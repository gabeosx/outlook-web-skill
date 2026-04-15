---
phase: 01-auth-scaffold-cli-skeleton
plan: "02"
subsystem: auth
tags: [node, agent-browser, session, polling, atomics, url-inspection]

requires:
  - phase: 01-01
    provides: "lib/run.js (runAgentBrowser, parseAgentBrowserJson), lib/output.js (outputOk, outputError, log), lib/session.js stub, policy-auth.json, policy-read.json, outlook.js dispatch"

provides:
  - "lib/session.js: isLoginUrl — URL-based auth state detection (LOGIN_DOMAINS + about:blank guard)"
  - "lib/session.js: checkSessionValid — navigate + URL inspect (pattern 3)"
  - "lib/session.js: runAuth — session check → headed browser → Atomics.wait poll loop → finally-close (AUTH-01 through AUTH-04)"
  - "lib/session.js: assertSession — SESSION_INVALID mid-operation expiry check (AUTH-05)"
  - "lib/session.js: sleep — Atomics.wait with spawnSync sleep fallback"

affects: [01-03, 02-search, 03-read, 04-digest]

tech-stack:
  added: []
  patterns:
    - "URL inspection for auth state — isLoginUrl checks three Microsoft login domains + about:blank; no DOM parsing needed"
    - "Atomics.wait for synchronous poll sleep — avoids event loop, safe in Node.js CLI context; spawnSync sleep fallback if SharedArrayBuffer unavailable"
    - "finally block for session persistence — close always called even on error to ensure --session-name flush"
    - "Pre-check before --headed launch — checkSessionValid() called first; no browser window opened if session is already valid (D-06)"

key-files:
  created:
    - lib/session.js
  modified: []

key-decisions:
  - "Atomics.wait chosen over spawnSync('sleep') as primary poll sleep — lower latency, no subprocess overhead; spawnSync sleep retained as fallback per RESEARCH.md A1"
  - "checkSessionValid uses policy-read.json (not policy-auth.json) — session check is a read operation; using auth policy unnecessarily would expand privilege surface"
  - "close called in valid-session branch (not just finally) — ensures Pitfall 1 guard applies even on the fast path (no login needed)"
  - "getCurrentUrl kept as private helper — not exported; only isLoginUrl is part of the public contract"

patterns-established:
  - "Pattern: assertSession(operation) as guard — search/read/digest call this before any browser work; returns false + SESSION_INVALID error on expiry"
  - "Pattern: finally-close — runAgentBrowser(['close'], policyFile) in finally block guarantees session save regardless of success/failure"
  - "Pattern: log() for all diagnostics in session.js — zero process.stdout references; all diagnostic text goes to stderr via lib/output.log"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04
  - AUTH-05

duration: 8min
completed: "2026-04-10"
---

# Phase 01 Plan 02: Auth Detection and Interactive Login Summary

**URL-inspection auth state detection with headed browser launch, Atomics.wait poll loop, and finally-block session persistence covering AUTH-01 through AUTH-05**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-10T19:00:00Z
- **Completed:** 2026-04-10T19:08:00Z
- **Tasks:** 1
- **Files modified:** 1 (lib/session.js — replaced stub with full implementation)

## Accomplishments

- `lib/session.js` replaces the Plan 01 stub with a complete, testable auth module: four exports, five internal helpers
- `isLoginUrl` correctly identifies all three Microsoft login domains plus `about:blank` (Pitfall 3 guard) — verified by inline test suite
- `runAuth` implements D-06 (no unnecessary browser window): calls `checkSessionValid()` first; only launches `--headed` browser if session is invalid
- `waitForLoginCompletion` uses `Atomics.wait` for synchronous polling (RESEARCH.md Pattern 4 / A1 verified); spawnSync sleep retained as fallback
- `finally` block guarantees `agent-browser close` is always called regardless of login success or error — Pitfall 1 guard confirmed
- `assertSession` provides AUTH-05 mid-operation expiry check for all future subcommands (search/read/digest)
- `outlook.js` `case 'auth':` already dispatches to `require('./lib/session').runAuth()` — no changes needed (confirmed from Plan 01)

