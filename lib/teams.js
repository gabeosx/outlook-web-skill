'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // reuse — needs click, eval, snapshot

// Teams login domains (Entra SSO same as Outlook, plus Teams-specific)
const TEAMS_LOGIN_DOMAINS = ['login.microsoftonline.com', 'login.live.com', 'login.windows.net'];

/**
 * Parse process.argv for teams subcommand arguments.
 * Expects: node outlook.js teams [--mentions] [--unread] [--limit N]
 *
 * Modes:
 *   (default)   — Activity feed (all recent notifications)
 *   --mentions  — Filter to @mentions only
 *   --unread    — Unread chats only
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
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) limit = n;
      i++;
    }
  }

  return { mode, limit };
}

/**
 * Check if a URL indicates a Teams login redirect.
 * @param {string} url
 * @returns {boolean}
 */
function isTeamsLoginUrl(url) {
  if (!url || url === 'about:blank') return true;
  return TEAMS_LOGIN_DOMAINS.some(d => url.includes(d));
}

/**
 * Navigate to Teams activity feed and take an accessibility snapshot.
 * Returns the raw snapshot text or null on failure.
 *
 * @returns {{ snapshotText: string } | null}
 */
function fetchActivityFeed() {
  const teamsUrl = process.env.TEAMS_BASE_URL || 'https://teams.microsoft.com';

  const result = runBatch([
    ['open', teamsUrl],
    ['wait', '6000'],               // Teams SPA is heavier than Outlook
    ['get', 'url'],                 // session check
    ['snapshot'],                   // capture activity feed
  ], POLICY);

  if (result.status !== 0) {
    log(`teams: initial batch failed (status ${result.status})`);
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
  if (urlLine && isTeamsLoginUrl(urlLine.trim())) {
    log(`teams: session expired — login URL: ${urlLine.trim().slice(0, 80)}`);
    return { _loginRequired: true };
  }

  return { snapshotText: cleaned };
}

/**
 * Click the Activity button in Teams left rail, wait, and re-snapshot.
 * Teams may land on Chat or another view by default.
 *
 * @returns {{ snapshotText: string } | null}
 */
function navigateToActivity() {
  const result = runBatch([
    ['find', 'text', 'Activity', 'click'],
    ['wait', '3000'],
    ['snapshot'],
  ], POLICY);

  if (result.status !== 0) {
    log('teams: activity navigation batch failed');
    return null;
  }

  const cleaned = stripContentBoundaries(result.stdout);
  if (!cleaned.trim()) return null;

  return { snapshotText: cleaned };
}

/**
 * Click the Chat button in Teams left rail, wait, and snapshot for unread chats.
 *
 * @returns {{ snapshotText: string } | null}
 */
function navigateToChat() {
  const result = runBatch([
    ['find', 'text', 'Chat', 'click'],
    ['wait', '3000'],
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
    const m = line.match(/^\s*-\s+(listitem|option|generic)\s+"(.+?)"\s*(?:\[.*)?$/);
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
  let parts = rawText.split(/\s+[—–]\s+/);
  if (parts.length < 2) {
    parts = rawText.split(/,\s*/);
  }

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
 * Main teams subcommand handler.
 *
 * Modes:
 *   activity (default) — Activity feed notifications
 *   mentions — Filtered to @mentions only
 *   unread — Unread chats
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

  if (mode === 'unread') {
    // Navigate to Chat view for unread chats
    const chatResult = navigateToChat();
    if (chatResult && chatResult.snapshotText) {
      snapshotText = chatResult.snapshotText;
    }

    const chatItems = extractChatItems(snapshotText);
    const unreadOnly = chatItems.filter(c => c.has_unread);
    const results = unreadOnly.slice(0, limit).map(item => parseChatItem(item.raw_text, item.has_unread));

    process.stdout.write(JSON.stringify({
      operation: 'teams',
      status: 'ok',
      mode: 'unread',
      results,
      count: results.length,
      error: null,
    }) + '\n');
    log(`teams: returning ${results.length} unread chats`);
    return;
  }

  // Activity or mentions mode — navigate to Activity feed
  // Check if we're already on Activity (initial load may land there)
  const hasActivityContent = snapshotText.includes('mentioned') ||
                              snapshotText.includes('replied') ||
                              snapshotText.includes('sent a message');

  if (!hasActivityContent) {
    const activityResult = navigateToActivity();
    if (activityResult && activityResult.snapshotText) {
      snapshotText = activityResult.snapshotText;
    }
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

module.exports = { runTeams, parseArgs, extractActivityItems, extractChatItems, parseActivityItem, parseChatItem };
