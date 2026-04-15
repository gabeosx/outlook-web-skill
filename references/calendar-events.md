# Calendar Events Reference

The `calendar`, `calendar-read`, and `calendar-search` subcommands provide read-only access to the user's Outlook calendar. This file documents the JSON schemas for all three subcommands, the meaning of each field, and known limitations.

---

## `calendar` Listing Schema

The `calendar` subcommand returns a `results` array where each element is a calendar event object with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Composite event identifier. Pass to `calendar-read` unchanged. See **Event ID Limitations** below — do not construct IDs manually. |
| `subject` | string or null | Event title/subject line. Unlike email `search` results, this is always populated for calendar events. |
| `organizer` | string or null | Display name of the event organizer (e.g., `"Smith, Alice"` or `"Lee, Joshua"`). Null if not parseable from the accessible name. |
| `start_time` | string or null | ISO 8601 UTC datetime (e.g., `"2026-04-14T13:00:00.000Z"`). Null if parsing failed. |
| `end_time` | string or null | ISO 8601 UTC datetime. For all-day events, this is the day after the last all-day date (exclusive), consistent with iCalendar DTEND semantics. |
| `duration_minutes` | number or null | Duration in minutes. `1440` for all-day events (24 × 60). Null if start or end time is unavailable. |
| `location` | string or null | Meeting location text (room name, address, or Teams/Zoom URL text). Null if not specified in the event. |
| `is_online_meeting` | boolean | `true` if the location or event body indicates an online meeting (Teams, Zoom, Webex, Google Meet, or any URL). |
| `is_all_day` | boolean | `true` for all-day events. All-day events have `duration_minutes: 1440` and `start_time` set to midnight UTC. |
| `is_recurring` | boolean | `true` if this event is an instance of a recurring event series (includes both regular instances and exceptions). |
| `response_status` | string | One of: `"accepted"`, `"tentative"`, `"none"`, `"unknown"` — see **`response_status` Values** below. |

**Example `calendar` result:**

```json
{
  "operation": "calendar",
  "status": "ok",
  "results": [
    {
      "id": "{\"subject\":\"Weekly Standup\",\"start_time\":\"2026-04-14T09:00:00.000Z\"}",
      "subject": "Weekly Standup",
      "organizer": "Smith, Alice",
      "start_time": "2026-04-14T09:00:00.000Z",
      "end_time": "2026-04-14T09:30:00.000Z",
      "duration_minutes": 30,
      "location": "Microsoft Teams Meeting",
      "is_online_meeting": true,
      "is_all_day": false,
      "is_recurring": true,
      "response_status": "accepted"
    },
    {
      "id": "{\"subject\":\"PTO\",\"start_time\":\"2026-04-16T00:00:00.000Z\"}",
      "subject": "PTO",
      "organizer": null,
      "start_time": "2026-04-16T00:00:00.000Z",
      "end_time": "2026-04-18T00:00:00.000Z",
      "duration_minutes": 1440,
      "location": null,
      "is_online_meeting": false,
      "is_all_day": true,
      "is_recurring": false,
      "response_status": "accepted"
    }
  ],
  "count": 2,
  "error": null
}
```

---

## `calendar-read` Detail Schema

The `calendar-read` subcommand returns a single event object (not an array) in the `results` field. It includes all fields from the `calendar` listing schema plus the following additional fields from the event detail popup:

| Field | Type | Description |
|-------|------|-------------|
| `meeting_link` | string or null | Teams or Zoom join URL, if present in the popup card body text. **Usually `null` for Teams meetings** — Outlook only loads the full event body (which contains the join URL) when the full event view is opened, not in the popup card. Use `is_online_meeting: true` as the reliable signal that a meeting has a join link. |
| `attendees` | array | List of attendee objects. **Currently always an empty array** — the popup card shows only aggregate attendee counts (e.g., "Accepted 5, Didn't respond 3"), not individual names. Full attendee list requires navigating to the full event page (out of scope). |
| `body_text` | string | Event agenda and notes as plain text. May contain meeting join instructions, agenda items, links, and other event body content. Empty string if no body content was visible. |

**Note on `response_status` in `calendar-read`:** The event detail popup does not expose the ShowAs/response-status field. `response_status` will always be `"unknown"` in `calendar-read` results. Use `calendar` listing to get `response_status` for an event.

