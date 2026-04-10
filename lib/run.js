'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const { log } = require('./output');

// Resolve policy file paths relative to the project root (where outlook.js lives)
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Invoke agent-browser as a subprocess.
 * Sets all AGENT_BROWSER_* safety env vars on the child environment.
 * Never mutates process.env.
 *
 * @param {string[]} args - Arguments passed to agent-browser after the standard flags
 * @param {string} policyFile - Relative path to policy JSON (e.g., 'policy-auth.json')
 * @param {Object} [opts] - Optional overrides
 * @param {boolean} [opts.headed] - If true, pass --headed flag (auth only)
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runAgentBrowser(args, policyFile, opts = {}) {
  const policyPath = path.join(PROJECT_ROOT, policyFile);

  // Domain restriction only applies to read operations — auth must reach
  // login.microsoftonline.com and other Microsoft domains during the login flow.
  const outlookDomain = process.env.OUTLOOK_BASE_URL
    ? new URL(process.env.OUTLOOK_BASE_URL).hostname
    : '';
  const restrictDomains = policyFile === 'policy-read.json' && outlookDomain;

  const childEnv = {
    ...process.env,
    AGENT_BROWSER_ACTION_POLICY: policyPath,
    ...(restrictDomains ? { AGENT_BROWSER_ALLOWED_DOMAINS: outlookDomain } : {}),
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_EXECUTABLE_PATH: process.env.OUTLOOK_BROWSER_PATH,
  };

  // --headed is only passed for interactive auth — never set globally
  const headedFlag = opts.headed ? ['--headed'] : [];

  // NOTE: Do NOT pass --profile here. Chrome's SingletonLock prevents a second
  // Chrome process from opening the same profile while it is already in use.
  // Session persistence is handled by --session-name (saves on close).

  const finalArgs = [
    '-q',
    '--session-name', 'outlook-skill',
    ...headedFlag,
    ...args,
  ];

  log(`agent-browser ${finalArgs.join(' ')}`);

  const result = spawnSync('agent-browser', finalArgs, {
    cwd: PROJECT_ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.stderr) {
    log(`stderr: ${result.stderr.trim()}`);
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

/**
 * Parse agent-browser --json output safely.
 * Returns null if stdout is not valid JSON or success is false.
 * @param {string} stdout
 * @returns {any|null}
 */
function parseAgentBrowserJson(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (!parsed.success) return null;
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { runAgentBrowser, parseAgentBrowserJson };
