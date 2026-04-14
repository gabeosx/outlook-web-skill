---
phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai
verified: 2026-04-14T21:30:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run `node outlook.js calendar --days 7` against a live Outlook session"
    expected: "Returns JSON array with at least one upcoming event, each containing all 11 D-07 fields. Events sorted chronologically by start_time."
    why_human: "Requires a live authenticated Outlook session. Verifies end-to-end navigation, ARIA extraction, and parser against real calendar data."
  - test: "Run `node outlook.js calendar-read <id>` with an event ID from the prior calendar result"
    expected: "Returns a single event object with D-10 fields: id, subject, organizer, start_time, end_time, duration_minutes, location, is_online_meeting, meeting_link (null or Teams URL), is_all_day, is_recurring, response_status (always 'unknown'), attendees (always []), body_text."
    why_human: "Requires live session and a real event ID. Verifies the popup card click-and-parse flow against real ARIA structure."
  - test: "Run `node outlook.js calendar-search 'standup'` against a live Outlook session"
    expected: "Returns JSON array (possibly empty) of calendar events matching the query. Zero results returns {status:'ok', results:[], count:0} — not an error."
    why_human: "Requires live session. Verifies combobox search workflow and calendar event row extraction from search results view."
  - test: "Run `node outlook.js calendar --days 7` with an expired/absent session (or no .env)"
    expected: "Returns {status:'error', error:{code:'SESSION_INVALID'}} — does not crash."
    why_human: "Verifying session expiry handling requires a session that is actually expired or simulated. Can be approximated by temporarily replacing OUTLOOK_BASE_URL with a login URL, but requires manual setup."
---

# Phase 6: Calendar Capabilities Verification Report

**Phase Goal:** Three read-only calendar subcommands (calendar, calendar-read, calendar-search) are implemented and documented, mirroring the email subcommand architecture — preceded by mandatory ARIA exploration of the calendar UI

