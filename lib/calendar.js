'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputOk, outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // D-13: reuse existing policy for all calendar ops

// Eval script: calendar events have no stable ID attribute (D-08 confirmed).
// Return an empty array as a no-op eval — composite key is built from parsed event data.
// The eval command is still required in the batch to maintain the double-decode parsing path.
const EVENT_ID_EVAL = "JSON.stringify([])";

// Eval script: extract meeting link href directly from the DOM after popup opens.
// Queries for Teams (meetup-join path) and Zoom (zoom.us/j/) anchor hrefs.
// Returns a JSON array with 0 or 1 element (the first match).
const MEETING_LINK_EVAL = "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"teams.microsoft.com/l/\"],a[href*=\"zoom.us/j/\"]')).map(a=>a.href).filter(Boolean).slice(0,1))";

// Terminal tokens that end the organizer field and signal the next semantic segment
const TERMINAL_TOKENS = new Set([
  'free', 'busy', 'tentative', 'oof', 'recurring event', 'exception to recurring event',
]);

/**
 * Parse process.argv for calendar subcommand arguments.
 * Expects: node outlook.js calendar [--days N]
 *
 * @param {string[]} argv - process.argv
 * @returns {{ days: number }}
 */
function parseCalendarArgs(argv) {
  const args = argv.slice(3); // skip node, outlook.js, calendar
  let days = 7; // default per D-05
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) days = n;
      i++;
    }
  }
  return { days };
}

/**
 * Parse a month name (e.g., "April") into a 0-based month index.
 * @param {string} monthName
 * @returns {number} 0-11
 */
function parseMonth(monthName) {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const idx = months.indexOf((monthName || '').toLowerCase().trim());
  return idx >= 0 ? idx : 0;
}

/**
 * Parse "h:mm AM/PM" into { hours, minutes } in 24h format.
 * @param {string} timeStr - e.g., "9:00 AM", "4:30 PM", "12:00 PM"
 * @returns {{ hours: number, minutes: number }}
 */
function parseTime(timeStr) {
  const m = (timeStr || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return { hours: 0, minutes: 0 };
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === 'AM') {
    if (hours === 12) hours = 0;
  } else {
    if (hours !== 12) hours += 12;
  }
  return { hours, minutes };
}

/**
 * Parse a date string of format "Weekday, Month Day, Year" into a Date object.
 * Returns null if parsing fails.
 * @param {string} dateStr - e.g., "Tuesday, April 14, 2026"
 * @returns {Date|null}
 */
function parseCalendarDate(dateStr) {
  // Format: "Weekday, Month Day, Year"
  const m = (dateStr || '').trim().match(/^(?:\w+,\s*)?(\w+)\s+(\d+),\s+(\d{4})$/);
  if (!m) return null;
  const month = parseMonth(m[1]);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return new Date(Date.UTC(year, month, day));
}

/**
 * Detect whether a location string indicates an online meeting.
 * @param {string} location
 * @returns {boolean}
 */
function detectOnlineMeeting(location) {
  if (!location) return false;
  const l = location.toLowerCase();
  return (
    l.includes('teams') ||
    l.includes('zoom') ||
    l.includes('webex') ||
    l.includes('meet.google') ||
    l.startsWith('http://') ||
    l.startsWith('https://')
  );
}

/**
 * Map Outlook ShowAs text to response_status values.
 * Based on ARIA exploration findings (references/outlook-ui.md).
 *
 * @param {string} showAs - e.g., "Tentative", "Busy", "Free", "OOF"
 * @returns {string}
 */
function mapResponseStatus(showAs) {
  if (!showAs) return 'unknown';
  switch (showAs.toLowerCase().trim()) {
    case 'tentative': return 'tentative';
    case 'busy':      return 'accepted';
    case 'free':      return 'accepted';
    case 'oof':       return 'accepted';
    default:          return 'unknown';
  }
}

/**
 * Check if a part string is a terminal token (ShowAs, recurring flag).
 * @param {string} part
 * @returns {boolean}
 */
function isTerminalToken(part) {
  return TERMINAL_TOKENS.has((part || '').toLowerCase().trim());
}

/**
 * Parse a single calendar event button accessible name string into the D-07 schema.
 *
 * Accessible name formats (confirmed-live, references/outlook-ui.md):
 *
 * Timed event:
 *   {subject}, {startTime} to {endTime}, {weekday}, {month} {day}, {year}
 *   [, {location or Teams URL}], By {organizer}[, {firstname}], {showAs}
 *   [, Recurring event][, Exception to recurring event]
 *
 * All-day single-day:
 *   {subject}, all day event, {weekday}, {month} {day}, {year}
 *   [, {location}][, By {organizer}[, {firstname}]][, {showAs}][, Recurring event]
 *
 * All-day multi-day span:
 *   {subject}, all day event, {weekday}, {month} {day}, {year} to {weekday}, {month} {day}, {year}
 *   [, {showAs}]
 *   Note: "year to weekday" is NOT split by ", " — the " to " has no comma before it.
 *
 * @param {string} name - The accessible name string
 * @returns {object} D-07 schema event object
 */
