'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-teams.json';

/**
 * Parse process.argv for teams subcommand arguments.
 * Expects: node outlook.js teams [--mentions] [--unread] [--chats] [--limit N]
 *
 * Modes:
 *   (default)   — Activity feed (all recent notifications)
 *   --mentions  — Filter to @mentions only
 *   --unread    — Unread chats only
 *   --chats     — All recent chats (read + unread)
 *
 * @param {string[]} argv - process.argv
 * @returns {{ mode: string, limit: number }}
 */
function parseArgs(argv) {
  const args = argv.slice(3);
  let mode = 'activity';  // default: activity feed
  let limit = 30;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mentions') {
      mode = 'mentions';
    } else if (args[i] === '--unread') {
      mode = 'unread';
    } else if (args[i] === '--chats') {
      mode = 'chats';
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) limit = n;
      i++;
    }
  }

  return { mode, limit };
}

/**
 * Parse process.argv for teams-read subcommand arguments.
 * Expects: node outlook.js teams-read <name-query> [--limit N]
 *
 * @param {string[]} argv - process.argv
 * @returns {{ query: string, limit: number }}
 */
function parseTeamsReadArgs(argv) {
  const args = argv.slice(3);
  let query = '';
  let limit = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) limit = n;
      i++;
    } else if (!args[i].startsWith('--')) {
      query = query ? query + ' ' + args[i] : args[i];
    }
  }

  return { query: query.trim(), limit };
}

/**
 * Navigate to Teams activity feed and take an accessibility snapshot.
 * Returns the raw snapshot text or null on failure.
 *
 * @returns {{ snapshotText: string } | null}
 */
function fetchActivityFeed() {
  const teamsUrl = process.env.TEAMS_BASE_URL || 'https://teams.microsoft.com';

  // Step 1: Navigate and wait for Teams SPA to load
  const navResult = runBatch([
    ['open', teamsUrl],
    ['wait', '10000'],
  ], POLICY);

  if (navResult.status !== 0) {
    log(`teams: navigation failed (status ${navResult.status})`);
    if (navResult.stderr) log(`teams: stderr: ${navResult.stderr.trim().slice(0, 300)}`);
    return null;
  }

  // Step 2: Dismiss the Office add-in confirm dialog if present.
  // This dialog appears on fresh sessions; 'dialog dismiss' fails with a CDP error
  // when no dialog is showing, so we fire-and-forget and ignore the result.
  runBatch([['dialog', 'dismiss']], POLICY);

  // Step 3: Session check and snapshot (small wait for Teams to settle post-dismiss)
  const result = runBatch([
    ['wait', '1000'],
    ['get', 'url'],    // session check
    ['snapshot'],      // capture activity feed
  ], POLICY);

  if (result.status !== 0) {
    log(`teams: snapshot batch failed (status ${result.status})`);
    if (result.stderr) log(`teams: stderr: ${result.stderr.trim().slice(0, 300)}`);
    return null;
  }

  const cleaned = stripContentBoundaries(result.stdout);
  log(`teams: batch stdout ${cleaned.length} chars`);

  if (!cleaned.trim()) {
    log('teams: batch output empty after stripping boundaries');
    return null;
  }

  // Session check: find URL line
  const lines = cleaned.split('\n');
  const urlLine = lines.find(l => /^https?:\/\/\S+$/.test(l.trim()));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`teams: session expired — login URL: ${urlLine.trim().slice(0, 80)}`);
    return { _loginRequired: true };
  }

  return { snapshotText: cleaned };
}

/**
 * Find the agent-browser ref (@eN) for a left-rail nav button in a Teams snapshot.
 *
 * The ARIA snapshot format is:
 *   - button "Activity" [@e5]
 *   - button "Activity, 3 unread" [@e5, aria-pressed=false]
 *
 * Matches exact label or label with a suffix (badge count: "Activity, 3 unread").
 *
 * @param {string} snapshotText - ARIA snapshot text
 * @param {string} label - Button label to find (e.g., 'Activity', 'Chat')
 * @returns {string|null} ref like '@e5', or null if not found
 */
