'use strict';
const os = require('os');
const { outputError } = require('./lib/output');

// ── Step 1: Env var validation (before argv, before any browser) ──
const REQUIRED_ENV = ['OUTLOOK_BASE_URL', 'OUTLOOK_BROWSER_PATH', 'OUTLOOK_BROWSER_PROFILE'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    outputError('startup', 'INVALID_ARGS', `Missing required env var: ${key}`);
    // outputError exits — code below this loop never runs for missing vars
  }
}

// ── Step 2: Normalize tilde in path env vars ──
function expandTilde(p) {
  return typeof p === 'string' ? p.replace(/^~(?=$|\/|\\)/, os.homedir()) : p;
}
process.env.OUTLOOK_BROWSER_PATH = expandTilde(process.env.OUTLOOK_BROWSER_PATH);
process.env.OUTLOOK_BROWSER_PROFILE = expandTilde(process.env.OUTLOOK_BROWSER_PROFILE);

// ── Step 3: Extract allowed domain for SAFE-02 ──
let allowedDomain;
try {
  allowedDomain = new URL(process.env.OUTLOOK_BASE_URL).hostname;
} catch {
  outputError('startup', 'INVALID_ARGS', `OUTLOOK_BASE_URL is not a valid URL: ${process.env.OUTLOOK_BASE_URL}`);
}

// ── Step 4: Subcommand dispatch ──
const VALID_COMMANDS = ['auth', 'search', 'read', 'digest'];
const cmd = process.argv[2];

if (!cmd || !VALID_COMMANDS.includes(cmd)) {
  outputError(cmd ?? 'unknown', 'INVALID_ARGS', `Unknown subcommand: "${cmd ?? ''}". Valid: ${VALID_COMMANDS.join(', ')}`);
}

// Export allowedDomain for use by lib/run.js and subcommand handlers
module.exports = { allowedDomain };

switch (cmd) {
  case 'auth':
    require('./lib/session').runAuth();
    break;
  case 'search':
    outputError('search', 'OPERATION_FAILED', 'search not yet implemented — coming in Phase 2');
    break;
  case 'read':
    outputError('read', 'OPERATION_FAILED', 'read not yet implemented — coming in Phase 3');
    break;
  case 'digest':
    outputError('digest', 'OPERATION_FAILED', 'digest not yet implemented — coming in Phase 4');
    break;
}