**Verified:** 2026-04-14T21:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `references/outlook-ui.md` has a `### Calendar` section with confirmed-live ARIA selectors | VERIFIED | File exists locally (gitignored by design). Contains `### Calendar` section with `confirmed-live` annotations. Confirmed by `06-01-SUMMARY.md` and direct file inspection. |
| 2 | `node outlook.js calendar --days 7` returns chronologically sorted JSON array with all D-07 fields | VERIFIED (code) / human needed (live) | `runCalendar()` is fully implemented (642+ lines). `parseCalendarEventName()` returns all 11 D-07 fields (verified by unit test + direct invocation). Scroll-accumulate, `--days` filtering, and chronological sort are implemented and tested. |
| 3 | `node outlook.js calendar-read <id>` returns D-10 schema including attendees, body_text, meeting_link | VERIFIED (code) / human needed (live) | `runCalendarRead()` implemented. `parseCalendarDetailSnapshot()` returns all D-10 fields. `extractMeetingLink()` regex verified for Teams/Zoom patterns. `outputOk('calendar-read', {...})` outputs D-10 schema. |
| 4 | `node outlook.js calendar-search "<query>"` returns calendar events using combobox workflow with D-07 schema | VERIFIED (code) / human needed (live) | `runCalendarSearch()` uses `['find', 'role', 'combobox', 'click']` and `['find', 'role', 'combobox', 'fill', query]` workflow. Reuses `parseCalendarEventName()` for D-07 schema output. `--limit` cap applied. |
| 5 | `references/calendar-events.md` documents all calendar JSON schemas, response_status values, --days behavior, and event ID limitations | VERIFIED | File exists (261 lines). Contains all 11 D-07 fields, all 3 D-10 fields, response_status table, --days flag docs, event ID limitations section, calendar-search operators, and Natural Language Explanation Templates. |
| 6 | `SKILL.md` documents all three calendar subcommands with invocation syntax, examples, and reference pointers | VERIFIED | All three sections present: `### calendar`, `### calendar-read`, `### calendar-search`. JSON examples include all schema fields. `EVENT_NOT_FOUND` in Error Codes. `references/calendar-events.md` in Reference Files. Frontmatter updated with calendar trigger phrases. |
| 7 | Session expiry during any calendar operation returns `SESSION_INVALID` — not a crash | VERIFIED (code) | `outputError('calendar', 'SESSION_INVALID', ...)`, `outputError('calendar-read', 'SESSION_INVALID', ...)`, `outputError('calendar-search', 'SESSION_INVALID', ...)` — 3 occurrences confirmed. |
| 8 | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` applies to calendar-read body text | VERIFIED | `lib/run.js` sets `AGENT_BROWSER_CONTENT_BOUNDARIES: '1'` in `childEnv` on lines 30, 86, 130. All `runBatch()` calls in calendar.js inherit this. `stripContentBoundaries()` is called on all batch output. |

**Score:** 8/8 truths verified (code-level). 4 truths require human verification against a live session.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/calendar.js` | Calendar subcommand module with all three implementations | VERIFIED | 1175 lines. Exports: runCalendar, runCalendarRead, runCalendarSearch, parseCalendarEventName, extractCalendarRows, parseCalendarArgs, parseCalendarReadArgs, parseCalendarSearchArgs, parseCalendarDetailSnapshot, extractMeetingLink. No stubs. |
| `outlook.js` | Dispatches all 3 calendar subcommands | VERIFIED | VALID_COMMANDS includes 8 entries. Switch has `case 'calendar'`, `case 'calendar-read'`, `case 'calendar-search'` all dispatching to `require('./lib/calendar')`. |
| `references/calendar-events.md` | Calendar event JSON schemas and field documentation | VERIFIED | 261 lines. All required sections confirmed. |
| `SKILL.md` | Updated with calendar subcommand documentation | VERIFIED | 3 new subcommand sections + EVENT_NOT_FOUND + references/calendar-events.md in reference table + frontmatter updated. All existing sections preserved unchanged. |
| `test/calendar-parser.test.js` | Unit tests using real ARIA examples | VERIFIED | 70 tests across 13 describe blocks. All pass (`node --test test/calendar-parser.test.js`: 70 pass, 0 fail). |
| `references/outlook-ui.md` (local, gitignored) | Calendar ARIA section | VERIFIED | Exists locally. Contains `### Calendar` section with `confirmed-live` annotations. Gitignored by design (privacy policy). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| outlook.js | lib/calendar.js | require + switch dispatch | VERIFIED | `require('./lib/calendar').runCalendar()` etc. confirmed in outlook.js lines 72-79 |
| lib/calendar.js | lib/run.js | runBatch() call | VERIFIED | `runBatch` called in runCalendar, runCalendarRead, runCalendarSearch |
| lib/calendar.js | lib/session.js | isLoginUrl() session check | VERIFIED | `isLoginUrl(urlLine.trim())` used in all three subcommands |
| lib/calendar.js | lib/output.js | JSON output envelope | VERIFIED | `outputOk`, `outputError` imported and used throughout |
| SKILL.md | references/calendar-events.md | reference pointer | VERIFIED | `references/calendar-events.md` appears in SKILL.md Reference Files table |
| lib/calendar.js runCalendarSearch | combobox workflow | find role combobox click/fill | VERIFIED | `['find', 'role', 'combobox', 'click']` and `['find', 'role', 'combobox', 'fill', query]` confirmed in runCalendarSearch batch |
| lib/calendar.js runCalendarRead | buildCalendarClickEval | composite key click | VERIFIED | `buildCalendarClickEval(eventId)` called in runCalendarRead; eval script clicks by subject match in aria-label/textContent |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| lib/calendar.js `runCalendar` | `allRows` | `extractCalendarRows(snapshotText)` from `runBatch` accessibility snapshot | Yes — reads from live Outlook calendar page via agent-browser | FLOWING |
| lib/calendar.js `runCalendarRead` | `parsed` | `parseCalendarDetailSnapshot(cleaned, eventId)` from popup card snapshot | Yes — reads popup card after clicking event button | FLOWING |
| lib/calendar.js `runCalendarSearch` | `rows` | `extractCalendarRows(snapshotText)` from combobox search result snapshot | Yes — reads search results page after filling combobox | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| parseCalendarArgs --days 3 | `parseCalendarArgs(['node','outlook.js','calendar','--days','3']).days === 3` | 3 | PASS |
| parseCalendarArgs default | `parseCalendarArgs(['node','outlook.js','calendar']).days === 7` | 7 | PASS |
| parseCalendarEventName D-07 fields | Called with real ARIA string from 06-01 | All 11 fields present, organizer='Lee, Joshua', response_status='tentative', is_recurring=true | PASS |
| parseCalendarEventName all-day | Called with 'PTO, all day event, Thursday, April 16, 2026...' | is_all_day=true, duration_minutes=1440 | PASS |
| extractMeetingLink Teams URL | Called with Teams meetup-join URL | Returns URL string containing teams.microsoft.com | PASS |
| extractMeetingLink no URL | Called with 'no link here' | Returns null | PASS |
| extractMeetingLink Zoom URL | Called with zoom.us/j/ URL | Returns URL string containing zoom.us | PASS |
| parseCalendarSearchArgs | `parseCalendarSearchArgs(['node','outlook.js','calendar-search','standup','--limit','5'])` | { query: 'standup', limit: 5 } | PASS |
| Unit test suite | `node --test test/calendar-parser.test.js` | 70 pass, 0 fail | PASS |
| Live calendar invocation | `node outlook.js calendar --days 7` | Requires live session | SKIP |
| Live calendar-read invocation | `node outlook.js calendar-read <id>` | Requires live session | SKIP |
| Live calendar-search invocation | `node outlook.js calendar-search "standup"` | Requires live session | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CAL-01 | 06-01 | Calendar ARIA exploration — calendar navigation URL | SATISFIED | `references/outlook-ui.md` Calendar section contains confirmed-live URL pattern |
| CAL-02 | 06-01 | Calendar ARIA exploration — event row role and accessible name format | SATISFIED | `references/outlook-ui.md` documents role=button with 3 accessible name formats |
| CAL-03 | 06-01 | Calendar ARIA exploration — event detail pane landmark | SATISFIED | Popup is unnamed generic at ARIA root; documented and implementation adapted |
| CAL-04 | 06-02 | `calendar` subcommand implementation | SATISFIED | `runCalendar()` implemented with scroll-accumulate, --days filtering, chronological sort |
| CAL-05 | 06-02 | D-07 schema fields in calendar listing | SATISFIED | All 11 fields confirmed in `parseCalendarEventName()` output |
| CAL-06 | 06-02 | Chronological sort by start_time | SATISFIED | `results.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))` |
| CAL-07 | 06-02 | Scroll-accumulate for busy calendars | SATISFIED | MAX_SCROLLS=15, 2-consecutive-empty exit |
| CAL-08 | 06-03 | `calendar-read` subcommand implementation | SATISFIED | `runCalendarRead()` implemented |
| CAL-09 | 06-03 | D-10 schema with attendees, body_text, meeting_link | SATISFIED | `parseCalendarDetailSnapshot()` returns all D-10 fields; `extractMeetingLink()` extracts Teams/Zoom URLs |
| CAL-10 | 06-01 | outlook.js dispatch wiring for calendar subcommands | SATISFIED | VALID_COMMANDS has 8 entries; switch cases for all 3 calendar commands |
| CAL-11 | 06-01 | lib/calendar.js skeleton with exports | SATISFIED | Module exists with all exports (later upgraded from stubs to full implementations) |
| CAL-12 | 06-03 | Content boundaries for calendar-read body text | SATISFIED | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` set in all runBatch childEnv calls |
| CAL-13 | 06-03 | `calendar-search` combobox workflow | SATISFIED | Uses `find role combobox click/fill` pattern; navigates to calendar URL first |
| CAL-14 | 06-03 | Session expiry returns SESSION_INVALID | SATISFIED | All 3 operations check isLoginUrl() and call outputError with SESSION_INVALID |
| CAL-15 | 06-04 | `references/calendar-events.md` created | SATISFIED | File exists, 261 lines, all required sections present |
| CAL-16 | 06-04 | `SKILL.md` updated with calendar entries | SATISFIED | All 3 sections, EVENT_NOT_FOUND, references/calendar-events.md, frontmatter updated |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `lib/calendar.js:676` | `buildCalendarClickEval` escapes only `\` and `"` — not `\n` or `\r` | Warning (code review CR-01) | In practice not exploitable: composite key is always produced by JSON.stringify which encodes newlines as `\n` (two chars, not bare newline). Would become a risk if a caller constructs a raw event ID with bare newlines, which the current API surface does not support. |
| `lib/calendar.js:833-854` | Duplicate `bodyLines.push` path — second push at line 851 is dead code (code review WR-01) | Info | The first `if (organizer)` block always fires and continues before the second `if (organizer !== null)` can run. No functional impact — body text accumulation is correct via the first path. |
| `lib/calendar.js:268-273` | All-day branch does not accumulate multi-part locations (code review WR-02) | Warning | Only affects all-day events with physical addresses containing comma-separated parts. Test suite uses single-segment address; real-world multi-part addresses would be truncated. |
| `lib/calendar.js:687-693` | `startTime` variable extracted in eval string but never used in DOM match predicate (code review WR-03) | Info | Start time is not used in event button matching — first button with matching subject is clicked. Documented limitation in SKILL.md. No functional regression, but could cause wrong event selection for recurring events with same subject at different times. |

