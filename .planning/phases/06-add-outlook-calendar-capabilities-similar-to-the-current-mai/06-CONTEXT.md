# Phase 6: Add Outlook Calendar Capabilities - Context

**Gathered:** 2026-04-14 (user delegated all decisions to Claude)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add read-only calendar access to the Outlook web skill, mirroring the structure of the existing email capabilities. Three new subcommands are added to `outlook.js`:

- `calendar` — list upcoming events within a configurable time window (analog of `digest` for email)
- `calendar-read` — fetch full details of a specific event by ID (analog of `read` for email)
- `calendar-search` — search calendar events by keyword/date range (analog of `search` for email); uses the same combobox workflow as email search — the combobox is labeled "Search for email, **meetings**, files and more." and already has a Calendar filter tab

Phase 6 also extends `references/outlook-ui.md` with calendar ARIA findings (mirrors what Phase 0 did for email), and writes `references/calendar-events.md` for the calling agent.

**Out of scope for Phase 6:**
- Accepting, declining, or responding to calendar invites — hard read-only constraint, unchanged
- Creating, editing, or deleting calendar events — same constraint
- Non-primary calendars (shared calendars, delegated access) — out of scope for v1

</domain>

<decisions>
## Implementation Decisions

### ARIA Exploration (mirrors Phase 0 approach)

- **D-01:** Phase 6 MUST start with a live calendar exploration pass before any implementation. Calendar UI was NOT explored in Phase 0 (email-only). The exploration pass captures: calendar navigation URL/landmark, event list ARIA structure (role, aria-label), individual event row accessible name format, event detail pane landmarks, and the stable event ID attribute (analog of `data-convid`). This produces a new `### Calendar` section in `references/outlook-ui.md`.
- **D-02:** Extend `references/outlook-ui.md` (do not create a separate `calendar-ui.md`) — keeps all verified Outlook ARIA in one authoritative file.
- **D-03:** Navigate to calendar via the existing nav: `button "Calendar"` is confirmed in outlook-ui.md. Likely URL: `OUTLOOK_BASE_URL.replace('/mail', '/calendar')` — verify during exploration, not assumption.

### Subcommand Design

- **D-04:** Three new subcommands added to `VALID_COMMANDS` in `outlook.js`: `calendar`, `calendar-read`, and `calendar-search`. Module files: `lib/calendar.js` (exports `runCalendar()`, `runCalendarRead()`, `runCalendarSearch()`).
- **D-05:** `calendar` subcommand accepts `--days N` (default: 7). Lists events starting from today's date up to N calendar days ahead, sorted chronologically.
- **D-06:** `calendar-read` accepts a required positional `<event-id>` argument (the stable ID captured during `calendar` listing). Returns full event details.

### Event Data Fields — `calendar` listing

- **D-07:** Each event in the `calendar` results array contains:
  ```json
  {
    "id": "string (stable ID for calendar-read — from event ARIA or URL)",
    "subject": "string",
    "organizer": "string",
    "start_time": "ISO 8601 UTC string",
    "end_time": "ISO 8601 UTC string",
    "duration_minutes": "number",
    "location": "string or null",
    "is_online_meeting": "boolean",
    "is_all_day": "boolean",
    "is_recurring": "boolean",
    "response_status": "accepted | tentative | none | unknown"
  }
  ```
- **D-08:** If the stable event ID cannot be extracted from the calendar list view (same problem as Phase 2 where `id` was always null in email search), fall back to using the event's accessible name + start_time as a composite key. Document this limitation in `references/calendar-events.md`.
- **D-09:** Parse `start_time` and `end_time` from the accessible name text. Calendar accessible names confirmed to include time in Outlook's standard format — exact parsing handled at implementation time using the ARIA exploration findings.

### Event Data Fields — `calendar-read` detail view

- **D-10:** `calendar-read` returns:
  ```json
  {
    "id": "string",
    "subject": "string",
    "organizer": "string",
    "start_time": "ISO 8601 UTC string",
    "end_time": "ISO 8601 UTC string",
    "duration_minutes": "number",
    "location": "string or null",
    "is_online_meeting": "boolean",
    "meeting_link": "string or null (Teams/Zoom URL extracted from body)",
    "is_all_day": "boolean",
    "is_recurring": "boolean",
    "response_status": "accepted | tentative | none | unknown",
    "attendees": [{"name": "string", "email": "string or null", "response": "accepted | tentative | declined | none"}],
    "body_text": "string (agenda/notes — plain text only, no HTML)"
  }
  ```
- **D-11:** Scope the reading pane snapshot to the calendar event detail pane (analog of `[aria-label="Reading Pane"]` for email). The exact landmark is to be determined during the ARIA exploration pass.
- **D-12:** Content boundaries (`AGENT_BROWSER_CONTENT_BOUNDARIES=1`) apply to calendar-read — calendar event body/agenda can contain prompt-injection-style content just like email.

### Calendar Search (`calendar-search`)

- **D-13a:** `calendar-search` uses the same combobox workflow as `lib/search.js` — click the combobox, fill the query, press Enter, wait for results. The combobox aria-label ("Search for email, meetings, files and more.") is already confirmed. The ARIA exploration pass determines whether clicking the "Calendar" tab in the suggestions listbox is required before submitting, or whether the query alone surfaces calendar results.
- **D-13b:** `calendar-search` accepts a required positional query string. The query format mirrors email KQL where applicable (date operators like `before:`, `after:` are likely to work; email-specific operators like `from:` may apply to organizer; subject: likely applies to meeting title). Document tested operators in `references/calendar-events.md`.
- **D-13c:** `calendar-search` results use the same schema as `calendar` listing (D-07) — consistent field shape across all three calendar subcommands.