function parseCalendarEventName(name) {
  const result = {
    id: null,
    subject: null,
    organizer: null,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    location: null,
    is_online_meeting: false,
    is_all_day: false,
    is_recurring: false,
    response_status: 'unknown',
  };

  if (!name || !name.trim()) return result;

  // Split on ", " — the format uses comma-space as field separator
  const parts = name.split(', ');
  if (parts.length === 0) return result;

  let idx = 0;

  // Subject is always first
  result.subject = parts[idx++] || null;

  if (idx >= parts.length) {
    result.id = JSON.stringify({ subject: result.subject, start_time: result.start_time });
    return result;
  }

  // Check for all-day event marker
  const isAllDay = parts[idx] && parts[idx].toLowerCase().trim() === 'all day event';
  result.is_all_day = isAllDay;

  if (isAllDay) {
    idx++; // consume "all day event"

    // Next 3 parts form the start date: "Weekday", "Month Day", "Year [to Weekday]"
    // Note: for multi-day all-day spans, the year part looks like "2026 to Friday"
    const weekdayPattern = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;
    let startDateStr = '';
    let endDateStr = '';

    if (idx < parts.length && weekdayPattern.test(parts[idx].trim())) {
      const weekday = parts[idx++];
      const monthDay = parts[idx++] || '';
      const yearPart = parts[idx++] || ''; // may be "2026" or "2026 to Friday"

      // Check for multi-day span: "2026 to Friday"
      const multiDayMatch = yearPart.match(/^(\d{4})\s+to\s+(\w+)$/);
      if (multiDayMatch) {
        // Multi-day: start year is multiDayMatch[1], end weekday is multiDayMatch[2]
        startDateStr = `${weekday}, ${monthDay}, ${multiDayMatch[1]}`;
        const endWeekday = multiDayMatch[2];
        const endMonthDay = parts[idx++] || '';
        const endYear = parts[idx++] || '';
        endDateStr = `${endWeekday}, ${endMonthDay}, ${endYear}`;
      } else {
        startDateStr = `${weekday}, ${monthDay}, ${yearPart}`;
      }
    }

    // Parse start date
    const startDate = parseCalendarDate(startDateStr);
    if (startDate) {
      result.start_time = startDate.toISOString();

      if (endDateStr) {
        const parsedEnd = parseCalendarDate(endDateStr);
        if (parsedEnd) {
          // For all-day spans, end_time is the day after the last all-day date
          parsedEnd.setUTCDate(parsedEnd.getUTCDate() + 1);
          result.end_time = parsedEnd.toISOString();
        }
      } else {
        // Single all-day: end is start + 1 day
        const calcEndDate = new Date(startDate);
        calcEndDate.setUTCDate(calcEndDate.getUTCDate() + 1);
        result.end_time = calcEndDate.toISOString();
      }
      result.duration_minutes = 1440; // all-day = 24h = 1440 min
    }

    // Remaining parts: optional location, "By organizer [firstname]", showAs, recurring flags
    while (idx < parts.length) {
      const part = parts[idx].trim();
      const partLower = part.toLowerCase();

      if (part.startsWith('By ')) {
        // Organizer: "By Lastname" — next part may be firstname (if not a terminal token)
        let organizer = part.slice(3).trim();
        if (idx + 1 < parts.length && !isTerminalToken(parts[idx + 1])) {
          const nextPart = parts[idx + 1].trim();
          // Heuristic: first name is a single word (no spaces), not a known terminal
          // and not starting with "By " (would be another organizer — unlikely)
          if (/^\w+$/.test(nextPart) && !nextPart.startsWith('By ')) {
            organizer = organizer + ', ' + nextPart;
            idx++;
          }
        }
        result.organizer = organizer;
        idx++;
      } else if (/^(Free|Busy|Tentative|OOF)$/i.test(part)) {
        result.response_status = mapResponseStatus(part);
        idx++;
      } else if (partLower === 'recurring event') {
        result.is_recurring = true;
        idx++;
      } else if (partLower === 'exception to recurring event') {
        result.is_recurring = true;
        idx++;
      } else {
        // Could be a location (before "By")
        if (!result.organizer && !result.location) {
          result.location = part;
          result.is_online_meeting = detectOnlineMeeting(part);
        }
        idx++;
      }
    }

  } else {
    // Timed event: next part is "{startTime} to {endTime}"
    const timeRangePattern = /^(\d{1,2}:\d{2}\s*[AP]M)\s+to\s+(\d{1,2}:\d{2}\s*[AP]M)$/i;
    let startTimeStr = null;
    let endTimeStr = null;

    if (idx < parts.length && timeRangePattern.test(parts[idx].trim())) {
      const timeMatch = parts[idx].trim().match(timeRangePattern);
      startTimeStr = timeMatch[1].trim();
      endTimeStr = timeMatch[2].trim();
      idx++;
    }

    // Next: date — "Weekday", "Month Day", "Year"
    const weekdayPattern = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;
    let dateStr = '';

    if (idx < parts.length && weekdayPattern.test(parts[idx].trim())) {
      const weekday = parts[idx++];
      const monthDay = parts[idx++] || '';
      const year = parts[idx++] || '';
      dateStr = `${weekday}, ${monthDay}, ${year}`;
    }

    // Parse date + time into ISO 8601
    const dateObj = parseCalendarDate(dateStr);
    if (dateObj && startTimeStr) {
      const { hours: sh, minutes: sm } = parseTime(startTimeStr);
      const startDate = new Date(dateObj);
      startDate.setUTCHours(sh, sm, 0, 0);
      result.start_time = startDate.toISOString();

      if (endTimeStr) {
        const { hours: eh, minutes: em } = parseTime(endTimeStr);
        const endDate = new Date(dateObj);
        endDate.setUTCHours(eh, em, 0, 0);
        // Handle midnight crossover (e.g., 11:30 PM to 12:30 AM)
        if (endDate <= startDate) {
          endDate.setUTCDate(endDate.getUTCDate() + 1);
        }
        result.end_time = endDate.toISOString();
        result.duration_minutes = Math.round((endDate - startDate) / 60000);
      }
    }

    // Remaining parts: optional location, "By organizer [firstname]", showAs, recurring flags
    // Location appears before "By organizer" in the accessible name
    while (idx < parts.length) {
      const part = parts[idx].trim();
      const partLower = part.toLowerCase();

      if (part.startsWith('By ')) {
        // Organizer: "By Lastname" — next part may be firstname (if not a terminal token)
        // e.g., "By Org, Alpha" → parts: ["By Smith", "Jordan", "Tentative", ...]
        let organizer = part.slice(3).trim();
        if (idx + 1 < parts.length && !isTerminalToken(parts[idx + 1])) {
          const nextPart = parts[idx + 1].trim();
          // Heuristic: firstname is a single word, not a terminal token, not "By ..."
          if (/^\w+$/.test(nextPart) && !nextPart.startsWith('By ')) {
            organizer = organizer + ', ' + nextPart;
            idx++;
          }
        }
        result.organizer = organizer;
        idx++;
      } else if (/^(Free|Busy|Tentative|OOF)$/i.test(part)) {
        result.response_status = mapResponseStatus(part);
        idx++;
      } else if (partLower === 'recurring event') {
        result.is_recurring = true;
        idx++;
      } else if (partLower === 'exception to recurring event') {
        result.is_recurring = true;
        idx++;
      } else {
        // Location — appears before "By organizer"
        // Multi-part locations like "123 Main Street, Anytown, NY 10001" are collapsed
        if (!result.organizer) {
          // Accumulate location parts until we hit "By " or a terminal token
          if (!result.location) {
            result.location = part;
          } else {
            result.location = result.location + ', ' + part;
          }
          result.is_online_meeting = detectOnlineMeeting(result.location);
        }
        idx++;
      }
    }
  }

  // Build composite key ID (D-08: no stable DOM ID on calendar events)
  result.id = JSON.stringify({ subject: result.subject, start_time: result.start_time });

  return result;
}