**Note on `results` shape:** For `calendar-read`, `results` is a **single object**, not an array. This matches the `read` subcommand behavior for email.

**Example `calendar-read` result:**

```json
{
  "operation": "calendar-read",
  "status": "ok",
  "results": {
    "id": "{\"subject\":\"Weekly Standup\",\"start_time\":\"2026-04-14T09:00:00.000Z\"}",
    "subject": "Weekly Standup",
    "organizer": "Smith, Alice",
    "start_time": "2026-04-14T09:00:00.000Z",
    "end_time": "2026-04-14T09:30:00.000Z",
    "duration_minutes": 30,
    "location": "Microsoft Teams Meeting",
    "is_online_meeting": true,
    "meeting_link": "https://teams.microsoft.com/l/meetup-join/19%3a...",
    "is_all_day": false,
    "is_recurring": true,
    "response_status": "unknown",
    "attendees": [],
    "body_text": "Join the weekly standup.\n\nAgenda:\n1. Status updates\n2. Blockers\n3. Planning"
  },
  "error": null
}
```

---

## `response_status` Values

The `response_status` field in `calendar` listing results is derived from the Outlook "ShowAs" indicator visible in the calendar event row. In `calendar-read` results, `response_status` is always `"unknown"` (popup card does not expose this field).

| Value | Meaning |
|-------|---------|
| `"accepted"` | User accepted the meeting invitation. Also used when ShowAs is "Busy", "Free", or "OOF" — these indicate the time is committed, not a tentative hold. |
| `"tentative"` | User tentatively accepted the meeting invitation. The time is held but not confirmed. |
| `"none"` | User has not yet responded to the invitation. The event appears on the calendar without a confirmed response. |
| `"unknown"` | Response status could not be determined from the calendar view (ShowAs indicator absent or not recognized). This is also the value returned by `calendar-read` for all events, since the popup card does not expose this field. |

**ShowAs to `response_status` mapping (calendar listing only):**

| Outlook ShowAs aria-label | `response_status` |
|--------------------------|-------------------|
| `Tentative` | `"tentative"` |
| `Busy` | `"accepted"` |
| `Free` | `"accepted"` |
| `OOF` (Out of Office) | `"accepted"` |
| (absent from accessible name) | `"unknown"` |

**When `response_status` is important:** Use the `calendar` listing result for response_status. If you only have a `calendar-read` result, call `calendar` and find the matching event by `subject` and `start_time` to get the definitive response status.

---

## `--days` Flag Behavior

The `calendar` subcommand accepts a `--days N` flag to control the time window:

```bash
node outlook.js calendar               # default: next 7 days
node outlook.js calendar --days 1      # today's events only
node outlook.js calendar --days 14     # next two weeks
node outlook.js calendar --days 30     # next 30 days (may require multiple scroll iterations)
```

- **Default:** `--days 7` — lists events from today through 7 calendar days ahead
- **`--days 1`:** Today's events only (midnight UTC to midnight UTC the next day)
- **`--days 30`:** Next 30 days. Outlook's calendar view may not show all events without scrolling; the skill uses a scroll-accumulate loop (up to 15 scroll iterations) to capture all visible events.
- **Start boundary:** Events are included if their `start_time` falls on or after today's midnight UTC.
- **End boundary:** Events are excluded if their `start_time` is on or after `today + N` days midnight UTC.
- **Sort order:** Events are returned sorted chronologically by `start_time` ascending.
- **All-day events:** All-day events for a given day appear alongside timed events for that day, sorted by `start_time` (midnight UTC for all-day events means they sort before timed events on the same date).

**Empty results:** `{ "status": "ok", "results": [], "count": 0 }` with no events is not an error — it means no events were found in the calendar view for the requested window.

---

## Event ID Limitations

Calendar events in Outlook web do not have a stable DOM identifier (unlike email, which exposes `data-convid`). The `id` field in all three calendar subcommands is a **composite key** constructed by the skill:

```
id = JSON.stringify({ subject: <event subject>, start_time: <ISO 8601 UTC start time> })
```

**Example:**
```
{"subject":"Weekly Standup","start_time":"2026-04-14T09:00:00.000Z"}
```

**Implications:**

1. **Do not construct IDs manually.** Always pass the `id` field from a `calendar` listing result directly to `calendar-read`. The JSON.stringify key ordering must match exactly.

