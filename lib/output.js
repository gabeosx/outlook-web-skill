'use strict';

/**
 * Write success JSON to stdout.
 * @param {string} operation
 * @param {any} results - array or null
 */
function outputOk(operation, results = null) {
  process.stdout.write(
    JSON.stringify({ operation, status: 'ok', results, error: null }) + '\n'
  );
}

/**
 * Write error JSON to stdout and exit(1).
 * @param {string} operation
 * @param {string} code - one of: INVALID_ARGS, SESSION_INVALID, AUTH_REQUIRED, OPERATION_FAILED
 * @param {string} message
 */
function outputError(operation, code, message) {
  process.stdout.write(
    JSON.stringify({ operation, status: 'error', results: null, error: { code, message } }) + '\n'
  );
  process.exit(1);
}

/**
 * Write diagnostic message to stderr only. Never touches stdout.
 * @param {string} msg
 */
function log(msg) {
  process.stderr.write(`[outlook-skill] ${msg}\n`);
}

module.exports = { outputOk, outputError, log };