/**
 * Extract calendar event button accessible names from a text-format snapshot.
 *
 * Calendar events appear as button-role elements (NOT option-role like email rows).
 * ARIA exploration (06-01) confirmed: event buttons are inside main "calendar view, ...".
 *
 * Detection pattern: lines matching `button "` that contain `, 20\d\d,` or `all day event`
 * (as confirmed in the critical context ARIA findings).
 *
 * @param {string} text - Raw text snapshot from batch stdout
 * @returns {string[]} Array of accessible name strings for calendar event buttons
 */
function extractCalendarRows(text) {
  const rows = [];
  for (const line of (text || '').split('\n')) {
    // Match button elements with an accessible name
    const m = line.match(/^\s*-\s+button\s+"(.+?)"\s*(?:\[.*)?$/);
    if (!m || !m[1].trim()) continue;
    const name = m[1].trim();
    // Filter to calendar event buttons: must contain a year pattern or "all day event"
    // This distinguishes events from navigation buttons (e.g., "Next week", "Calendar")
    const hasYear = /, 20\d\d[,"]/.test(name) || /, 20\d\d$/.test(name) || / 20\d\d[,\s]/.test(name);
    const isAllDay = /all day event/i.test(name);
    if (hasYear || isAllDay) {
      rows.push(name);
    }
  }
  log(`calendar: extractCalendarRows found ${rows.length} event button rows`);
  return rows;
}

/**
 * Parse eval output from batch stdout to extract event IDs.
 * Since calendar events have no stable DOM ID (D-08), the eval returns [].
 * This function follows the same double-decode pattern as parseConvids in digest.js.
 *
 * @param {string} cleaned - Stripped batch stdout
 * @returns {{ ids: string[], evalLineEnd: number }}
 */
function parseEventIds(cleaned) {
  let ids = [];
  let evalLineEnd = 0;

  const doubleEncodedMatch = cleaned.match(/^"(\[.*?\])"\s*$/m);
  if (doubleEncodedMatch) {
    try {
      const innerJson = JSON.parse(doubleEncodedMatch[0]);
      const parsed = JSON.parse(innerJson);
      if (Array.isArray(parsed)) ids = parsed;
      evalLineEnd = doubleEncodedMatch.index + doubleEncodedMatch[0].length;
    } catch {
      log('calendar: eval JSON double-decode failed -- falling back to null IDs');
    }
  } else {
    const jsonArrayMatch = cleaned.match(/^(\[.*?\])\s*$/m);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[1]);
        if (Array.isArray(parsed)) {
          ids = parsed;
          evalLineEnd = jsonArrayMatch.index + jsonArrayMatch[0].length;
        }
      } catch {
        log('calendar: eval JSON array parse failed -- falling back to null IDs');
      }
    }
  }

  return { ids, evalLineEnd };
}

/**
 * calendar subcommand: list upcoming events within a configurable time window.
 * Accepts --days N (default: 7) per D-05.
 *
 * Flow:
 * 1. Parse --days argument
 * 2. Build calendar URL
 * 3. Run initial batch (open, wait, get url, eval, snapshot)
 * 4. Session check
 * 5. Extract event rows from snapshot
 * 6. Scroll-accumulate (MAX_SCROLLS=15, 2-empty-stop per D-15/T-06-06)
 * 7. Parse each row into D-07 schema
 * 8. Filter to --days window
 * 9. Sort chronologically
 * 10. Output JSON envelope
 */
