---
phase: 01-auth-scaffold-cli-skeleton
plan: "01"
subsystem: infra
tags: [node, cli, agent-browser, action-policy, json-envelope, spawnSync]

requires: []

provides:
  - "outlook.js CLI entry point: env validation, tilde expansion, URL parsing, argv dispatch with subcommand stubs"
  - "lib/output.js JSON envelope builder: outputOk, outputError, log"
  - "lib/run.js spawnSync wrapper: per-invocation childEnv injection, --headed conditional, stdout capture"
  - "lib/session.js stub: placeholder for full auth flow (plan 02)"
  - "policy-auth.json: default:deny action policy including click and fill (auth subcommand only)"
  - "policy-read.json: default:deny action policy excluding click and fill (all read operations)"

affects: [01-02, 01-03, 02-search, 03-read, 04-digest]

tech-stack:
  added: []
  patterns:
    - "Per-invocation childEnv merging — AGENT_BROWSER_* set per spawnSync call, never on process.env globally"
    - "JSON stdout envelope — all output is {operation, status, results, error} written via process.stdout.write"
    - "Stderr-only diagnostics — log() writes to process.stderr exclusively"
    - "Dual policy files — policy-auth.json for auth (click+fill allowed), policy-read.json for everything else"
    - "Tilde expansion at startup — OUTLOOK_BROWSER_PATH and OUTLOOK_BROWSER_PROFILE normalized before use"

key-files:
  created:
    - outlook.js
    - lib/output.js
    - lib/run.js
    - lib/session.js
    - policy-auth.json
    - policy-read.json
  modified: []

key-decisions:
  - "lib/ module layout chosen over monolithic outlook.js — supports clean Phase 2-4 extension (one new file + one case per subcommand)"
  - "Two separate policy files (policy-auth.json, policy-read.json) chosen over single policy — strongest read-only isolation; read operations cannot escalate to click/fill even on unexpected URL"
  - "tilde expansion applied at startup in outlook.js, not in lib/run.js — env vars normalized once, used consistently everywhere"
  - "lib/session.js stub committed with Task 1 — allows outlook.js to require('./lib/session') without a Node.js module-not-found crash during testing"

patterns-established:
  - "Pattern: require('./lib/run').runAgentBrowser(args, policyFile, opts) — all future subcommands use this wrapper"
  - "Pattern: process.stdout.write(JSON.stringify({operation, status, results, error}) + newline) — never console.log"
  - "Pattern: process.stderr.write for diagnostics — calling agent sees only JSON on stdout"

requirements-completed:
  - CFG-01
  - CFG-02
  - CFG-03
  - CFG-04
  - SAFE-01
  - SAFE-02
  - SAFE-03
  - SAFE-04
  - OUT-01
  - OUT-02
  - OUT-03
  - PKG-02
  - PKG-03

duration: 12min
completed: "2026-04-10"
---

# Phase 01 Plan 01: CLI Scaffold and Safety Foundation Summary

**Node.js CLI entry point with env validation, JSON stdout envelope, per-invocation safety env injection, and dual action-policy files enforcing read-only isolation for all non-auth subcommands**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-10T18:40:00Z
- **Completed:** 2026-04-10T18:52:32Z
- **Tasks:** 3
- **Files modified:** 6 (5 plan artifacts + session stub)

## Accomplishments

- `outlook.js` validates all three required env vars at startup before any browser launch, normalizes tildes, parses OUTLOOK_BASE_URL, and dispatches to known subcommands only
- `lib/output.js` establishes the `{operation, status, results, error}` JSON envelope that all future plans must use; stderr-only diagnostics enforced at module level
- `lib/run.js` is the single point of agent-browser invocation: sets AGENT_BROWSER_ACTION_POLICY, ALLOWED_DOMAINS, CONTENT_BOUNDARIES, EXECUTABLE_PATH, PROFILE on a per-call childEnv without mutating process.env globally; `--headed` flag is conditional on `opts.headed`
- `policy-auth.json` and `policy-read.json` provide the hardened safety boundary — read operations cannot access click or fill even if driven to an unexpected page

## Task Commits

1. **Task 1: outlook.js entry point and lib/output.js** - `f2767df` (feat)
2. **Task 2: lib/run.js spawnSync wrapper** - `ecc7864` (feat)
3. **Task 3: policy-auth.json and policy-read.json** - `608d8aa` (chore)

## Files Created/Modified

- `outlook.js` — CLI entry point: REQUIRED_ENV loop, tilde expansion, URL parse, VALID_COMMANDS dispatch, subcommand stubs
- `lib/output.js` — JSON envelope: outputOk(), outputError() (exits 1), log() to stderr
- `lib/run.js` — spawnSync wrapper: per-invocation childEnv, -q --session-name outlook-skill, conditional --headed, stdout+stderr capture
- `lib/session.js` — stub: `runAuth() {}` placeholder; full implementation in plan 02
- `policy-auth.json` — default:deny, allows navigate/snapshot/get/wait/scroll/close/state/session/click/fill
- `policy-read.json` — default:deny, allows navigate/snapshot/get/wait/scroll/close/state/session (no click/fill)

## Decisions Made

- **lib/ module layout** over monolithic outlook.js: Phases 2-4 each add one file in lib/ and one case in the switch; monolith would grow to 500+ lines by Phase 4.
- **Two separate policy files** over one: A single policy cannot distinguish auth (needs click+fill) from read ops (must never have click+fill). Separate files provide the strongest isolation — there is no runtime path by which a read subcommand can access auth-level browser actions.
- **Tilde expansion in outlook.js** (not in lib/run.js): Normalized once at startup so all consumers get clean paths. Applied to OUTLOOK_BROWSER_PATH and OUTLOOK_BROWSER_PROFILE; OUTLOOK_BASE_URL is validated as a URL, not a path.
- **session.js stub committed in Task 1**: The plan requires outlook.js to `require('./lib/session')` in the auth case. Without the stub, testing Task 1's env/argv validation would produce a MODULE_NOT_FOUND error even for non-auth invocations (Node.js resolves requires at parse time in some contexts). The stub costs one extra line and prevents false failures.

## Deviations from Plan

None — plan executed exactly as written. The session.js stub is explicitly noted in Task 1's action block ("create a stub lib/session.js ... for validation purposes") so it is not a deviation.

## Issues Encountered

The Task 1 verification script used `env: {}` (empty object) in spawnSync. Without `PATH` in the env, the child `node` process cannot be found. The test script in the plan has this gap, but the actual behavior is correct — adding `PATH: process.env.PATH` to the minimal env confirms the output and exit code. This is a test script issue, not a code issue; the production code behaves correctly.

## User Setup Required

None — no external service configuration required for this scaffold. Users will need to set:
- `OUTLOOK_BASE_URL` — their Outlook web URL
- `OUTLOOK_BROWSER_PATH` — path to Chrome/Edge binary
- `OUTLOOK_BROWSER_PROFILE` — path to Chrome profile directory

These are runtime env vars, not build-time configuration.

## Next Phase Readiness

- All structural scaffolding is in place for Phases 2-4 to add subcommand implementations
- `lib/run.js` and the policy files are the stable interfaces all future plans will use
- `lib/session.js` stub is the immediate target for plan 02 (auth flow: session detection, --headed login, poll loop)
- Primary risk still to validate: Entra Conditional Access compatibility with `--headed` + managed Chrome profile (plan 02)

---
*Phase: 01-auth-scaffold-cli-skeleton*
*Completed: 2026-04-10*