None of the above anti-patterns block the phase goal. CR-01 is safe in practice. WR-02 and WR-03 are correctness limitations under specific conditions.

### Human Verification Required

#### 1. Live Calendar Listing

**Test:** With a valid `.env` and authenticated session, run `node outlook.js calendar --days 7`
**Expected:** Exits with code 0. Stdout contains valid JSON with `{"operation":"calendar","status":"ok","results":[...],"count":N}`. Each result has all 11 D-07 fields. Events are sorted chronologically by `start_time`. If today has meetings on the calendar, they appear.
**Why human:** Requires a live Outlook session and real calendar data to verify end-to-end navigation, snapshot capture, ARIA parsing, and date filtering.

#### 2. Live Calendar-Read

**Test:** Use the `id` from a `calendar` result. Run `node outlook.js calendar-read '<id>'` (pass the full JSON composite key string).
**Expected:** Exits with code 0. Returns a single event object with D-10 fields. `response_status` is `"unknown"`. `attendees` is `[]`. `body_text` contains any visible agenda text. `meeting_link` is a Teams URL or null.
**Why human:** Requires clicking a real event in the calendar UI and parsing the live popup card. The popup's ARIA structure may vary across event types.

#### 3. Live Calendar-Search

**Test:** Run `node outlook.js calendar-search "standup"` (or a keyword matching a known event).
**Expected:** Exits with code 0. Returns JSON with `status:'ok'`. May return empty array if no matching events — that is not an error. If results exist, they have D-07 fields.
**Why human:** Requires confirming that the combobox search workflow produces any calendar event results in the search view. The calendar scoping behavior (D-13a) is explicitly unresolved — whether results are calendar-only cannot be verified without running it.