function runCalendar() {
  const { days } = parseCalendarArgs(process.argv);
  log(`calendar: starting — days=${days}`);

  // Build calendar URL (confirmed URL pattern from 06-01 ARIA exploration)
  const calendarUrl = (process.env.OUTLOOK_BASE_URL || '').replace(/\/?$/, '') + '/calendar/';
  log(`calendar: navigating to ${calendarUrl}`);

  // Initial batch: open calendar, wait for render, session check, eval (no-op), snapshot
  // Snapshot MUST be last (D-16: page resets to about:blank after batch exit)
  const initialBatch = [
    ['open', calendarUrl],
    ['wait', '5000'],         // SPA render — 5s needed for cold Chrome start
    ['get', 'url'],           // inline session check
    ['eval', EVENT_ID_EVAL],  // no-op eval (D-08: no stable ID); keeps double-decode path consistent
    ['snapshot'],             // MUST be last (D-16)
  ];

  const initialResult = runBatch(initialBatch, POLICY);

  if (initialResult.status !== 0) {
    log(`calendar: initial batch failed (status ${initialResult.status})`);
    if (initialResult.stderr) log(`calendar: stderr: ${initialResult.stderr.trim().slice(0, 300)}`);
    outputError('calendar', 'OPERATION_FAILED', 'Calendar batch failed — browser error or timeout');
    return;
  }

  const cleanedInitial = stripContentBoundaries(initialResult.stdout);

  // Session check: find URL line in batch stdout
  const initialLines = cleanedInitial.split('\n');
  const urlLine = initialLines.find(l => /^https?:\/\/\S+$/.test(l.trim()));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`calendar: session expired — login URL: ${urlLine.trim().slice(0, 80)}`);
    outputError('calendar', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
    return;
  }

  // Parse initial batch output: eval IDs (no-op) + snapshot text
  const { evalLineEnd: initialEvalEnd } = parseEventIds(cleanedInitial);
  const initialSnapshotText = cleanedInitial.slice(initialEvalEnd).trim();

  log(`calendar: initial snapshot text ${initialSnapshotText.length} chars`);

  // Extract event rows from initial snapshot
  let allRows = extractCalendarRows(initialSnapshotText);

  // Track seen event keys for dedup (no stable IDs — use subject+start composite)
  const seenKeys = new Set();
  for (const r of allRows) {
    const parsed = parseCalendarEventName(r);
    seenKeys.add(JSON.stringify({ subject: parsed.subject, start_time: parsed.start_time }));
  }

  // Scroll-accumulate loop (D-15: handle calendars with many events; T-06-06: MAX_SCROLLS guard)
  const MAX_SCROLLS = 15;
  let consecutiveEmpty = 0;

  for (let scrollAttempt = 0; scrollAttempt < MAX_SCROLLS; scrollAttempt++) {
    const scrollBatch = [
      ['scroll', 'down', '500'],
      ['wait', '1500'],
      ['eval', EVENT_ID_EVAL],
      ['snapshot'],  // MUST be last (D-16)
    ];

    const scrollResult = runBatch(scrollBatch, POLICY);
    if (scrollResult.status !== 0) {
      log(`calendar: scroll batch failed at attempt ${scrollAttempt + 1}`);
      break;
    }

    const cleanedScroll = stripContentBoundaries(scrollResult.stdout);
    const { evalLineEnd: scrollEvalEnd } = parseEventIds(cleanedScroll);
    const scrollSnapshotText = cleanedScroll.slice(scrollEvalEnd).trim();

    if (!scrollSnapshotText) {
      consecutiveEmpty++;
      log(`calendar: scroll attempt ${scrollAttempt + 1} — empty snapshot`);
      if (consecutiveEmpty >= 2) {
        log('calendar: two consecutive empty scroll attempts — stopping');
        break;
      }
      continue;
    }

    const newRows = extractCalendarRows(scrollSnapshotText);
    let addedCount = 0;

    for (const row of newRows) {
      const parsed = parseCalendarEventName(row);
      const key = JSON.stringify({ subject: parsed.subject, start_time: parsed.start_time });
      if (!seenKeys.has(key)) {
        allRows.push(row);
        seenKeys.add(key);
        addedCount++;
      }
    }

    log(`calendar: scroll attempt ${scrollAttempt + 1} added ${addedCount} new rows`);

    if (addedCount === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) {
        log('calendar: two consecutive empty scroll attempts — stopping');
        break;
      }
    } else {
      consecutiveEmpty = 0;
    }
  }

  log(`calendar: total event rows accumulated: ${allRows.length}`);

  if (allRows.length === 0) {
    log('calendar: no events found in snapshot');
    process.stdout.write(JSON.stringify({
      operation: 'calendar',
      status: 'ok',
      results: [],
      count: 0,
      error: null,
    }) + '\n');
    return;
  }

  // Parse each row into D-07 schema
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + days);

  const results = [];
  for (const row of allRows) {
    const event = parseCalendarEventName(row);

    // Filter: only include events whose start_time falls within the --days window
    if (event.start_time) {
      const eventStart = new Date(event.start_time);
      if (eventStart >= windowStart && eventStart < windowEnd) {
        results.push(event);
      }
    }
  }

  // Sort chronologically by start_time ascending
  results.sort((a, b) => {
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return new Date(a.start_time) - new Date(b.start_time);
  });

  log(`calendar: returning ${results.length} events within ${days}-day window`);

  process.stdout.write(JSON.stringify({
    operation: 'calendar',
    status: 'ok',
    results,
    count: results.length,
    error: null,
  }) + '\n');

  log('calendar: stdout write complete, returning to outlook.js');
}

