'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  findNavRef,
  extractActivityItems,
  parseActivityItem,
  parseChatItem,
} = require('../outlook-web/lib/teams');

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('returns default mode=activity limit=30 when no args', () => {
    const result = parseArgs(['node', 'outlook.js', 'teams']);
    assert.equal(result.mode, 'activity');
    assert.equal(result.limit, 30);
  });

  it('sets mode=mentions with --mentions flag', () => {
    const result = parseArgs(['node', 'outlook.js', 'teams', '--mentions']);
    assert.equal(result.mode, 'mentions');
  });

  it('sets mode=unread with --unread flag', () => {
    const result = parseArgs(['node', 'outlook.js', 'teams', '--unread']);
    assert.equal(result.mode, 'unread');
  });

  it('sets limit with --limit N', () => {
    const result = parseArgs(['node', 'outlook.js', 'teams', '--limit', '5']);
    assert.equal(result.limit, 5);
  });

  it('ignores invalid --limit value and keeps default', () => {
    const result = parseArgs(['node', 'outlook.js', 'teams', '--limit', 'abc']);
    assert.equal(result.limit, 30);
  });

  it('ignores --limit 0 and keeps default', () => {
    const result = parseArgs(['node', 'outlook.js', 'teams', '--limit', '0']);
    assert.equal(result.limit, 30);
  });
});

// ---------------------------------------------------------------------------
// findNavRef
// ---------------------------------------------------------------------------

describe('findNavRef', () => {
  it('finds ref for exact label match', () => {
    const snapshot = `
      - button "Activity" [ref=e5]
      - button "Chat" [ref=e8]
    `;
    assert.equal(findNavRef(snapshot, 'Activity'), '@e5');
  });

  it('finds ref when label has badge count suffix', () => {
    const snapshot = `
      - button "Activity, 3 unread" [ref=e5, aria-pressed=false]
    `;
    assert.equal(findNavRef(snapshot, 'Activity'), '@e5');
  });

  it('returns null when label is not present', () => {
    const snapshot = `
      - button "Chat" [ref=e8]
      - button "Teams" [ref=e9]
    `;
    assert.equal(findNavRef(snapshot, 'Activity'), null);
  });

  it('picks the correct button among multiple', () => {
    const snapshot = `
      - button "Chat" [ref=e8]
      - button "Activity" [ref=e5]
      - button "Calendar" [ref=e12]
    `;
    assert.equal(findNavRef(snapshot, 'Activity'), '@e5');
    assert.equal(findNavRef(snapshot, 'Chat'), '@e8');
  });

  it('returns null for empty snapshot', () => {
    assert.equal(findNavRef('', 'Activity'), null);
  });
});

// ---------------------------------------------------------------------------
// extractActivityItems
// ---------------------------------------------------------------------------

describe('extractActivityItems', () => {
  it('detects mention type', () => {
    const snapshot = `
      - listitem "Alice mentioned you in General — hey check this out — 2h ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'mention');
  });

  it('detects reply type', () => {
    const snapshot = `
      - listitem "Bob replied to your message in Engineering — sounds good — 1h ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'reply');
  });

  it('detects reaction type', () => {
    const snapshot = `
      - listitem "Carol reacted to your message with a like — 30m ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'reaction');
  });

  it('deduplicates identical items', () => {
    const snapshot = `
      - listitem "Alice mentioned you in General — hey check this out — 2h ago"
      - listitem "Alice mentioned you in General — hey check this out — 2h ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
  });

  it('filters items shorter than 10 characters', () => {
    const snapshot = `
      - listitem "Short"
      - listitem "Alice mentioned you in General — message — 1h ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
  });

  it('filters nav/chrome items by name', () => {
    const snapshot = `
      - listitem "Activity"
      - listitem "Chat"
      - listitem "Settings"
      - listitem "Alice mentioned you in General — message — 1h ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
  });

  it('does not include generic role elements', () => {
    const snapshot = `
      - generic "Alice mentioned you in General — message — 1h ago"
      - listitem "Bob replied to your message in Engineering — great — 2h ago"
    `;
    const items = extractActivityItems(snapshot);
    assert.equal(items.length, 1);
    assert.equal(items[0].raw_text, 'Bob replied to your message in Engineering — great — 2h ago');
  });
});

