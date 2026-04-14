---
phase: 06-add-outlook-calendar-capabilities
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - SKILL.md
  - lib/calendar.js
  - outlook.js
  - references/calendar-events.md
  - test/calendar-parser.test.js
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-14
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 06 adds three calendar subcommands (`calendar`, `calendar-read`, `calendar-search`) to the existing Outlook web skill. The implementation follows established patterns from the email subcommands. The parser logic (`parseCalendarEventName`) is thorough and is backed by real ARIA-captured test fixtures. Session handling and read-only policy enforcement are correctly reused.

One critical issue is identified: `buildCalendarClickEval` insufficiently escapes the injected event ID, leaving newline and carriage-return characters unescaped in a dynamically constructed JS string that is sent to `eval`. Three warnings cover: (1) a duplicated `bodyLines.push` path in `parseCalendarDetailSnapshot` that silently discards the second push, (2) asymmetric location accumulation between all-day and timed event parsers, and (3) `start_time` being extracted from the composite key in `buildCalendarClickEval` but never actually used in the match condition. Four info-level items cover dead code, minor pattern gaps, and a documentation inconsistency.

---

## Critical Issues

### CR-01: Incomplete escaping in `buildCalendarClickEval` allows newline injection into eval string

**File:** `lib/calendar.js:676`

**Issue:** The `safe` variable escapes only `\` and `"` before embedding `eventId` into a concatenated JavaScript string that is passed to `eval`. If `eventId` contains a newline (`\n`) or carriage return (`\r`) character — which can happen if an Outlook event subject contains one — the resulting eval script becomes syntactically invalid or executes unintended statements. While Outlook Web UI subjects rarely contain newlines, the escaping is incomplete and the pattern is unsafe regardless of likelihood.

The composite key is `JSON.stringify({ subject, start_time })`. `JSON.stringify` encodes `\n` as the two-character sequence `\n` (escaped), so in the resulting JSON string the literal is `\\n`, not a bare newline. This means in practice the ID passed to `buildCalendarClickEval` will not contain a bare newline. However, the comment on line 675 says "Escape the event ID for safe embedding in a JS string literal" and the escaping is incomplete against that stated goal — if a caller ever passes a raw event ID string with unescaped newlines (e.g., constructed manually or from a future code path), this will silently break.

**Fix:** Use `JSON.stringify` to produce a fully safe JS string literal rather than manual escaping:

```javascript
function buildCalendarClickEval(eventId) {
  // JSON.stringify produces a valid JS string literal including all escape sequences
  const safeId = JSON.stringify(eventId); // e.g., '"{\"subject\":...}"'
  return (
    '(function() {' +
    'var id = ' + safeId + ';' +  // no manual escaping needed
    'var parsed; try { parsed = JSON.parse(id); } catch(e) { return "not_found:parse_error"; }' +
    // ... rest unchanged
    '})()'
  );
}
```

---

## Warnings

### WR-01: Duplicated `bodyLines.push` in `parseCalendarDetailSnapshot` — second push is dead code

**File:** `lib/calendar.js:833-854`

**Issue:** Inside the `staticMatch` branch of `parseCalendarDetailSnapshot`, there are two separate conditions that both push to `bodyLines`:

- Lines 833-836: `if (organizer) { bodyLines.push(text2); continue; }` — this fires and `continue`s, so the code below is never reached when organizer is set.
- Lines 851-854: `if (organizer !== null) { bodyLines.push(text2); }` — this condition is structurally unreachable: whenever `organizer !== null` is true at line 852, the `if (organizer)` at line 833 would have already fired and `continue`d.

The second push (lines 851-854) is dead code. Any text that arrives between the date/time and organizer fields (but without a matching location condition at line 841) is silently consumed — neither pushed to `bodyLines` nor assigned to `location`.

**Fix:** Remove the duplicate dead-code block at lines 851-854. Consolidate all post-organizer body accumulation in the single block at lines 833-836. If pre-organizer unmatched text needs special handling, add an explicit `else` branch before the organizer check:

```javascript
// Inside staticMatch block:
if (organizer !== null) {
  // All text after organizer is body text
  bodyLines.push(text2);
  continue;
}
// ... location detection ...
// (remove the second if (organizer !== null) block below)
```

---

### WR-02: Asymmetric location handling — all-day branch does not accumulate multi-part locations

**File:** `lib/calendar.js:268-273`

**Issue:** In the timed event branch (lines 354-364), location parts are accumulated with `result.location = result.location + ', ' + part` to handle multi-segment addresses like `"123 Main Street, Anytown, NY 10001"`. The all-day event branch (lines 268-273) only assigns a single part: `result.location = part` with no accumulation. A multi-part location in an all-day event would silently discard all parts after the first.

The test suite happens to use `'Company HQ - Floor 65'` as the all-day location fixture — this is a single comma-free segment, so the test passes. A real all-day event with a multi-part address (e.g., `'123 Main Street, Anytown, NY 10001'`) would produce truncated location output with no error.

**Fix:** Apply the same accumulation logic to the all-day branch:

```javascript
// All-day branch (replace lines 268-273):
} else {
  // Could be a location (before "By")
  if (!result.organizer) {
    if (!result.location) {
      result.location = part;
    } else {
      result.location = result.location + ', ' + part;
    }
    result.is_online_meeting = detectOnlineMeeting(result.location);
  }
  idx++;
}
```

---

### WR-03: `start_time` extracted from composite key in `buildCalendarClickEval` but never used in DOM match

**File:** `lib/calendar.js:687-693`