function findNavRef(snapshotText, label) {
  for (const line of snapshotText.split('\n')) {
    // Match any role with a quoted name and a bracketed attrs section
    const m = line.match(/^\s*-\s+\S+\s+"(.+?)"\s*\[([^\]]*)\]/);
    if (!m) continue;
    const name = m[1].trim();
    if (name !== label && !name.startsWith(label + ',') && !name.startsWith(label + ' ')) continue;
    // Snapshot uses "ref=eN" format; click command expects "@eN"
    const refMatch = m[2].match(/ref=(e\d+)/);
    if (refMatch) return '@' + refMatch[1];
  }
  return null;
}

/**
 * Click the Activity button in Teams left rail, wait, and re-snapshot.
 * Teams may land on Chat or another view by default.
 *
 * Uses the @eN ref from the already-captured snapshot to click — avoids all
 * DOM selector guessing and policy caching issues (click is in every policy file).
 *
 * @param {string} currentSnapshotText - snapshot from fetchActivityFeed (used to find ref)
 * @returns {{ snapshotText: string } | null}
 */
function navigateToActivity(currentSnapshotText) {
  const ref = findNavRef(currentSnapshotText, 'Activity');
  if (!ref) {
    log('teams: Activity button ref not found in snapshot — cannot navigate');
    return null;
  }
  log(`teams: clicking Activity by ref ${ref}`);

  let result = runBatch([
    ['click', ref],
    ['wait', '5000'],
    ['snapshot'],
  ], POLICY);

  // If click was blocked (e.g. loading screen still covering button), wait for
  // Teams to settle, re-snapshot for fresh refs, and retry once.
  if (result.status !== 0) {
    log('teams: activity click blocked — waiting 8 s for loading screen to clear, then retrying');
    const refreshResult = runBatch([
      ['wait', '8000'],
      ['snapshot'],
    ], POLICY);
    if (refreshResult.status !== 0) return null;
    const refreshed = stripContentBoundaries(refreshResult.stdout);
    if (!refreshed.trim()) return null;

    const retryRef = findNavRef(refreshed, 'Activity');
    if (!retryRef) return null;
    log(`teams: retrying Activity click with ref ${retryRef}`);

    result = runBatch([
      ['click', retryRef],
      ['wait', '5000'],
      ['snapshot'],
    ], POLICY);
    if (result.status !== 0) {
      log('teams: activity navigation retry also failed');
      return null;
    }
  }

  const cleaned = stripContentBoundaries(result.stdout);
  if (!cleaned.trim()) return null;

  return { snapshotText: cleaned };
}

/**
 * Click the Chat button in Teams left rail, wait, and snapshot for unread chats.
 *
 * @param {string} currentSnapshotText - snapshot from fetchActivityFeed (used to find ref)
 * @returns {{ snapshotText: string } | null}
 */
function navigateToChat(currentSnapshotText) {
  const ref = findNavRef(currentSnapshotText, 'Chat');
  if (!ref) {
    log('teams: Chat button ref not found in snapshot — cannot navigate');
    return null;
  }
  log(`teams: clicking Chat by ref ${ref}`);

  const result = runBatch([
    ['click', ref],
    ['wait', '5000'],
    ['snapshot'],
  ], POLICY);

  if (result.status !== 0) {
    log('teams: chat navigation batch failed');
    return null;
  }

  const cleaned = stripContentBoundaries(result.stdout);
  if (!cleaned.trim()) return null;

  return { snapshotText: cleaned };
}

/**
 * Extract activity feed items from a Teams accessibility snapshot.
 *
 * Teams Activity feed ARIA structure (expected patterns):
 *   - listitem "Sender mentioned you in Channel — message preview — time"
 *   - listitem "Sender replied to your message in Channel — preview — time"
 *   - listitem "Sender sent a message in Channel — preview — time"
 *   - option elements with notification text
 *
 * The exact structure varies by Teams version. We extract:
 *   - listitem and option elements with descriptive accessible names
 *   - Filter out structural elements (buttons, tabs, navigation)
 *
 * @param {string} text - Raw snapshot text
 * @returns {Array<{ raw_text: string, type: string }>}
 */
