---
phase: 01-auth-scaffold-cli-skeleton
plan: "03"
subsystem: auth
tags: [node, agent-browser, session, entra, conditional-access, action-policy]

requires:
  - phase: 01-02
    provides: "lib/session.js (runAuth, checkSessionValid, assertSession), lib/run.js, policy-auth.json, policy-read.json"

provides:
  - "Confirmed: --headed + managed Chrome binary passes Entra Conditional Access on first attempt"
  - "Confirmed: --session-name outlook-skill persists session across separate Node.js invocations"
  - "Confirmed: second invocation returns status:ok with no browser window"
  - "Discovered: 6 policy/session bugs fixed during live validation — policy allow lists incomplete, ALLOWED_DOMAINS too broad, polling loop incorrect"
  - "Discovered: AGENT_BROWSER_PROFILE is not a recognized env var — profile not needed; no --profile flag (SingletonLock conflict)"
  - "Discovered: Outlook SPA renders olkerror.html when CDN domains are blocked — not a login redirect, Phase 2 concern"

affects: [02-search, 03-read, 04-digest, 05-packaging]

tech-stack:
  added: []
  patterns:
    - "Action policy names are granular: 'url' is a separate action from 'get'; 'launch' is separate from 'navigate'"
    - "Domain restriction only for policy-read.json — auth must reach login.microsoftonline.com, login.live.com, login.windows.net"
    - "No --profile CLI flag — SingletonLock prevents two Chrome processes on same profile; --session-name is sufficient for persistence"
    - "open --headed blocks until page loads OR window closes — no post-open polling loop needed or appropriate"
    - "Browser-closed after auth = success — get url returns null when browser already closed; treat null as session may be saved"

key-files:
  created: []
  modified:
    - policy-auth.json
    - policy-read.json
    - lib/run.js
    - lib/session.js

key-decisions:
  - "AGENT_BROWSER_ALLOWED_DOMAINS not applied for policy-auth.json — auth must navigate to login.microsoftonline.com and other Microsoft domains freely"
  - "No --profile flag in agent-browser invocation — Chrome SingletonLock prevents a second Chrome process from opening the same profile while it is already in use; --session-name handles persistence without profile"
  - "Post-open URL check (not poll loop) — open --headed is a blocking call that returns after page load or window close; polling after it terminates only sees a dead browser"
  - "null URL after open = optimistic success — if browser closed before get url runs, session was likely auto-saved; next auth call will confirm via checkSessionValid()"

patterns-established:
  - "Pattern: policy action list must include 'launch' and 'url' as separate entries — not covered by 'navigate' or 'get'"
  - "Pattern: AGENT_BROWSER_ALLOWED_DOMAINS is aggressive — blocks ALL resources from unlisted domains, breaking SPA asset loading; use sparingly"

requirements-completed: []

duration: ~90min (live debugging session)
completed: "2026-04-10"
---

# Phase 01 Plan 03: Live Auth Validation Checkpoint Summary

**Managed Chrome binary passes Entra Conditional Access; --session-name persists across invocations; six policy/session bugs found and fixed during live validation**

## Performance

- **Duration:** ~90 min (interactive debugging session including 6 bug fix cycles)
- **Started:** 2026-04-10 (Wave 3 checkpoint)
- **Completed:** 2026-04-10
- **Tasks:** 1 (human verification checkpoint)
- **Files modified:** 4 (policy-auth.json, policy-read.json, lib/run.js, lib/session.js)

## Accomplishments

- Entra Conditional Access compatibility confirmed: managed Chrome binary with `--headed` flag completed MFA/SSO login on first attempt (no Conditional Access block, no bot detection rejection)
- Session persistence confirmed: `~/.agent-browser/sessions/outlook-skill-default.json` (338 bytes) created after first invocation; second invocation returned `{"operation":"auth","status":"ok","results":null,"error":null}` with no browser window
- Six implementation bugs discovered and fixed during live validation (see Deviations section)
- Phase 2 concern documented: `AGENT_BROWSER_ALLOWED_DOMAINS` prevents Outlook SPA from loading CDN resources — post-auth URL is `olkerror.html`, not inbox (not a login redirect, valid for Phase 1 purposes)

