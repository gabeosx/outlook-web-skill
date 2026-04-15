# Phase 6: Add Outlook Calendar Capabilities - Research

**Researched:** 2026-04-14
**Domain:** Outlook Web Calendar — browser automation via agent-browser; mirrors email subcommand architecture
**Confidence:** HIGH (all core decisions grounded in verified codebase and confirmed ARIA patterns from Phase 0/email work)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 6 MUST start with a live calendar exploration pass before any implementation. Calendar UI was NOT explored in Phase 0. Exploration captures: calendar nav URL/landmark, event list ARIA structure, event row accessible name format, event detail pane landmarks, stable event ID attribute.
- **D-02:** Extend `references/outlook-ui.md` — do not create a separate `calendar-ui.md`.
- **D-03:** Navigate to calendar via `button "Calendar"` (confirmed in capture 1). Likely URL: `OUTLOOK_BASE_URL.replace('/mail', '/calendar')` — verify during exploration.
- **D-04:** Three new subcommands added to `VALID_COMMANDS`: `calendar`, `calendar-read`, `calendar-search`. Module: `lib/calendar.js`.
- **D-05:** `calendar` accepts `--days N` (default: 7). Lists events from today up to N days ahead, chronological.
- **D-06:** `calendar-read` accepts a required positional `<event-id>`.
- **D-07:** `calendar` result schema: `id`, `subject`, `organizer`, `start_time`, `end_time`, `duration_minutes`, `location`, `is_online_meeting`, `is_all_day`, `is_recurring`, `response_status`.
- **D-08:** If stable event ID cannot be extracted, fall back to event accessible name + start_time as composite key.
- **D-09:** Parse `start_time` / `end_time` from accessible name text — exact format determined during ARIA exploration.
- **D-10:** `calendar-read` result schema: all fields from D-07 plus `meeting_link`, `attendees`, `body_text`.
- **D-11:** Scope reading pane snapshot to calendar event detail pane (analog of `[aria-label="Reading Pane"]`).
- **D-12:** `AGENT_BROWSER_CONTENT_BOUNDARIES=1` applies to `calendar-read`.
- **D-13a:** `calendar-search` uses same combobox workflow as `lib/search.js`. Combobox aria-label confirmed: "Search for email, meetings, files and more."
- **D-13b:** `calendar-search` accepts a required positional query string. KQL date operators likely applicable; document tested operators in `references/calendar-events.md`.
- **D-13c:** `calendar-search` results use same schema as `calendar` listing (D-07).
- **D-13:** Reuse `policy-search.json` for all calendar operations.
- **D-14:** `VALID_COMMANDS` updated to: `['auth', 'search', 'read', 'digest', 'tune', 'calendar', 'calendar-read', 'calendar-search']`.
- **D-15:** Apply scroll-accumulate loop to calendar event list (same pattern as `digest.js`). Loop exits after 1–2 iterations for typical 7-day windows.
- **D-16:** Accessibility snapshot MUST be the final command in each batch (page resets to `about:blank` after CLI exits — confirmed Phase 2 decision).
- **D-17:** Phase 6 writes `references/calendar-events.md`.
- **D-18:** `SKILL.md` updated to add `calendar`, `calendar-read`, `calendar-search` subcommand entries.

### Claude's Discretion

- Exact accessible name parsing for calendar events (time format, prefix patterns) — determined during ARIA exploration
- Whether to navigate to Day/Week/Month view or use search combobox "Calendar" tab for the listing
- How to handle timezone offset (display timezone vs. UTC normalization)
- Module structure — whether `lib/calendar.js` handles both subcommands or splits into `lib/calendar.js` + `lib/calendar-read.js`
- Error message wording for new error cases

### Deferred Ideas (OUT OF SCOPE)

- Non-primary/shared calendar support — out of scope for v1
- Recurring event instance navigation — v1 marks `is_recurring: true` on each instance
- Event creation/editing/accepting/declining — permanently out of scope (read-only constraint)
</user_constraints>

---

## Summary

Phase 6 adds calendar read capabilities to the `outlook-web` skill by closely mirroring the email subcommand architecture established in Phases 2–4. The implementation has three tiers: a list command (`calendar`), a detail command (`calendar-read`), and a search command (`calendar-search`).