function extractActivityItems(text) {
  const items = [];
  const seen = new Set();

  for (const line of text.split('\n')) {
    // Match listitem or option with quoted accessible name
    const m = line.match(/^\s*-\s+(listitem|option)\s+"(.+?)"\s*(?:\[.*)?$/);
    if (!m) continue;

    const role = m[1];
    const name = m[2].trim();

    // Skip short/structural items
    if (name.length < 10) continue;
    // Skip navigation and UI chrome
    if (/^(Activity|Chat|Teams|Calendar|Calls|Files|More|Search|Settings|New chat|View more|Sidepane|Apps|Open office|Your profile|Turn on|Close|Stay in the know)/i.test(name)) continue;
    // Skip items that are purely UI labels (no person name pattern)
    if (/^(Search \(|Profile picture|Desktop notifications)/i.test(name)) continue;

    // Dedup
    const key = name.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);

    // Detect type from keywords
    let type = 'notification';
    const nameLower = name.toLowerCase();
    if (nameLower.includes('mentioned you') || nameLower.includes('@')) {
      type = 'mention';
    } else if (nameLower.includes('replied')) {
      type = 'reply';
    } else if (nameLower.includes('reacted')) {
      type = 'reaction';
    } else if (nameLower.includes('sent a message') || nameLower.includes('new message')) {
      type = 'message';
    }

    items.push({ raw_text: name, type });
  }

  log(`teams: extractActivityItems found ${items.length} items`);
  return items;
}

/**
 * Extract chat list items from a Teams snapshot.
 * Chat list items typically appear as listitem or option with chat name + preview.
 *
 * @param {string} text - Raw snapshot text
 * @returns {Array<{ raw_text: string, has_unread: boolean }>}
 */
function extractChatItems(text) {
  const items = [];
  const seen = new Set();

  for (const line of text.split('\n')) {
    const m = line.match(/^\s*-\s+(listitem|option)\s+"(.+?)"\s*(?:\[.*)?$/);
    if (!m) continue;

    const name = m[2].trim();
    if (name.length < 5) continue;
    // Skip navigation items
    if (/^(Activity|Chat|Teams|Calendar|Calls|Files|More|Search|Settings)/i.test(name)) continue;

    const key = name.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);

    // Unread detection: accessible name often contains "unread" or a badge count
    const hasUnread = /\bunread\b/i.test(name) || /\b\d+\s*new\b/i.test(name);

    items.push({ raw_text: name, has_unread: hasUnread });
  }

  log(`teams: extractChatItems found ${items.length} items`);
  return items;
}

/**
 * Parse an activity feed item's accessible name into structured fields.
 *
 * Patterns observed:
 *   "Sender mentioned you in Channel — message preview — 2h ago"
 *   "Sender replied to your message in Channel — preview — Yesterday"
 *   "Sender sent a message in Channel — preview — 10:30 AM"
 *
 * Delimiter is typically " — " (em dash with spaces) or " - " (hyphen).
 *
 * @param {string} rawText - Accessible name of the activity item
 * @param {string} type - Item type from extractActivityItems
 * @returns {{ sender: string, channel: string|null, preview: string, time: string|null, type: string }}
 */
function parseActivityItem(rawText, type) {
  // Try splitting on em dash first, then hyphen
  let parts = rawText.split(/\s+[—–]\s+/);
  if (parts.length < 2) {
    parts = rawText.split(/\s+-\s+/);
  }

  // Last part is often the time
  let time = null;
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    if (/^\d{1,2}:\d{2}\s*[AP]M$/i.test(lastPart) ||
        /^\d+[hmd]\s*ago$/i.test(lastPart) ||
        /^\d+\s+(?:hour|minute|day|week)s?\s+ago$/i.test(lastPart) ||
        /^(yesterday|today|just now)/i.test(lastPart) ||
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(lastPart) ||
        /^\d{1,2}\/\d{1,2}/i.test(lastPart)) {
      time = lastPart;
      parts = parts.slice(0, -1);
    }
  }

  // First part contains sender (and possibly channel context)
  const firstPart = parts[0] || '';
  let sender = firstPart;
  let channel = null;

  // Extract "in Channel" pattern
  const inMatch = firstPart.match(/^(.+?)\s+(?:mentioned you |replied .+?|sent a message )?in\s+(.+)/i);
  if (inMatch) {
    sender = inMatch[1].trim();
    channel = inMatch[2].trim();
  } else {
    // Try simpler: just the first word/name before a keyword
    const kwMatch = firstPart.match(/^(.+?)\s+(?:mentioned|replied|sent|reacted|liked)/i);
    if (kwMatch) {
      sender = kwMatch[1].trim();
    }
  }

  // Preview is the middle parts joined
  const preview = parts.length > 1 ? parts.slice(1).join(' — ').trim() : '';

  return { sender, channel, preview, time, type };
}

