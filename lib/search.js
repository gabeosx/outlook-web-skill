'use strict';

const { runAgentBrowser, runEval, stripContentBoundaries } = require('./run');
const { assertSession } = require('./session');
const { outputError, log } = require('./output');

const POLICY = 'policy-search.json';
const DEFAULT_LIMIT = 20;
const MAX_SCROLL_ATTEMPTS = 5;
const COMBOBOX_NAME = 'Search for email, meetings, files and more.';

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
 * Drive the Outlook search combobox workflow.
 * Sequence: click → wait 500ms → fill KQL → press Enter → wait 4000ms.
 *
 * @param {string} query - KQL query string
 */
function executeComboboxSearch(query) {
  // Step 1: Click combobox to activate
  const clickResult = runAgentBrowser(
    ['find', 'role', 'combobox', 'click', '--name', COMBOBOX_NAME],
    POLICY
  );
  if (clickResult.status !== 0) {
    log(`search: combobox click failed (status ${clickResult.status}) — continuing`);
  }

  // Step 2: Wait for suggestions list
  runAgentBrowser(['wait', '500'], POLICY);

  // Step 3: Fill with KQL query (passed as separate argv element — no shell interpolation)
  const fillResult = runAgentBrowser(
    ['find', 'role', 'combobox', 'fill', query, '--name', COMBOBOX_NAME],
    POLICY
  );
  if (fillResult.status !== 0) {
    log(`search: combobox fill failed (status ${fillResult.status}) — continuing`);
  }

  // Step 4: Submit
  const pressResult = runAgentBrowser(['press', 'Enter'], POLICY);
  if (pressResult.status !== 0) {
    log(`search: press Enter failed (status ${pressResult.status}) — continuing`);
  }

  // Step 5: Wait for SPA render
  runAgentBrowser(['wait', '4000'], POLICY);
}

/**
 * Take a full interactive snapshot and return the parsed JSON.
 * Strips content boundary markers before parsing.
 *
 * @returns {any|null} Parsed snapshot JSON, or null on failure
 */
function takeSnapshot() {
  const result = runAgentBrowser(['snapshot', '-i', '--json'], POLICY);
  if (result.status !== 0) {
    log(`snapshot failed (status ${result.status})`);
    return null;
  }
  const cleaned = stripContentBoundaries(result.stdout);
  try {
    return JSON.parse(cleaned.trim());
  } catch (e) {
    log(`snapshot JSON parse failed: ${e.message}`);
    // Try without stripContentBoundaries in case --json bypasses boundaries
    try {
      return JSON.parse(result.stdout.trim());
    } catch {
      return null;
    }
  }
}

/**
 * Walk snapshot JSON tree to find message list rows.
 * Looks for a listbox node with name containing "Message list",
 * then collects all child option nodes' accessible names.
 *
 * @param {any} snapshot - Parsed snapshot JSON from agent-browser
 * @returns {string[]} Array of accessible name strings for message rows
 */
function extractMessageRows(snapshot) {
  if (!snapshot) return [];

  // Recursively find the message list listbox node
  function findMessageListbox(node) {
    if (!node || typeof node !== 'object') return null;
    if (
      node.role === 'listbox' &&
      node.name &&
      node.name.includes('Message list')
    ) {
      return node;
    }
    // Check children array
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findMessageListbox(child);
        if (found) return found;
      }
    }
    // Check tree/nodes patterns used by agent-browser snapshot JSON
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) {
        const found = findMessageListbox(child);
        if (found) return found;
      }
    }
    return null;
  }

  // Collect option elements from the listbox
  function collectOptions(node) {
    const options = [];
    if (!node || typeof node !== 'object') return options;
    const children = node.children || node.nodes || [];
    for (const child of children) {
      if (child && child.role === 'option' && child.name) {
        options.push(child.name);
      } else {
        // Options can be nested within groups
        options.push(...collectOptions(child));
      }
    }
    return options;
  }

  const listbox = findMessageListbox(snapshot);
  if (!listbox) {
    log('search: message list listbox not found in snapshot');
    // Diagnostic: log all role+name pairs in the tree to identify the real container
    const roleNames = [];
    function collectRoleNames(node, depth) {
      if (!node || typeof node !== 'object' || depth > 6) return;
      if (node.role) roleNames.push(`${'  '.repeat(depth)}[${node.role}] ${node.name || '(no name)'}`);
      for (const child of (node.children || node.nodes || [])) collectRoleNames(child, depth + 1);
    }
    collectRoleNames(snapshot, 0);
    log('search: snapshot data keys: ' + JSON.stringify(Object.keys((snapshot && snapshot.data) || snapshot || {})));
    // Count roles in refs (flat dict)
    const refs = (snapshot && snapshot.data && snapshot.data.refs) || {};
    const roleCounts = {};
    for (const v of Object.values(refs)) {
      if (v && v.role) roleCounts[v.role] = (roleCounts[v.role] || 0) + 1;
    }
    log('search: refs role counts: ' + JSON.stringify(roleCounts));
    // Log all non-empty names with their role
    const named = Object.values(refs).filter(v => v && v.name && v.name.length > 8).slice(0, 30);
    log('search: named refs sample:\n' + named.map(v => `  [${v.role}] ${v.name.slice(0, 80)}`).join('\n'));
    log('search: snapshot role/name tree:\n' + roleNames.slice(0, 60).join('\n'));
    return [];
  }

  return collectOptions(listbox);
}