The critical technical unknown is the calendar event ARIA structure, which has never been explored (Phase 0 covered email only). This is explicitly addressed by decision D-01: the phase must begin with a live ARIA exploration pass before writing any implementation code. Without verified ARIA selectors for the calendar view, no reliable snapshot parsing can be built. All other technical patterns are fully understood from the existing codebase.

The existing `lib/digest.js` scroll-accumulate pattern, `lib/read.js` scoped snapshot pattern, `lib/search.js` combobox workflow, and `lib/run.js` `runBatch()` infrastructure are all reused directly. The policy file (`policy-search.json`) needs no modification. The primary implementation risk is ARIA structure divergence from the email model — calendar events may use different roles, different accessible name formats, and different ID patterns than email `option` rows.

**Primary recommendation:** Build the ARIA exploration batch first, verify calendar event structure live, then write parsers against verified selectors. Do not speculate on ARIA structure — the Phase 0 email research discovered multiple non-obvious patterns (double-encoded eval, `data-convid` vs DOM `id`, snapshot-must-be-last) that would have caused hard-to-debug failures if assumed.

---

## Standard Stack

No new packages required. All implementation uses the existing project stack.

### Core (Already Installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Node.js | v25.9.0 | Runtime | [VERIFIED: shell] |
| agent-browser | 0.25.3 | Browser automation CLI | [VERIFIED: references/outlook-ui.md capture metadata] |
| `lib/run.js` | — | `runBatch()`, `stripContentBoundaries()` | Reused as-is |
| `lib/output.js` | — | `outputOk()`, `outputError()`, `log()` | Reused as-is |
| `lib/search.js` | — | `parseAccessibleName()`, `extractRowsFromText()`, `executeComboboxSearch()` | Potentially reusable for calendar row parsing if ARIA format is similar |

### No New Installations Required
All required infrastructure is already present. Phase 6 adds only:
- `lib/calendar.js` (new source file)
- `references/calendar-events.md` (new reference document)
- Updates to `references/outlook-ui.md`, `outlook.js`, and `SKILL.md`

---

## Architecture Patterns

### Recommended Project Structure (Delta)
```
lib/
├── calendar.js          # NEW: runCalendar(), runCalendarRead(), runCalendarSearch()
├── digest.js            # unchanged — canonical pattern source
├── read.js              # unchanged — canonical pattern source
├── search.js            # unchanged — exports reusable for calendar row parsing
└── run.js               # unchanged — runBatch() used by calendar.js

references/
├── calendar-events.md   # NEW: calendar JSON schema doc + operator reference
└── outlook-ui.md        # EXTENDED: append ### Calendar section

outlook.js               # MODIFIED: add 3 cases to VALID_COMMANDS + switch
SKILL.md                 # MODIFIED: add 3 subcommand entries
```

### Pattern 1: ARIA Exploration Batch (Wave 0 mandatory step)

**What:** Before writing any parser, run a live batch to capture the calendar event list ARIA structure.
**When to use:** First task in Wave 0. No parser code can be written without this.
**What to capture:**
1. URL after navigating to calendar (confirm `OUTLOOK_BASE_URL.replace('/mail', '/calendar')`)
2. Calendar view container role and aria-label (analog of `listbox "Message list"`)
3. Event row role and accessible name format (analog of `option "Unread Sender..."`)
4. Whether a stable ID attribute exists on event rows (analog of `data-convid`)
5. Date/time rendering in accessible name — exact format (e.g., "Mon Apr 14, 2026 9:00 AM – 10:00 AM")
6. Event detail pane role and aria-label (analog of `main "Reading Pane"`)
7. Accessible name format differences for: all-day events, recurring events, online meetings
8. Whether clicking the "Calendar" tab in the search suggestions listbox is needed before pressing Enter, or whether the combobox Enter directly routes to calendar results when on the calendar view

**Exploration batch structure:**
```javascript
// Source: mirrored from Phase 0 pattern documented in references/outlook-ui.md
const explorationBatch = [
  ['open', process.env.OUTLOOK_BASE_URL.replace('/mail/', '/calendar/')],
  ['wait', '5000'],
  ['get', 'url'],          // confirm URL pattern
  ['snapshot'],            // capture calendar view ARIA tree
];
```