/**
 * Parse a chat list item's accessible name into structured fields.
 *
 * @param {string} rawText - Accessible name
 * @param {boolean} hasUnread
 * @returns {{ name: string, preview: string, time: string|null, has_unread: boolean }}
 */
function parseChatItem(rawText, hasUnread) {
  const parts = rawText.split(/\s+[—–]\s+/);

  const name = parts[0] ? parts[0].trim() : rawText;
  let preview = '';
  let time = null;

  if (parts.length >= 3) {
    preview = parts.slice(1, -1).join(' ').trim();
    const lastPart = parts[parts.length - 1].trim();
    if (/\d/.test(lastPart) || /ago|yesterday|today/i.test(lastPart)) {
      time = lastPart;
    } else {
      preview = parts.slice(1).join(' ').trim();
    }
  } else if (parts.length === 2) {
    preview = parts[1].trim();
  }

  return { name, preview, time, has_unread: hasUnread };
}

/**
 * Find the ARIA ref and resolved name of a chat list item matching a query string.
 * Scans listitem/option elements in the Chat view snapshot.
 *
 * @param {string} snapshotText - ARIA snapshot from the Chat view
 * @param {string} query - Case-insensitive substring to match against the item name
 * @returns {{ ref: string, name: string } | null}
 */
function findChatItemRef(snapshotText, query) {
  const q = query.toLowerCase();
  for (const line of snapshotText.split('\n')) {
    const m = line.match(/^\s*-\s+(listitem|option)\s+"(.+?)"\s*\[([^\]]*)\]/);
    if (!m) continue;
    const name = m[2].trim();
    if (/^(Activity|Chat|Teams|Calendar|Calls|Files|More|Search|Settings)/i.test(name)) continue;
    if (name.length < 3) continue;
    if (!name.toLowerCase().includes(q)) continue;
    const refMatch = m[3].match(/ref=(e\d+)/);
    if (refMatch) return { ref: '@' + refMatch[1], name };
  }
  return null;
}

/**
 * Extract individual messages from a Teams conversation panel snapshot.
 *
 * Teams conversation ARIA structure (observed live):
 *   - heading "preview by Sender Name" [level=4, ref=eN]
 *   - time "Full date string."
 *     - StaticText "Short time"
 *   - StaticText "Sender Name"
 *   - group "..." [ref=eN]
 *     - button "More message options"
 *     - paragraph
 *       - StaticText "Full message content"
 *
 * Level-3 headings are day separators ("Monday", "Today") and are skipped.
 *
 * @param {string} snapshotText - Raw snapshot from the conversation panel
 * @returns {Array<{ sender: string, content: string, time: string|null, full_time: string|null }>}
 */
