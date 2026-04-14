---
phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai
plan: "01"
subsystem: calendar
tags: [agent-browser, calendar, aria, outlook, subcommand, skeleton]

requires:
  - phase: 02-read-operation
    provides: lib/run.js, lib/output.js, lib/session.js — all reused by lib/calendar.js
  - phase: 04-digest-operation
    provides: policy-search.json — reused for all calendar operations per D-13
  - phase: 01-auth-scaffold-cli-skeleton
    provides: outlook.js dispatch pattern — extended with 3 new subcommand cases

provides:
  - lib/calendar.js module with runCalendar, runCalendarRead, runCalendarSearch stubs
  - outlook.js extended to dispatch all 3 calendar subcommands
  - Verified calendar ARIA structure documented in references/outlook-ui.md (local-only, gitignored)
  - Calendar event button accessible name format confirmed live

affects:
  - 06-02 (calendar listing — implements runCalendar based on ARIA findings)
  - 06-03 (calendar-read/search — implements runCalendarRead and runCalendarSearch)
  - 06-04 (reference docs — documents calendar schema and operators)

tech-stack:
  added: []
  patterns:
    - Calendar event buttons use role=button (not role=option like email rows) — different from email ARIA structure
    - No stable event ID attribute on calendar rows — composite key (subject + start_time) required for D-08
    - Calendar view URL is BASE_URL + '/calendar/' (NOT replace('/mail', '/calendar'))
    - lib/calendar.js follows exact same require pattern as lib/digest.js

key-files:
  created:
    - lib/calendar.js
  modified:
    - outlook.js
    - references/outlook-ui.md (local-only — gitignored per privacy policy)

key-decisions:
  - "Calendar events use role=button (not role=option like email) — calendar ARIA is entirely different from email ARIA"
  - "No stable DOM event ID attribute — D-08 composite key (subject + start_time) confirmed as required approach"
  - "Calendar URL pattern: BASE_URL + '/calendar/' works; replace('/mail', '/calendar') fails if no /mail/ segment"
  - "Calendar event detail card is an unnamed generic element at ARIA root — not a dialog, not a region"
  - "Response status comes from accessible name ShowAs values: Tentative, Busy, Free, OOF"
  - "references/outlook-ui.md is gitignored by design (privacy); calendar section written locally only"

patterns-established:
  - "Calendar event button accessible name format: {subject}, {start} to {end}, {weekday}, {month} {day}, {year}[, location|Teams URL], By {organizer}, {showAs}[, Recurring event][, Exception to recurring event]"
  - "All-day event accessible name format: {subject}, all day event, {weekday}, {month} {day}, {year}[, location][, By {organizer}][, showAs][, Recurring event]"
  - "Calendar search combobox in calendar view has aria-label='Search' (shorter than mail view)"

requirements-completed: [CAL-01, CAL-02, CAL-03, CAL-10, CAL-11]

duration: 90min
completed: 2026-04-14
---

# Phase 06 Plan 01: Calendar ARIA Exploration and Subcommand Skeleton Summary

**Live-verified calendar ARIA structure in references/outlook-ui.md, plus lib/calendar.js skeleton with three subcommand stubs wired into outlook.js dispatch**

## Performance

- **Duration:** ~90 min (includes 10 live agent-browser exploration batches)
- **Started:** 2026-04-14T19:30:00Z
- **Completed:** 2026-04-14T21:00:00Z
- **Tasks:** 2 of 2 (Task 1 = ARIA exploration + documentation; Task 2 = code skeleton)
- **Files modified:** 2 tracked (lib/calendar.js created, outlook.js modified); 1 local-only (references/outlook-ui.md gitignored)

## Accomplishments

- Ran 10 live agent-browser exploration batches against the Outlook calendar UI, capturing the complete ARIA structure of the week/day views, event buttons, event detail popup card, and navigation URL pattern
- Documented calendar ARIA findings in `references/outlook-ui.md` under a new `### Calendar` section with all findings annotated `confirmed-live` or `inferred`
- Created `lib/calendar.js` with three function stubs (`runCalendar`, `runCalendarRead`, `runCalendarSearch`) following the same require pattern as `lib/digest.js`
- Extended `outlook.js` `VALID_COMMANDS` to 8 entries and added `calendar`, `calendar-read`, `calendar-search` dispatch cases
- Confirmed all D-08, D-09, D-13a unknowns from the research phase with live data

## Task Commits

1. **Task 1: Live ARIA Exploration** - no git commit (references/outlook-ui.md is gitignored by design per privacy policy; changes are local-only on disk)
2. **Task 2: calendar.js skeleton + outlook.js dispatch** - `775159b` (feat)

## Files Created/Modified

- `lib/calendar.js` — Three exported stub functions (runCalendar, runCalendarRead, runCalendarSearch); each returns structured OPERATION_FAILED JSON; sets const POLICY = 'policy-search.json' per D-13; requires ./run, ./output, ./session
- `outlook.js` — VALID_COMMANDS extended to 8 entries; 3 new switch cases dispatching to lib/calendar
- `references/outlook-ui.md` — ### Calendar section appended (local-only, gitignored); documents calendar navigation URL, event button ARIA role and accessible name format, event detail card popup structure, stable ID absence, ShowAs values, recurring/exception indicators, ARIA landmark map

## Decisions Made