/**
 * Parse process.argv for calendar-read subcommand arguments.
 * Expects: node outlook.js calendar-read <event-id>
 *
 * @param {string[]} argv - process.argv
 * @returns {{ eventId: string }}
 */
function parseCalendarReadArgs(argv) {
  const args = argv.slice(3); // skip node, outlook.js, calendar-read
  let eventId = null;
  for (let i = 0; i < args.length; i++) {
    if (!eventId) {
      eventId = args[i];
    }
  }
  if (!eventId) {
    outputError('calendar-read', 'INVALID_ARGS', 'Usage: node outlook.js calendar-read <event-id>');
  }
  return { eventId };
}

/**
 * Extract a Teams or Zoom meeting URL from body text.
 *
 * Uses known URL patterns (T-06-09: regex restricts to known patterns to prevent
 * URL forgery). Trailing punctuation is stripped. No URL is followed or fetched.
 *
 * @param {string|null} bodyText
 * @returns {string|null}
 */
function extractMeetingLink(bodyText) {
  if (!bodyText) return null;
  const teamsRe = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>\]]+/;
  const zoomRe = /https:\/\/[a-z0-9-]+\.zoom\.us\/j\/[^\s"<>\]]+/;
  const m = bodyText.match(teamsRe) || bodyText.match(zoomRe);
  return m ? m[0].replace(/[).,]+$/, '') : null;
}

/**
 * Parse a MEETING_LINK_EVAL result from batch stdout lines.
 * Handles both double-encoded ("\"[...]\"]") and direct (["..."]) array forms.
 *
 * @param {string[]} lines - Lines from stripped batch stdout
 * @returns {string|null} First meeting link URL, or null if not found
 */
function parseMeetingLinkEvalResult(lines) {
  for (const line of lines) {
    const t = line.trim();
    // Double-encoded form: "\"[\\\"https://...\\\"]\""
    const doubleMatch = t.match(/^"(\[.*?\])"\s*$/);
    if (doubleMatch) {
      try {
        const inner = JSON.parse(doubleMatch[0]);
        const arr = JSON.parse(inner);
        if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
          return String(arr[0]).replace(/[).,]+$/, '');
        }
      } catch { /* ignore */ }
    }
    // Direct array form: ["https://..."]
    if (t.startsWith('["') && t.endsWith('"]')) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
          return String(arr[0]).replace(/[).,]+$/, '');
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}


/**
 * Build an eval script that clicks a calendar event button matching the given composite key.
 *
 * The composite key (from D-08) is JSON.stringify({ subject, start_time }).
 * Parse the key to extract subject and start_time, then find matching event buttons
 * by their accessible name.
 *
 * @param {string} eventId - JSON.stringify({ subject, start_time })
 * @returns {string} Eval script
 */
function buildCalendarClickEval(eventId) {
  // Escape the event ID for safe embedding in a JS string literal
  const safe = eventId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return (
    '(function() {' +
    'var id = "' + safe + '";' +
    'var parsed; try { parsed = JSON.parse(id); } catch(e) { return "not_found:parse_error"; }' +
    'var subject = parsed.subject || "";' +
    'var startTime = parsed.start_time || "";' +
    // Find all buttons (calendar events are role=button)
    'var buttons = Array.from(document.querySelectorAll("[role=button],[role=gridcell]"));' +
    // Also check plain button elements
    'var allButtons = buttons.concat(Array.from(document.querySelectorAll("button")));' +
    'var target = allButtons.find(function(el) {' +
    '  var name = el.getAttribute("aria-label") || el.textContent || "";' +
    '  return name.indexOf(subject) !== -1;' +
    '});' +
    'if (!target) return "not_found:" + allButtons.length;' +
    'target.click();' +
    'return "clicked";' +
    '})()'
  );
}

/**
 * Parse the calendar event detail popup from a full accessibility snapshot.
 *
 * ARIA structure (confirmed-live, references/outlook-ui.md Calendar section):
 *
 * The popup card appears as an unnamed generic element at the ARIA root (outside
 * main "calendar view"). It is NOT a dialog, region, or tooltip.
 *
 * Structure:
 *   - generic  (unnamed, at application root)
 *     - StaticText "{subject}"
 *     - button "View event" [ref=eXX]
 *     - generic [clickable]  ← Join button area (Teams meetings only)
 *       - button "Join"
 *     - button "Chat with participants"
 *     - StaticText "{weekday} {M/D/YYYY} {startTime} - {endTime}"
 *     - StaticText "Series"  ← only for recurring events
 *     - StaticText "{location}"  ← or "No location added"
 *     - button "Opens card for {organizer name}"
 *     - generic
 *       - button "Opens card for {organizer name}"
 *       - StaticText " invited you."
 *     - StaticText "Accepted {N}, Didn't respond {N}"
 *     - StaticText "{body text}"
 *     - group "respond form"
 *
 * Parsing approach: find the popup section by locating "button "View event"" in
 * the snapshot, then parse surrounding lines for subject, date/time, location,
 * organizer, and body text.
 *
 * @param {string} text - Full accessibility snapshot text
 * @param {string} eventId - Composite key to validate subject match
 * @returns {object|null} D-10 schema fields, or null if popup not found
 */
