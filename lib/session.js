'use strict';
const { runAgentBrowser, parseAgentBrowserJson } = require('./run');
const { outputOk, outputError, log } = require('./output');

// D-04: Microsoft login domains that indicate session is invalid
const LOGIN_DOMAINS = ['login.microsoftonline.com', 'login.live.com', 'login.windows.net'];

/**
 * Return true if url is a Microsoft login/redirect page.
 * Per Pitfall 3: about:blank is treated as invalid (not authenticated).
 * @param {string} url
 * @returns {boolean}
 */
function isLoginUrl(url) {
  if (!url || url === 'about:blank') return true; // Pitfall 3: blank = not authenticated
  return LOGIN_DOMAINS.some(d => url.includes(d));
}

/**
 * Get the current browser URL.
 * NOTE: runAgentBrowser already prepends -q and --session-name; do not add them here.
 * @param {string} policyFile
 * @returns {string|null}
 */
function getCurrentUrl(policyFile) {
  // Use plain `get url` — not `--json get url`. The --json flag conflicts with -q
  // and returns status 1 with no output. Plain text stdout is the URL directly.
  const result = runAgentBrowser(['get', 'url'], policyFile);
  if (result.status !== 0) {
    log(`get url failed (status ${result.status}): ${result.stderr}`);
    return null;
  }
  const url = result.stdout.trim();
  if (!url) {
    log('get url returned empty output');
    return null;
  }
  return url;
}

/**
 * Navigate to OUTLOOK_BASE_URL and check if the session is valid.
 * Valid = final URL is NOT a login domain URL.
 * Per Pitfall 3: always call 'open' before 'get url' (open waits for load + redirect).
 *
 * @returns {boolean} true if session is valid (inbox loaded), false if login redirect
 */
function checkSessionValid() {
  log('Navigating to Outlook to check session...');
  const openResult = runAgentBrowser(
    ['open', process.env.OUTLOOK_BASE_URL],
    'policy-read.json'
  );
  if (openResult.status !== 0) {
    log(`open failed: ${openResult.stderr}`);
    // Daemon may be up — close it so the headed launch in runAuth() can start fresh
    runAgentBrowser(['close'], 'policy-read.json');
    return false;
  }

  const url = getCurrentUrl('policy-read.json');
  if (url === null) {
    runAgentBrowser(['close'], 'policy-read.json');
    return false;
  }

  log(`Post-navigate URL: ${url}`);
  const valid = !isLoginUrl(url);

  if (!valid) {
    // Close headless daemon now — runAuth() needs to restart it with --headed
    runAgentBrowser(['close'], 'policy-read.json');
  }

  return valid;
}

/**
 * Synchronous sleep using Atomics (Node.js CLI safe).
 * Fallback: spawnSync bash sleep if SharedArrayBuffer is not available.
 * @param {number} ms
 */
function sleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // Fallback: use spawnSync bash sleep
    const { spawnSync } = require('child_process');
    spawnSync('sleep', [String(Math.ceil(ms / 1000))]);
  }
}

/**
 * Wait for the user to complete MFA/SSO login by polling the browser URL.
 * Returns true when the URL leaves the login domain within the timeout.
 * @param {number} timeoutMs - default 5 minutes
 * @param {number} pollIntervalMs - default 3 seconds
 * @returns {boolean}
 */
function waitForLoginCompletion(timeoutMs = 300000, pollIntervalMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  log('Waiting for login to complete (up to 5 minutes)...');
  while (Date.now() < deadline) {
    sleep(pollIntervalMs);
    const url = getCurrentUrl('policy-auth.json');
    if (url === null) {
      log('Could not get URL during poll — retrying...');
      continue;
    }
    log(`Poll URL: ${url}`);
    if (!isLoginUrl(url)) {
      log('Login complete — inbox URL detected.');
      return true;
    }
  }
  log('Login timed out after 5 minutes.');
  return false;
}