**Issue:** `buildCalendarClickEval` parses both `subject` and `start_time` from the composite key (line 682-683 in the eval script), but the `find` predicate on line 688-690 only checks whether the element's `aria-label` or `textContent` contains `subject` — `startTime` is extracted but never referenced. This means if two events share the same subject at different times (e.g., a recurring event appearing twice in a multi-week view), the first matching button is always clicked, regardless of which `start_time` was intended.

This limitation is documented in SKILL.md ("If multiple events share the same subject, the first matching button is clicked"), but the code creates the false impression that `start_time` participates in the match. The extracted `startTime` variable is dead code in the eval string.

**Fix (option A — preferred):** Use `start_time` in the match. The accessible name contains the time in `"h:MM AM to h:MM AM"` format; extract the time portion from `start_time` and include it in the predicate:

```javascript
// In buildCalendarClickEval, update the find predicate:
'var target = allButtons.find(function(el) {' +
'  var name = el.getAttribute("aria-label") || el.textContent || "";' +
'  return name.indexOf(subject) !== -1 && (startTime === "" || name.indexOf(startTime.substring(11,16)) !== -1);' +
'});'
```

**Fix (option B — minimal):** Remove `startTime` extraction to eliminate dead code and make the limitation explicit in the eval comment:

```javascript
// Remove the startTime line; add comment explaining single-match limitation
'var subject = parsed.subject || "";' +
// startTime is not used — first button matching subject wins (documented limitation)
```

---

## Info

### IN-01: `extractCalendarRows` year filter includes `"` as a valid year-trailing character

**File:** `lib/calendar.js:395`

**Issue:** The first year detection branch uses `/, 20\d\d[,"]/.test(name)`. The `"` character would match a quote immediately after a year, which is not a possible character in a calendar event accessible name (these are plain text strings, not quoted). The `"` is dead within this regex branch. This is cosmetic, but could confuse a future maintainer who tries to understand when a `"` would follow a year.

**Fix:** Remove `"` from the character class:

```javascript
const hasYear = /, 20\d\d[,]/.test(name) || /, 20\d\d$/.test(name) || / 20\d\d[,\s]/.test(name);
// Or simplified:
const hasYear = /(, | )20\d\d([,\s"]|$)/.test(name);
```

---

### IN-02: `parseCalendarReadArgs` does not validate that `eventId` is a valid JSON composite key

**File:** `lib/calendar.js:633-644`

**Issue:** `parseCalendarReadArgs` accepts any non-null string as `eventId`. If a caller passes a malformed ID (e.g., a plain subject string instead of the JSON composite key), `buildCalendarClickEval` will call `JSON.parse` on it in the browser context and return `"not_found:parse_error"`, producing an `EVENT_NOT_FOUND` error with a confusing message. A simple validation — checking that the string starts with `{` and can be parsed as JSON with `subject` and `start_time` keys — would produce a clearer `INVALID_ARGS` error at the CLI boundary before any browser is opened.

**Fix:**

```javascript
function parseCalendarReadArgs(argv) {
  // ... existing arg extraction ...
  if (!eventId) {
    outputError('calendar-read', 'INVALID_ARGS', 'Usage: node outlook.js calendar-read <event-id>');
  }
  // Validate composite key format
  try {
    const parsed = JSON.parse(eventId);
    if (!parsed.subject || !parsed.start_time) {
      outputError('calendar-read', 'INVALID_ARGS',
        'event-id must be the composite key from a prior calendar result (JSON with subject and start_time)');
    }
  } catch {
    outputError('calendar-read', 'INVALID_ARGS',
      'event-id is not valid JSON — pass the id field from a calendar result unchanged');
  }
  return { eventId };
}
```

---

### IN-03: `parseMonth` returns `0` (January) silently on unrecognized month names

**File:** `lib/calendar.js:43-50`

**Issue:** `parseMonth` returns `0` when `monthName` is not found in the months array. This means a corrupted or unrecognized month string silently produces January dates rather than a parse failure. The caller `parseCalendarDate` returns `null` only if the full date regex fails — if the regex matches but the month name is misspelled, the date will be wrong. This is a low-risk issue because all month names come from Outlook's ARIA output (which is expected to be well-formed), but it makes debugging harder.

**Fix:** Return `-1` on not-found, and have `parseCalendarDate` treat a `-1` month index as a parse failure:

```javascript
function parseMonth(monthName) {
  const months = ['january', /* ... */];
  return months.indexOf((monthName || '').toLowerCase().trim()); // returns -1 if not found
}

function parseCalendarDate(dateStr) {
  // ...
  const month = parseMonth(m[1]);
  if (month < 0) return null; // unrecognized month
  // ...
}
```

---

### IN-04: `outlook.js` line 82 — `log()` call and `process.exit(0)` after synchronous dispatch are unreachable for subcommands that call `outputError`

**File:** `outlook.js:82-83`

**Issue:** `outputError` in `lib/output.js` calls `process.exit(1)` internally. For subcommands that fail with an error, `process.exit(1)` fires inside the subcommand, making the `log()` and `process.exit(0)` calls on lines 82-83 of `outlook.js` unreachable in the error path. For successful subcommands that write to stdout and return normally, the `process.exit(0)` is valid. This is not a functional bug, but the comment intent of "switch complete, calling process.exit(0)" implies the log will always execute, which is misleading for error paths.

This is minor — the behavior is correct (exit code 1 on error, 0 on success). No code change is required, but a note in the comment would prevent confusion:

```javascript
// Subcommands that call outputError() will have already exited with code 1.
// This exit(0) is reached only by successful subcommands.
log('outlook.js: subcommand returned normally, calling process.exit(0)');
process.exit(0);
```

---

_Reviewed: 2026-04-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