function extractMessages(snapshotText) {
  const lines = snapshotText.split('\n');

  // Pass 1: collect level=4 headings (message headers) with line index
  const headings = [];
  // Pass 2: collect time elements with line index
  const times = [];
  // Pass 3: collect paragraph > StaticText contents with line index
  const contents = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Level=4 heading → message header: "PREVIEW by SENDER"
    const hm = line.match(/-\s+heading\s+"(.+?)"\s+\[level=4/);
    if (hm) {
      const bySender = hm[1].match(/\sby\s+([^"]+)$/);
      if (bySender) {
        headings.push({ sender: bySender[1].trim(), lineIdx: i });
      }
      continue;
    }

    // time element → short time in next StaticText
    const tm = line.match(/-\s+time\s+"(.+?)"\s*(?:\[.*)?$/);
    if (tm) {
      const fullTime = tm[1].replace(/\.$/, '').trim();
      if (i + 1 < lines.length) {
        const stm = lines[i + 1].match(/-\s+StaticText\s+"(.+?)"\s*$/);
        if (stm) times.push({ fullTime, shortTime: stm[1].trim(), lineIdx: i });
      }
      continue;
    }

    // paragraph → collect ALL StaticTexts within its subtree (handles @mention spans
    // which Teams renders as nested elements, splitting text across multiple nodes)
    if (/-\s+paragraph\s*$/.test(line)) {
      const pIndent = line.search(/\S/);
      const parts = [];
      for (let k = i + 1; k < lines.length; k++) {
        const kl = lines[k];
        if (!kl.trim()) continue;
        if (kl.search(/\S/) <= pIndent) break; // back to paragraph level or above
        const stm = kl.match(/-\s+StaticText\s+"(.+?)"\s*$/);
        if (stm && stm[1].trim()) parts.push(stm[1].trim());
      }
      if (parts.length > 0) contents.push({ content: parts.join(' '), lineIdx: i });
    }
  }

  // Zip: for each heading, find the time and content that appear before the next heading
  const messages = [];
  for (let h = 0; h < headings.length; h++) {
    const { sender, lineIdx: hLine } = headings[h];
    const nextHLine = h + 1 < headings.length ? headings[h + 1].lineIdx : Infinity;

    const t = times.find(x => x.lineIdx > hLine && x.lineIdx < nextHLine);
    const c = contents.find(x => x.lineIdx > hLine && x.lineIdx < nextHLine);

    if (!c && !t) continue; // skip headings with no associated content or time
    messages.push({
      sender,
      content: c ? c.content : '',
      time: t ? t.shortTime : null,
      full_time: t ? t.fullTime : null,
    });
  }

  log(`teams: extractMessages found ${messages.length} messages`);
  return messages;
}

/**
 * Main teams subcommand handler.
 *
 * Modes:
 *   activity (default) — Activity feed notifications
 *   mentions — Filtered to @mentions only
 *   unread — Unread chats only
 *   chats — All recent chats (read + unread)
 */
function runTeams() {
  const { mode, limit } = parseArgs(process.argv);
  log(`teams: mode="${mode}" limit=${limit}`);

  // Step 1: Open Teams
  const initial = fetchActivityFeed();
  if (!initial) {
    outputError('teams', 'OPERATION_FAILED', 'Teams batch failed — browser error or timeout');
    return;
  }
  if (initial._loginRequired) {
    outputError('teams', 'SESSION_INVALID', 'Teams session expired — run: node outlook.js auth (ensure Teams SSO is active in your browser profile)');
    return;
  }

  let snapshotText = initial.snapshotText;

  if (mode === 'chats' || mode === 'unread') {
    // Navigate to Chat view
    const chatResult = navigateToChat(snapshotText);
    if (chatResult && chatResult.snapshotText) {
      snapshotText = chatResult.snapshotText;
    }

    let chatItems = extractChatItems(snapshotText);
    if (mode === 'unread') {
      chatItems = chatItems.filter(c => c.has_unread);
    }
    const results = chatItems.slice(0, limit).map(item => parseChatItem(item.raw_text, item.has_unread));

    process.stdout.write(JSON.stringify({
      operation: 'teams',
      status: 'ok',
      mode,
      results,
      count: results.length,
      error: null,
    }) + '\n');
    log(`teams: returning ${results.length} ${mode} chats`);
    return;
  }

  // Activity or mentions mode — always navigate to Activity feed
  // Teams may land on Chat view; we must click Activity to get the right snapshot
  const activityResult = navigateToActivity(snapshotText);
  if (activityResult && activityResult.snapshotText) {
    snapshotText = activityResult.snapshotText;
  }

  const activityItems = extractActivityItems(snapshotText);

  // Filter to mentions if requested
  let filtered = activityItems;
  if (mode === 'mentions') {
    filtered = activityItems.filter(item => item.type === 'mention');
  }

  const results = filtered.slice(0, limit).map(item => parseActivityItem(item.raw_text, item.type));

  process.stdout.write(JSON.stringify({
    operation: 'teams',
    status: 'ok',
    mode,
    results,
    count: results.length,
    error: null,
  }) + '\n');
  log(`teams: returning ${results.length} ${mode} items`);
}

/**
 * teams-read subcommand handler.
 * Opens a specific chat conversation and returns its recent messages.
 *
 * Usage: node outlook.js teams-read <name-query> [--limit N]
 */
function runTeamsRead() {
  const { query, limit } = parseTeamsReadArgs(process.argv);
  log(`teams-read: query="${query}" limit=${limit}`);

  if (!query) {
    outputError('teams-read', 'INVALID_ARGS', 'Usage: node outlook.js teams-read <name> [--limit N]');
    return;
  }

  // Step 1: Open Teams
  const initial = fetchActivityFeed();
  if (!initial) {
    outputError('teams-read', 'OPERATION_FAILED', 'Teams batch failed — browser error or timeout');
    return;
  }
  if (initial._loginRequired) {
    outputError('teams-read', 'SESSION_INVALID', 'Teams session expired — run: node outlook.js auth (ensure Teams SSO is active in your browser profile)');
    return;
  }

  let snapshotText = initial.snapshotText;

  // Step 2: Navigate to Chat view to see the conversation list
  const chatResult = navigateToChat(snapshotText);
  if (chatResult && chatResult.snapshotText) {
    snapshotText = chatResult.snapshotText;
  }

  // Step 3: Find the chat matching the query
  const chatMatch = findChatItemRef(snapshotText, query);
  if (!chatMatch) {
    outputError('teams-read', 'NOT_FOUND', `No chat found matching "${query}" — use "node outlook.js teams --chats" to list available conversations`);
    return;
  }
  log(`teams-read: opening chat "${chatMatch.name}" ref ${chatMatch.ref}`);

  // Step 4: Click the chat and snapshot the conversation
  const convResult = runBatch([
    ['click', chatMatch.ref],
    ['wait', '4000'],
    ['snapshot'],
  ], POLICY);

  if (convResult.status !== 0) {
    outputError('teams-read', 'OPERATION_FAILED', `Failed to open conversation with "${chatMatch.name}"`);
    return;
  }

  const convSnapshot = stripContentBoundaries(convResult.stdout);
  if (!convSnapshot.trim()) {
    outputError('teams-read', 'OPERATION_FAILED', 'Empty conversation snapshot');
    return;
  }

  // Step 5: Extract and return messages (most recent N)
  const allMessages = extractMessages(convSnapshot);
  const results = allMessages.slice(-limit);

  process.stdout.write(JSON.stringify({
    operation: 'teams-read',
    status: 'ok',
    chat_name: chatMatch.name,
    results,
    count: results.length,
    error: null,
  }) + '\n');
  log(`teams-read: returning ${results.length} messages from "${chatMatch.name}"`);
}

module.exports = {
  runTeams, runTeamsRead,
  parseArgs, parseTeamsReadArgs,
  findNavRef, findChatItemRef,
  extractActivityItems, extractChatItems, extractMessages,
  parseActivityItem, parseChatItem,
};