## Validation Results

| Criterion | Result |
|-----------|--------|
| First invocation opens visible browser window | PASS |
| Entra Conditional Access / MFA completed | PASS (managed Chrome binary; no bot block) |
| `~/.agent-browser/sessions/` contains session file | PASS (`outlook-skill-default.json`, 338 bytes) |
| Second invocation: no browser window | PASS |
| Second invocation stdout: valid JSON `{status:"ok"}` | PASS |
| Inbox loaded during first invocation | PARTIAL — Outlook SPA shows `olkerror.html` due to CDN domain block; not a login redirect (Phase 2 concern) |

## Environment That Worked

- **OUTLOOK_BASE_URL**: `https://myemail.accenture.com`
- **OUTLOOK_BROWSER_PATH**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **OUTLOOK_BROWSER_PROFILE**: `Default` (set in env but not used — `--profile` flag removed; `--session-name` is sufficient)
- **Session file**: `~/.agent-browser/sessions/outlook-skill-default.json`
- **--auto-connect fallback**: Not needed — managed binary passed on first attempt

## Bug Fix Commits

Six bugs were discovered during live validation and fixed inline:

1. **`launch` action missing from policy allow lists** - `1819cdb`
   - `open` command internally triggers `launch` (daemon start) + `navigate` (page load)
   - Both policy files missing `"launch"` → denied at daemon startup
   - Fix: added `"launch"` to both policy allow lists

2. **`AGENT_BROWSER_PROFILE` not a recognized env var → tried `--profile` → SingletonLock** - `d0d07ba`, `2f1dc5f`
   - `AGENT_BROWSER_PROFILE` was set in childEnv but silently ignored by agent-browser
   - Added `--profile` as CLI flag → `Chrome exited early, exit code 21` (SingletonLock: two Chrome processes on same profile)
   - Fix: reverted `--profile` flag entirely; `--session-name outlook-skill` is sufficient for session persistence

3. **`AGENT_BROWSER_ALLOWED_DOMAINS` blocked Microsoft auth redirects** - `97c040e`
   - Applied `OUTLOOK_BASE_URL` domain restriction to ALL invocations including auth
   - MFA redirect to `login.microsoftonline.com` was blocked → "something went wrong" on Outlook page
   - Fix: only apply domain restriction when `policyFile === 'policy-read.json'`; auth policy gets no domain restriction

4. **Polling loop launched browser repeatedly after window closed** - `d18e676`
   - `open --headed` blocks (spawnSync) until page loads or window closes
   - After window closed, `waitForLoginCompletion()` poll loop tried `get url` → null → continued polling
   - Each poll failure caused another browser launch attempt
   - Fix: removed polling loop entirely; check URL once immediately after `open` returns

5. **`--json` flag with `-q` returns status 1 / empty output** - `d18e676`
   - `runAgentBrowser(['--json', 'get', 'url'], ...)` failed — `-q` and `--json` conflict
   - Fix: use plain `get url` without `--json`; plain text stdout is the URL directly

6. **`url` action missing from policy allow lists** - `accc112`
   - `get url` internally triggers action name `url` (not `get`)
   - Both policy files missing `"url"` → `Action 'url' denied by policy`
   - Fix: added `"url"` to both policy allow lists

## Policy Allow Lists (Final State)

```json
// policy-auth.json
{"default":"deny","allow":["launch","navigate","snapshot","get","url","wait","scroll","close","state","session","click","fill"]}

// policy-read.json
{"default":"deny","allow":["launch","navigate","snapshot","get","url","wait","scroll","close","state","session"]}
```

## Deviations from Plan

