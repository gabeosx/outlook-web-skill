---
phase: 04-daily-digest-operation
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - lib/digest.js
  - lib/output.js
  - lib/read.js
  - lib/run.js
  - lib/search.js
  - lib/session.js
  - outlook.js
  - policy-auth.json
  - policy-read.json
  - policy-search.json
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This review covers the new `lib/digest.js` subcommand and all supporting modules. The digest subcommand navigates to the Outlook inbox, extracts today's messages from the accessibility tree, scores them by importance, and returns sorted JSON. The overall architecture is sound and the read-only constraint is well-enforced. The scroll-accumulate loop has correct termination conditions. One critical issue was found: the session check in `runDigest` is structurally broken and will never detect an expired session, leaving a permanent silent authentication bypass. Five warnings cover correctness issues in the scroll-accumulate deduplication, a race-prone URL detection pattern, an unvalidated environment variable concatenation, a missing session close on the digest fast-path, and an unreachable `return` after `outputError`. Four informational items cover dead code, magic numbers, a long comment block, and a missing `is_flagged` field comment discrepancy.

---

## Critical Issues

### CR-01: Session check in `runDigest` never fires — `stripContentBoundaries` removes the URL line before `isLoginUrl` can see it

**File:** `lib/digest.js:316-325`

**Issue:** The session validity check reads the current URL from batch stdout, which is the output of the `['get', 'url']` batch command. However, the code first calls `stripContentBoundaries` on the full `initialResult.stdout` (line 316), then splits the stripped output and searches for a line that starts with `http` (lines 319-325). The `stripContentBoundaries` function in `lib/run.js:163-170` removes the `--- AGENT_BROWSER_PAGE_CONTENT ... ---` wrapper markers that surround the URL output, but the URL itself remains in the output only when AGENT_BROWSER_CONTENT_BOUNDARIES is disabled. With `AGENT_BROWSER_CONTENT_BOUNDARIES=1` set unconditionally in `lib/run.js:87`, the `get url` output is always wrapped. After stripping the boundary markers the raw URL string still appears — however, the fundamental problem is structural: the URL returned by the `get url` batch command is the post-navigation URL of the Outlook inbox after a successful load. If the session is expired, Outlook redirects to `login.microsoftonline.com`, but the batch command sequence runs `open` + `wait` + `get url` in one batch. In that sequence, the `open` call navigates to `/mail/inbox` and the SPA responds by redirecting the browser to the Microsoft login page before the `wait 5000` finishes. The `get url` command then emits the login URL into batch stdout. But `cleanedInitial` (produced at line 316) is the output of the initial batch, not the focused output from `parseBatchOutput`. The `parseBatchOutput` call does not happen until line 359, after the session check. The session check at line 320-325 searches `cleanedInitial` (the full batch stdout) for the URL, which is correct in principle. The **actual defect** is at line 320:

```js
const urlLine = initialLines.find(l => l.trim().startsWith('http'));
```

This searches the raw accessibility snapshot text for a line beginning with `http`. The accessibility snapshot of the inbox or the login page will very likely contain dozens of `https://` links as `StaticText` or `link` elements in the accessibility tree — so the first `http` line found will be a page hyperlink, not the `get url` output. The `get url` output is a bare URL with no surrounding label; it appears as a single line in the batch output. When this bare URL line collides with snapshot content links, `urlLine` will not match the `get url` output line but will instead match an arbitrary page link. A login page will contain `https://login.microsoftonline.com/...` links in its accessibility tree that are **not** the `get url` output. The check therefore produces a false negative: `isLoginUrl` is called on a random page link and the session check silently passes. This is the same pattern used in `lib/read.js:338` which is also affected, but the digest path is new code.

**Fix:** Use `parseBatchOutput` to extract the url line before the snapshot text, rather than searching the entire raw batch stdout. Alternatively, place the `['get', 'url']` command **before** `['snapshot']` and parse its output using a marker unique to the URL line. The cleanest fix is to search `cleanedInitial` only up to the start of the snapshot text by splitting off the eval/snapshot section first:

```js
// After parseBatchOutput extracts snapshotText, search only the pre-snapshot portion:
const initialParsed = parseBatchOutput(initialResult.stdout);
if (initialParsed) {
  workingSnapshotText = initialParsed.snapshotText;
  workingIds = initialParsed.ids;
}

// Session check: search the cleaned output BEFORE the snapshot text starts
const preSnapshotText = cleanedInitial.slice(
  0,
  cleanedInitial.length - (workingSnapshotText ? workingSnapshotText.length : 0)
);
const urlLine = preSnapshotText.split('\n').find(l => l.trim().startsWith('http'));
if (urlLine && isLoginUrl(urlLine.trim())) {
  outputError('digest', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
  return;
}
```

Note: `lib/read.js:338` has the same structural vulnerability and should be fixed in parallel.

---

## Warnings

### WR-01: Scroll-accumulate dedup falls back to positional matching when convid is null, causing duplicate rows in output

**File:** `lib/digest.js:418-425`

