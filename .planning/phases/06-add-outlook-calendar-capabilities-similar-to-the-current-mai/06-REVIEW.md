---
phase: 06-add-outlook-calendar-capabilities-similar-to-the-current-mai
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - lib/calendar.js
  - test/calendar-parser.test.js
  - references/calendar-events.md
  - SKILL.md
  - outlook.js
  - lib/digest.js
  - lib/read.js
  - lib/run.js
  - lib/search.js
  - lib/session.js
  - lib/tune.js
  - policy-auth.json
  - policy-read.json
  - policy-search.json
  - references/digest-signals.md
  - references/error-recovery.md
  - references/kql-syntax.md
  - references/outlook-ui.example.md
  - scoring.json.example
  - .env.example
  - README.md
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 06 adds three calendar subcommands (`calendar`, `calendar-read`, `calendar-search`) implemented in `lib/calendar.js`, tested in `test/calendar-parser.test.js`, and documented in `references/calendar-events.md` and `SKILL.md`. The implementation is well-structured, closely mirrors established patterns from `lib/digest.js` and `lib/search.js`, and the parser is thoroughly unit-tested against live-captured ARIA strings.

The prior Phase 06 review (2026-04-14, 5 files) identified CR-01 (incomplete JS string escaping in `buildCalendarClickEval`), WR-01 (duplicated dead `bodyLines.push`), WR-02 (asymmetric all-day location accumulation), and WR-03 (`start_time` extracted but unused in click eval). This review covers the full 21-file diff scope with all pre-existing lib/ files in scope for a lighter pass.

**Status of prior findings:** All four prior issues (CR-01, WR-01, WR-02, WR-03) are confirmed **fixed** in the current code. The escaping now uses `JSON.stringify`, the duplicate body-lines push is gone, the all-day branch accumulates multi-part locations, and `startTime` is now used in the click predicate.

This pass identifies four new warnings and three info items. The primary concern is that `parseCalendarDetailSnapshot` does not handle the all-day event date format from the popup card, producing null `start_time`/`end_time` for all-day events opened via `calendar-read`. Secondary concerns are: a double-parse pattern in `runCalendar`'s scroll loop, an organizer firstname heuristic that would misidentify digit-containing location tokens, and a possible combobox ambiguity in `runCalendarSearch`.

The pre-existing files (`digest.js`, `read.js`, `search.js`, `run.js`, `session.js`, `tune.js`, policy files, reference docs) show no new issues.

---

## Warnings

### WR-01: `parseCalendarDetailSnapshot` does not handle all-day popup date format — `start_time` always null for all-day events in `calendar-read`

**File:** `lib/calendar.js:869`
**Issue:** Inside `parseCalendarDetailSnapshot`, the date/time regex at line 869 is:
```
/^(\w{3})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i
```
This requires both a start and end time in `H:MM AM - H:MM AM` format. All-day events in the Outlook popup card display a date-only string such as `"Tue 4/14/2026"` or `"Mon 4/13/2026 - Wed 4/15/2026"` with no time component. This string will not match the regex, leaving `dateYear` as `null`.

When `dateYear` is `null`:
- `start_time` and `end_time` remain `null`
- `duration_minutes` remains `null`
- `is_all_day` stays `false` (it is declared `const` at line 933 and never set)
- The returned `id` becomes `JSON.stringify({ subject, start_time: null })` — a broken composite key

An all-day event opened via `node outlook.js calendar-read '<id>'` would return a result with all time fields null and a broken `id`, making the output useless for follow-up operations.