/**
 * Batch-extract Exchange ItemIDs from all visible [role="option"] elements via eval.
 * Uses a single eval --stdin call to read el.id without touching message read state.
 *
 * @returns {Array<string|null>} Array of id strings (or null for elements without id)
 */
function extractIds() {
  const script = `JSON.stringify(Array.from(document.querySelectorAll('[role="option"]')).map(el => el.id || null))`;
  const result = runEval(script, POLICY);
  if (result.status !== 0) {
    log(`eval ID extraction failed (status ${result.status})`);
    return [];
  }
  const cleaned = stripContentBoundaries(result.stdout);
  try {
    const parsed = JSON.parse(cleaned.trim());
    // Handle case where eval returns a JSON string inside another JSON envelope
    if (typeof parsed === 'string') {
      return JSON.parse(parsed);
    }
    if (Array.isArray(parsed)) return parsed;
    // agent-browser may wrap in {success: true, result: "..."}
    if (parsed.result) {
      const inner = typeof parsed.result === 'string' ? JSON.parse(parsed.result) : parsed.result;
      if (Array.isArray(inner)) return inner;
    }
    return [];
  } catch (e) {
    log(`eval ID parse failed: ${e.message}`);
    // Fallback: try raw stdout
    try {
      const raw = JSON.parse(result.stdout.trim());
      if (Array.isArray(raw)) return raw;
      if (raw.result) {
        const inner = typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result;
        if (Array.isArray(inner)) return inner;
      }
    } catch { /* ignore */ }
    return [];
  }
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

  // Date regex covering all observed formats from Phase 0 captures:
  // - M/D/YYYY (e.g., 6/24/2024, 11/30/2023)
  // - Day M/D/YYYY (e.g., Mon 6/24/2024, Fri 4/10/2026)
  // - Day M/D (e.g., Tue 3/17)
  // - M/D (e.g., 3/17)
  // - h:mm AM/PM (e.g., 1:47 PM)
  const dateRegex = /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}\s*[AP]M)\b/;
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
 * Orchestrates: arg parsing → navigate → session check → combobox search →
 * snapshot → ID extraction → scroll-accumulate → JSON output.
 */
function runSearch() {
  const { query, limit } = parseArgs(process.argv);

  log(`search: query="${query}" limit=${limit}`);

  // Step 1: Navigate to Outlook (D-11)
  log('search: navigating to Outlook...');
  const openResult = runAgentBrowser(['open', process.env.OUTLOOK_BASE_URL], POLICY);
  if (openResult.status !== 0) {
    log(`search: open failed: ${openResult.stderr}`);
    outputError('search', 'OPERATION_FAILED', 'Failed to navigate to Outlook');
    return;
  }

  // Session check (D-11) — must pass policy-search.json (not policy-read.json)
  if (!assertSession('search', POLICY)) return; // assertSession emits error + exits

  // Step 2: Execute combobox search (D-12)
  executeComboboxSearch(query);

  // Step 3: Take initial snapshot and extract rows
  let snapshot = takeSnapshot();
  let rows = snapshot ? extractMessageRows(snapshot) : [];

  // Step 4: Zero results guard (D-15)
  if (rows.length === 0) {
    log('search: no results found');
    process.stdout.write(JSON.stringify({
      operation: 'search',
      status: 'ok',
      results: [],
      count: 0,
      error: null,
    }) + '\n');
    return;
  }

  // Step 5: Extract IDs (D-06)
  let ids = extractIds();

  // Correlate rows and IDs (D-08)
  if (ids.length !== rows.length) {
    log(`search: eval ID count ${ids.length} != snapshot row count ${rows.length}`);
  }

  // Build initial results
  const results = [];
  const rowLimit = Math.min(rows.length, limit);
  for (let i = 0; i < rowLimit; i++) {
    const parsed = parseAccessibleName(rows[i]);
    parsed.id = (i < ids.length) ? (ids[i] || null) : null; // D-08, D-20
    results.push(parsed);
  }

  // Step 6: Scroll-and-accumulate (D-14)
  let scrollAttempts = 0;
  let staleScrolls = 0;
  const seenIds = new Set(ids.filter(Boolean));

  while (results.length < limit && staleScrolls < 2 && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
    log(`search: scroll attempt ${scrollAttempts + 1} (have ${results.length}/${limit})`);
    runAgentBrowser(['scroll', 'down', '500', '--selector', '[aria-label*="Message list"]'], POLICY);
    runAgentBrowser(['wait', '1500'], POLICY);

    snapshot = takeSnapshot();
    const newRows = snapshot ? extractMessageRows(snapshot) : [];
    const newIds = extractIds();

    const prevLength = results.length;

    for (let i = 0; i < newRows.length && results.length < limit; i++) {
      const id = (i < newIds.length) ? (newIds[i] || null) : null;
      // Dedup by ID if available
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);

      const parsed = parseAccessibleName(newRows[i]);
      parsed.id = id;
      results.push(parsed);
    }

    if (results.length === prevLength) {
      staleScrolls++;
    } else {
      staleScrolls = 0;
    }
    scrollAttempts++;
  }

  // Step 7: Output results
  log(`search: returning ${results.length} results`);
  process.stdout.write(JSON.stringify({
    operation: 'search',
    status: 'ok',
    results: results,
    count: results.length,
    error: null,
  }) + '\n');
}

module.exports = { runSearch, parseAccessibleName, parseArgs, extractMessageRows };