**Issue:** The deduplication logic inside the scroll loop adds a row if and only if its `convid` is truthy and not in `seenConvids`:

```js
if (convid && seenConvids.has(convid)) continue;
```

When `convid` is `null` or an empty string (e.g., when the eval returns fewer entries than the number of visible rows, or when a row has no `data-convid` attribute), the condition `convid && ...` is falsy, so the `continue` is skipped and the row is unconditionally appended. On repeated scrolls, if the same row appears in two consecutive snapshots and its `convid` is null, it will be added twice to `allRows`. This is not hypothetical: the eval extracts `data-convid` from `[role=option]` elements; if the inbox list is partially virtualized, some rows visible in the snapshot text may not be present in the DOM at eval time, yielding null slots.

**Fix:** Track rows by accessible name as a secondary dedup key when convid is unavailable:

```js
const seenNames = new Set(allRows);

for (let i = 0; i < newRows.length; i++) {
  const convid = allConvids[i] || null;
  if (convid && seenConvids.has(convid)) continue;
  if (!convid && seenNames.has(newRows[i])) continue;  // name-based fallback dedup
  allRows.push(newRows[i]);
  allIds.push(convid);
  if (convid) seenConvids.add(convid);
  seenNames.add(newRows[i]);
  addedCount++;
}
```

---

### WR-02: `OUTLOOK_BASE_URL` is concatenated unsanitized into the `open` command argument

**File:** `lib/digest.js:300`

**Issue:** The `open` command target is built as:

```js
['open', process.env.OUTLOOK_BASE_URL + '/mail/inbox'],
```