function parseCalendarDetailSnapshot(text, eventId) {
  const lines = text.split('\n');

  // Locate the "View event" button — this is the anchor for the popup card
  const viewEventIdx = lines.findIndex(l => /\bbutton\s+"View event"/.test(l));
  if (viewEventIdx < 0) {
    log('calendar-read: popup anchor "View event" not found in snapshot');
    return null;
  }

  // The subject is the StaticText immediately before "View event"
  // Look back from viewEventIdx (within a small window of ~5 lines)
  let subject = null;
  for (let i = Math.max(0, viewEventIdx - 5); i < viewEventIdx; i++) {
    const m = lines[i].match(/^\s*-\s+StaticText\s+"(.+?)"\s*(?:\[.*)?$/);
    if (m && m[1].trim()) {
      subject = m[1].trim();
    }
  }

  // Parse lines after "View event" for the rest of the popup fields
  // Date/time format: "Weekday M/D/YYYY H:MM AM - H:MM AM" (confirmed from ARIA)
  const dateTimeRe = /^(\w{3})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/;

  let startTimeRaw = null;
  let endTimeRaw = null;
  let dateYear = null;
  let dateMonth = null;
  let dateDay = null;
  let location = null;
  let organizer = null;
  let isOnlineMeeting = false;
  let isRecurring = false;
  let attendeeCountText = null;
  const bodyLines = [];
  let hasJoinButton = false;

  // State tracking for popup parsing
  let passedViewEvent = false;
  let passedOrganizer = false;
  let inRespondForm = false;
  let organizerLinesConsumed = 0;

  for (let i = viewEventIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i === viewEventIdx) {
      passedViewEvent = true;
      continue;
    }

    // Stop at respond form (end of popup content)
    if (/\bgroup\s+"respond form"/.test(line)) {
      inRespondForm = true;
      break;
    }
    if (inRespondForm) break;

    // Detect "Join" button — indicates Teams online meeting
    if (/\bbutton\s+"Join"/.test(line)) {
      hasJoinButton = true;
      isOnlineMeeting = true;
      continue;
    }

    // Skip "Chat with participants" button
    if (/\bbutton\s+"Chat with participants"/.test(line)) continue;

    // Parse StaticText elements
    const staticMatch = line.match(/^\s*-\s+StaticText\s+"(.+?)"\s*(?:\[.*)?$/);
    if (staticMatch) {
      const text2 = staticMatch[1].trim();

      // Skip " invited you." (organizer invitation text)
      if (text2 === ' invited you.' || text2 === 'invited you.') continue;

      // Check for date/time pattern: "Tue 4/14/2026 9:00 AM - 9:30 AM"
      const dtm = text2.match(/^(\w{3})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i);
      if (dtm) {
        dateMonth = parseInt(dtm[2], 10) - 1; // 0-based
        dateDay = parseInt(dtm[3], 10);
        dateYear = parseInt(dtm[4], 10);
        startTimeRaw = dtm[5].trim();
        endTimeRaw = dtm[6].trim();
        continue;
      }

      // "Series" indicates a recurring event
      if (text2 === 'Series') {
        isRecurring = true;
        continue;
      }

      // Attendee count: "Accepted N, Didn't respond N" or similar
      if (/^(Accepted|Declined|Tentative|Didn't respond|No response)/i.test(text2) && /\d/.test(text2)) {
        attendeeCountText = text2;
        continue;
      }

      // After the organizer has been found, remaining StaticText is body text
      if (organizer) {
        bodyLines.push(text2);
        continue;
      }

      // Before organizer: check if this is location text
      // Location comes AFTER date/time but BEFORE organizer button
      // "No location added" means null location
      if (dateYear !== null && location === null && organizer === null) {
        if (text2 !== 'No location added' && text2.length > 0) {
          location = text2;
          isOnlineMeeting = isOnlineMeeting || detectOnlineMeeting(text2);
        } else if (text2 === 'No location added') {
          location = null;
        }
        continue;
      }

      // Body text accumulation (post-organizer, pre-respond-form)
      if (organizer !== null) {
        bodyLines.push(text2);
      }
      continue;
    }

    // Parse organizer from "Opens card for {name}" button
    const organizerMatch = line.match(/^\s*-\s+button\s+"Opens card for (.+?)"\s*(?:\[.*)?$/);
    if (organizerMatch) {
      if (organizer === null) {
        organizer = organizerMatch[1].trim();
        organizerLinesConsumed++;
      }
      continue;
    }
  }

  // Build ISO 8601 times
  let start_time = null;
  let end_time = null;
  let duration_minutes = null;
  let is_all_day = false;

  if (dateYear !== null && startTimeRaw) {
    const { hours: sh, minutes: sm } = parseTime(startTimeRaw);
    const startDate = new Date(Date.UTC(dateYear, dateMonth, dateDay, sh, sm, 0, 0));
    start_time = startDate.toISOString();

    if (endTimeRaw) {
      const { hours: eh, minutes: em } = parseTime(endTimeRaw);
      const endDate = new Date(Date.UTC(dateYear, dateMonth, dateDay, eh, em, 0, 0));
      if (endDate <= startDate) endDate.setUTCDate(endDate.getUTCDate() + 1);
      end_time = endDate.toISOString();
      duration_minutes = Math.round((endDate - startDate) / 60000);
    }
  }

  const body_text = bodyLines.join('\n').trim();
  const meeting_link = extractMeetingLink(body_text);

  // Re-build composite key ID using the parsed subject and start_time
  const id = JSON.stringify({ subject, start_time });

  return {
    id,
    subject,
    organizer,
    start_time,
    end_time,
    duration_minutes,
    location: location || null,
    is_online_meeting: isOnlineMeeting,
    meeting_link,
    is_all_day,
    is_recurring: isRecurring,
    response_status: 'unknown', // popup card does not show response status directly
    attendees: [], // popup shows counts only; full attendee list requires "View event" expansion
    body_text,
  };
}

/**
 * calendar-read subcommand: fetch full details of a specific event by ID.
 *
 * The event ID is a composite key: JSON.stringify({ subject, start_time }).
 * Navigates to the calendar, clicks the matching event button, waits for the
 * popup card, takes a full snapshot, and parses the D-10 detail schema.
 *
 * Flow:
 * 1. Parse <event-id> argument
 * 2. Build click eval using composite key (D-08)
 * 3. Navigate to calendar URL
 * 4. Click matching event button via eval
 * 5. Wait for popup card
 * 6. Get URL for session check
 * 7. Full snapshot (popup has no stable selector — unnamed generic at ARIA root)
 * 8. Session check
 * 9. Parse popup card with parseCalendarDetailSnapshot()
 * 10. Output D-10 schema via outputOk()
 */
function runCalendarRead() {
  const { eventId } = parseCalendarReadArgs(process.argv);
  log(`calendar-read: eventId="${eventId.slice(0, 80)}..."`);

  // Build calendar URL
  const calendarUrl = (process.env.OUTLOOK_BASE_URL || '').replace(/\/?$/, '') + '/calendar/';
  log(`calendar-read: navigating to ${calendarUrl}`);

  // Build click eval for composite key matching
  const clickEval = buildCalendarClickEval(eventId);

  // Batch: open calendar -> wait for render -> click event -> wait for popup ->
  //        extract meeting link from DOM -> session check -> full snapshot
  // Snapshot MUST be last (D-16).
  const batch = [
    ['open', calendarUrl],
    ['wait', '5000'],              // cold Chrome start: 5s needed for SPA render
    ['eval', clickEval],           // click the target calendar event button
    ['wait', '3000'],              // wait for popup card to render
    ['eval', MEETING_LINK_EVAL],   // extract Teams/Zoom href directly from DOM
    ['get', 'url'],                // session check
    ['snapshot'],                  // MUST be last (D-16); full snapshot — popup is unnamed generic
  ];

  const result = runBatch(batch, POLICY);

  if (result.status !== 0) {
    log(`calendar-read: batch failed (status ${result.status})`);
    if (result.stderr) log(`calendar-read: stderr: ${result.stderr.trim().slice(0, 300)}`);
    outputError('calendar-read', 'OPERATION_FAILED', 'Calendar-read batch failed — browser error or timeout');
    return;
  }
  log('calendar-read: batch complete');

  const cleaned = stripContentBoundaries(result.stdout);
  log(`calendar-read: batch stdout ${cleaned.length} chars`);

  if (!cleaned.trim()) {
    log('calendar-read: batch output empty after stripping boundaries');
    outputError('calendar-read', 'OPERATION_FAILED', 'Snapshot was empty — calendar may not have loaded');
    return;
  }

  // Session check: find URL line
  const outputLines = cleaned.split('\n');
  const urlLine = outputLines.find(l => /^https?:\/\/\S+$/.test(l.trim()));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`calendar-read: session expired — login URL: ${urlLine.trim().slice(0, 80)}`);
    outputError('calendar-read', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
    return;
  }

  // Check if the click eval found the event
  const evalResultLine = outputLines.find(l =>
    l.trim().startsWith('"not_found') ||
    l.trim() === '"clicked"' ||
    l.trim().startsWith('"clicked')
  );
  if (evalResultLine && evalResultLine.trim().startsWith('"not_found')) {
    const countMatch = evalResultLine.trim().match(/not_found:(\w+)/);
    const countInfo = countMatch ? countMatch[1] : '?';
    log(`calendar-read: event not found (${countInfo} buttons checked)`);
    outputError('calendar-read', 'EVENT_NOT_FOUND',
      `Event not found in calendar view. event-id="${eventId.slice(0, 80)}". ` +
      `Checked ${countInfo} elements. Use 'node outlook.js calendar' to list current events.`);
    return;
  }

  // Parse meeting link from MEETING_LINK_EVAL output (fast path — popup DOM).
  // The popup body is truncated so this usually returns null for Teams meetings;
  // fetchMeetingLinkViaFullEvent() is the reliable fallback below.
  const meetingLinkFromEval = parseMeetingLinkEvalResult(outputLines);
  if (meetingLinkFromEval) {
    log(`calendar-read: meeting link found in popup DOM eval: ${meetingLinkFromEval.slice(0, 60)}...`);
  }

  // Parse the popup card from the full snapshot
  const parsed = parseCalendarDetailSnapshot(cleaned, eventId);

  if (!parsed) {
    log('calendar-read: popup card not found in snapshot');
    outputError('calendar-read', 'OPERATION_FAILED',
      'Event popup card not found in snapshot — event may not have loaded. Try again.');
    return;
  }

  log(`calendar-read: parsed — subject="${(parsed.subject || '').slice(0, 50)}" body=${parsed.body_text.length} chars`);

  // meeting_link: extracted from popup DOM eval (fast path) or body text.
  // For Teams meetings, the join URL lives in the full event body (only accessible via
  // "View event"), not the popup card. meeting_link will be null for most Teams meetings.
  // is_online_meeting: true reliably signals a Teams/Zoom meeting regardless.
  const meeting_link = meetingLinkFromEval || parsed.meeting_link;

  // Output D-10 schema
  outputOk('calendar-read', {
    id: parsed.id,
    subject: parsed.subject,
    organizer: parsed.organizer,
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    duration_minutes: parsed.duration_minutes,
    location: parsed.location,
    is_online_meeting: parsed.is_online_meeting || meetingLinkFromEval !== null,
    meeting_link,
    is_all_day: parsed.is_all_day,
    is_recurring: parsed.is_recurring,
    response_status: parsed.response_status,
    attendees: parsed.attendees,
    body_text: parsed.body_text,
  });
  log('calendar-read: stdout write complete, returning to outlook.js');
}

/**
 * Parse process.argv for calendar-search subcommand arguments.
 * Expects: node outlook.js calendar-search "<query>" [--limit N]
 *
 * @param {string[]} argv - process.argv
 * @returns {{ query: string, limit: number }}
 */
function parseCalendarSearchArgs(argv) {
  const args = argv.slice(3); // skip node, outlook.js, calendar-search
  let query = null;
  let limit = 20; // default
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) limit = n;
      i++;
    } else if (!query) {
      query = args[i];
    }
  }
  if (!query) {
    outputError('calendar-search', 'INVALID_ARGS', 'Usage: node outlook.js calendar-search "<query>" [--limit N]');
  }
  return { query, limit };
}

