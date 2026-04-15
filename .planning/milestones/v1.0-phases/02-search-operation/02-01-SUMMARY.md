---
phase: 02-search-operation
plan: 01
subsystem: api
tags: [agent-browser, outlook, kql, search, json, browser-automation]

# Dependency graph
requires:
  - phase: 01-auth-scaffold-cli-skeleton
    provides: runAgentBrowser/parseAgentBrowserJson in lib/run.js, outputOk/outputError/log in lib/output.js, assertSession in lib/session.js, --session-name outlook-skill persistence pattern

provides:
  - policy-search.json with default:deny and 14 allowed actions (click, fill, press, eval added for combobox and ID extraction)
  - lib/run.js updated: domain restriction removed, stripContentBoundaries(), runEval() with stdin pipe
  - lib/session.js updated: assertSession() accepts policyFile parameter (backward-compatible default)
  - lib/search.js: full search subcommand — combobox workflow, accessible name parsing, eval-based Exchange ItemID extraction, scroll-accumulate loop
  - outlook.js search case dispatches to lib/search.js runSearch()

affects:
  - 02-02 (read operation) — can reuse policy-search.json, runEval(), extractIds pattern, parseAccessibleName for message row IDs
  - 03-digest (digest operation) — same policy, same combobox/scroll patterns
  - Any future phase needing agent-browser eval — runEval() is now available from lib/run.js

# Tech tracking
tech-stack:
  added: []
  patterns:
    - runEval() helper wraps agent-browser eval --stdin with stdio pipe (separate from runAgentBrowser which uses stdin:ignore)
    - stripContentBoundaries() strips AGENT_BROWSER_CONTENT_BOUNDARIES=1 markers before JSON.parse
    - assertSession() with policyFile parameter allows each operation to use its own policy
    - parseAccessibleName() parses Outlook accessible name format [Unread ][Important ]{sender+subject} {date} {preview}
    - scroll-accumulate loop: dedup by Exchange ItemID, staleScrolls<2 exit, MAX_SCROLL_ATTEMPTS hard limit

key-files:
  created:
    - policy-search.json
    - lib/search.js
  modified:
    - lib/run.js
    - lib/session.js
    - outlook.js

key-decisions:
  - "Removed AGENT_BROWSER_ALLOWED_DOMAINS entirely from data operations — CDN blocking caused olkerror.html; action policy (default:deny) is the real safety boundary"
  - "policy-search.json adds click, fill, press, eval to read-policy base for combobox workflow and batch ID extraction"
  - "runEval() uses stdio:pipe for stdin — separate from runAgentBrowser which uses stdio:ignore (eval --stdin requires piped stdin)"
  - "assertSession() now accepts policyFile parameter with backward-compatible default 'policy-read.json'"
  - "Exchange ItemID extracted via single eval call (batch read, no per-row navigation, no read-state mutation)"
  - "parseAccessibleName treats all pre-date text as 'from' — no hard delimiter between sender and subject exists in accessible names"

patterns-established:
  - "Policy files at project root — policy-auth.json (auth), policy-read.json (compatibility), policy-search.json (data ops)"
  - "runEval(script, policyFile) for any JS that needs browser context without shell quoting issues"
  - "stripContentBoundaries(stdout) before JSON.parse whenever CONTENT_BOUNDARIES=1 is set"
  - "scroll-accumulate loop: staleScrolls<2 + MAX_SCROLL_ATTEMPTS guards against infinite scroll"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05]

# Metrics
duration: 15min
completed: 2026-04-10
---

# Phase 02 Plan 01: Search Infrastructure and Subcommand Summary

**KQL search via Outlook combobox automation with Exchange ItemID extraction, accessible name parsing, and scroll-accumulate result collection**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-10T20:42:00Z
- **Completed:** 2026-04-10T20:45:05Z
- **Tasks:** 2
- **Files modified:** 5 (3 modified, 2 created)

## Accomplishments

- Created `policy-search.json` with `default:deny` and 14 allowed actions enabling the combobox workflow (`click`, `fill`, `press`) and batch ID extraction (`eval`)
- Updated `lib/run.js`: removed CDN domain restriction that caused `olkerror.html`, added `stripContentBoundaries()` for `CONTENT_BOUNDARIES=1` JSON parsing, and `runEval()` with piped stdin for `eval --stdin`
- Updated `lib/session.js`: `assertSession()` now accepts optional `policyFile` parameter (backward-compatible) so search can use its own policy
- Implemented full `lib/search.js`: combobox workflow, accessible name parser with date regex and Unread/Important prefix handling, batch Exchange ItemID extraction via `runEval()`, scroll-accumulate loop with dedup and exit guards
- Wired `outlook.js` `case 'search':` to call `require('./lib/search').runSearch()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create policy-search.json and update infrastructure** - `5429cea` (feat)
2. **Task 2: Implement lib/search.js and wire into outlook.js** - `3bf7a7e` (feat)

## Files Created/Modified

- `policy-search.json` - Action policy for search/read/digest data operations with 14 allowed actions
- `lib/run.js` - Domain restriction removed; added runEval(), stripContentBoundaries(), updated parseAgentBrowserJson()
- `lib/session.js` - assertSession() now accepts policyFile parameter with backward-compatible default
- `lib/search.js` - Full search subcommand: combobox workflow, accessible name parsing, eval ID extraction, scroll loop
- `outlook.js` - case 'search' now dispatches to lib/search.js runSearch()

## Decisions Made

All decisions followed the CONTEXT.md decision log (D-01 through D-21). No new architectural decisions were made during execution.

Key decisions enacted:
- Domain restriction removed for all data operations (D-04/D-05) — policy is sufficient safety boundary
- `runEval()` uses `stdio: ['pipe', 'pipe', 'pipe']` unlike `runAgentBrowser` which uses `stdio: ['ignore', 'pipe', 'pipe']` — required for `eval --stdin`
- Accessible name `from` field includes entire pre-date segment (sender + subject) — no reliable delimiter exists
- `to` and `is_flagged` fields are always `null` in search results (D-18, D-19) — only available in reading pane (Phase 3)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/search.js` is the search foundation for Phase 3 (read) and Phase 4 (digest)
- Exchange ItemIDs returned in search results can be used directly by Phase 3's read operation
- `runEval()` and `policy-search.json` can be reused by all data operations
- `parseAccessibleName()` exported for reuse by Phase 4 digest

**Concerns for downstream phases:**
- [Phase 2 concern] CDN domain restriction previously kept for `policy-read.json` compatibility — now fully removed. If any downstream operation finds it needs restriction, it must be handled differently.
- Accessible name parsing is heuristic — `from` field may include subject text. Phase 3 read operation will get clean `from`/`to`/`subject` from the reading pane.

---
*Phase: 02-search-operation*
*Completed: 2026-04-10*
