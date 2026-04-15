---
phase: 03-read-operation
plan: 01
subsystem: read-operation
tags: [read, search, exchange-itemid, accessibility-snapshot, batch]
dependency_graph:
  requires: [02-search-operation]
  provides: [read-subcommand, search-id-extraction]
  affects: [lib/search.js, lib/read.js, outlook.js]
tech_stack:
  added: []
  patterns: [inline-eval-in-batch, scoped-snapshot, index-correlated-id-extraction]
key_files:
  created:
    - lib/read.js
  modified:
    - lib/search.js
    - outlook.js
decisions:
  - "Inline eval inside batch (not post-batch eval) captures Exchange ItemIDs before page resets to about:blank"
  - "parseReadingPaneSnapshot extracts metadata from ARIA level-3 headings; body_text from document 'Message body' subtree"
  - "Attachment detection uses file extension heuristic on body element accessible names (best-effort per D-15)"
  - "Snapshot scoped to main[aria-label='Reading Pane'] to reduce token noise and prevent data leakage (T-03-04)"
  - "policy-search.json reused for read (D-18) — no new policy file needed"
  - "encodeURIComponent(id) applied to URL construction to prevent path traversal (T-03-01)"
metrics:
  duration: ~10 min
  completed_date: "2026-04-10T23:37:54Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 3 Plan 1: Read Subcommand and Search ID Extraction Summary

**One-liner:** Inline eval in search batch extracts real Exchange ItemIDs; new lib/read.js navigates to /mail/id/<id> and parses the reading pane accessibility snapshot into structured JSON.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix lib/search.js to return real Exchange ItemIDs via inline eval | 886e55b | lib/search.js |
| 2 | Create lib/read.js and wire into outlook.js | 5a42ec2 | lib/read.js, outlook.js |

## What Was Built

### Task 1: Search ID Fix (lib/search.js)

The Phase 2 search implementation always returned `id: null` because the eval to extract Exchange ItemIDs ran after the batch exited, landing on `about:blank`. The fix inserts an `['eval', "JSON.stringify(Array.from(document.querySelectorAll('[role=option]')).map(el => el.id))"]` command into the batch array before the snapshot command. Both commands now run while the search results page is still live.

The `executeComboboxSearch()` return parsing was updated to a two-phase parser:
1. Find the first JSON array in batch stdout (the eval result — an array of Exchange ItemID strings)
2. Extract snapshot text from everything after the JSON array
3. Return `{ _textSnapshot: snapshotText, _ids: ids }` extending the existing convention

The `runSearch()` result-building loop now correlates IDs by array index: `parsed.id = (snapshot._ids && snapshot._ids[i]) || null`. A mismatch warning log is emitted if eval returns fewer IDs than snapshot rows (D-04 graceful fallback).

### Task 2: Read Subcommand (lib/read.js + outlook.js)

`lib/read.js` implements the complete read workflow:

1. **Argument parsing** (`parseArgs`): `process.argv.slice(3)`, single required positional arg, `INVALID_ARGS` on missing ID
2. **URL construction**: `OUTLOOK_BASE_URL + '/mail/id/' + encodeURIComponent(id)` — confirmed `/mail/id/` pattern (not `/mail/inbox/id/`)
3. **Batch execution**: `['open', emailUrl]` → `['wait', '3000']` → `['get', 'url']` → `['snapshot', '-s', "main[aria-label='Reading Pane']"]`
4. **Session check**: Finds the URL line in batch stdout, calls `isLoginUrl()`, returns `SESSION_INVALID` if login redirect detected
5. **Reading pane parsing** (`parseReadingPaneSnapshot`): Extracts subject (first level-3 heading), from/to/cc/date (prefixed headings), body_text (child elements inside `document "Message body"` until `menuitem "Reply"`), attachment_names (file extension heuristic on body text)
6. **Output**: `outputOk('read', { subject, from, to, cc, date, body_text, has_attachments, attachment_names })`

`outlook.js` case 'read' now dispatches to `require('./lib/read').runRead()` instead of the stub error.

## Verification Results

All 6 plan verification checks passed:
1. `node -e "require('./lib/search')"` exits 0
2. `node -e "require('./lib/read')"` exits 0
3. `grep 'eval.*querySelectorAll' lib/search.js` matches
4. `grep "require('./lib/read')" outlook.js` matches
5. `node outlook.js read 2>&1 | head -1` returns `INVALID_ARGS` JSON
6. `grep '_ids' lib/search.js` returns matches

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

**lib/read.js attachment detection (D-15, D-16):** The `attachment_names` extraction uses a best-effort file extension heuristic on reading pane body element accessible names. This is intentional per design decisions D-14 and D-15 — the ARIA structure for real file attachments is unresolved from Phase 0 captures (only inline-image emails were captured). A separate human checkpoint plan (03-02) must verify and potentially fix this before Phase 3 is marked complete.

- File: `lib/read.js`, function `parseReadingPaneSnapshot`
- Line ~121: `const attachmentNames = bodyLines.filter(text => ATTACHMENT_EXTENSIONS.test(text.trim()));`
- Reason: File attachment ARIA structure is UNRESOLVED; Phase 3 human checkpoint (03-02) will verify live captures

## Threat Surface Review

All threats in the plan's threat model (T-03-01 through T-03-06) are mitigated as designed. No new unplanned security surface was introduced.

| Threat | Status | Implementation |
|--------|--------|----------------|
| T-03-01: URL path traversal via crafted ID | Mitigated | `encodeURIComponent(id)` in lib/read.js |
| T-03-02: Prompt injection via email body content | Mitigated | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` + `stripContentBoundaries()` inherited from runBatch |
| T-03-03: Batch command tampering | Mitigated | `policy-search.json` default deny; read uses open/wait/get/snapshot only |
| T-03-04: Reading pane over-capture | Mitigated | Snapshot scoped to `main[aria-label='Reading Pane']` via `-s` flag |
| T-03-05: Eval output parse DoS | Accepted | Malformed eval output falls back to `ids = []`; no crash |
| T-03-06: Session expiry detected as email content | Mitigated | `isLoginUrl()` check on get url output returns `SESSION_INVALID` |

## Self-Check: PASSED

Files created/modified:
- FOUND: /Users/username/outlook-web-skill/lib/read.js
- FOUND: /Users/username/outlook-web-skill/lib/search.js (modified)
- FOUND: /Users/username/outlook-web-skill/outlook.js (modified)

Commits:
- FOUND: 886e55b (feat(03-01): fix search ID extraction via inline eval in batch)
- FOUND: 5a42ec2 (feat(03-01): implement read subcommand and wire into outlook.js)