**Anti-pattern:** Do NOT assume the calendar event ARIA structure mirrors email. Calendar events are a different content type — roles, names, and ID attributes may all differ from `option` rows with `data-convid`.

---

### Pattern 2: `calendar` Listing — Mirrors `digest.js`

**What:** Navigate to calendar view, extract upcoming event rows, parse accessible names.
**Template:** `lib/digest.js` — entire batch construction, scroll-accumulate loop, and row parsing pattern.

**Key structural questions resolved by ARIA exploration (before implementation):**
- Is the event list a `listbox` or a different container role?
- Are events grouped by day (like email groups by "Today"/"Yesterday") or rendered flat?
- What is the accessible name format? (e.g., "Mon Apr 14 9:00 AM – 10:00 AM Team Standup Alpha User Recurring Online")
- Does Outlook render a stable `data-eventid` (or equivalent) on event rows for `calendar-read` targeting?

**Scroll behavior (D-15):** The same scroll-accumulate pattern from `digest.js` applies — Outlook SPAs virtualize long lists. For a 7-day window this typically renders all events without scrolling, but the loop is included defensively.

**Batch structure (post-exploration):**
```javascript
// Source: mirrors lib/digest.js CONVID_EVAL + snapshot pattern
const EVENT_ID_EVAL = "JSON.stringify(Array.from(document.querySelectorAll('[data-event-id]')).map(el => el.getAttribute('data-event-id')))";
// Note: actual attribute name determined during ARIA exploration — 'data-event-id' is [ASSUMED]

const calendarBatch = [
  ['open', CALENDAR_URL],
  ['wait', '5000'],
  ['get', 'url'],           // session check
  ['eval', EVENT_ID_EVAL],  // extract event IDs while page is live
  ['snapshot'],             // MUST be last
];
```

---

### Pattern 3: `calendar-read` — Mirrors `lib/read.js`

**What:** Navigate to calendar, click a specific event by ID, capture scoped snapshot of detail pane.
**Template:** `lib/read.js` — search+click navigation pattern, scoped snapshot, metadata extraction from ARIA headings.

**Key difference from email read:** Email read uses a search combobox to load the email list first, then clicks by `data-convid`. Calendar read may navigate directly to the calendar view and click an event row by its stable ID (if one exists). If no stable ID exists on calendar rows, the fallback is matching by subject + start_time composite key (D-08).

**Scoped snapshot:** The event detail pane selector is determined during ARIA exploration (D-11). Candidate patterns based on email analogy:
- `[ASSUMED]` `[aria-label="Event details"]` — by analogy with `[aria-label="Reading Pane"]`
- `[ASSUMED]` A different aria-label — calendar panes often use event-specific accessible names

**Meeting link extraction (D-10 `meeting_link` field):** Extract Teams/Zoom URL from `body_text` using regex. Typical patterns:
- Teams: `https://teams.microsoft.com/l/meetup-join/...`
- Zoom: `https://[company].zoom.us/j/...`
This extraction happens in JavaScript after body text is captured — no browser interaction needed.

```javascript
// [ASSUMED] Meeting link extraction pattern
function extractMeetingLink(bodyText) {
  const teamsRe = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/;
  const zoomRe = /https:\/\/[a-z0-9]+\.zoom\.us\/j\/[^\s"<>]+/;
  const m = bodyText.match(teamsRe) || bodyText.match(zoomRe);
  return m ? m[0] : null;
}
```

---

### Pattern 4: `calendar-search` — Mirrors `lib/search.js`

**What:** Use existing search combobox workflow to search calendar events.
**Template:** `lib/search.js` `executeComboboxSearch()` — combobox click, fill, Enter, wait, snapshot.

**Confirmed ARIA:** The combobox (`aria-label="Search for email, meetings, files and more."`) is already confirmed live. The "Search Suggestions" listbox has a `Calendar` tab (observed in search-suggestions listbox capture alongside Mail, Files, Teams, People tabs — NOT confirmed as a separate tab in Phase 0 captures, see Open Questions).

**Search context:** D-13a notes that when on the calendar view, submitting the search combobox may automatically scope results to calendar. When on the mail view, a "Calendar" filter tab may be needed. The exploration pass should test both behaviors.

