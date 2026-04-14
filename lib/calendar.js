'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputOk, outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // D-13: reuse existing policy for all calendar ops

// Eval script: calendar events have no stable ID attribute (D-08 confirmed).
// Return an empty array as a no-op eval — composite key is built from parsed event data.
// The eval command is still required in the batch to maintain the double-decode parsing path.
const EVENT_ID_EVAL = "JSON.stringify([])";

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
        // e.g., "By Lee, Joshua" → parts: ["By Lee", "Joshua", "Tentative", ...]
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
        // Multi-part locations like "150 West 30th Street, New York, NY 10001" are collapsed
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

module.exports = { runCalendar, runCalendarRead, runCalendarSearch, parseCalendarEventName, extractCalendarRows, parseCalendarArgs };
