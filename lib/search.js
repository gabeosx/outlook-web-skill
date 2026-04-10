'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputError, log } = require('./output');

const POLICY = 'policy-search.json';
const DEFAULT_LIMIT = 20;

/**
 * Parse process.argv for search subcommand arguments.
 * Expects: node outlook.js search "<KQL query>" [--limit N]
 *
 * @param {string[]} argv - process.argv
 * @returns {{ query: string, limit: number }}
 */
function parseArgs(argv) {
  const args = argv.slice(3); // skip node, outlook.js, search
  let query = null;
  let limit = DEFAULT_LIMIT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) limit = n;
      i++; // skip next
    } else if (!query) {
      query = args[i];
    }
  }

  if (!query) {
    outputError('search', 'INVALID_ARGS', 'Usage: node outlook.js search "<KQL query>" [--limit N]');
    // outputError exits — code below never runs for missing query
  }

  return { query, limit };
}

/**
 * Navigate to Outlook, interact with search combobox, wait for results,
 * and take an accessibility snapshot — all in a single batch (one Chrome session).
 *
 * The snapshot is included as the final batch command because the page state
 * does not persist between the batch CLI exit and subsequent runAgentBrowser
 * calls: after the batch process exits, the daemon resets to about:blank.
 * Including snapshot inside the batch captures the page while it is still live.
 *
 * @param {string} query - KQL query string
 * @returns {any|null} Parsed snapshot JSON, or null on failure
 */
function executeComboboxSearch(query) {
  const result = runBatch([
    ['open', process.env.OUTLOOK_BASE_URL],
    ['wait', '5000'],                              // SPA render time — 5s needed for cold Chrome start
    ['find', 'role', 'combobox', 'click'],         // one combobox on page, no --name needed
    ['wait', '500'],
    ['find', 'role', 'combobox', 'fill', query],   // query as single JSON arg handles spaces
    ['press', 'Enter'],
    ['wait', '4000'],                              // wait for search results to render
    ['eval', "JSON.stringify(Array.from(document.querySelectorAll('[role=option]')).map(el => el.id))"],  // D-01/D-03: extract Exchange ItemIDs while page is live
    ['snapshot', '-i', '--json'],                  // capture while page is still live; must be last
  ], POLICY);

  if (result.status !== 0) {
    log(`search: batch failed (status ${result.status})`);
    if (result.stderr) log(`search: stderr: ${result.stderr.trim().slice(0, 300)}`);
    return null;
  }
  log('search: batch complete (search + eval + snapshot)');

  // Phase 3 fix (D-02): Parse eval output (JSON array of IDs) + snapshot text.
  // Batch stdout contains both the eval JSON array result and the accessibility snapshot text.
  // The eval result appears as the first JSON array in stdout; snapshot text follows.
  const cleaned = stripContentBoundaries(result.stdout);
  log(`search: batch stdout ${cleaned.length} chars`);

  if (!cleaned.trim()) {
    log('search: batch output empty after stripping boundaries');
    return null;
  }

  // Phase 3 fix (D-02): Parse eval output (JSON array of IDs) + snapshot text
  let ids = [];
  const jsonArrayMatch = cleaned.match(/(\[[^\]]*\])/s);
  if (jsonArrayMatch) {
    try {
      const parsed = JSON.parse(jsonArrayMatch[1]);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      log('search: eval JSON array parse failed — falling back to null IDs');
    }
  }

  // Snapshot text is everything after the JSON array (or the whole thing if no array found)
  const snapshotStart = jsonArrayMatch ? jsonArrayMatch.index + jsonArrayMatch[0].length : 0;
  const snapshotText = cleaned.slice(snapshotStart).trim();

  if (!snapshotText) {
    log('search: no snapshot text found after eval output');
    return null;
  }

  log(`search: extracted ${ids.length} IDs from eval, snapshot text ${snapshotText.length} chars`);
  return { _textSnapshot: snapshotText, _ids: ids };
}

/**
 * Extract message row accessible names from a snapshot (JSON or text format).
 *
 * JSON format: {success, data: {origin, refs: {eN: {role, name}}}} — used when
 *   snapshot is run as a standalone command (runAgentBrowser).
 *
 * Text format: {_textSnapshot: string} — used when snapshot is run inside a batch;
 *   agent-browser ignores --json in batch context and produces a text accessibility tree.
 *   Text lines look like: "  - option "Unread Sender Subject Date Preview""
 *
 * @param {any} snapshot - JSON snapshot or {_textSnapshot: string}
 * @returns {string[]} Array of accessible name strings for message rows
 */
function extractMessageRows(snapshot) {
  if (!snapshot) return [];

  // Text format path
  if (snapshot._textSnapshot) {
    return extractRowsFromText(snapshot._textSnapshot);
  }

  // JSON format path
  const refs = (snapshot.data && snapshot.data.refs) || {};
  const allElems = Object.values(refs).filter(v => v && v.role);
  const options = allElems.filter(v => v.role === 'option' && v.name);
  if (options.length === 0) {
    log('search: no option elements in snapshot refs');
    return [];
  }
  log(`search: found ${options.length} option rows (JSON)`);
  return options.map(o => o.name);
}

/**
 * Extract option-role accessible names from agent-browser text snapshot format.
 *
 * agent-browser batch produces text-format snapshot lines like:
 *   "      - option "Sender Subject Date Preview" [ref=e41]"
 *
 * The [ref=eNN] suffix and any trailing metadata after the closing quote are NOT
 * part of the accessible name and must be stripped.
 *
 * @param {string} text - Raw text snapshot from batch stdout
 * @returns {string[]} Accessible names for all option elements with non-empty names
 */