**Result schema reuse (D-13c):** `calendar-search` returns the same field shape as `calendar` listing (D-07). This means the same row parser handles both subcommands — good for code sharing.

---

### Pattern 5: ISO 8601 UTC Normalization

**What:** Calendar accessible names contain times in local timezone display (e.g., "9:00 AM"). These must be converted to ISO 8601 UTC strings for the output schema (D-07: `start_time`, `end_time`).

**Approach (Claude's discretion):** Parse the display time using `Date` constructor with the user's local timezone, then call `.toISOString()`. This requires knowing the offset.

**Recommended approach:** Use Node.js `Intl.DateTimeFormat` to determine the runtime timezone, then construct a `Date` from the display string. Since the skill runs in the same timezone as the user's computer (which shows the Outlook calendar in local time), `new Date(dateString)` will interpret it correctly if the string includes timezone context.

**Fallback for timezone ambiguity:** If confident UTC conversion cannot be done (e.g., no timezone in the accessible name), include the raw display time in the `start_time` field with an `[ASSUMED]` caveat in `calendar-events.md` and let the calling agent handle display. This is a Claude's Discretion item — finalize during implementation after seeing real accessible name formats.

---

### Pattern 6: Response Status Parsing

**What:** Map the event's response status to one of: `"accepted" | "tentative" | "none" | "unknown"`.

**[ASSUMED]** Outlook calendar accessible names may include response status text (e.g., "Accepted", "Tentative", "Not responded") as a prefix or suffix on event rows, similar to how "Unread " and "Important " prefix email rows. The exact format is unknown until ARIA exploration.

**Fallback:** If response status is not in the accessible name, it may be in the detail pane only. In that case:
- `calendar` listing: `response_status: "unknown"` (cannot determine from list view alone)
- `calendar-read`: parse from detail pane headings or body

---

### Anti-Patterns to Avoid

- **[VERIFIED: codebase patterns]** Do NOT use `--json` flag in `snapshot` inside a batch — agent-browser ignores `--json` in batch context and produces text format. The snapshot parser must handle text format, not JSON.
- **[VERIFIED: codebase patterns]** Do NOT run `eval` as the last command in the batch — `eval` return values need the snapshot to follow them for parsing. Keep snapshot last.
- **[VERIFIED: codebase patterns]** Do NOT try to use the calendar URL with `/id/` pattern for event navigation. The email analog (`/mail/id/...`) uses a specific Exchange ItemId format. Calendar URLs (`/calendar/item/...`) may use a different ID type — verify during exploration.
- **[VERIFIED: codebase patterns]** Do NOT emit anything to stdout except the final JSON envelope. All diagnostic output uses `log()` which writes to stderr only.
- **[ASSUMED]** Do NOT assume calendar rows have `data-convid`. This is the email-specific Exchange ConversationId. Calendar events use a different identity model.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser session | Custom Chromium wrapper | `runBatch()` in `lib/run.js` | Phase 2 decision: all ops use one batch call; page resets to `about:blank` between invocations |
| JSON output envelope | Custom output format | `outputOk()`, `outputError()` in `lib/output.js` | Enforces consistent `{operation, status, results, error}` envelope for all subcommands |
| Combobox search workflow | New search implementation | `lib/search.js` `executeComboboxSearch()` | Exact combobox click+fill+Enter workflow already verified live; reuse or closely mirror |
| Row text extraction | New regex | `extractRowsFromText()` from `lib/search.js` | Option-role row extraction already handles [ref=eNN] stripping and whitespace; adaptable for calendar rows if role is similar |
| Accessible name parsing | New parser from scratch | Build on `parseAccessibleName()` from `lib/search.js` | Date regex patterns already handle all Outlook date formats; adapt time-range format for calendar |
| Action policy | New policy file | `policy-search.json` | Already allows all needed actions (navigate, snapshot, get, wait, scroll, eval, click, press, fill) — reuse as-is per D-13 |
| Content boundary stripping | New regex | `stripContentBoundaries()` from `lib/run.js` | Handles both START and END marker variants; verified against live output |
| Session validity check | URL-based check from scratch | `isLoginUrl()` from `lib/session.js` | Already detects login redirects; same inline-check pattern used by digest.js and read.js |

**Key insight:** The calendar implementation is a remapping exercise — map calendar ARIA structure to the same batch/parse/output pipeline the email subcommands already use. Building custom abstractions for calendar would diverge from the established pattern and create maintenance inconsistency.

---

## Common Pitfalls

### Pitfall 1: ARIA Exploration Skip
**What goes wrong:** Implementation begins with assumed ARIA selectors (e.g., `[aria-label="Event list"]`). Selectors don't match live Outlook calendar. All snapshot parsing returns empty results silently.
**Why it happens:** The temptation to start coding immediately. Email ARIA was thoroughly documented in Phase 0; calendar has NO equivalent baseline.
**How to avoid:** D-01 is non-negotiable. The first batch in Wave 0 is the exploration pass. No `lib/calendar.js` parser code is written until exploration output is in `references/outlook-ui.md`.
**Warning signs:** Parser returns empty `results: []` on first run even though the calendar has events.

### Pitfall 2: Snapshot Not Last in Batch
**What goes wrong:** `eval` or `get url` is placed after `snapshot`. The page resets to `about:blank` after the batch CLI exits — any command after snapshot operates on a blank page.
**Why it happens:** Logical ordering impulse (snapshot first to see what's there, then eval). But the batch exits after all commands run, and subsequent CLI invocations start on `about:blank`.
**How to avoid:** [VERIFIED: Phase 2 decision] Always put `['snapshot']` as the final array element in every batch. `eval` for ID extraction MUST precede snapshot.
**Warning signs:** `eval` returns empty array or null when event rows are visible in snapshot output.

### Pitfall 3: Assuming `data-convid` on Calendar Rows
**What goes wrong:** The eval script uses `document.querySelectorAll('[data-convid]')` on the calendar view. Returns empty array. Event IDs are all null in output.
**Why it happens:** Direct copy-paste from `digest.js` CONVID_EVAL without checking whether the attribute exists on calendar rows.
**How to avoid:** During ARIA exploration, run a DOM attribute probe on event rows (same as Phase 0 capture 4) to find the actual stable ID attribute. Write a calendar-specific eval script.
**Warning signs:** All `id` fields are null in `calendar` output even when events are visible.

### Pitfall 4: Calendar URL Wrong Format
**What goes wrong:** Navigation to `OUTLOOK_BASE_URL.replace('/mail', '/calendar')` produces a 404 or redirect back to mail, OR navigates to the correct URL but Outlook SPA renders the calendar view under a different URL pattern.
**Why it happens:** D-03 notes this is a likely URL but must be verified. Outlook SPAs sometimes use hash routing (`/calendar#view=month`) or query params.
**How to avoid:** Run `get url` as the second batch command (after open + wait) to confirm the actual URL Outlook uses after calendar navigation. Document in the Calendar ARIA section.
**Warning signs:** Snapshot shows inbox/mail content instead of calendar, or `get url` returns a URL not containing "calendar".

### Pitfall 5: Date Parsing Fails on All-Day Events
**What goes wrong:** `start_time` and `end_time` are null for all-day events. The `duration_minutes` field is `NaN`.
**Why it happens:** All-day events in Outlook show "All day" instead of a time range in the accessible name. The time parser's regex doesn't match "All day".
**How to avoid:** During accessible name parsing, check for "All day" (or equivalent) pattern before running time regex. Set `is_all_day: true`, `start_time: <date>T00:00:00Z` (beginning of day), `end_time: <date+1>T00:00:00Z`, `duration_minutes: 1440`.
**Warning signs:** All-day events cause parse errors or return `null` times.

### Pitfall 6: Search Combobox Routes to Mail Instead of Calendar
**What goes wrong:** `calendar-search` submits a query but results show email rows instead of calendar events.
**Why it happens:** The combobox is shared across mail and calendar. When on the mail view, pressing Enter routes to mail search results. Calendar search may require: (a) navigating to the calendar view first, or (b) clicking a "Calendar" filter tab in the suggestions listbox before pressing Enter.
**How to avoid:** ARIA exploration should test search behavior from both the mail view and the calendar view to determine which approach produces calendar results.
**Warning signs:** `calendar-search` returns results with accessible names that look like email rows (sender name format) rather than event rows (time range format).

### Pitfall 7: Double-Encoded Eval Output
**What goes wrong:** ID extraction eval returns `null` or parse fails because the outer JSON string is not stripped before inner JSON.parse.
**Why it happens:** [VERIFIED: Phase 2/3 decision] agent-browser JSON-encodes eval return values. Since the eval calls `JSON.stringify()`, the batch output is double-encoded: `"\"[...]\""`. A single `JSON.parse` strips the outer quotes but leaves the inner array as a string.
**How to avoid:** Reuse the `parseConvids()` pattern from `lib/digest.js` — two-level JSON.parse with double-encoded match first, bare JSON array as fallback.
**Warning signs:** ID array contains a single string element that starts with `[` — indicates only one JSON.parse was applied.

---

## Code Examples

### Exploration Batch (Wave 0 — run before any implementation)
```javascript
// Source: mirrors Phase 0 exploration + lib/digest.js DOM probe pattern
const CALENDAR_URL = process.env.OUTLOOK_BASE_URL.replace(/\/mail\/?.*$/, '/calendar/');

// DOM probe to discover event row ID attribute (run as eval in exploration batch)
const EVENT_DOM_PROBE = "JSON.stringify(Array.from(document.querySelectorAll('[role=option],[role=gridcell],[role=row]')).slice(0, 3).map(el => ({ tagName: el.tagName, role: el.getAttribute('role'), id: el.id, dataset: Object.keys(el.dataset), ariaLabel: el.getAttribute('aria-label'), className: el.className.slice(0, 60) })))";

const explorationBatch = [
  ['open', CALENDAR_URL],
  ['wait', '5000'],
  ['get', 'url'],          // confirm calendar URL pattern
  ['eval', EVENT_DOM_PROBE], // discover event row structure
  ['snapshot'],            // MUST be last — captures full ARIA tree
];
```

### `calendar` Listing Batch Structure (post-exploration template)
```javascript
// Source: mirrors lib/digest.js runDigest() batch construction
// Replace EVENT_ID_EVAL with actual attribute discovered during exploration
const CALENDAR_BATCH = [
  ['open', CALENDAR_URL],
  ['wait', '5000'],
  ['get', 'url'],               // inline session check
  ['eval', EVENT_ID_EVAL],      // extract event IDs (discovered attribute)
  ['snapshot'],                 // MUST be last
];
```

### Session Check Pattern (reused across all calendar subcommands)
```javascript
// Source: lib/digest.js and lib/read.js — inline URL-based session check
// [VERIFIED: codebase]
const { isLoginUrl } = require('./session');
const urlLine = cleanedOutput.split('\n').find(l => /^https?:\/\/\S+$/.test(l.trim()));
if (urlLine && isLoginUrl(urlLine.trim())) {
  outputError('calendar', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
  return;
}
```

### ISO 8601 UTC Conversion (Claude's Discretion — post-exploration)
```javascript
// [ASSUMED] Approach depends on actual accessible name time format discovered during exploration
// Node.js v25 has full Intl.DateTimeFormat support
function toISOUtc(displayDateStr, displayTimeStr) {
  // Example: displayDateStr = "Mon, April 14, 2026", displayTimeStr = "9:00 AM"
  // Date() constructor interprets without timezone as local time on this machine
  const d = new Date(`${displayDateStr} ${displayTimeStr}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString(); // UTC output e.g. "2026-04-14T13:00:00.000Z"
}
```

### Meeting Link Extraction (D-10 `meeting_link` field)
```javascript
// Source: standard regex patterns for Teams/Zoom — [ASSUMED] URL format stable
function extractMeetingLink(bodyText) {
  if (!bodyText) return null;
  const teamsRe = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>\]]+/;
  const zoomRe = /https:\/\/[a-z0-9-]+\.zoom\.us\/j\/[^\s"<>\]]+/;
  const m = bodyText.match(teamsRe) || bodyText.match(zoomRe);
  return m ? m[0].replace(/[).,]+$/, '') : null; // strip trailing punctuation
}
```

### `outlook.js` Dispatch Extension
```javascript
// Source: outlook.js switch pattern — [VERIFIED: codebase]
const VALID_COMMANDS = ['auth', 'search', 'read', 'digest', 'tune', 'calendar', 'calendar-read', 'calendar-search'];