- **D-08 confirmed:** No stable DOM event ID exists on calendar event buttons (DOM id=null, dataset={}). Composite key (subject + start_time) is confirmed as the required approach for calendar-read event targeting in Plan 06-02.
- **Calendar URL pattern confirmed:** `OUTLOOK_BASE_URL + '/calendar/'` navigates to `/calendar/view/day`. The `replace('/mail', '/calendar')` pattern fails because BASE_URL may not contain `/mail/`. Use string concatenation.
- **Event role=button (not role=option):** Calendar events render as `role=button` `DIV` elements inside `group > generic` containers. This differs fundamentally from email message rows (role=option in a listbox). The `extractRowsFromText()` function from lib/search.js cannot be reused as-is for calendar.
- **Event detail popup is unnamed generic:** Clicking an event opens a popup card that appears as an unnamed `generic` element at the ARIA root — not a `dialog`, `region`, or `tooltip`. Scoped snapshot approach for calendar-read (Plan 06-03) must target a different landmark than `[aria-label="Reading Pane"]`.
- **Calendar search combobox:** On the calendar view, the search combobox has `aria-label="Search"` (not the longer mail version). Whether submitting a query scopes to calendar results is unresolved (D-13a open question for Plan 06-03).

## Deviations from Plan

### Discovered Issues

**1. [Rule 1 - Bug] Calendar URL pattern differs from assumed**
- **Found during:** Task 1 (Step 1 of ARIA exploration)
- **Issue:** `OUTLOOK_BASE_URL.replace('/mail/', '/calendar/')` fails because the base URL is `https://mail.example.com` (no `/mail/` segment). The direct navigation attempt returned to `/mail/` instead.
- **Fix:** Confirmed that `OUTLOOK_BASE_URL + '/calendar/'` works correctly, navigating to `/calendar/view/day`. Documented the correct URL pattern in the Calendar section of references/outlook-ui.md.
- **Impact:** Plan 06-02 implementation must use `BASE_URL.replace(/\/?$/, '') + '/calendar/'` not `replace('/mail', '/calendar')`.
- **Files modified:** references/outlook-ui.md (local-only)

**2. [Discovery] Calendar button click in batch does not navigate**
- **Found during:** Task 1 (Step 2 of ARIA exploration)
- **Issue:** Using `['find', 'role', 'button', '--name', 'Calendar', 'click']` in a batch did not navigate away from the mail view — URL stayed `/mail/` with a 5s wait.
- **Fix:** Direct URL navigation (`['open', BASE + '/calendar/']`) is the reliable approach. Button click approach is unreliable in batch context.
- **Impact:** Plan 06-02 must use direct URL navigation to calendar, not button click.

**3. [Discovery] Event detail popup structure differs from email reading pane**
- **Found during:** Task 1 (Steps 6-9 of ARIA exploration)
- **Issue:** Calendar event detail is NOT a `main "Reading Pane"` equivalent. It renders as an unnamed `generic` element at the ARIA root. No `aria-label`, no `role=dialog`, no `role=region`.
- **Fix:** Documented the popup card structure in full (confirmed-live capture of "Project Planning Sync daily" event). Plan 06-02 implementation must detect this popup by finding the `button "View event"` button and traversing up to the containing generic.
- **Impact:** Plan 06-02 calendar-read must target the popup card differently than email's reading pane approach.

---

**Total deviations:** 3 discoveries auto-documented (no code changes needed — all affect future plan implementation guidance)
**Impact on plan:** No plan scope change. All discoveries captured in references/outlook-ui.md Calendar section.

## Known Stubs

All three functions in `lib/calendar.js` are intentional stubs — this is the skeleton plan. Each stub returns a properly-formatted OPERATION_FAILED JSON error with the implementing plan reference:
- `runCalendar()` → "not yet implemented (Plan 06-02)"
- `runCalendarRead()` → "not yet implemented (Plan 06-03)"
- `runCalendarSearch()` → "not yet implemented (Plan 06-03)"

These stubs are the plan's designed output. Plans 06-02 and 06-03 replace them with real implementations.

## Issues Encountered

- The event detail popup card is difficult to capture via agent-browser batch because clicking the event opens a transient popup that is dismissed if the focus moves. Resolved by using eval-based click and observing the ARIA tree before popup dismissal.
- `references/outlook-ui.md` is gitignored by design (phase 2 privacy decision) — the calendar section cannot be committed. The file exists locally and is available for Plan 06-02 implementation.

## Next Phase Readiness

- `lib/calendar.js` skeleton is in place for Plan 06-02 to implement `runCalendar()`
- Calendar ARIA structure is fully documented locally in `references/outlook-ui.md` with confirmed-live selectors
- Key open question for Plan 06-02: how to reliably navigate to calendar and enumerate all events in a date range (the week view `['open', BASE + '/calendar/view/week']` approach is confirmed to work)
- Key open question for Plan 06-03: calendar search combobox behavior from calendar view (D-13a)
- D-08 fallback confirmed: Plans 06-02/03 must implement composite key (subject + start_time) for event identity

## Self-Check: PASSED

- FOUND: lib/calendar.js
- FOUND: outlook.js (modified)
- FOUND: 06-01-SUMMARY.md
- FOUND: commit 775159b (feat(06-01))

---
*Phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai*
*Completed: 2026-04-14*
