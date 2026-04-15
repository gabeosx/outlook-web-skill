---
phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai
plan: "02"
subsystem: calendar
tags: [agent-browser, calendar, aria, outlook, parser, unit-tests]

requires:
  - phase: 06-01
    provides: lib/calendar.js skeleton with stubs, verified calendar ARIA structure (references/outlook-ui.md local-only)
  - phase: 04-digest-operation
    provides: policy-search.json, runBatch/stripContentBoundaries/scroll-accumulate pattern
  - phase: 02-read-operation
    provides: lib/run.js, lib/output.js, lib/session.js

provides:
  - Working runCalendar() implementation in lib/calendar.js
  - parseCalendarEventName: parses all 3 accessible name formats into D-07 schema
  - extractCalendarRows: extracts button-role event rows from text snapshot
  - parseCalendarArgs: handles --days N flag with default 7
  - parseEventIds: double-decode pattern for eval output (no-op eval since D-08 composite key)
  - test/calendar-parser.test.js: 56 unit tests against real ARIA data

affects:
  - 06-03 (calendar-read/search — uses same lib/calendar.js, stubs unchanged)
  - 06-04 (reference docs — schema and behavior to document)

tech-stack:
  added: []
  patterns:
    - Calendar event accessible name parser handles 3 formats (timed, all-day single, all-day multi-day)
    - Organizer "Lastname, Firstname" detection: next part after "By X" is firstname if not terminal token
    - All-day multi-day span: year part contains " to Weekday" (not comma-separated)
    - Composite key ID for D-08: JSON.stringify({ subject, start_time })
    - extractCalendarRows uses year-pattern filter to distinguish events from navigation buttons
    - node:test + node:assert/strict for unit tests (no external framework)

key-files:
  created:
    - test/calendar-parser.test.js
  modified:
    - lib/calendar.js

key-decisions:
  - "No-op eval (JSON.stringify([])) used in batch to maintain double-decode parsing path while satisfying D-08 composite key requirement"
  - "Organizer firstname detection: if next part after 'By X' is a single word not in TERMINAL_TOKENS, it is merged as firstname"
  - "Location accumulation: multiple address parts (e.g., '150 West 30th Street, New York, NY 10001') collapsed until 'By ' is reached"
  - "All-day event end_time is exclusive (day after last all-day date), consistent with iCalendar DTEND semantics"

patterns-established:
  - "Terminal token set (Free/Busy/Tentative/OOF/Recurring event/Exception to recurring event) used as organizer firstname boundary"
  - "extractCalendarRows year-pattern filter: button lines with ', 20\\d\\d,' or 'all day event' are events; others (Next week, Calendar) are skipped"
  - "parseTime: 12-hour AM/PM to 24-hour UTC conversion"
  - "parseCalendarDate: 'Weekday, Month Day, Year' string to Date object"

requirements-completed: [CAL-04, CAL-05, CAL-06, CAL-07]

duration: 6min
completed: 2026-04-14
---

# Phase 06 Plan 02: Calendar Event Listing Implementation Summary

**Full runCalendar() implementation with multi-format accessible name parser (timed/all-day/multi-day), scroll-accumulate loop, D-07 schema output, and 56 unit tests against real captured ARIA strings**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-14T19:44:32Z
- **Completed:** 2026-04-14T19:50:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (lib/calendar.js modified, test/calendar-parser.test.js created)

## Accomplishments

- Replaced runCalendar() stub with full implementation following digest.js scroll-accumulate pattern
- Built parseCalendarEventName() parsing all 3 confirmed-live accessible name formats: timed events, all-day single-day, and all-day multi-day spans
- Correctly handles organizer names with "Lastname, Firstname" comma pattern, multi-part addresses, Teams/Zoom/URL online meeting detection, and all ShowAs→response_status mappings
- Implemented extractCalendarRows() using year-pattern heuristic to distinguish calendar event buttons from navigation buttons
- 56 unit tests pass using real accessible name strings captured during Plan 06-01 live ARIA exploration

## Task Commits

1. **Task 1: Implement calendar event accessible name parser** - `68dfea1` (feat)
2. **Task 2: Unit test calendar event parser against real ARIA examples** - `a99be37` (test)