**Fix:** Add an all-day date branch before the timed date/time check. First, change the `is_all_day` declaration to `let`:
```javascript
// Line ~933: change
const is_all_day = false;
// to:
let is_all_day = false;
```
Then in the `staticMatch` block add a branch:
```javascript
// Before the dtm check:
// All-day format: "Tue 4/14/2026" or "Mon 4/13/2026 - Wed 4/15/2026"
const allDayDtm = text2.match(/^\w{3}\s+(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-\s*\w{3}\s+\d{1,2}\/\d{1,2}\/\d{4})?$/i);
if (!dtm && allDayDtm) {
  dateMonth = parseInt(allDayDtm[1], 10) - 1;
  dateDay = parseInt(allDayDtm[2], 10);
  dateYear = parseInt(allDayDtm[3], 10);
  is_all_day = true;
  startTimeRaw = null;
  endTimeRaw = null;
  continue;
}
```
Also update the ISO 8601 construction block to handle `is_all_day`:
```javascript
if (dateYear !== null) {
  if (is_all_day) {
    start_time = new Date(Date.UTC(dateYear, dateMonth, dateDay)).toISOString();
    end_time = new Date(Date.UTC(dateYear, dateMonth, dateDay + 1)).toISOString();
    duration_minutes = 1440;
  } else if (startTimeRaw) {
    // ... existing timed logic ...
  }
}
```

---

### WR-02: Double parse of every event row in `runCalendar` — dedup key generation and final results loop both call `parseCalendarEventName`

**File:** `lib/calendar.js:527–528, 566–568, 604–619`
**Issue:** In `runCalendar`, rows are added to `allRows` as raw strings and deduped using a `seenKeys` set. The dedup key is computed by calling `parseCalendarEventName(r)` inline at line 527 (initial seeding) and line 567 (scroll accumulation). Then the final results loop at line 611 calls `parseCalendarEventName(row)` again on every row in `allRows`. Every row is therefore parsed twice — once for dedup, once for output. For a calendar with 100 events over 15 scroll iterations, this is 200+ parse calls where 100 would suffice.

More subtly: the `seenKeys` set stores the key from the first parse, but there is no guarantee the key produced by the second parse (in the final results loop) is identical if the parsing were ever non-deterministic. Currently it is deterministic, so this is a latent issue rather than an active bug, but the pattern is fragile.

**Fix:** Store parsed objects instead of raw row strings, and deduplicate on the parsed object directly:
```javascript
// Replace allRows (string[]) with allParsed (object[])
let allParsed = initialRows.map(r => parseCalendarEventName(r));
for (const p of allParsed) {
  seenKeys.add(JSON.stringify({ subject: p.subject, start_time: p.start_time }));
}

// In scroll loop:
for (const row of newRows) {
  const parsed = parseCalendarEventName(row);
  const key = JSON.stringify({ subject: parsed.subject, start_time: parsed.start_time });
  if (!seenKeys.has(key)) {
    allParsed.push(parsed);
    seenKeys.add(key);
    addedCount++;
  }
}

// Final pass operates directly on allParsed — no second parse needed.
for (const event of allParsed) {
  if (event.start_time) { /* filter and push */ }
}
```

---

### WR-03: Organizer firstname heuristic uses `\w+` — would misidentify digit-containing location tokens as firstnames

**File:** `lib/calendar.js:267, 351`
**Issue:** Both the all-day and timed event organizer-parsing branches use `/^\w+$/.test(nextPart)` to detect whether the token following `"By Lastname"` is a firstname. `\w` matches `[A-Za-z0-9_]`. A location token that happens to follow an organizer — such as a room number like `"Room204"` or a conference identifier like `"Conf_A"` — would satisfy this pattern and be incorrectly consumed as the organizer's firstname, producing e.g. `organizer: "Org, Room204"`.

Real firstnames are purely alphabetic (ignoring hyphens and apostrophes), so restricting the test to alphabetic characters eliminates the false-positive class while correctly handling the most common names. The existing tests all use purely alphabetic firstnames, so no tests would need updating.