// Add to switch statement:
case 'calendar':
  require('./lib/calendar').runCalendar();
  break;
case 'calendar-read':
  require('./lib/calendar').runCalendarRead();
  break;
case 'calendar-search':
  require('./lib/calendar').runCalendarSearch();
  break;
```

---

## Runtime State Inventory

> Omitted. This is a greenfield feature addition — no rename, refactor, or migration. No stored data, live service config, OS registrations, secrets, or build artifacts are affected by adding new subcommands.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `lib/calendar.js` runtime | Yes | v25.9.0 | — |
| agent-browser CLI | Browser automation | Yes (0.25.3) | 0.25.3 | — |
| Managed Chrome binary | Browser sessions | Configured via `.env` | User-configured | None — must be set |
| Outlook web session | All calendar operations | Requires auth | — | Run `node outlook.js auth` |

**Missing dependencies with no fallback:**
- None (assuming `.env` is configured and `node outlook.js auth` has been run)

**Note:** Calendar exploration pass (D-01) requires a live Outlook session with calendar events visible in the current 7-day window. If the user's calendar is empty for the next 7 days, the exploration pass will show an empty event list — which is valid, but less useful for ARIA discovery. In that case, navigate to a week with known events.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for Phase 6 |
|--------------|------------------|--------------|---------------------|
| Separate policy files per op | Reuse `policy-search.json` | Phase 4 decision D-24 | Use `policy-search.json` for all calendar ops — no new file |
| Manual eval parse (single JSON.parse) | Double-decode pattern | Phase 3 discovery | All eval ID extraction must use two-level JSON.parse |
| Scroll-accumulate disabled | Enabled for all list views | Phase 4 (digest.js) | Calendar uses same scroll loop; disabled for search (Phase 2 decision) |
| Profile-based session | `--session-name outlook-skill` | Phase 1 decision | All calendar batches use same session name |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `OUTLOOK_BASE_URL.replace('/mail/', '/calendar/')` produces the correct calendar URL | Pattern 1 (Exploration) | Must verify during exploration — wrong URL = no calendar content |
| A2 | Calendar event rows use some stable DOM ID attribute (analogous to `data-convid`) | Pattern 2, Code Examples | If no stable ID exists, D-08 composite-key fallback applies; `calendar-read` must work differently |
| A3 | Calendar search routes to calendar results when combobox is submitted from the calendar view | Pattern 4, Pitfall 6 | If search always routes to mail results, a "Calendar" tab click or explicit filter may be needed |
| A4 | Response status (accepted/tentative/none) is expressed in the event accessible name or detail pane | Pattern 6 | If not exposed in ARIA, `response_status` must always return `"unknown"` in listing results |
| A5 | Teams/Zoom meeting link URL patterns in `extractMeetingLink()` cover this tenant's link format | Code Examples | If company uses a different Teams domain or custom Zoom subdomain, regex may need adjustment |
| A6 | `new Date(displayDateStr + " " + displayTimeStr)` correctly interprets calendar times as local timezone | Pattern 5 (ISO 8601) | If parsed as UTC, all event times will be offset by the user's UTC offset |
| A7 | The "Calendar" tab is visible in the search suggestions listbox (confirmed present: All, Mail, Files, Teams, People — Calendar not in Phase 0 captures) | Pattern 4, Open Questions | If Calendar tab is absent or named differently, search scoping may not work |

---

## Open Questions

1. **What is the calendar event ARIA structure?**
   - What we know: `button "Calendar"` exists in `navigation "left-rail-appbar"` (confirmed in Phase 0 capture 1). Calendar view has never been opened via agent-browser on this tenant.
   - What's unclear: Event row role (option? gridcell? row?), accessible name format, container landmark, stable ID attribute.
   - Recommendation: Mandatory ARIA exploration pass (D-01) — first task of Wave 0 before any other implementation.

2. **Does the "Calendar" tab exist in the search combobox suggestions listbox?**
   - What we know: Phase 0 capture 5 shows the suggestions listbox has tabs: `All`, `Mail`, `Files`, `Teams`, `People`. No `Calendar` tab was visible. The CONTEXT.md says "already has a Calendar filter tab" but this was not confirmed in the Phase 0 capture.
   - What's unclear: Whether the Calendar tab appears only after typing a query, or only when on the calendar view, or whether it's absent on this tenant.
   - Recommendation: Test during ARIA exploration — type a sample query and capture the suggestions listbox to see available tabs.

3. **How does Outlook Calendar URL routing work on this tenant?**
   - What we know: Mail URL is `https://mail.example.com/mail/` (after load). Calendar button exists in nav.
   - What's unclear: Does `button "Calendar"` click navigate to `/calendar/`, `/calendar/view/month/`, or a hash-routed URL?
   - Recommendation: Capture `get url` after clicking the Calendar nav button during exploration.