// ---------------------------------------------------------------------------
// parseActivityItem
// ---------------------------------------------------------------------------

describe('parseActivityItem', () => {
  it('parses em-dash delimited item with channel and time', () => {
    const result = parseActivityItem('Alice mentioned you in General — hey check this out — 2h ago', 'mention');
    assert.equal(result.sender, 'Alice');
    assert.equal(result.channel, 'General');
    assert.equal(result.preview, 'hey check this out');
    assert.equal(result.time, '2h ago');
    assert.equal(result.type, 'mention');
  });

  it('parses en-dash delimited item', () => {
    const result = parseActivityItem('Bob replied to your message in Engineering – sounds good – 1h ago', 'reply');
    assert.equal(result.sender, 'Bob');
    assert.equal(result.channel, 'Engineering');
    assert.equal(result.time, '1h ago');
    assert.equal(result.type, 'reply');
  });

  it('extracts clock time at end', () => {
    const result = parseActivityItem('Alice sent a message in General — hello — 10:30 AM', 'message');
    assert.equal(result.time, '10:30 AM');
    assert.equal(result.preview, 'hello');
  });

  it('extracts "in Channel" pattern from first part', () => {
    const result = parseActivityItem('Dave mentioned you in Project Alpha — ping — Yesterday', 'mention');
    assert.equal(result.sender, 'Dave');
    assert.equal(result.channel, 'Project Alpha');
    assert.equal(result.time, 'Yesterday');
  });

  it('handles item with no channel (no "in X" pattern)', () => {
    const result = parseActivityItem('Eve reacted to your message — 5m ago', 'reaction');
    assert.equal(result.sender, 'Eve');
    assert.equal(result.channel, null);
  });

  it('preserves type field', () => {
    const result = parseActivityItem('Alice mentioned you in General — msg — 1h ago', 'mention');
    assert.equal(result.type, 'mention');
  });

  it('extracts full-word time format "3 hours ago"', () => {
    const result = parseActivityItem('Alice mentioned you in General — hello — 3 hours ago', 'mention');
    assert.equal(result.time, '3 hours ago');
  });

  it('extracts full-word time format "2 days ago"', () => {
    const result = parseActivityItem('Bob replied to your message in General — ok — 2 days ago', 'reply');
    assert.equal(result.time, '2 days ago');
  });
});

// ---------------------------------------------------------------------------
// parseChatItem
// ---------------------------------------------------------------------------

describe('parseChatItem', () => {
  it('parses name, preview, and time from em-dash delimited string', () => {
    const result = parseChatItem('Alice — hey are you free? — 10:30 AM', false);
    assert.equal(result.name, 'Alice');
    assert.equal(result.preview, 'hey are you free?');
    assert.equal(result.time, '10:30 AM');
    assert.equal(result.has_unread, false);
  });

  it('sets has_unread true when passed true', () => {
    const result = parseChatItem('Bob — new message — 2h ago', true);
    assert.equal(result.has_unread, true);
  });

  it('uses full string as name when em-dash split yields one part', () => {
    const result = parseChatItem('Smith, John', false);
    assert.equal(result.name, 'Smith, John');
    assert.equal(result.preview, '');
    assert.equal(result.time, null);
  });

  it('does not split on comma (no comma-split fallback)', () => {
    const result = parseChatItem('Last, First', false);
    assert.equal(result.name, 'Last, First');
  });

  it('handles two-part em-dash split (name + preview, no time)', () => {
    const result = parseChatItem('Carol — see you tomorrow', false);
    assert.equal(result.name, 'Carol');
    assert.equal(result.preview, 'see you tomorrow');
    assert.equal(result.time, null);
  });
});
