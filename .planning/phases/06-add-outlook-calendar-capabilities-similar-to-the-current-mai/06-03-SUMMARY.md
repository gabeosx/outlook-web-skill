---
phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai
plan: "03"
subsystem: calendar
tags: [agent-browser, calendar, aria, outlook, calendar-read, calendar-search, unit-tests]

requires:
  - phase: 06-02
    provides: runCalendar() implementation, parseCalendarEventName, extractCalendarRows — all reused by runCalendarRead/Search
  - phase: 02-read-operation
    provides: lib/run.js (runBatch, stripContentBoundaries), lib/output.js, lib/session.js
  - phase: 01-auth-scaffold-cli-skeleton
    provides: policy-search.json, outlook.js dispatch

provides:
  - Working runCalendarRead() implementation in lib/calendar.js
  - Working runCalendarSearch() implementation in lib/calendar.js
  - parseCalendarDetailSnapshot: parses unnamed generic popup ARIA into D-10 schema
  - extractMeetingLink: extracts Teams/Zoom URL from body text (T-06-09 mitigation)
  - parseCalendarReadArgs: parses <event-id> positional argument
  - parseCalendarSearchArgs: parses <query> + --limit N arguments
  - 14 new unit tests in test/calendar-parser.test.js (70 total, all pass)

affects:
  - 06-04 (reference docs — calendar-read D-10 schema and calendar-search D-07 schema to document)

tech-stack:
  added: []
  patterns:
    - Calendar event detail popup is an unnamed generic at ARIA root — full snapshot required (no -s selector)
    - Event click via eval using composite key (subject match in accessible name) since D-08 confirmed no stable DOM ID
    - extractMeetingLink uses regex restricted to known Teams/Zoom patterns (T-06-09 mitigation)
    - calendar-search navigates to calendar URL first for best-effort calendar scoping (D-13a)
    - Popup card parsing anchored on "button View event" line — subject is StaticText immediately before it

key-files:
  created:
    - .planning/phases/06-add-outlook-calendar-capabilities-similar-to-the-current-mai/06-03-SUMMARY.md
  modified:
    - lib/calendar.js
    - test/calendar-parser.test.js

key-decisions:
  - "Full snapshot (not -s scoped) for calendar-read: popup card is unnamed generic at ARIA root — no stable aria-label selector exists"
  - "Event click via composite key subject match in accessible name (not DOM attribute): D-08 confirmed, no stable event ID"
  - "calendar-search navigates to calendar URL first for best-effort calendar scoping — whether it actually scopes is unresolved (D-13a)"
  - "Popup attendees field returns [] with count in attendee_count: popup shows aggregated counts only; full attendee list requires View event expansion"
  - "response_status returns 'unknown' for calendar-read popup: popup card does not expose ShowAs/response-status field"
  - "extractMeetingLink: regex restricted to teams.microsoft.com/l/meetup-join/ and *.zoom.us/j/ patterns with trailing punctuation stripped"

requirements-completed: [CAL-08, CAL-09, CAL-12, CAL-13, CAL-14]

duration: 3min
completed: 2026-04-14
---

# Phase 06 Plan 03: Calendar Read and Search Implementation Summary

**runCalendarRead() and runCalendarSearch() replacing stubs — event detail popup parser using unnamed-generic ARIA structure, extractMeetingLink regex, and combobox search workflow with calendar URL navigation**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-14T19:53:00Z
- **Completed:** 2026-04-14T19:56:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (lib/calendar.js modified, test/calendar-parser.test.js modified)

## Accomplishments

- Replaced `runCalendarRead()` stub with full implementation: navigates to calendar URL, clicks target event via composite key eval, waits 3s for popup, takes full snapshot, parses unnamed generic popup card
- Built `parseCalendarDetailSnapshot()` anchored on `button "View event"` to locate popup in full snapshot — extracts subject, date/time (ISO 8601), location, organizer, recurring flag, Join button presence, and body text
- Built `extractMeetingLink()` with Teams/Zoom regex (T-06-09 mitigation: known URL patterns only, trailing punctuation stripped)
- Replaced `runCalendarSearch()` stub with combobox workflow mirroring `lib/search.js`: navigate to calendar URL → click combobox → fill query → Enter → wait → eval (no-op) → snapshot → `extractCalendarRows()` → `parseCalendarEventName()` (D-13c: same schema)
- Added `parseCalendarReadArgs` and `parseCalendarSearchArgs` for argument parsing
- Added 14 unit tests to `test/calendar-parser.test.js` (6 for parseCalendarSearchArgs, 8 for extractMeetingLink edge cases); all 70 tests pass