All six bugs were found during the checkpoint's live execution and fixed inline as blocking issues (cannot proceed without them). These were not scope expansions — each fix was a minimal correction to make the planned behavior work.

### Auto-fixed Issues

**1. [Blocking] Policy allow list incomplete: `launch` missing**
- **Found during:** Live first invocation attempt
- **Issue:** `Action 'launch' denied by policy` — agent-browser's `open` command starts a daemon (`launch`) then navigates; only `navigate` was in the allow lists
- **Fix:** Added `"launch"` to both policy files
- **Committed in:** `1819cdb`

**2. [Blocking] `AGENT_BROWSER_PROFILE` unrecognized; `--profile` causes SingletonLock**
- **Found during:** First successful launch — Outlook loaded but user profile auth state was missing
- **Issue:** Profile env var silently ignored; `--profile` CLI flag worked but crashed with exit code 21 when Chrome already running
- **Fix:** Removed all profile-related code; `--session-name` alone handles persistence
- **Committed in:** `d0d07ba` (add flag), `2f1dc5f` (revert flag + add close before re-launch)

**3. [Blocking] `AGENT_BROWSER_ALLOWED_DOMAINS` blocked MFA redirect**
- **Found during:** First auth attempt with browser open
- **Issue:** Domain restriction applied to auth policy, blocking `login.microsoftonline.com` redirect
- **Fix:** Conditional logic: domain restriction only for `policy-read.json`
- **Committed in:** `97c040e`

**4. [Blocking] Post-open polling loop re-launched browser after close**
- **Found during:** Second auth attempt — browser launched repeatedly
- **Issue:** `waitForLoginCompletion()` poll loop ran after browser closed, treating null URL as "still on login page"; each iteration triggered new browser launch
- **Fix:** Removed polling loop; check URL once after `open` returns
- **Committed in:** `d18e676`

**5. [Blocking] `--json get url` incompatible with `-q`**
- **Found during:** Post-open URL check (status 1 with empty output)
- **Issue:** `-q` and `--json` flags conflict — status 1, no stdout
- **Fix:** Use plain `get url`; read plain text stdout
- **Committed in:** `d18e676`

**6. [Blocking] `url` action not in policy allow lists**
- **Found during:** Post-open URL check (`Action 'url' denied`)
- **Issue:** Action name for `get url` is `url`, not `get` — separate allow list entry required
- **Fix:** Added `"url"` to both policy files
- **Committed in:** `accc112`

---

**Total deviations:** 6 auto-fixed (all blocking)
**Impact on plan:** All fixes necessary for correctness. Policy action names are more granular than documented — `launch`, `navigate`, `url`, `get`, `snapshot` are all separate entries. This is a gap in the agent-browser reference docs.

## Phase 2 Concerns

**Outlook SPA CDN block**: `AGENT_BROWSER_ALLOWED_DOMAINS` for `policy-read.json` restricts to the Outlook hostname only. The Outlook SPA loads assets from CDN domains (e.g., `res-1.cdn.office.net`, `outlook.live.net`). Post-auth navigation shows `olkerror.html?bret=fail&esrc=NoBootJs` instead of the inbox — Outlook's SPA bootstrap fails without CDN access.

This is NOT a Phase 1 blocker: `olkerror.html` is not a login domain URL, so `isLoginUrl()` correctly returns false (session is valid). Phase 2 (search) must expand `AGENT_BROWSER_ALLOWED_DOMAINS` to include the required CDN domains, or remove the domain restriction for read operations.

## Next Phase Readiness

- Auth infrastructure is fully validated: managed Chrome, `--session-name` persistence, policy files, session detection
- `assertSession(operation)` is ready for Phases 2-4 to call before browser work
- Phase 2 must address CDN domain restriction before Outlook SPA renders the inbox
- Policy action allow lists may need further additions as Phase 2-4 operations are implemented (e.g., `title`, `screenshot`, `text` if used by search/read)

---
*Phase: 01-auth-scaffold-cli-skeleton*
*Completed: 2026-04-10*
