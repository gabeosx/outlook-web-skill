---
phase: 01-add-folder-flag-to-search-and-digest-subcommands-pre-search-
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - README.md
  - SKILL.md
  - lib/digest.js
  - lib/folder.js
  - lib/search.js
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the `--folder` flag additions for `search` and `digest`, plus the new `lib/folder.js` module. `lib/folder.js` is clean. `README.md` and `SKILL.md` are consistent and accurate. The main concerns are in `lib/digest.js`: an ID-to-row index correlation bug in the scroll-accumulation dedup loop, a silent regression path when Focused Inbox switching fails in combination with `--folder`, and a redundant config lookup inside a hot loop. `lib/search.js` has a misleading error code on batch failure.

---

## Warnings

### WR-01: Scroll dedup loop correlates Today-only rows against full-page convid array

**File:** `lib/digest.js:455-465`

**Issue:** In the scroll-accumulation loop, `allConvids` is the full array of all `[role=option]` convids on the page at the time of the scroll batch. But `newRows` is extracted by `extractTodayRows`, which returns only the rows belonging to the Today group. When earlier groups (Yesterday, older) remain visible above the fold during scrolling, `allConvids[i]` is out of sync with `newRows[i]` — `allConvids[0]` may be a Yesterday row convid while `newRows[0]` is a Today row. The result is that newly-added Today rows get the wrong convid assigned, or correct Today convids are treated as already-seen and deduplicated away.

```javascript
// Current (incorrect): i indexes into Today-only rows but allConvids includes all rows
for (let i = 0; i < newRows.length; i++) {
  const convid = allConvids[i] || null;  // index mismatch if non-Today rows precede Today rows
  if (convid && seenConvids.has(convid)) continue;
  // ...
}
```

**Fix:** The `extractTodayRows` function needs to return the starting option-element index within the full snapshot so that `allConvids` can be offset-indexed. Alternatively, use a different dedup key — the accessible name text — since convid matching across snapshots is the goal but name-based dedup is reliable enough and avoids the index coupling:

```javascript
const seenNames = new Set(allRows);
for (let i = 0; i < newRows.length; i++) {
  if (seenNames.has(newRows[i])) continue;
  // find matching convid by scanning allConvids via a separate text-to-id map
  allRows.push(newRows[i]);
  seenNames.add(newRows[i]);
}
```

---

### WR-02: Focused Inbox switch failure silently drops `--folder` navigation

**File:** `lib/digest.js:375-405`

**Issue:** When Focused Inbox is detected and the switch batch fails (line 388 path), the code falls through to parse `initialResult.stdout` (line 399-404). But `initialResult` was captured from the `initialBatch` that includes `folderCommands` injected after `get url`. When the Focused switch fails (status !== 0), the browser state is undefined — the folder navigation in `initialBatch` may or may not have run before the failure. The fallback then reads from the initial snapshot which was captured before the Focused switch, so the folder context is lost silently. The user requested `--folder sent` (for example) but gets inbox results with no error.

```javascript
// The fallback path when Focused switch fails
if (workingSnapshotText === null) {
  const initialParsed = parseBatchOutput(initialResult.stdout);
  // initialResult captured inbox state — folderCommands ran but Focused switch
  // clobbered the view. No error is surfaced.
}
```

**Fix:** When `hasFocused` is true and the switch batch fails, and a `--folder` argument was provided, surface an `OPERATION_FAILED` error rather than silently returning inbox results:

```javascript
if (switchResult.status !== 0) {
  if (resolvedFolder) {
    outputError('digest', 'OPERATION_FAILED',
      'Focused Inbox switch failed — cannot navigate to target folder. Retry or run auth.');
    return;
  }
  log('digest: Focused switch failed — proceeding with initial snapshot (no folder specified)');
}
```

---

### WR-03: Misleading `SESSION_INVALID` error code when search batch fails for non-session reasons

**File:** `lib/search.js:288-292`

**Issue:** `runSearch` emits `SESSION_INVALID` whenever `executeComboboxSearch` returns `null`. But `executeComboboxSearch` returns `null` for any batch failure: browser timeout, `agent-browser` not installed, snapshot empty, or actual session expiry. A caller following the error-recovery tree for `SESSION_INVALID` will run `auth` unnecessarily when the real cause is a browser crash or missing binary.

```javascript
if (snapshot === null) {
  outputError('search', 'SESSION_INVALID',
    'Search batch failed — session may be expired. Run: node outlook.js auth');
  return;
}
```

