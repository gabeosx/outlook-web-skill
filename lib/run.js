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

  // --headed is a session-startup flag — only meaningful when the daemon is not yet running.
  // Passing it to every command generates "daemon already running, --headed ignored" warnings.
  // Only auth passes opts.headed=true (for the initial open). All other operations omit it.
  const headedFlag = opts.headed ? ['--headed'] : [];

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
 * Run multiple agent-browser commands in a single browser session via `batch`.
 * Batch keeps Chrome alive across all commands — no open/close between steps.
 * Use for sequential commands where intermediate output is not needed.
 *
 * Commands that need output (snapshot --json, get url, eval) must still be
 * separate runAgentBrowser/runEval calls so their stdout can be parsed.
 *
 * @param {Array<string[]>} commandArrays - Each element is a command+args array,
 *   e.g. [['find', 'role', 'combobox', 'click', '--name', 'Search...'], ['wait', '500']]
 * @param {string} policyFile - Policy file name (e.g., 'policy-search.json')
 * @param {Object} [opts]
 * @param {boolean} [opts.headed]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runBatch(commandArrays, policyFile, opts = {}) {
  const policyPath = path.join(PROJECT_ROOT, policyFile);
  const childEnv = {
    ...process.env,
    AGENT_BROWSER_ACTION_POLICY: policyPath,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_EXECUTABLE_PATH: process.env.OUTLOOK_BROWSER_PATH,
  };
  // OUTLOOK_HEADED=1 triggers headed mode on the batch open — this is the daemon startup
  // command, so --headed is meaningful here (unlike snapshot/eval which reuse the daemon).
  const headedFlag = (opts.headed || process.env.OUTLOOK_HEADED === '1') ? ['--headed'] : [];
  const finalArgs = ['-q', '--session-name', 'outlook-skill', ...headedFlag, 'batch'];

  const input = JSON.stringify(commandArrays);
  log(`agent-browser batch (${commandArrays.length} commands)${headedFlag.length ? ' [--headed]' : ''}`);

  const result = spawnSync('agent-browser', finalArgs, {
    cwd: PROJECT_ROOT,
    env: childEnv,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.stderr) {
    log(`batch stderr: ${result.stderr.trim()}`);
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

  const finalArgs = ['-q', '--session-name', 'outlook-skill', 'eval', '--stdin'];
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
  // Pattern: --- AGENT_BROWSER_PAGE_CONTENT nonce=<hex> origin=<url> ---\n<content>\n--- END_AGENT_BROWSER_PAGE_CONTENT [nonce=...] ---
  // Note: END marker uses underscore (END_AGENT_BROWSER_PAGE_CONTENT), not space.
  const startPattern = /---\s*AGENT_BROWSER_PAGE_CONTENT\s+[^\n]*---\n?/g;
  const endPattern = /\n?---\s*END[_ ]AGENT_BROWSER_PAGE_CONTENT[^\n]*---/g;
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

module.exports = { runAgentBrowser, parseAgentBrowserJson, runEval, runBatch, stripContentBoundaries };