## Task Commits

1. **Task 1: Implement runCalendarRead** - `2975cb7` (feat)
2. **Task 2: Implement runCalendarSearch + unit tests** - `a35a0bc` (feat)

## Files Created/Modified

- `lib/calendar.js` — Full runCalendarRead() and runCalendarSearch() implementations; parseCalendarReadArgs, parseCalendarSearchArgs, parseCalendarDetailSnapshot, extractMeetingLink, buildCalendarClickEval exported; runCalendar() unchanged
- `test/calendar-parser.test.js` — 14 new tests appended (parseCalendarSearchArgs × 6, extractMeetingLink × 8); 70 total, 0 failures

## Decisions Made

- **Full snapshot for calendar-read:** The popup card is an unnamed generic element at ARIA root — no stable aria-label or role=dialog selector exists. The `-s` flag cannot scope to it. Full snapshot is used and the popup is located by finding `button "View event"` as an anchor.
- **Click by accessible name (not DOM attribute):** D-08 confirmed no stable DOM event ID exists. The eval script searches for buttons whose `aria-label` or `textContent` contains the subject from the composite key.
- **calendar-search navigates to calendar URL:** Per D-13a best-effort calendar scoping — opening the calendar view before submitting the search query may cause results to be calendar-scoped. This is unresolved empirically; the implementation uses this approach as the most likely to work.
- **attendees returns []:** The popup card shows aggregate attendee counts (e.g., "Accepted 5, Didn't respond 3") but not individual attendee names/emails. Full attendee list requires clicking "View event" to navigate to the full event page — out of scope for this plan.
- **response_status returns 'unknown' for calendar-read popup:** The popup card does not expose the ShowAs field. This is present in the calendar listing view (accessible name) but not in the popup structure.

## Deviations from Plan

### Discovered Issues

**1. [Rule 2 - Missing functionality] Popup has no -s selector — plan specified scoped snapshot but ARIA context shows it's unnamed**
- **Found during:** Task 1 (reviewing critical_context ARIA findings)
- **Issue:** Plan spec said "use `-s` flag with the event detail pane selector" but the critical context embedded in the prompt explicitly states the popup is an unnamed generic at ARIA root with no stable selector. A scoped snapshot would silently return empty output.
- **Fix:** Used full snapshot (no `-s` flag) and anchored popup parsing on `button "View event"` line, parsing surrounding lines for all popup fields. This matches the approach recommended in the critical context ("RECOMMENDED APPROACH: take full snapshot and parse popup by finding unnamed generic block after main calendar").
- **Files modified:** lib/calendar.js
- **Committed in:** 2975cb7

None — plan executed as written (with the above adaptation per embedded ARIA findings).

## Known Stubs

None. Both `runCalendarRead()` and `runCalendarSearch()` are fully implemented. The `attendees: []` empty array is a documented limitation (popup card does not expose individual attendees) — not a stub.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. All threats from the plan's threat model are mitigated:

| Threat | Mitigation Applied |
|--------|-------------------|
| T-06-08: Prompt injection via event body | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` applied via `runBatch` childEnv (same as all calendar ops) |
| T-06-09: Meeting link URL tampering | `extractMeetingLink` restricts to known Teams/Zoom URL patterns; trailing punctuation stripped; URL is extracted as string only, never followed |
| T-06-10: Attendee email disclosure | Accept disposition (user's own calendar data) |
| T-06-11: Search query injection | Query passed via `fill` action; agent-browser handles escaping; no shell injection risk |

## Self-Check: PASSED

- FOUND: lib/calendar.js (modified)
- FOUND: test/calendar-parser.test.js (modified)
- FOUND: 06-03-SUMMARY.md
- FOUND: commit 2975cb7 (feat(06-03) Task 1)
- FOUND: commit a35a0bc (feat(06-03) Task 2)
- node --test test/calendar-parser.test.js: 70 pass, 0 fail

---
*Phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai*
*Completed: 2026-04-14*