function extractRowsFromText(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    // Match: optional indent, "- option", quoted name, optional [ref=...] and other trailing attrs
    // Greedy match for name, then require closing quote before [ref or end of line
    const m = line.match(/^\s*-\s+option\s+"(.+?)"\s*(?:\[.*)?$/);
    if (m && m[1].trim()) {
      rows.push(m[1].trim());
    }
  }
  log(`search: extractRowsFromText found ${rows.length} option rows`);
  return rows;
}


/**
 * Parse a single accessible name string from an Outlook message row into result schema fields.
 *
 * Accessible name format: [Unread ][Important ]{sender} {subject} {date} {preview}
 *
 * Note: There is no hard delimiter between sender and subject — both are in the pre-date
 * segment. The entire pre-date text is returned as `from`; `subject` is left empty.
 * The calling agent can parse further if needed.
 *
 * @param {string} name - Accessible name string from snapshot
 * @returns {{ is_read: boolean, is_flagged: null, from: string, subject: string, date: string|null, preview: string, to: null }}
 */
function parseAccessibleName(name) {
  let rest = (name || '').trim();

  // Detect unread status (D-17: "Unread " prefix)
  const is_read = !rest.startsWith('Unread ');
  if (!is_read) rest = rest.slice('Unread '.length);

  // Strip "Important " prefix if present
  if (rest.startsWith('Important ')) rest = rest.slice('Important '.length);

  // Date regex covering all observed formats:
  // - Day M/D/YYYY (e.g., Mon 6/24/2024)   — must be first, more specific than M/D/YYYY
  // - M/D/YYYY     (e.g., 6/24/2024)
  // - Day M/D      (e.g., Tue 3/17)
  // - M/D          (e.g., 3/17)
  // - Day h:mm AM/PM (e.g., Thu 4:00 PM)   — this-week messages show day + time
  // - h:mm AM/PM   (e.g., 1:47 PM)         — today's messages show time only
  const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const dateRegex = new RegExp(
    `\\b(${DAY}\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{1,2}\\/\\d{1,2}\\/\\d{4}|${DAY}\\s+\\d{1,2}\\/\\d{1,2}|\\d{1,2}\\/\\d{1,2}|${DAY}\\s+\\d{1,2}:\\d{2}\\s*[AP]M|\\d{1,2}:\\d{2}\\s*[AP]M)\\b`
  );
  const dateMatch = dateRegex.exec(rest);

  let from = '';
  let subject = '';
  let date = null;
  let preview = '';

  if (dateMatch) {
    const before = rest.slice(0, dateMatch.index).trim();
    date = dateMatch[0];
    preview = rest.slice(dateMatch.index + dateMatch[0].length).trim();
    // Best-effort sender/subject split: no reliable delimiter exists
    // Treat entire pre-date text as "from" — calling agent can parse further if needed
    from = before;
    subject = '';
  } else {
    // No date found — put everything in from
    from = rest;
  }

  return {
    is_read,
    is_flagged: null, // D-19: not determinable from passive snapshot
    from,
    subject,
    date,
    preview,
    to: null, // D-18: only visible in reading pane (Phase 3)
  };
}

/**
 * Main search subcommand handler.
 * Orchestrates: arg parsing → batch(open+search+snapshot) → parse rows → output.
 *
 * Note: IDs (data-convid GUIDs) are not extracted. The page reverts to about:blank
 * after the batch CLI exits, so a separate eval call would find nothing. IDs can be
 * recovered in Phase 3 by clicking into a specific message.
 */
function runSearch() {
  const { query, limit } = parseArgs(process.argv);

  log(`search: query="${query}" limit=${limit}`);

  // Step 1: Open Outlook, search, snapshot — one batch = one Chrome session
  // Returns JSON snapshot, {_textSnapshot} (text format from batch), or null (failure)
  const snapshot = executeComboboxSearch(query);
  if (snapshot === null) {
    outputError('search', 'SESSION_INVALID',
      'Search batch failed — session may be expired. Run: node outlook.js auth');
    return;
  }

  // Step 2: Extract message rows from snapshot
  const rows = extractMessageRows(snapshot);

  // D-04: Warn if eval ID count doesn't match snapshot row count
  if (snapshot._ids && snapshot._ids.length !== rows.length) {
    log(`search: ID count mismatch — ${snapshot._ids.length} IDs vs ${rows.length} rows`);
  }

  // Step 3: Zero results guard
  if (rows.length === 0) {
    log('search: no results found');
    process.stdout.write(JSON.stringify({
      operation: 'search',
      status: 'ok',
      results: [],
      count: 0,
      error: null,
    }) + '\n');
    log('search: stdout write complete, returning to outlook.js');
    return;
  }

  // Step 4: Build results — correlate IDs by array index (D-04 graceful fallback to null)
  const results = [];
  const rowLimit = Math.min(rows.length, limit);
  for (let i = 0; i < rowLimit; i++) {
    const parsed = parseAccessibleName(rows[i]);
    parsed.id = (snapshot._ids && snapshot._ids[i]) || null;
    results.push(parsed);
  }

  // Step 5: Output results
  log(`search: returning ${results.length} results`);
  process.stdout.write(JSON.stringify({
    operation: 'search',
    status: 'ok',
    results: results,
    count: results.length,
    error: null,
  }) + '\n');
  log('search: stdout write complete, returning to outlook.js');
}

module.exports = { runSearch, parseAccessibleName, parseArgs, extractMessageRows, executeComboboxSearch };