2. **IDs are not stable across sessions.** If the event's subject or start time changes (e.g., a recurring meeting is rescheduled), the ID changes. Always retrieve fresh IDs from `calendar` before calling `calendar-read`.

3. **Two events with the same subject at the same time would share the same ID.** This is rare in practice (Outlook prevents exact duplicates) but possible for recurring events with identical subjects in the same time slot.

4. **`calendar-read` click mechanism:** `calendar-read` uses the subject from the composite key to find and click the matching event button in the calendar view. If multiple events share the same subject, the first matching button is clicked.

5. **`id` is never null** in calendar results (unlike email `search` results where `id` is always null in Phase 2). The composite key is always constructable.

---

## `calendar-search` Query Operators

The `calendar-search` subcommand uses the same search combobox as email search. The skill navigates to the calendar URL before submitting the query for best-effort calendar scoping, but **whether results are guaranteed to be calendar-only is unresolved** — the search combobox covers "email, meetings, files and more" and may return non-calendar results alongside calendar events. Only results that match the calendar event button ARIA pattern (year in accessible name or "all day event" marker) are returned.

**Operators likely to work for calendar search:**

| Operator | Example | Notes |
|----------|---------|-------|
| Free text | `standup` | Searches meeting titles, body, and participants |
| `subject:` | `subject:standup` | Filters by meeting title |
| `before:` | `before:2026-05-01` | Events before a date (YYYY-MM-DD format) |
| `after:` | `after:2026-04-01` | Events after a date (YYYY-MM-DD format) |

**Email operators that do NOT apply to calendar search:**

- `from:` — use free text with the organizer name instead
- `to:` — not applicable to calendar events
- `is:unread`, `is:flagged` — email-only status flags
- `hasattachment:true` — email-only
- `folder:` — email folder operators do not apply to calendar

For the full KQL operator reference for email search, see `references/kql-syntax.md`. Calendar search does not support the full KQL operator set — use simple subject keywords and date range operators for best results.

**`calendar-search` result schema:** Results use the same D-07 schema as `calendar` listing. `response_status` may be `"unknown"` for many results since the search results view may not show the ShowAs indicator.

---

## Natural Language Explanation Templates

Use these templates when explaining calendar results to the user.

```
# Single timed event
"You have [subject] on [weekday] at [start_time formatted as h:MM AM/PM]. It runs for [duration_minutes] minutes."

# All-day event
"[subject] is marked as an all-day event on [start_time formatted as weekday, Month D]."

# Multi-day all-day event
"[subject] is an all-day event spanning [start_time formatted as Month D] to [end_time minus one day formatted as Month D]."

# Online meeting with join link
"[subject] is an online meeting at [start_time formatted]. Join link: [meeting_link]."
  (If meeting_link is null but is_online_meeting is true:)
  "The meeting link wasn't found in the event details. Try calendar-read to retrieve the full event body."

# Recurring event
"[subject] is a recurring event — this instance is on [start_time formatted]."

# Tentative event
"[subject] on [start_time formatted] is tentatively accepted — you haven't confirmed attendance."

# Not responded
"[subject] on [start_time formatted] has no response yet — you haven't accepted or declined."

# Calendar listing summary
"You have [count] event(s) in the next [days] days:
  - [start_time formatted as Mon Apr 14, h:MM AM]: [subject] ([duration_minutes] min)[, recurring][, online meeting]
  - [start_time formatted]: [subject] (all day)
  ..."

# Empty calendar
"No events found in the next [days] days."

# calendar-read result
"[subject] — [start_time formatted as weekday, Month D, h:MM AM - end_time h:MM AM].
  Organizer: [organizer].
  [If location and not is_online_meeting:] Location: [location].
  [If is_online_meeting and meeting_link:] Online meeting. Join: [meeting_link].
  [If body_text:] Notes: [body_text first 200 chars]..."
```

**Formatting `start_time` for display:** Convert ISO 8601 UTC to the user's local time zone before presenting. The raw `start_time` value is UTC. Example: `"2026-04-14T13:00:00.000Z"` = Monday April 14 at 9:00 AM ET (UTC-4).

**Formatting `duration_minutes`:**
- `< 60` → `"30 minutes"`
- `60` → `"1 hour"`
- `90` → `"1.5 hours"` or `"1 hour 30 minutes"`
- `1440` → all-day (do not show duration for all-day events)
