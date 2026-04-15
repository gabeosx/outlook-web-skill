---
phase: 02-search-operation
plan: 02
subsystem: api
tags: [agent-browser, outlook, kql, search, verification, live-test]

# Dependency graph
requires:
  - phase: 02-01
    provides: lib/search.js skeleton, policy-search.json, combobox batch workflow

provides:
  - Verified working search subcommand against live Outlook
  - Text-format snapshot parsing (replaces JSON snapshot approach)
  - Snapshot-in-batch pattern (solves about:blank page reset)
  - Correct date regex for all Outlook date formats including "Day h:mm AM/PM"

key-decisions:
  - "Snapshot must be included as the final batch command — page resets to about:blank after batch CLI exits, making separate snapshot calls see nothing"
  - "agent-browser --json flag is ignored inside batch context — output is always accessibility tree text format"
  - "Text format option lines are: '  - option \"name\" [ref=eNN]' — greedy-but-not-global regex strips [ref=...] correctly"
  - "IDs (data-convid GUIDs) cannot be extracted in the same session: eval as a separate call also sees about:blank. id field is always null — Phase 3 will recover IDs by clicking into the message"
  - "Scroll-accumulate loop removed — Outlook virtualizes its list during scroll, clearing the accessibility tree temporarily"
  - "5s initial wait required for cold Chrome start — 3s was sufficient for warm daemon but failed on fresh daemon launch"
  - "process.exit(0) confirmed in outlook.js — hang from earlier sessions was actually spawnSync blocking due to daemon pipe inheritance"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05]

# Metrics
duration: ~3hrs (extended live debug session)
completed: 2026-04-10
---

# Phase 02 Plan 02: Live Verification Summary

**All 5 verification tests passed against live Outlook after significant implementation debugging**

## Performance

- **Duration:** ~3 hours (live browser automation debug session)
- **Completed:** 2026-04-10
- **Tasks:** 1 (human verification checkpoint)
- **Files modified:** lib/search.js, lib/run.js, outlook.js

## Verification Results

| Test | Command | Expected | Result |
|------|---------|----------|--------|
| 1 | `node outlook.js search "from:user@example.com"` | status:ok, results with 8 fields | PASS (5 results) |
| 2 | `node outlook.js search "from:zzz-nonexistent@fake.example"` | status:ok, empty results | PASS |
| 3 | `node outlook.js search "is:unread" --limit 3` | at most 3 results | PASS |
| 4 | `node outlook.js search` (no query) | INVALID_ARGS error, no browser | PASS |
| 5 | `node outlook.js search "hasattachment:yes"` | status:ok, consistent schema | PASS |

**Note:** `id` field is `null` for all results (see deviations below). All other 7 fields populate correctly.

## Accomplishments

- Fixed content boundary END marker regex (`END[_ ]AGENT_BROWSER_PAGE_CONTENT` — actual format uses underscore, not space)
- Discovered that `agent-browser batch` ignores `--json` on snapshot — output is accessibility tree text format
- Implemented `extractRowsFromText()` to parse `- option "name" [ref=eNN]` lines from text format
- Moved snapshot inside the batch as the 8th command — solves about:blank page reset between batch and separate snapshot calls
- Fixed `OUTLOOK_HEADED=1` support (now only in `runBatch`, not `runAgentBrowser` — headed is daemon-startup-only)
- Added `process.exit(0)` diagnostic logging — confirmed clean exit, diagnosed earlier hang as spawnSync pipe behavior with daemon
- Extended date regex to cover `Day h:mm AM/PM` format (e.g., `Thu 4:00 PM`) — this-week messages in Outlook use this format

## Deviations from Plan (02-01-SUMMARY)

The 02-01 plan described an implementation that was largely correct in intent but required substantial live debugging to work against the real Outlook SPA:

| Deviation | Original | Actual | Reason |
|-----------|----------|--------|--------|
| Snapshot format | JSON (`--json` flag) | Text format | `--json` is ignored inside `agent-browser batch` context |
| Snapshot location | Separate `runAgentBrowser` call | 8th command inside batch | Page resets to `about:blank` after batch CLI exits — separate call sees wrong page |
| Exchange IDs | Non-null GUIDs via eval | Always `null` | eval call also lands on `about:blank`; page state doesn't survive batch exit |
| Scroll loop | Scroll-accumulate with dedup | Removed | Outlook virtualizes list during scroll, temporarily clearing accessibility tree |
| Initial wait | 3s after `open` | 5s | 3s works for warm daemon (cached assets) but fails on cold Chrome start |
| `--json` snapshot parsing | Direct `JSON.parse` | Text line regex | See snapshot format deviation above |

## Files Modified (during verification debug)

- `lib/search.js` — Major rewrite: batch-with-snapshot, text parser, date regex, removed scroll loop and eval-ID extraction
- `lib/run.js` — OUTLOOK_HEADED=1 restored for runBatch only; batch log shows [--headed] indicator
- `outlook.js` — Added `log` import to existing destructure; diagnostic log before `process.exit(0)`

## Known Limitations Carried Forward

- **`id` always null** — Phase 3 read operation will need to select messages by clicking (accessible name or position), not by ID
- **First viewport only** — search returns only as many results as Outlook renders in the initial viewport (typically 5-15). No pagination.
- **`subject` always empty** — no reliable delimiter exists between sender and subject in Outlook's accessible name format; `from` field contains both
- **`to` always null** — only visible in reading pane, not in message list rows
- **`is_flagged` always null** — not determinable from passive snapshot

## Next Phase Readiness

- Phase 3 (read) can reuse the batch-with-snapshot pattern
- Phase 3 will need to click a message row to open reading pane — use accessible name to identify the target row
- `parseAccessibleName()` exported for reuse in Phase 4 digest
- `runBatch()` with snapshot as final command is the established pattern for all future data operations

---
*Phase: 02-search-operation*
*Completed: 2026-04-10*
