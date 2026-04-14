'use strict';

/**
 * Unit tests for calendar event parser (lib/calendar.js)
 *
 * All test input strings are real accessible name examples captured during live
 * ARIA exploration of Outlook calendar (Plan 06-01, confirmed-live 2026-04-14).
 * No synthetic/fabricated examples are used.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCalendarEventName,
  extractCalendarRows,
  parseCalendarArgs,
  parseCalendarSearchArgs,
  extractMeetingLink,
} = require('../lib/calendar');

// ---------------------------------------------------------------------------
// parseCalendarArgs
// ---------------------------------------------------------------------------

describe('parseCalendarArgs', () => {
  it('returns { days: 3 } when --days 3 is provided', () => {
    const result = parseCalendarArgs(['node', 'outlook.js', 'calendar', '--days', '3']);
    assert.equal(result.days, 3);
  });

  it('returns { days: 7 } by default when --days is omitted', () => {
    const result = parseCalendarArgs(['node', 'outlook.js', 'calendar']);
    assert.equal(result.days, 7);
  });

  it('returns { days: 14 } when --days 14 is provided', () => {
    const result = parseCalendarArgs(['node', 'outlook.js', 'calendar', '--days', '14']);
    assert.equal(result.days, 14);
  });

  it('ignores invalid --days value and uses default', () => {
    const result = parseCalendarArgs(['node', 'outlook.js', 'calendar', '--days', 'abc']);
    assert.equal(result.days, 7);
  });
});

// ---------------------------------------------------------------------------
// parseCalendarEventName — timed events
// ---------------------------------------------------------------------------

describe('parseCalendarEventName — timed recurring event (Teams meeting)', () => {
  // Real captured string: timed recurring event with Teams meeting location absent from name
  const name = 'AIG passwordless assessment (daily), 9:00 AM to 9:30 AM, Tuesday, April 14, 2026, By Lee, Joshua, Tentative, Recurring event';

  it('returns all D-07 schema fields', () => {
    const result = parseCalendarEventName(name);
    const requiredFields = [
      'id', 'subject', 'organizer', 'start_time', 'end_time', 'duration_minutes',
      'location', 'is_online_meeting', 'is_all_day', 'is_recurring', 'response_status',
    ];
    for (const field of requiredFields) {
      assert.ok(field in result, `Missing field: ${field}`);
    }
  });

  it('parses subject correctly', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.subject, 'AIG passwordless assessment (daily)');
  });

  it('parses start_time as ISO 8601', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.start_time, '2026-04-14T09:00:00.000Z');
  });

  it('parses end_time as ISO 8601', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.end_time, '2026-04-14T09:30:00.000Z');
  });

  it('calculates duration_minutes = 30', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.duration_minutes, 30);
  });

  it('parses organizer with lastname, firstname format', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Lee, Joshua');
  });

  it('parses response_status as tentative', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.response_status, 'tentative');
  });

  it('parses is_recurring = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_recurring, true);
  });

  it('parses is_all_day = false', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_all_day, false);
  });

  it('id is a non-empty string (composite key)', () => {
    const result = parseCalendarEventName(name);
    assert.equal(typeof result.id, 'string');
    assert.ok(result.id.length > 0);
    // Composite key contains subject
    const parsed = JSON.parse(result.id);
    assert.equal(parsed.subject, 'AIG passwordless assessment (daily)');
  });
});

describe('parseCalendarEventName — timed event with Microsoft Teams Meeting location', () => {
  // Real captured string: timed event with Teams meeting as location field
  const name = 'IAM Leads Meeting, 4:30 PM to 4:55 PM, Tuesday, April 14, 2026, Microsoft Teams Meeting, By Beasley, Chris, Tentative, Recurring event';

  it('parses subject correctly', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.subject, 'IAM Leads Meeting');
  });

  it('parses location as Microsoft Teams Meeting', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.location, 'Microsoft Teams Meeting');
  });

  it('detects is_online_meeting = true for Teams meeting', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_online_meeting, true);
  });

  it('parses organizer with lastname, firstname format', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Beasley, Chris');
  });

  it('calculates duration_minutes = 25', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.duration_minutes, 25);
  });

  it('parses is_recurring = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_recurring, true);
  });
});

describe('parseCalendarEventName — timed event with Zoom URL as location', () => {
  // Real captured string: timed event with Zoom URL in location field
  const name = 'Hold for Hitachi + Okta + Accenture?, 12:30 PM to 2:00 PM, Thursday, April 16, 2026, https://okta.zoom.us/j/95577737751?pwd=..., By Rob Howe, Tentative';

  it('parses subject correctly', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.subject, 'Hold for Hitachi + Okta + Accenture?');
  });

  it('detects is_online_meeting = true for Zoom URL', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_online_meeting, true);
  });

  it('parses organizer as single name (no comma)', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Rob Howe');
  });

  it('calculates duration_minutes = 90', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.duration_minutes, 90);
  });

  it('parses response_status as tentative', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.response_status, 'tentative');
  });
});

describe('parseCalendarEventName — timed event with physical location (multi-part address)', () => {
  // Real captured string: timed event with street address as location
  const name = 'NY PAN - Third Thursday Happy Hour, 5:30 PM to 7:00 PM, Thursday, April 16, 2026, 150 West 30th Street, New York, NY 10001, By Park, Laura, Tentative';

  it('parses location including street address parts', () => {
    const result = parseCalendarEventName(name);
    // Location should include all address parts before "By organizer"
    assert.ok(result.location && result.location.includes('150 West 30th Street'), `location was: ${result.location}`);
  });

  it('parses organizer with lastname, firstname format', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Park, Laura');
  });

  it('is_online_meeting = false for physical location', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_online_meeting, false);
  });
});

describe('parseCalendarEventName — exception to recurring event', () => {
  // Real captured string: timed event that is an exception to a recurring series
  const name = 'SAL Re-Imagined Talk [69]: ..., 10:00 AM to 11:00 AM, Thursday, April 16, 2026, Microsoft Teams Meeting, By Druchas, Nico, Tentative, Exception to recurring event';

  it('parses is_recurring = true for exception to recurring', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_recurring, true);
  });

  it('parses organizer correctly', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Druchas, Nico');
  });

  it('parses location as Microsoft Teams Meeting', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.location, 'Microsoft Teams Meeting');
  });
});

// ---------------------------------------------------------------------------
// parseCalendarEventName — all-day events
// ---------------------------------------------------------------------------

describe('parseCalendarEventName — all-day single-day event (no organizer)', () => {
  // Real captured string: all-day event owned by user, no organizer shown
  const name = 'OOO, all day event, Monday, April 13, 2026, OOF';

  it('parses is_all_day = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_all_day, true);
  });

  it('parses duration_minutes = 1440 for all-day event', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.duration_minutes, 1440);
  });

  it('parses start_time at midnight UTC', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.start_time, '2026-04-13T00:00:00.000Z');
  });

  it('parses end_time as next day midnight (exclusive)', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.end_time, '2026-04-14T00:00:00.000Z');
  });

  it('maps OOF response_status to accepted', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.response_status, 'accepted');
  });

  it('organizer is null when not in accessible name', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, null);
  });
});

describe('parseCalendarEventName — all-day single-day event with organizer', () => {
  // Real captured string: all-day recurring event with organizer
  const name = 'Prashant - working out of country, all day event, Sunday, April 12, 2026, By Nimbalagundi, Prashant, Free, Recurring event';

  it('parses is_all_day = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_all_day, true);
  });

  it('parses organizer with lastname, firstname format', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Nimbalagundi, Prashant');
  });

  it('maps Free response_status to accepted', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.response_status, 'accepted');
  });

  it('parses is_recurring = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_recurring, true);
  });
});

describe('parseCalendarEventName — all-day multi-day span', () => {
  // Real captured string: all-day event spanning multiple days
  const name = 'PTO, all day event, Thursday, April 16, 2026 to Friday, April 17, 2026, OOF';

  it('parses is_all_day = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_all_day, true);
  });

  it('parses start_time as Thursday', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.start_time, '2026-04-16T00:00:00.000Z');
  });

  it('parses end_time as day after last all-day date (Saturday)', () => {
    const result = parseCalendarEventName(name);
    // End time is Friday Apr 17 + 1 day = Saturday Apr 18
    assert.equal(result.end_time, '2026-04-18T00:00:00.000Z');
  });

  it('maps OOF response_status to accepted', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.response_status, 'accepted');
  });

  it('parses duration_minutes = 1440 for all-day event', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.duration_minutes, 1440);
  });
});

describe('parseCalendarEventName — all-day event with location and organizer', () => {
  // Real captured string: all-day recurring event with physical location
  const name = 'PAN NYM Third Thursdays at 1MW, all day event, Thursday, April 16, 2026, One Manhattan West - Floor 65, By Ehrenreich, Rachel, Free, Recurring event';

  it('parses location correctly', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.location, 'One Manhattan West - Floor 65');
  });

  it('parses organizer with lastname, firstname format', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.organizer, 'Ehrenreich, Rachel');
  });

  it('parses is_recurring = true', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_recurring, true);
  });

  it('is_online_meeting = false for physical location', () => {
    const result = parseCalendarEventName(name);
    assert.equal(result.is_online_meeting, false);
  });
});

// ---------------------------------------------------------------------------
// extractCalendarRows
// ---------------------------------------------------------------------------

describe('extractCalendarRows', () => {
  // Sample snapshot text containing event buttons and non-event buttons
  // Adapted from the ARIA exploration output format described in the critical context
  const snapshotText = `
    - main "calendar view, Week of April 14 to 18, 2026"
      - button "Previous week"
      - button "Next week"
      - button "Today"
      - button "AIG passwordless assessment (daily), 9:00 AM to 9:30 AM, Tuesday, April 14, 2026, By Lee, Joshua, Tentative, Recurring event"
      - button "IAM Leads Meeting, 4:30 PM to 4:55 PM, Tuesday, April 14, 2026, Microsoft Teams Meeting, By Beasley, Chris, Tentative, Recurring event"
      - button "OOO, all day event, Monday, April 13, 2026, OOF"
      - button "PTO, all day event, Thursday, April 16, 2026 to Friday, April 17, 2026, OOF"
      - button "Calendar"
      - button "Week"
      - button "Month"
  `;

  it('returns 4 event rows (skips navigation buttons)', () => {
    const rows = extractCalendarRows(snapshotText);
    assert.equal(rows.length, 4);
  });

  it('first row is the timed AIG event', () => {
    const rows = extractCalendarRows(snapshotText);
    assert.ok(rows[0].startsWith('AIG passwordless assessment (daily)'), `got: ${rows[0].slice(0, 60)}`);
  });

  it('includes all-day events', () => {
    const rows = extractCalendarRows(snapshotText);
    const allDayRows = rows.filter(r => r.includes('all day event'));
    assert.equal(allDayRows.length, 2);
  });

  it('does not include navigation buttons like "Next week" or "Calendar"', () => {
    const rows = extractCalendarRows(snapshotText);
    for (const row of rows) {
      assert.ok(!['Next week', 'Previous week', 'Today', 'Calendar', 'Week', 'Month'].includes(row),
        `Navigation button leaked: ${row}`);
    }
  });

  it('returns empty array for empty snapshot text', () => {
    const rows = extractCalendarRows('');
    assert.equal(rows.length, 0);
  });

  it('returns empty array for snapshot with no event buttons', () => {
    const rows = extractCalendarRows(`
      - button "Next week"
      - button "Calendar"
      - button "Today"
    `);
    assert.equal(rows.length, 0);
  });
});

// ---------------------------------------------------------------------------
// parseCalendarSearchArgs
// ---------------------------------------------------------------------------

describe('parseCalendarSearchArgs', () => {
  it('parses query positional argument', () => {
    const result = parseCalendarSearchArgs(['node', 'outlook.js', 'calendar-search', 'meeting topic']);
    assert.equal(result.query, 'meeting topic');
  });

  it('returns default limit 20 when --limit is omitted', () => {
    const result = parseCalendarSearchArgs(['node', 'outlook.js', 'calendar-search', 'meeting topic']);
    assert.equal(result.limit, 20);
  });

  it('parses --limit flag correctly', () => {
    const result = parseCalendarSearchArgs(['node', 'outlook.js', 'calendar-search', 'standup', '--limit', '5']);
    assert.equal(result.query, 'standup');
    assert.equal(result.limit, 5);
  });

  it('parses --limit before query', () => {
    const result = parseCalendarSearchArgs(['node', 'outlook.js', 'calendar-search', '--limit', '10', 'budget review']);
    assert.equal(result.query, 'budget review');
    assert.equal(result.limit, 10);
  });

  it('ignores invalid --limit value and uses default', () => {
    const result = parseCalendarSearchArgs(['node', 'outlook.js', 'calendar-search', 'standup', '--limit', 'abc']);
    assert.equal(result.limit, 20);
  });

  it('accepts --limit 1', () => {
    const result = parseCalendarSearchArgs(['node', 'outlook.js', 'calendar-search', 'all hands', '--limit', '1']);
    assert.equal(result.limit, 1);
  });
});

// ---------------------------------------------------------------------------
// extractMeetingLink
// ---------------------------------------------------------------------------

describe('extractMeetingLink', () => {
  it('extracts Teams meetup-join URL', () => {
    const link = extractMeetingLink('Click to join: https://teams.microsoft.com/l/meetup-join/abc123%2Fdef/0?context=xyz here');
    assert.ok(link, 'should return a link');
    assert.ok(link.includes('teams.microsoft.com'), `got: ${link}`);
  });

  it('returns null for text with no meeting URL', () => {
    const link = extractMeetingLink('Please review the attached document before the meeting.');
    assert.equal(link, null);
  });

  it('returns null for null input', () => {
    const link = extractMeetingLink(null);
    assert.equal(link, null);
  });

  it('returns null for empty string', () => {
    const link = extractMeetingLink('');
    assert.equal(link, null);
  });

  it('extracts Zoom URL', () => {
    const link = extractMeetingLink('Join Zoom Meeting https://company.zoom.us/j/95577737751?pwd=abc123 Thanks');
    assert.ok(link, 'should return a link');
    assert.ok(link.includes('zoom.us'), `got: ${link}`);
  });

  it('strips trailing period from Teams URL', () => {
    const link = extractMeetingLink('Join at https://teams.microsoft.com/l/meetup-join/abc123.');
    assert.ok(link, 'should return a link');
    assert.ok(!link.endsWith('.'), `link should not end with period: ${link}`);
  });

  it('strips trailing comma from Zoom URL', () => {
    const link = extractMeetingLink('Join at https://company.zoom.us/j/123456,');
    assert.ok(link, 'should return a link');
    assert.ok(!link.endsWith(','), `link should not end with comma: ${link}`);
  });

  it('returns null for a non-Teams/Zoom https URL', () => {
    const link = extractMeetingLink('See agenda at https://confluence.example.com/pages/meeting');
    assert.equal(link, null);
  });
});
