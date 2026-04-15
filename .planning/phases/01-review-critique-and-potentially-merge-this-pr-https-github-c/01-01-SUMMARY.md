---
phase: 01-review-critique-and-potentially-merge-this-pr
plan: 01
subsystem: skill-core
tags: [teams, copilot, policy, run.js, pr-review, feature-merge]
dependency_graph:
  requires: []
  provides:
    - teams subcommand (lib/teams.js)
    - copilot-summary subcommand (lib/copilot.js)
    - per-subcommand policy files (policy-teams.json, policy-copilot.json)
    - filterStderr + log() improvements to lib/run.js
  affects:
    - outlook.js (10 subcommands now dispatchable)
    - lib/run.js (filterStderr, log calls, no --profile regression)
    - .env.example (TEAMS_BASE_URL documented)
tech_stack:
  added: []
  patterns:
    - per-subcommand policy files with least-privilege allow lists
    - session.js isLoginUrl reuse across all subcommands (no duplication)
    - filterStderr for harmless agent-browser warnings
key_files:
  created:
    - lib/teams.js
    - lib/copilot.js
    - policy-teams.json
    - policy-copilot.json
  modified:
    - lib/run.js
    - outlook.js
    - .env.example
decisions:
  - "D-04 honored: --profile logic reverted from run.js; --session-name outlook-skill hardcoded in all 3 call sites"
  - "D-09 honored: policy-search.json split into policy-teams.json (no keyboard) and policy-copilot.json (with keyboard)"
  - "D-10 honored: least-privilege per subcommand — teams excludes fill/press/keyboard, copilot includes all needed"
  - "isTeamsLoginUrl duplication fixed: teams.js uses isLoginUrl from session.js (non-blocking observation resolved)"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-15"
  tasks_completed: 1
  tasks_total: 1
  files_created: 4
  files_modified: 3
---

# Phase 1 Plan 1: PR Review and Feature Merge Summary

**One-liner:** Applied PR #1's teams+copilot-summary subcommands to main with --session-name enforcement, per-subcommand policy split, and isTeamsLoginUrl deduplication.

## What Was Built

Posted a "request changes" review on PR #1 documenting two blocking changes, then applied all PR functionality to the current worktree branch via Option B (new branch off main):

1. **PR review posted** — `CHANGES_REQUESTED` review on gabeosx/outlook-web-skill#1 with two blocking items (--profile regression, policy split) and one non-blocking observation (isTeamsLoginUrl duplication).

2. **lib/teams.js** — Checked out from PR branch. Fixed: POLICY changed from `policy-search.json` to `policy-teams.json`. Removed `TEAMS_LOGIN_DOMAINS` constant and `isTeamsLoginUrl` function; replaced call with `isLoginUrl` from session.js (already imported).

3. **lib/copilot.js** — Checked out from PR branch. Fixed: POLICY changed from `policy-search.json` to `policy-copilot.json`. No other changes needed — already uses isLoginUrl from session.js correctly.

4. **lib/run.js** — Added `filterStderr` function (keep from PR, D-06). Added `log()` calls before spawnSync in runAgentBrowser and runEval (runBatch already had one). Replaced raw `.stderr.trim()` checks with `filterStderr(result.stderr)` in all three functions. Did NOT add profileFlag — kept `--session-name outlook-skill` hardcoded in all three call sites (D-04).

5. **outlook.js** — Updated Step 1 env validation to command-aware: `ALWAYS_REQUIRED = ['OUTLOOK_BROWSER_PATH', 'OUTLOOK_BROWSER_PROFILE']`; OUTLOOK_BASE_URL only required for emailCommands (auth, search, read, digest, tune, calendar, calendar-read, calendar-search). Guarded allowedDomain extraction with `if (process.env.OUTLOOK_BASE_URL)`. Updated `VALID_COMMANDS` to include teams and copilot-summary. Added dispatch cases for both new subcommands. Calendar commands preserved.

6. **policy-teams.json** — New file. `default: deny`. Allow list: launch, navigate, snapshot, get, url, wait, scroll, close, state, session, click, eval, getbytext, find. No keyboard/fill/press (D-10, T-01-01).

7. **policy-copilot.json** — New file. `default: deny`. Allow list: launch, navigate, snapshot, get, url, wait, scroll, close, state, session, click, fill, press, eval, evaluate, keyboard, getbytext, getbylabel, getbyplaceholder, find (D-07: keyboard accepted for Copilot prompt entry, T-01-02).

8. **policy-search.json** — Unchanged from main. Retains `"dialog"` for folder navigation; does not contain keyboard/getbytext/getbylabel/getbyplaceholder.

9. **.env.example** — Added Teams section with `TEAMS_BASE_URL` optional env var documentation.

## Verification Results

All 9 automated checks from the plan passed:

- `grep -c "session-name.*outlook-skill" lib/run.js` → 3
- `grep -q "profileFlag" lib/run.js` → non-zero (not found)
- `node -e "require('./lib/teams')"` → no throw
- `node -e "require('./lib/copilot')"` → no throw
- `node -c outlook.js` → exits 0
- `jq '.allow | index("dialog")' policy-search.json` → 16 (non-null)
- `jq '.allow | index("keyboard")' policy-search.json` → -1 (null)
- `jq '.allow | index("keyboard")' policy-copilot.json` → 15 (non-null)
- `jq '.allow | index("keyboard")' policy-teams.json` → -1 (null)

## Deviations from Plan

None — plan executed exactly as written.

The PR branch already imported `isLoginUrl` from session.js (line 5 of teams.js) but also separately defined `isTeamsLoginUrl`. The plan correctly anticipated this and described the fix precisely.

## Threat Surface

No new network endpoints or auth paths introduced beyond those in the plan's threat model. The `policy-teams.json` correctly excludes keyboard/fill/press per T-01-01. The `policy-copilot.json` includes keyboard per T-01-02 (accepted risk).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | f95a09c | feat(01-01): add teams and copilot-summary subcommands (PR #1 with fixes) |

## Known Stubs

None — both lib/teams.js and lib/copilot.js are complete implementations from the PR, not stubs.

## Self-Check: PASSED

- lib/teams.js: FOUND
- lib/copilot.js: FOUND
- policy-teams.json: FOUND
- policy-copilot.json: FOUND
- commit f95a09c: FOUND