### Policy and Safety

- **D-13:** Reuse `policy-search.json` for both `calendar` and `calendar-read` — it allows navigate, snapshot, get, wait, scroll. No `click` or `fill` needed for read-only calendar ops. Consistent with how `digest.js` reuses `policy-search.json` (Phase 4 decision D-24).
- **D-14:** `outlook.js` VALID_COMMANDS list is updated: `['auth', 'search', 'read', 'digest', 'tune', 'calendar', 'calendar-read', 'calendar-search']`.

### Scroll Accumulation

- **D-15:** Apply scroll-accumulate loop to the calendar event list (same pattern as `digest.js`). For a 7-day window this is usually <10 events, so the loop will typically exit in 1–2 iterations. The loop is included defensively — busy weeks could have many events.
- **D-16:** As in Phase 2/Phase 4, the accessibility snapshot MUST be the final command inside the batch — page state resets to `about:blank` after the batch CLI exits.

### Reference Documentation

- **D-17:** Phase 6 writes `references/calendar-events.md` documenting: `calendar` listing JSON schema, `calendar-read` detail JSON schema, the `response_status` values, the `--days` flag behavior, and the known limitation around event IDs. The calling agent reads this to understand calendar results (same role as `digest-signals.md` for digest).
- **D-18:** `SKILL.md` is updated to add `calendar`, `calendar-read`, and `calendar-search` subcommand entries, including examples and schema references.

### Claude's Discretion

- Exact accessible name parsing for calendar events (time format, prefix patterns) — determined during ARIA exploration
- Whether to navigate to Day/Week/Month view or use the search combobox's "Calendar" tab for the listing
- How to handle timezone offset (display timezone vs. UTC normalization)
- Module structure — whether `lib/calendar.js` handles both subcommands or splits into `lib/calendar.js` + `lib/calendar-read.js`
- Error message wording for new error cases (e.g., event ID not found)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 6 scope
- `.planning/ROADMAP.md` §Phase 6 — goal and success criteria (to be written at plan time)
- `.planning/REQUIREMENTS.md` §Read-Only Safety — SAFE-01–04 apply unchanged to calendar

### Existing implementation (MUST READ before adding new subcommands)
- `outlook.js` — entry point, VALID_COMMANDS, env var validation, subcommand dispatch; extend, don't rewrite
- `lib/run.js` — `runBatch()`, `stripContentBoundaries()`, `runAgentBrowser()`; all calendar ops use these
- `lib/output.js` — `outputOk()`, `outputError()`; JSON envelope contract
- `lib/digest.js` — canonical pattern for listing + scroll-accumulate + accessible name parsing; calendar analog follows this pattern closely
- `lib/read.js` — canonical pattern for reading pane scoped snapshot; calendar-read follows this
- `lib/search.js` — `parseAccessibleName()`, `extractRowsFromText()` exported; may be reusable for calendar row parsing

### Verified ARIA (email baseline — calendar section to be added in Phase 6)
- `references/outlook-ui.md` — existing email ARIA patterns; calendar exploration extends this file

### Skill packaging (for SKILL.md update and new reference doc)
- `.agents/skills/agent-browser/SKILL.md` — agent-browser CLI reference
- `references/digest-signals.md` — model for `references/calendar-events.md` style/depth

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/digest.js` — entire pattern (batch construction, accessible name parsing, scroll-accumulate) is the template for `lib/calendar.js`
- `lib/read.js` — entire pattern (navigate to item, scoped snapshot, body text extraction) is the template for `calendar-read`
- `lib/search.js` — exports `parseAccessibleName()` and `extractRowsFromText()`; likely reusable for calendar row parsing if calendar accessible name format is similar
- `policy-search.json` — reused as-is for calendar operations (D-13)

### Established Patterns
- Batch execution: `runBatch()` from `lib/run.js` — all operations in one Chrome session
- Snapshot is always the last command in the batch (Phase 2 decision — page resets to `about:blank` after CLI exits)
- `data-convid` is the stable email ID; calendar needs an equivalent — to be identified during ARIA exploration
- 5s initial wait required for cold Chrome start (Phase 2 finding)
- Content boundaries: `AGENT_BROWSER_CONTENT_BOUNDARIES=1` set in `runAgentBrowser()`'s child env — applies automatically

### Integration Points
- `outlook.js` `VALID_COMMANDS` array: add `'calendar'`, `'calendar-read'`, `'calendar-search'`
- `outlook.js` switch statement: add `case 'calendar':`, `case 'calendar-read':`, `case 'calendar-search':` routing to `lib/calendar.js`
- `SKILL.md`: add two new subcommand entries to the existing subcommands section
- `references/outlook-ui.md`: append calendar section (do not replace)

</code_context>

<specifics>
## Specific Ideas

- User's framing: "similar to the current mailbox capabilities" — the architecture and code patterns must mirror email closely, not diverge
- User delegated all decisions to Claude — full confidence in the codebase-grounded approach above

</specifics>

<deferred>
## Deferred Ideas

- Non-primary/shared calendar support — out of scope for v1
- Recurring event instance navigation — complex; v1 just marks `is_recurring: true` on each instance
- Event creation/editing — permanently out of scope (read-only constraint)

### Reviewed Todos (not folded)

No pending todos found for this phase.

</deferred>

---

*Phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai*
*Context gathered: 2026-04-14 (user delegated all decisions)*