/**
 * Main auth handler — implements AUTH-01 through AUTH-04.
 *
 * Flow:
 * 1. Navigate to OUTLOOK_BASE_URL with policy-read.json
 * 2. If URL is NOT a login domain → session is valid (D-06) → return ok, no browser window
 * 3. If URL IS a login domain → launch --headed browser with managed binary (D-05)
 * 4. Wait for login completion via polling
 * 5. Always call close (in finally) to persist session via --session-name (D-03 / Pitfall 1)
 * 6. Return ok or error
 */
function runAuth() {
  log('auth: checking session state...');

  // Step 1 & 2: Check if session is already valid (D-06 / AUTH-04)
  if (checkSessionValid()) {
    log('auth: session valid — no login needed.');
    // Close to ensure session state is flushed to disk (Pitfall 1)
    runAgentBrowser(['close'], 'policy-read.json');
    outputOk('auth');
    return;
  }

  log('auth: session invalid — launching headed browser for interactive login (AUTH-02).');
  log(`auth: using browser: ${process.env.OUTLOOK_BROWSER_PATH}`);
  log(`auth: using profile: ${process.env.OUTLOOK_BROWSER_PROFILE}`);

  // Step 3: Launch headed browser. open --headed blocks until the page finishes loading
  // (including all MFA redirects). When it returns, the browser window may already be closed.
  const openResult = runAgentBrowser(
    ['open', process.env.OUTLOOK_BASE_URL],
    'policy-auth.json',
    { headed: true }
  );

  try {
    if (openResult.status !== 0) {
      log(`auth: headed open failed: ${openResult.stderr}`);
      outputError('auth', 'OPERATION_FAILED',
        `Failed to launch browser. Check OUTLOOK_BROWSER_PATH (${process.env.OUTLOOK_BROWSER_PATH}). ` +
        `stderr: ${openResult.stderr.trim()}`
      );
      return;
    }

    // Step 4: open returned — check URL once while the browser may still be alive.
    // Do NOT poll: open already waited for the full page load (including MFA redirects).
    // If the window closed before we get here, get url will return null and we assume
    // the session was auto-saved when the window closed.
    log('auth: checking post-login URL...');
    const url = getCurrentUrl('policy-auth.json');

    if (url === null) {
      // Browser already closed. Session may have been auto-saved by --session-name.
      // Report ok — next auth call will confirm via checkSessionValid().
      log('auth: browser closed before URL check — session may be auto-saved.');
      outputOk('auth');
      return;
    }

    if (!isLoginUrl(url)) {
      log('auth: login confirmed — inbox URL detected.');
      outputOk('auth');
    } else {
      log(`auth: still on login domain after open returned (${url})`);
      outputError('auth', 'OPERATION_FAILED',
        'Login did not complete — browser closed on login page. Please re-run: node outlook.js auth'
      );
    }
  } finally {
    // Step 5: ALWAYS close to persist session state via --session-name (D-03 / AUTH-03)
    log('auth: closing browser to persist session...');
    runAgentBrowser(['close'], 'policy-auth.json');
  }
}

/**
 * Mid-operation session expiry check (AUTH-05).
 * Call this at the start of search/read/digest after navigating to Outlook.
 * Returns true if session is valid, false (and emits SESSION_INVALID) if expired.
 *
 * @param {string} operation - e.g., 'search', 'read', 'digest'
 * @param {string} [policyFile='policy-read.json'] - Policy file to use for the URL check
 * @returns {boolean}
 */
function assertSession(operation, policyFile = 'policy-read.json') {
  const url = getCurrentUrl(policyFile);
  if (url === null || isLoginUrl(url)) {
    outputError(
      operation,
      'SESSION_INVALID',
      'Session expired — run: node outlook.js auth'
    );
    return false;
  }
  return true;
}

module.exports = { runAuth, checkSessionValid, assertSession, isLoginUrl };