#### 4. Session Expiry Handling

**Test:** Simulate an expired session or point `OUTLOOK_BASE_URL` at `https://login.microsoftonline.com` (triggers `isLoginUrl()`). Run any calendar subcommand.
**Expected:** Returns `{"operation":"calendar","status":"error","error":{"code":"SESSION_INVALID","message":"..."}}` with exit code 1.
**Why human:** Requires manually constructing a session-expired scenario. The code path is present (3 SESSION_INVALID occurrences confirmed), but live validation confirms it fires correctly vs. crashing.

### Gaps Summary

No gaps blocking goal achievement. All 8 success criteria are verified at the code level. 4 items require human testing against a live session to confirm end-to-end behavior — these cannot be verified programmatically without a running Outlook session.

**Code quality issues identified in the code review (06-REVIEW.md) do not block phase goal:**
- CR-01 (incomplete escaping in buildCalendarClickEval): Safe in practice; not exploitable via the current API surface
- WR-01 (dead code in parseCalendarDetailSnapshot): No functional impact
- WR-02 (all-day multi-part location truncation): Edge case affecting rare event configurations
- WR-03 (startTime not used in click predicate): Documented limitation; first matching subject wins

These should be addressed in a follow-up fix, but do not prevent the calling agent from using calendar capabilities as designed.

---

_Verified: 2026-04-14T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