**Fix:** Return a discriminated failure object from `executeComboboxSearch` so the caller can emit `OPERATION_FAILED` for infrastructure failures and `SESSION_INVALID` only when a login URL is detected:

```javascript
// executeComboboxSearch returns: { snapshot } | { sessionExpired: true } | { failed: true }
if (result.failed) {
  outputError('search', 'OPERATION_FAILED',
    'Search batch failed — browser error or timeout. Retry once; if it recurs run auth.');
  return;
}
if (result.sessionExpired) {
  outputError('search', 'SESSION_INVALID',
    'Session expired — run: node outlook.js auth');
  return;
}
```

Note: `lib/digest.js` already does this correctly (lines 360-366) — it checks `isLoginUrl` before emitting `SESSION_INVALID`. `search.js` should follow the same pattern.

---

### WR-04: Initial `allIds` slice can misalign if eval captures fewer convids than snapshot rows

**File:** `lib/digest.js:420-421`

**Issue:** `allIds` is initialized as `workingIds.slice(0, todayRows.length)`. If `workingIds` has fewer elements than `todayRows.length` (eval captured fewer elements than the snapshot listed rows), the slice is shorter than `todayRows.length`. Downstream, the dedup `seenConvids` set on line 425 is seeded from `allIds`, but some Today rows will not have a corresponding convid in `seenConvids`. When those rows reappear in a scroll batch with a convid, they will not be deduplicated and will be added again, producing duplicate results.

```javascript
let allIds = workingIds.slice(0, todayRows.length);
// If workingIds.length < todayRows.length, some entries are undefined/missing
const seenConvids = new Set(allIds.filter(Boolean));
// Rows with no convid are invisible to the dedup set — duplicates possible
```

**Fix:** Initialize `allIds` with explicit `null` padding to maintain 1:1 index correspondence with `allRows`:

```javascript
let allIds = Array.from({ length: todayRows.length }, (_, i) => workingIds[i] || null);
```

This ensures `allIds.length === allRows.length` invariant is maintained before the scroll loop begins, making the dedup logic easier to reason about.

---

## Info

### IN-01: 93-line self-contradicting comment block inside `scoreMessage`

**File:** `lib/digest.js:72-146`

**Issue:** The body of `scoreMessage` contains a 93-line comment block that works through multiple conflicting design decisions, contradicts itself several times, and ultimately arrives at the implemented approach. The comment describes discarded alternatives and reasoning that was valid only during development. It is confusing to anyone reading the code and misrepresents the final design intent.

**Fix:** Replace with a concise doc comment:

```javascript
// Scores: high_importance prefix (+40) + urgency keywords (+5 each, capped at +20).
// Unread signal is NOT scored here — the caller adds it after isBulk/isHuman detection.
```

---

### IN-02: Redundant `getScoringConfig()` call inside keyword loop

**File:** `lib/digest.js:155`

**Issue:** `getScoringConfig()` is called on line 67 and stored in `cfg`. Inside the keyword loop at line 155, `getScoringConfig()` is called again (`getScoringConfig().urgency_keywords`) instead of using `cfg`. The function is lazy-cached so there is no correctness bug, but it is inconsistent with the rest of the function and slightly wasteful.

```javascript
// Line 67: cfg already holds the config
const cfg = getScoringConfig();
// ...
// Line 155: redundant second call
for (const kw of getScoringConfig().urgency_keywords) {  // should be: cfg.urgency_keywords
```

**Fix:** Use `cfg.urgency_keywords` consistently:

```javascript
for (const kw of cfg.urgency_keywords) {
```

---

### IN-03: `parseArgs` in `search.js` returns `null` for `query` after `outputError` (dead return path)

**File:** `lib/search.js:36-41`

**Issue:** When `query` is null, `outputError` is called (which calls `process.exit(1)`). The comment acknowledges this. However, in unit test contexts where `outputError` is mocked or does not exit, the function returns `{ query: null, limit, folder }`. Any caller that does not check `query !== null` would then pass `null` to the browser interaction. This is a robustness issue for testability.

**Fix:** Add a guard after the `outputError` call to make the null-return path explicit and safe under mocking:

```javascript
if (!query) {
  outputError('search', 'INVALID_ARGS', 'Usage: node outlook.js search "<KQL query>" [--limit N] [--folder <name>]');
  return { query: '', limit, folder }; // unreachable in production; safe fallback for tests
}
```

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