`OUTLOOK_BASE_URL` is loaded from `.env` by `outlook.js` and validated to be a parseable URL (line 38-41 of `outlook.js`), but it is validated only for parsability, not for a trailing slash. If `OUTLOOK_BASE_URL` is set to `https://outlook.office.com/` (with trailing slash), the resulting URL becomes `https://outlook.office.com//mail/inbox`. Most servers normalize this, but some (including Outlook's own redirect logic) may fail to match the inbox path and redirect to an unexpected page, causing the session check to pass but the snapshot to contain no inbox content. The digest will then silently return an empty result set rather than an error.

**Fix:** Strip the trailing slash from `OUTLOOK_BASE_URL` before use, either at load time in `outlook.js` or locally in `runDigest`:

```js
const baseUrl = (process.env.OUTLOOK_BASE_URL || '').replace(/\/$/, '');
['open', baseUrl + '/mail/inbox'],
```

The same pattern applies in `lib/read.js:306` and `lib/search.js:53` where `OUTLOOK_BASE_URL` is also used directly.

---

### WR-03: `extractTodayRows` does not handle "Today" button appearing multiple times in the snapshot

**File:** `lib/digest.js:229-231`

**Issue:** The accumulation logic sets `accumulating = true` on the first line matching `TODAY_PATTERN` and never resets it back to false until a non-Today group header is found. If the Outlook accessibility tree renders the "Today" header more than once (e.g., a second "Today" group below the inbox list for a different folder pane that is also visible in the snapshot), all content between the first and second "Today" button — including content that is not inbox rows — will be accumulated. This is a low-probability edge case but has the potential to include non-Today rows in the digest output.

**Fix:** After setting `accumulating = true`, treat a second `TODAY_PATTERN` match as a stop condition (same as the other group headers), or break on it:

```js
if (!accumulating) {
  if (TODAY_PATTERN.test(line)) accumulating = true;
  continue;
}
// Already accumulating — second "Today" header means we've looped; stop
if (TODAY_PATTERN.test(line)) { reachedEnd = true; break; }
if (DAY_PATTERN.test(line)) { reachedEnd = true; break; }
```

---

### WR-04: Focused Inbox switch falls through to initial snapshot data on batch failure, but initial snapshot predates the tab switch — results will be from "Focused" not "All"

**File:** `lib/digest.js:343-364`

**Issue:** When the Focused Inbox is detected and the switch batch fails (line 345), the code logs a warning and falls through:

```js
log(`digest: Focused switch batch failed — proceeding with initial snapshot`);
// Fall through to use initial snapshot data
```

The initial snapshot was taken before clicking "Other". Using it means the digest will be built from Focused inbox rows, not All inbox rows. The caller will receive silently incomplete results with no indication that the Focused filter is active. Since only the switch batch failed (not the initial navigation), the session is likely valid; the problem is specific to the tab-switch click. Silently falling back to the Focused view violates the caller's expectation.

**Fix:** Treat a failed Focused switch as an error rather than a silent fallback:

```js
if (switchResult.status !== 0) {
  log(`digest: Focused switch batch failed — cannot switch to All view`);
  outputError('digest', 'OPERATION_FAILED',
    'Focused Inbox detected but switching to All view failed. ' +
    'Try disabling Focused Inbox in Outlook settings.');
  return;
}
```

---

### WR-05: `outputError` in `lib/output.js` calls `process.exit(1)` but callers in `lib/digest.js` have `return` after each call — the `return` is unreachable but creates misleading control flow

**File:** `lib/digest.js:323, 369` and `lib/output.js:24`

**Issue:** `outputError` always calls `process.exit(1)` before returning. All call sites in `lib/digest.js` follow the call with a bare `return;` statement:

```js
outputError('digest', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
return;  // unreachable — outputError calls process.exit(1)
```

The unreachable `return` is not itself a bug (the program will exit), but it creates a misleading implication that the function might return. If `outputError` were ever refactored to not exit (e.g., to support testing), the `return` would be needed — but the inconsistency between calling code that adds `return` and code that does not (line 368 calls `outputError` with no following `return` while line 323 does) suggests the pattern is applied inconsistently.

More importantly, line 368-370 (the `!workingSnapshotText` branch) outputs `process.stdout.write` directly without going through `outputError`, while other zero-result paths also output inline. The inconsistency makes it harder to verify all error paths produce well-formed JSON. This is a minor correctness concern — the paths are all functionally correct — but warrants a note.

**Fix:** Either document `outputError` as `@noreturn` and remove trailing `return` statements, or extract a `@returns {never}` TypeScript annotation. For consistency, the inline `process.stdout.write` for the empty-results case at line 368 should use `outputOk` via `require('./output')` (which is already imported but not used for the ok-path in `runDigest`):

```js
// Instead of inline write:
const { outputOk } = require('./output');
// ...
outputOk('digest', { results: [], count: 0 });
return;
```

---

## Info

### IN-01: `runDigest` does not call `close` after completing, leaving the browser daemon running

**File:** `lib/digest.js:531`

**Issue:** `outlook.js` calls `process.exit(0)` after `runDigest()` returns (line 71), which terminates the Node.js process. The agent-browser daemon is a separate process and is not closed by Node.js exit. None of the operational subcommands (`search`, `read`, `digest`) call `agent-browser close` after completing. The `runAuth` path in `lib/session.js` does call `close` explicitly (lines 57, 74, 138, 192) to flush session state. For operational subcommands the daemon is left running, which is the intentional design (the daemon is reused by subsequent invocations). This is documented behavior per the CLAUDE.md session persistence strategy. No action required — noted for completeness.

---

### IN-02: `scoreMessage` function has a 79-line comment block documenting discarded design iterations

**File:** `lib/digest.js:62-136`

**Issue:** Lines 62-136 contain a self-referential comment block documenting multiple abandoned interpretations of the function signature and scoring model, ending with `FINAL DECISION:`. The production code starts at line 138. The comment adds significant noise for future readers and obscures the actual implementation intent. The comment is not harmful to correctness, but it should be pruned.

**Fix:** Replace the comment block with a concise JSDoc summarizing the final decision:

```js
/**
 * Score a message by importance prefix and urgency keywords.
 * Unread bonus (+40) is NOT included here — the caller applies it separately
 * after checking isBulk and isHumanSender heuristics.
 *
 * @param {boolean} hadImportantPrefix
 * @param {string} searchText - from + subject + preview (lowercased)
 * @returns {{ importance_score: number, importance_signals: string[] }}
 */
```

---

### IN-03: Magic number `40` for unread bonus appears in three places with no named constant

**File:** `lib/digest.js:496, 139, (implicit in scoring model)`

**Issue:** The unread bonus value `40` appears as a literal at line 496 (`const unreadBonus = isHumanSender ? 40 : 20`) and the importance prefix bonus also uses `40` at line 139 (`score += 40`). The channel partial credit `20` is also a bare literal. These magic numbers make the scoring model harder to understand and modify consistently.

**Fix:** Define named constants near the top of the file:

```js
const SCORE_UNREAD_HUMAN    = 40;
const SCORE_UNREAD_CHANNEL  = 20;
const SCORE_HIGH_IMPORTANCE = 40;
const SCORE_KEYWORD         = 5;
const SCORE_KEYWORD_CAP     = 20;
```

---

### IN-04: `policy-read.json` and `policy-auth.json` are defined but neither is used by `lib/digest.js` or `lib/search.js` — `policy-search.json` is used for all data operations

**File:** `policy-read.json`, `policy-auth.json`, `lib/digest.js:8`

**Issue:** The comment at `lib/digest.js:8` notes "D-24: reuse existing policy (allows all required actions)". `policy-search.json` includes `eval`, `press`, `find`, `click`, and `fill` — the full set of actions needed for data operations. `policy-read.json` omits `click`, `fill`, `eval`, `press`, and `find` (it only allows `navigate`, `snapshot`, `get`, `url`, `wait`, `scroll`, `close`, `state`, `session`). `policy-auth.json` additionally includes `click` and `fill` for the login flow. The three policies are correctly differentiated: auth gets interactive actions, read-only check gets minimal actions, and search/read/digest get the full read-only action set. This is correct and intentional — no action needed. However, the comment "reuse existing policy" is slightly misleading since `policy-read.json` is a different, more restrictive policy. The constant name `POLICY` in each module could be renamed to `SEARCH_POLICY` to make it explicit.

---

_Reviewed: 2026-04-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