**Fix (both occurrences at lines 267 and 351):**
```javascript
// Replace:
if (/^\w+$/.test(nextPart) && !nextPart.startsWith('By ')) {

// With:
if (/^[A-Za-z'-]{1,30}$/.test(nextPart) && !nextPart.startsWith('By ')) {
```
This allows hyphens and apostrophes (e.g., `"O'Brien"`, `"Ann-Marie"`) while excluding digits and underscores.

---

### WR-04: `runCalendarSearch` combobox `find` has no `--name` qualifier — may match wrong combobox in calendar view

**File:** `lib/calendar.js:1316, 1318`
**Issue:** The search batch in `runCalendarSearch` uses `['find', 'role', 'combobox', 'click']` and `['find', 'role', 'combobox', 'fill', query]` without a `--name` argument to disambiguate. This works reliably in `lib/search.js` because it opens the inbox, which has exactly one combobox. However, `runCalendarSearch` first navigates to `/calendar/`, which may expose a date-range combobox or other calendar-specific controls alongside the search combobox. If a second combobox is visible in the calendar view, `find role combobox` would match whichever appears first in the ARIA tree, and the fill/press Enter would execute against the wrong element.

**Fix:** Add `--name` with the confirmed ARIA label for the search combobox:
```javascript
['find', 'role', 'combobox', '--name', 'Search for email, meetings, files and more.', 'click'],
['wait', '500'],
['find', 'role', 'combobox', '--name', 'Search for email, meetings, files and more.', 'fill', query],
```
If the label differs in the calendar context (which requires live verification), add a comment noting the risk and the fallback behavior.

---

## Info

### IN-01: Dead variable `organizerLinesConsumed` in `parseCalendarDetailSnapshot`

**File:** `lib/calendar.js:824, 923`
**Issue:** `organizerLinesConsumed` is declared at line 824 (`let organizerLinesConsumed = 0`) and incremented at line 923 (`organizerLinesConsumed++`) but never read anywhere. It is scaffolding left over from an earlier implementation and serves no purpose.

**Fix:**
```javascript
// Remove:
let organizerLinesConsumed = 0;
// ...and the increment:
organizerLinesConsumed++;
```

---

### IN-02: `parseMonth` silently returns `0` (January) for unrecognized month names

**File:** `lib/calendar.js:60–66`
**Issue:** When `monthName` is not in the months array, `Array.prototype.indexOf` returns `-1`, but the function returns `idx >= 0 ? idx : 0`, mapping the failure to `0` (January). A corrupted or unexpected month name silently produces a wrong date rather than a null result. All month names come from Outlook's ARIA output and are expected to be well-formed, but defensive handling would aid debugging.

**Fix:**
```javascript
function parseMonth(monthName) {
  const months = ['january', 'february', /* ... */ 'december'];
  return months.indexOf((monthName || '').toLowerCase().trim()); // returns -1 on failure
}

// In parseCalendarDate:
const month = parseMonth(m[1]);
if (month < 0) return null; // unrecognized month — treat as parse failure
```

---

### IN-03: `attendeeCountText` detection regex may match body sentences beginning with "Accepted" that contain a digit

**File:** `lib/calendar.js:886–889`
**Issue:** The guard `if (/^(Accepted|Declined|Tentative|Didn't respond|No response)/i.test(text2) && /\d/.test(text2))` would match any StaticText beginning with those words that contains any digit — including body sentences like `"Accepted by 3 of 5 stakeholders"` or `"Tentative — slots 2 and 4 are available"`. While this is a low-probability edge case (attendee count lines appear in a predictable position relative to the organizer), the pattern is imprecise.

**Fix:** Require the numeric count to immediately follow the keyword (standard Outlook format: `"Accepted 5, Didn't respond 3"`):
```javascript
// Replace:
if (/^(Accepted|Declined|Tentative|Didn't respond|No response)/i.test(text2) && /\d/.test(text2)) {

// With:
if (/^(Accepted|Declined|Tentative|Didn't respond|No response)\s+\d/i.test(text2)) {
```

---

_Reviewed: 2026-04-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