4. **Are calendar events virtualized like email in the inbox?**
   - What we know: Email inbox virtualizes ~12–20 rows, requiring scroll-accumulate. Calendar week/month views typically show all events without virtualization.
   - What's unclear: Whether the agent-browser ARIA snapshot captures all events for a 7-day view, or whether virtual DOM applies.
   - Recommendation: D-15 includes the scroll loop defensively. If exploration shows all 7 days render immediately, the loop will exit after 1 iteration.

5. **What event detail pane landmark does calendar use?**
   - What we know: Email uses `main "Reading Pane"` for the email detail view. Calendar typically has a separate event detail panel.
   - What's unclear: Whether the calendar event detail uses `main`, `dialog`, `region`, or another role, and its `aria-label` value.
   - Recommendation: After clicking an event row during ARIA exploration, capture a full snapshot to identify the detail pane landmark.

---

## Canonical References for Implementation

**Must read before implementing `lib/calendar.js`:**
- `lib/digest.js` — canonical list + scroll-accumulate pattern; `lib/calendar.js` listing follows this
- `lib/read.js` — canonical scoped snapshot + metadata extraction; `calendar-read` follows this
- `lib/search.js` — combobox workflow + row parsing; `calendar-search` follows this, `extractRowsFromText()` may be reusable
- `lib/run.js` — `runBatch()`, `stripContentBoundaries()`; all calendar ops use these
- `references/outlook-ui.md` — existing email ARIA baseline; calendar exploration extends this file
- `references/digest-signals.md` — model for `references/calendar-events.md` style and depth
- `SKILL.md` — current subcommand documentation style; calendar entries follow this format