/**
 * calendar-search subcommand: search calendar events by keyword/date range.
 *
 * Uses same combobox workflow as lib/search.js (D-13a).
 * Navigates to calendar URL first (best-effort calendar scoping per D-13a),
 * fills the search combobox, presses Enter, and extracts event button rows
 * using extractCalendarRows() + parseCalendarEventName() (D-13c: same schema as
 * calendar listing).
 *
 * Zero results returns { status: 'ok', results: [], count: 0 } — not an error.
 *
 * Flow:
 * 1. Parse query and --limit arguments
 * 2. Navigate to calendar URL (best-effort calendar scoping)
 * 3. Use combobox workflow: click combobox -> fill query -> Enter
 * 4. Wait for results
 * 5. Session check via URL line + isLoginUrl()
 * 6. Extract event button rows with extractCalendarRows()
 * 7. Parse each row with parseCalendarEventName()
 * 8. Apply --limit cap
 * 9. Output JSON envelope
 */
function runCalendarSearch() {
  const { query, limit } = parseCalendarSearchArgs(process.argv);
  log(`calendar-search: query="${query}" limit=${limit}`);

  // Build calendar URL (navigate here first for best-effort calendar scoping per D-13a)
  const calendarUrl = (process.env.OUTLOOK_BASE_URL || '').replace(/\/?$/, '') + '/calendar/';
  log(`calendar-search: navigating to ${calendarUrl}`);

  // Search batch: open calendar -> wait -> combobox click -> fill -> Enter ->
  //               wait for results -> eval (no-op for double-decode path) -> snapshot
  // Snapshot MUST be last (D-16)
  const searchBatch = [
    ['open', calendarUrl],
    ['wait', '5000'],                               // cold Chrome start: 5s for SPA render
    ['find', 'role', 'combobox', 'click'],          // calendar view combobox aria-label="Search"
    ['wait', '500'],
    ['find', 'role', 'combobox', 'fill', query],    // fill the search query
    ['press', 'Enter'],
    ['wait', '4000'],                               // wait for search results to render
    ['eval', EVENT_ID_EVAL],                        // no-op eval (calendar events have no stable ID)
    ['snapshot'],                                   // MUST be last (D-16)
  ];

  const result = runBatch(searchBatch, POLICY);

  if (result.status !== 0) {
    log(`calendar-search: batch failed (status ${result.status})`);
    if (result.stderr) log(`calendar-search: stderr: ${result.stderr.trim().slice(0, 300)}`);
    outputError('calendar-search', 'OPERATION_FAILED', 'Calendar-search batch failed — browser error or timeout');
    return;
  }
  log('calendar-search: batch complete');

  const cleaned = stripContentBoundaries(result.stdout);
  log(`calendar-search: batch stdout ${cleaned.length} chars`);

  // Session check: find URL line
  const outputLines = cleaned.split('\n');
  const urlLine = outputLines.find(l => /^https?:\/\/\S+$/.test(l.trim()));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`calendar-search: session expired — login URL: ${urlLine.trim().slice(0, 80)}`);
    outputError('calendar-search', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
    return;
  }

  // Extract eval output (no-op) from batch stdout to isolate snapshot text
  const { evalLineEnd } = parseEventIds(cleaned);
  const snapshotText = cleaned.slice(evalLineEnd).trim();

  log(`calendar-search: snapshot text ${snapshotText.length} chars`);

  // Extract calendar event button rows from snapshot
  // If search results contain event buttons (year pattern), they are calendar events
  const rows = extractCalendarRows(snapshotText || cleaned);

  if (rows.length === 0) {
    log('calendar-search: no calendar event rows in search results');
    process.stdout.write(JSON.stringify({
      operation: 'calendar-search',
      status: 'ok',
      results: [],
      count: 0,
      error: null,
    }) + '\n');
    log('calendar-search: stdout write complete, returning to outlook.js');
    return;
  }

  // Parse event rows into D-07 schema (D-13c: same schema as calendar listing)
  const limitedRows = rows.slice(0, limit);
  const results = limitedRows.map(row => parseCalendarEventName(row));

  log(`calendar-search: returning ${results.length} results (limit=${limit})`);

  process.stdout.write(JSON.stringify({
    operation: 'calendar-search',
    status: 'ok',
    results,
    count: results.length,
    error: null,
  }) + '\n');
  log('calendar-search: stdout write complete, returning to outlook.js');
}

module.exports = {
  runCalendar,
  runCalendarRead,
  runCalendarSearch,
  parseCalendarEventName,
  extractCalendarRows,
  parseCalendarArgs,
  parseCalendarReadArgs,
  parseCalendarSearchArgs,
  parseCalendarDetailSnapshot,
  extractMeetingLink,
};