## Task Commits

1. **Task 1: Create lib/session.js — auth detection and interactive login** - `4146b73` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `lib/session.js` — Full auth module: `isLoginUrl`, `checkSessionValid`, `runAuth`, `assertSession`, `waitForLoginCompletion`, `getCurrentUrl`, `sleep`

## Decisions Made

- **Atomics.wait as primary sleep** over `spawnSync('sleep')`: Lower overhead for the 3-second poll interval; no child process spawned each tick. spawnSync sleep retained as catch block fallback per RESEARCH.md A1.
- **policy-read.json for checkSessionValid**: The session validity check is a read-only operation — no write actions are needed. Using policy-auth.json there would unnecessarily expand the privilege surface during the detection phase.
- **close on valid-session fast path**: The plan's action block specifies calling close after `checkSessionValid()` returns true. This ensures the Pitfall 1 guard (session flush) applies on every code path, not just the login path.
- **getCurrentUrl as private helper**: Only `isLoginUrl` needs to be in the public contract per the plan's exports list. Keeping `getCurrentUrl` private prevents accidental misuse by future subcommand modules.

## Deviations from Plan

None — plan executed exactly as written. The implementation matches the action block in 01-02-PLAN.md line for line, including comment content, pitfall guards, and module.exports shape.

## Issues Encountered

None. All verification tests passed on first run:
- Node.js module load: PASS
- isLoginUrl boundary cases (6 URLs): PASS
- Export presence check: PASS
- Auth dispatch test (node outlook.js auth): PASS (got OPERATION_FAILED from browser attempt, not INVALID_ARGS — dispatch is working correctly)

## Pitfall Guards Implemented

| Pitfall | Guard | Location |
|---------|-------|----------|
| Pitfall 1: session not persisting | `finally { runAgentBrowser(['close'], ...) }` | `runAuth` lines 164-167 |
| Pitfall 3: about:blank URL | `if (!url \|\| url === 'about:blank') return true` | `isLoginUrl` line 16 |
| Pitfall 4: mixing stdout | All output via `outputOk`/`outputError`; no `process.stdout` in session.js | All functions |

## Threat Mitigations Implemented

Per plan threat model:

| Threat | Disposition | Implementation |
|--------|-------------|----------------|
| T-02-01: isLoginUrl spoofing | mitigate | LOGIN_DOMAINS substring check + about:blank guard |
| T-02-02: waitForLoginCompletion elevation | mitigate | Polling calls only `get url` — no `click` or `fill` during poll loop |
| T-02-04: log() information disclosure | mitigate | log() writes to stderr only — confirmed by grep (no process.stdout in session.js) |

## Known Stubs

None — all four exported functions are fully implemented. The `assertSession` function will only be called by future plan implementations (search/read/digest), but the implementation itself is complete.

## User Setup Required

None at this stage. When the user runs `node outlook.js auth` for the first time, they will need:
- `OUTLOOK_BASE_URL` set to their Outlook web URL
- `OUTLOOK_BROWSER_PATH` set to their Chrome/Edge binary path
- `OUTLOOK_BROWSER_PROFILE` set to their Chrome profile directory

These are documented in CLAUDE.md as Key Environment Variables.

## Next Phase Readiness

- `lib/session.js` is the complete auth module; Phase 1 Plan 03 (skill packaging) can proceed immediately
- `assertSession(operation)` is ready for Plans 02-04 (search, read, digest) — call at start of each subcommand's browser interaction
- Primary risk still open: Entra Conditional Access compatibility with `--headed` + managed Chrome profile — must be validated empirically by the user running `node outlook.js auth` against their real account
- Fallback documented in RESEARCH.md Pitfall 2: use `--auto-connect` if managed binary is blocked by Conditional Access

---
*Phase: 01-auth-scaffold-cli-skeleton*
*Completed: 2026-04-10*