---

## Sources

### Primary (HIGH confidence)
- Codebase — `lib/digest.js`, `lib/read.js`, `lib/search.js`, `lib/run.js`, `lib/output.js`, `lib/session.js` — direct inspection of verified, working implementation
- `references/outlook-ui.md` — live-captured ARIA patterns from Phase 0 (2026-04-10, agent-browser 0.25.3)
- `outlook.js` — confirmed `VALID_COMMANDS`, dispatch pattern, env var structure
- `policy-search.json` — confirmed allow-list contents
- `.planning/phases/06-add-outlook-calendar-capabilities-similar-to-the-current-mai/06-CONTEXT.md` — all locked decisions and discretion areas

### Secondary (MEDIUM confidence)
- `references/outlook-ui.md` evidence section — Phase 0 capture 1 confirms `button "Calendar"` in `navigation "left-rail-appbar"` and search combobox label; calendar URL pattern inferred from email URL structure
- `SKILL.md` — confirmed output envelope format and subcommand documentation style

### Tertiary (LOW confidence — require exploration verification)
- Calendar URL pattern (`/calendar/` path) — inferred from email URL structure, not live-verified
- Calendar event ARIA structure — entirely unverified; must be captured in Wave 0
- "Calendar" tab in search suggestions listbox — CONTEXT.md states it exists but Phase 0 captures do not show it

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing stack fully verified in production use
- Architecture patterns: HIGH for email-parallel patterns (reuse); MEDIUM for calendar-specific ARIA (unverified until exploration)
- Pitfalls: HIGH — all derived from documented Phase 0–4 live discoveries in STATE.md and codebase comments
- Calendar ARIA structure: LOW — not yet explored; entire Wave 0 is dedicated to resolving this

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (agent-browser and Outlook web change infrequently; re-verify if Microsoft deploys a calendar UI update)
