'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  parseTeamsReadArgs,
  findNavRef,
  findChatItemRef,
  extractActivityItems,
  extractMessages,
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

// ---------------------------------------------------------------------------
// parseTeamsReadArgs
// ---------------------------------------------------------------------------

describe('parseTeamsReadArgs', () => {
  it('returns query from positional arg and default limit 50', () => {
    const result = parseTeamsReadArgs(['node', 'outlook.js', 'teams-read', 'Alice']);
    assert.equal(result.query, 'Alice');
    assert.equal(result.limit, 50);
  });

  it('joins multiple positional args into query', () => {
    const result = parseTeamsReadArgs(['node', 'outlook.js', 'teams-read', 'Smith', 'John']);
    assert.equal(result.query, 'Smith John');
  });

  it('parses --limit flag', () => {
    const result = parseTeamsReadArgs(['node', 'outlook.js', 'teams-read', 'Alice', '--limit', '10']);
    assert.equal(result.limit, 10);
  });

  it('ignores invalid --limit and keeps default', () => {
    const result = parseTeamsReadArgs(['node', 'outlook.js', 'teams-read', 'Alice', '--limit', 'abc']);
    assert.equal(result.limit, 50);
  });

  it('returns empty query when no args given', () => {
    const result = parseTeamsReadArgs(['node', 'outlook.js', 'teams-read']);
    assert.equal(result.query, '');
  });
});

// ---------------------------------------------------------------------------
// findChatItemRef
// ---------------------------------------------------------------------------

describe('findChatItemRef', () => {
  const snapshot = `
    - listitem "Alice Smith — hey are you free? — 10:30 AM" [ref=e20, cursor:pointer]
    - listitem "Bob Jones — sounds good — Yesterday" [ref=e21, cursor:pointer]
    - listitem "Activity" [ref=e5]
  `;

  it('finds ref for case-insensitive partial name match', () => {
    const result = findChatItemRef(snapshot, 'alice');
    assert.ok(result, 'should return a match');
    assert.equal(result.ref, '@e20');
  });

  it('returns name of the matched item', () => {
    const result = findChatItemRef(snapshot, 'bob');
    assert.ok(result);
    assert.ok(result.name.includes('Bob Jones'));
  });

  it('returns null when query does not match any item', () => {
    const result = findChatItemRef(snapshot, 'Carol');
    assert.equal(result, null);
  });

  it('skips navigation items even if query matches', () => {
    const result = findChatItemRef(snapshot, 'Activity');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// extractMessages
// ---------------------------------------------------------------------------

describe('extractMessages', () => {
  // Realistic ARIA snapshot of a Teams conversation panel (anonymised)
  const snapshot = `
    - generic "Message List"
      - generic
        - heading "I'm not sure, I would assume the SaaS optio... by Alice Smith" [level=4, ref=e10]
        - time "Monday, July 14, 2026 1:53 PM."
          - StaticText "Monday 1:53 PM"
        - StaticText "Alice Smith"
        - group "I'm not sure, I would assume the SaaS option Alice Smith Monday, July 14, 2026 1:53 PM." [ref=e20]
          - button "More message options" [ref=e30]
          - paragraph
            - StaticText "I'm not sure, I would assume the SaaS option"
        - heading "Sounds good, I'll follow up by Bob Jones" [level=4, ref=e11]
        - StaticText "Bob Jones"
        - time "Monday, July 14, 2026 2:05 PM."
          - StaticText "Monday 2:05 PM"
        - group "Sounds good, I'll follow up Bob Jones Monday, July 14, 2026 2:05 PM." [ref=e21]
          - button "More message options" [ref=e31]
          - paragraph
            - StaticText "Sounds good, I'll follow up"
        - heading "Today" [level=3, ref=e12]
        - heading "Hi, do you have a moment? by Alice Smith" [level=4, ref=e13]
        - time "Today at 10:30 AM."
          - StaticText "10:30 AM"
        - group "Hi, do you have a moment? Alice Smith Today at 10:30 AM." [ref=e22]
          - button "More message options" [ref=e32]
          - paragraph
            - StaticText "Hi, do you have a moment?"
  `;

  it('returns the correct number of messages (skips level=3 day separators)', () => {
    const msgs = extractMessages(snapshot);
    assert.equal(msgs.length, 3);
  });

  it('extracts sender from "by Sender" in heading', () => {
    const msgs = extractMessages(snapshot);
    assert.equal(msgs[0].sender, 'Alice Smith');
    assert.equal(msgs[1].sender, 'Bob Jones');
  });

  it('extracts full message content from paragraph StaticText(s)', () => {
    const msgs = extractMessages(snapshot);
    assert.equal(msgs[0].content, "I'm not sure, I would assume the SaaS option");
    assert.equal(msgs[2].content, 'Hi, do you have a moment?');
  });

  it('joins multiple StaticTexts in a paragraph (mention spans)', () => {
    const mentionSnapshot = `
      - generic "Message List"
        - heading "Hi by Alice Smith" [level=4, ref=e1]
        - time "Today at 9:00 AM."
          - StaticText "9:00 AM"
        - group "Hi Bob for the meeting Alice Smith Today at 9:00 AM." [ref=e2]
          - paragraph
            - StaticText "Hi"
            - StaticText "Bob"
            - StaticText "for the meeting"
    `;
    const msgs = extractMessages(mentionSnapshot);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].content, 'Hi Bob for the meeting');
  });

  it('extracts short time from time > StaticText', () => {
    const msgs = extractMessages(snapshot);
    assert.equal(msgs[0].time, 'Monday 1:53 PM');
    assert.equal(msgs[2].time, '10:30 AM');
  });

  it('extracts full_time without trailing period', () => {
    const msgs = extractMessages(snapshot);
    assert.equal(msgs[0].full_time, 'Monday, July 14, 2026 1:53 PM');
  });

  it('returns empty array for empty snapshot', () => {
    const msgs = extractMessages('');
    assert.equal(msgs.length, 0);
  });

  it('returns empty array when no level=4 headings present', () => {
    const msgs = extractMessages(`
      - heading "Today" [level=3, ref=e1]
      - button "Send" [ref=e2]
    `);
    assert.equal(msgs.length, 0);
  });
});