## Files Created/Modified

- `lib/calendar.js` — Full runCalendar() implementation; parseCalendarEventName, extractCalendarRows, parseCalendarArgs, parseEventIds; runCalendarRead/runCalendarSearch stubs preserved for Plan 06-03
- `test/calendar-parser.test.js` — 56 unit tests across 11 describe blocks using real ARIA strings

## Decisions Made

- **No-op eval in batch:** Since D-08 confirmed no stable DOM event ID exists on calendar buttons, the eval script is `JSON.stringify([])`. This satisfies the batch structure requirement (eval before snapshot) while the ID is built as a composite key from parsed event data.
- **Organizer firstname heuristic:** After "By Lastname", if the next split-part is a single word not in TERMINAL_TOKENS, it is merged as the firstname (e.g., "By Lee" + "Joshua" → "Lee, Joshua"). This handles the dominant "Lastname, Firstname" format seen in ARIA exploration.
- **Location accumulation:** For physical addresses with multiple comma-separated parts (e.g., "150 West 30th Street, New York, NY 10001"), parts are accumulated until "By " or a terminal token is encountered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Organizer "Lastname, Firstname" parsing required lookahead after comma split**
- **Found during:** Task 1 (initial test with real ARIA strings)
- **Issue:** Split on ", " breaks "By Lee, Joshua" into ["By Lee", "Joshua"]; naive parsing only captured last name
- **Fix:** Added lookahead: after consuming "By X", check next part — if single word not in TERMINAL_TOKENS, merge as firstname
- **Files modified:** lib/calendar.js
- **Verification:** T1 test — organizer correctly parses as "Lee, Joshua"
- **Committed in:** 68dfea1

**2. [Rule 1 - Bug] All-day multi-day span year part contains " to Weekday"**
- **Found during:** Task 1 (testing "PTO, all day event, Thursday, April 16, 2026 to Friday, April 17, 2026, OOF")
- **Issue:** Split on ", " produces ["2026 to Friday"] as the year part — parseCalendarDate fails on "2026 to Friday"
- **Fix:** Added regex match for "YYYY to Weekday" in the year part; extracts start year and end weekday separately
- **Files modified:** lib/calendar.js
- **Verification:** T5 test — start_time: 2026-04-16T00:00:00.000Z, end_time: 2026-04-18T00:00:00.000Z
- **Committed in:** 68dfea1

---

**Total deviations:** 2 auto-fixed (both Rule 1 - parsing bugs discovered during first test run)
**Impact on plan:** Both fixes necessary for correct parsing of real ARIA data. Discovered and resolved before commit.

## Issues Encountered

None beyond the two parsing bugs documented above, both resolved before Task 1 commit.

## Known Stubs

- `runCalendarRead()` — intentional stub, implemented in Plan 06-03
- `runCalendarSearch()` — intentional stub, implemented in Plan 06-03

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. lib/calendar.js follows the same pattern as lib/digest.js. The threat model items T-06-04 through T-06-06 are all mitigated:
- T-06-04: AGENT_BROWSER_CONTENT_BOUNDARIES=1 applied via runBatch childEnv
- T-06-05: Double-decode pattern prevents eval injection; malformed JSON falls back gracefully
- T-06-06: MAX_SCROLLS=15 and 2-consecutive-empty exit prevent infinite loop

## Next Phase Readiness

- `runCalendar()` is fully implemented and tested — Plan 06-03 can implement `runCalendarRead()` and `runCalendarSearch()` by filling the existing stubs
- `parseCalendarEventName()` is exported for reuse if calendar-search results use the same accessible name format
- Unit tests provide regression coverage for all 3 event formats

## Self-Check: PASSED

- FOUND: lib/calendar.js (modified, 642 lines)
- FOUND: test/calendar-parser.test.js (created, 394 lines)
- FOUND: commit 68dfea1 (feat(06-02))
- FOUND: commit a99be37 (test(06-02))
- node --test test/calendar-parser.test.js: 56 pass, 0 fail

---
*Phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai*
*Completed: 2026-04-14*
