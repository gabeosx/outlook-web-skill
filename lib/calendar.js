'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputOk, outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // D-13: reuse existing policy for all calendar ops

/**
 * calendar subcommand: list upcoming events within a configurable time window.
 * Accepts --days N (default: 7) per D-05.
 */
function runCalendar() {
  outputError('calendar', 'OPERATION_FAILED', 'calendar subcommand not yet implemented (Plan 06-02)');
}

/**
 * calendar-read subcommand: fetch full details of a specific event by ID.
 * Accepts a required positional <event-id> argument per D-06.
 */
function runCalendarRead() {
  outputError('calendar-read', 'OPERATION_FAILED', 'calendar-read subcommand not yet implemented (Plan 06-03)');
}

/**
 * calendar-search subcommand: search calendar events by keyword/date range.
 * Uses same combobox workflow as lib/search.js per D-13a.
 */
function runCalendarSearch() {
  outputError('calendar-search', 'OPERATION_FAILED', 'calendar-search subcommand not yet implemented (Plan 06-03)');
}

module.exports = { runCalendar, runCalendarRead, runCalendarSearch };
