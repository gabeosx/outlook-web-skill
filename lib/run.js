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
 * Domain restriction is NOT applied for data operations — the action policy
 * (default: deny) is the real safety boundary. Domain restriction blocks Outlook
 * CDN assets and causes olkerror.html (Phase 2 decision D-04/D-05).
 *
 * @param {string[]} args - Arguments passed to agent-browser after the standard flags
 * @param {string} policyFile - Relative path to policy JSON (e.g., 'policy-auth.json')
 * @param {Object} [opts] - Optional overrides
 * @param {boolean} [opts.headed] - If true, pass --headed flag (auth only)
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runAgentBrowser(args, policyFile, opts = {}) {
  const policyPath = path.join(PROJECT_ROOT, policyFile);

  const childEnv = {
    ...process.env,
    AGENT_BROWSER_ACTION_POLICY: policyPath,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_EXECUTABLE_PATH: process.env.OUTLOOK_BROWSER_PATH,
  };

  // --headed is only passed for interactive auth — never set globally
  // TEMP DEBUG: OUTLOOK_HEADED=1 forces headed mode for all operations
  const headedFlag = (opts.headed || process.env.OUTLOOK_HEADED === '1') ? ['--headed'] : [];

  // Use --profile when OUTLOOK_BROWSER_PROFILE is set (uses existing Chrome session).
  // Fall back to --session-name for isolated sessions without a profile.
  // Note: --profile will fail with SingletonLock if Chrome is already open with that profile.
  const profileArgs = process.env.OUTLOOK_BROWSER_PROFILE
    ? ['--profile', process.env.OUTLOOK_BROWSER_PROFILE]
    : ['--session-name', 'outlook-skill'];

  const finalArgs = [
    '-q',
    ...profileArgs,
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
 * Run agent-browser eval --stdin with a JavaScript expression.
 * Unlike runAgentBrowser, this pipes script content to stdin.
 * Required because eval --stdin needs stdio: ['pipe', 'pipe', 'pipe'].
 *
 * @param {string} script - JavaScript to evaluate in the browser
 * @param {string} policyFile - Policy file name (e.g., 'policy-search.json')
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runEval(script, policyFile) {
  const policyPath = path.join(PROJECT_ROOT, policyFile);
  const childEnv = {
    ...process.env,
    AGENT_BROWSER_ACTION_POLICY: policyPath,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_EXECUTABLE_PATH: process.env.OUTLOOK_BROWSER_PATH,
  };

  const profileArgs = process.env.OUTLOOK_BROWSER_PROFILE
    ? ['--profile', process.env.OUTLOOK_BROWSER_PROFILE]
    : ['--session-name', 'outlook-skill'];
  const finalArgs = ['-q', ...profileArgs, 'eval', '--stdin'];
  log(`agent-browser ${finalArgs.join(' ')} (stdin: ${script.length} chars)`);

  const result = spawnSync('agent-browser', finalArgs, {
    cwd: PROJECT_ROOT,
    env: childEnv,
    input: script,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.stderr) {
    log(`eval stderr: ${result.stderr.trim()}`);
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

/**
 * Strip agent-browser content boundary markers from stdout if present.
 * Content boundaries wrap page-sourced text in --- AGENT_BROWSER_PAGE_CONTENT ... --- markers.
 * When --json output is also wrapped, JSON.parse fails unless markers are stripped first.
 * @param {string} stdout
 * @returns {string} stdout with boundary markers removed
 */
function stripContentBoundaries(stdout) {
  if (!stdout) return stdout;
  // Pattern: --- AGENT_BROWSER_PAGE_CONTENT nonce=<hex> origin=<url> ---\n<content>\n--- END AGENT_BROWSER_PAGE_CONTENT ---
  const startPattern = /---\s*AGENT_BROWSER_PAGE_CONTENT\s+[^\n]*---\n?/g;
  const endPattern = /\n?---\s*END\s+AGENT_BROWSER_PAGE_CONTENT\s*---/g;
  let result = stdout.replace(startPattern, '').replace(endPattern, '');
  return result.trim();
}

/**
 * Parse agent-browser --json output safely.
 * Strips content boundary markers before parsing to handle AGENT_BROWSER_CONTENT_BOUNDARIES=1.
 * Returns null if stdout is not valid JSON or success is false.
 * @param {string} stdout
 * @returns {any|null}
 */
function parseAgentBrowserJson(stdout) {
  try {
    const cleaned = stripContentBoundaries(stdout);
    const parsed = JSON.parse(cleaned.trim());
    if (!parsed.success) return null;
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { runAgentBrowser, parseAgentBrowserJson, runEval, stripContentBoundaries };
