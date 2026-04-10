# Phase 1: Auth Scaffold + CLI Skeleton - Research

**Researched:** 2026-04-10
**Domain:** Node.js CLI + agent-browser session persistence + read-only Action Policy enforcement
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Read `OUTLOOK_BASE_URL`, `OUTLOOK_BROWSER_PATH`, and `OUTLOOK_BROWSER_PROFILE` from `process.env` at startup. No config file in Phase 1 — config file support deferred to v2 (AUTH-06).
- **D-02:** All three env vars are required. If any is missing, fail fast at argv-validation time with a JSON error on stdout: `{"operation":"startup","status":"error","error":{"code":"INVALID_ARGS","message":"Missing required env var: OUTLOOK_BASE_URL"}}`. No browser is launched for missing config.
- **D-03:** Session persistence uses `--session-name outlook-skill` (auto-saves to `~/.agent-browser/sessions/`). No manual state file management.
- **D-04:** Auth detection (AUTH-01): navigate to `OUTLOOK_BASE_URL` with the persisted session; if the final URL contains a Microsoft login domain (`login.microsoftonline.com`, `login.live.com`, or `login.windows.net`), session is invalid. If an inbox URL loads, session is valid.
- **D-05:** First-time auth (AUTH-02): launch a `--headed` browser using `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE`. Wait for the user to complete MFA/SSO interactively. Detect completion by polling until the final URL is no longer a login-domain URL. Return `{"operation":"auth","status":"ok"}` once confirmed.
- **D-06:** Subsequent `auth` call with valid session (AUTH-04): return `{"operation":"auth","status":"ok"}` without launching a browser — session is restored from disk automatically.
- **D-07:** Session expiry mid-operation (AUTH-05): return `{"operation":"<op>","status":"error","error":{"code":"SESSION_INVALID","message":"Session expired — run: node outlook.js auth"}}`.
- **D-08:** `AGENT_BROWSER_ACTION_POLICY`, `AGENT_BROWSER_ALLOWED_DOMAINS`, and `AGENT_BROWSER_CONTENT_BOUNDARIES=1` are set as environment variables in the Node.js process before any agent-browser subprocess is spawned (SAFE-01/02/03).
- **D-09:** All agent-browser invocations include the `-q` flag to suppress non-JSON text from reaching stdout (PKG-03).
- **D-10:** Unknown subcommands are rejected at argv-parse time before any browser launch: `{"operation":"<cmd>","status":"error","error":{"code":"INVALID_ARGS",...}}` with exit code 1 (SAFE-04).
- **D-11:** All stdout is valid JSON using the standard envelope: `{"operation":"...","status":"ok|error","results":[...],"error":null|{"code":"...","message":"..."}}` (OUT-01/02).
- **D-12:** Diagnostic logging goes to stderr only.
- **D-13:** Error codes: `SESSION_INVALID`, `AUTH_REQUIRED`, `OPERATION_FAILED`, `INVALID_ARGS` (OUT-03).
- **D-14:** `outlook.js` is the single Node.js entry point (PKG-02). It shells out to the `agent-browser` CLI — does not import the npm package as a module.

### Claude's Discretion

- Action policy file layout — one policy file per operation type (e.g., `policy-read.json` vs. `policy-auth.json`) or a single file; agent should choose the approach that provides the strongest read-only isolation
- Code organization — monolithic `outlook.js` vs. `lib/` modules; agent should choose the structure that best supports incremental addition of `search`, `read`, and `digest` in Phases 2–4
- npm/`package.json` — whether to add one and what to pin; agent should decide based on what makes the skill most self-contained for the calling agent's environment

### Deferred Ideas (OUT OF SCOPE)

- Config file support (`~/.outlook-skill/config.json`) — explicitly deferred to v2 per AUTH-06
- Local `.env` file loading — not needed in Phase 1 given env-vars-only decision (D-01)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CFG-01 | Configurable Outlook base URL via env var | D-01: `OUTLOOK_BASE_URL` from `process.env` |
| CFG-02 | Config read at invocation time, not hardcoded | D-01/D-02: startup validation pattern |
| CFG-03 | Configurable browser executable path | `AGENT_BROWSER_EXECUTABLE_PATH` env var (verified) + `--executable-path` CLI flag |
| CFG-04 | Configurable browser profile path | `AGENT_BROWSER_PROFILE` env var (verified) + `--profile` CLI flag |
| AUTH-01 | Detect auth state by URL inspection after navigate | D-04: login-domain URL check pattern |
| AUTH-02 | Launch `--headed` browser with managed binary for interactive login | D-05: `--headed` + `OUTLOOK_BROWSER_PATH` + `OUTLOOK_BROWSER_PROFILE` |
| AUTH-03 | Persist session after login via `--session-name` | D-03: `--session-name outlook-skill` auto-saves on `close` |
| AUTH-04 | Restore session on subsequent invocations automatically | D-06: `--session-name` auto-restores; no code needed beyond flag |
| AUTH-05 | Detect mid-operation session expiry, return `SESSION_INVALID` | D-07: URL check pattern after navigate |
| SAFE-01 | Action Policy (`default: deny`) set before browser launch | D-08: `AGENT_BROWSER_ACTION_POLICY` in `process.env` before `spawnSync` |
| SAFE-02 | Domain allowlist set before browser launch | D-08: `AGENT_BROWSER_ALLOWED_DOMAINS` in `process.env` |
| SAFE-03 | Content boundaries enabled | D-08: `AGENT_BROWSER_CONTENT_BOUNDARIES=1` |
| SAFE-04 | Reject unknown subcommands before browser launch | D-10: argv-parse guard at top of `outlook.js` |
| OUT-01 | Only valid JSON to stdout | D-09: `-q` flag + stdout-only JSON envelope |
| OUT-02 | Standard JSON envelope on all responses | D-11: `{operation, status, results, error}` shape |
| OUT-03 | Standard error codes | D-13: `SESSION_INVALID`, `AUTH_REQUIRED`, `OPERATION_FAILED`, `INVALID_ARGS` |
| PKG-02 | Single `outlook.js` entry point with subcommands | D-14: shells out to agent-browser CLI |
| PKG-03 | All agent-browser calls use `-q` flag | D-09: verified `-q` suppresses non-JSON output |
</phase_requirements>

---

## Summary

Phase 1 builds the entire scaffolding that Phases 2–4 will extend. The implementation is Node.js shelling out to the `agent-browser` CLI via `child_process.spawnSync`. All safety is achieved through environment variables set on the subprocess — `AGENT_BROWSER_ACTION_POLICY` pointing to a `policy.json`, `AGENT_BROWSER_ALLOWED_DOMAINS`, and `AGENT_BROWSER_CONTENT_BOUNDARIES=1`. Session persistence is fully automatic via the `--session-name outlook-skill` flag; agent-browser saves the session to `~/.agent-browser/sessions/test-session-default.json` on `close` and restores it on the next `open` with the same name.

The highest-risk unknown is Microsoft Entra Conditional Access bot detection. The CONTEXT.md explicitly treats all mitigations as hypotheses until tested against a live session. The `--headed` flag plus `OUTLOOK_BROWSER_PATH`/`OUTLOOK_BROWSER_PROFILE` pointing to the user's real managed browser is the plan; whether agent-browser can drive a managed Chrome installation successfully is what Phase 1 must validate empirically.

The code organization decision (monolithic vs. `lib/` modules) is discretionary. Given that Phases 2–4 each add a single subcommand handler, a `lib/` module layout — `lib/run.js` for subprocess wrapper, `lib/session.js` for auth logic, `lib/output.js` for JSON envelope — prevents `outlook.js` from becoming a 500-line monolith by Phase 4 while keeping imports trivial.

**Primary recommendation:** Use separate `policy-auth.json` and `policy-read.json` files for the strongest read-only isolation, plus a `lib/` module layout for clean Phase 2–4 extension.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | 25.9.0 (confirmed on machine) | Entry point runtime | Already present; `child_process` built-in; no additional deps |
| agent-browser CLI | 0.25.3 (confirmed on machine) | Browser automation subprocess | Project-mandated; handles Chrome CDP, session persistence |
| `child_process.spawnSync` | built-in | Invoke agent-browser from Node.js | Synchronous; easy stdout/stderr capture; no third-party dependency |

[VERIFIED: bash - `agent-browser --version` returned `0.25.3`; `node --version` returned `v25.9.0`]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `process.env` | built-in | Read env vars at startup | Required by D-01/D-02 |
| `process.argv` | built-in | Parse subcommand | Required by D-10/D-14 |
| `JSON.stringify` | built-in | Build JSON output envelope | Required by D-11 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `spawnSync` | `execSync` | `execSync` returns a Buffer; harder to capture stderr separately; `spawnSync` gives `{stdout, stderr, status}` cleanly |
| `spawnSync` | `spawn` (async) | Async adds complexity with no benefit — all agent-browser commands are already serialized |
| Separate policy files per operation | Single `policy.json` | Single file is simpler but can't distinguish what auth is allowed vs read-only; see Architecture Patterns |

**Installation:** No additional npm install needed. Node.js and agent-browser are already present.

---

## Architecture Patterns

### Recommended Project Structure

```
outlook.js                    # Entry point: argv parse, env validation, dispatch
lib/
  run.js                      # spawnSync wrapper: sets env vars, captures stdout/stderr
  session.js                  # Auth detection: navigate + URL check, poll loop for login
  output.js                   # JSON envelope builder: ok/error shapes
policy-auth.json              # Action Policy for auth subcommand (navigate + click + fill)
policy-read.json              # Action Policy for all other subcommands (no click, no fill)
references/
  outlook-ui.md               # (from Phase 0 — existing)
```

The `lib/` split ensures `outlook.js` stays a thin dispatcher. Each Phase 2–4 addition is a new file in `lib/` plus a new `case` in the dispatcher.

### Pattern 1: Environment Variable Injection Before subprocess

**What:** Set all `AGENT_BROWSER_*` env vars on the child process environment object before `spawnSync`. Never mutate `process.env` globally — create a merged env object per invocation.

**When to use:** Every agent-browser invocation in every subcommand handler.

```javascript
// Source: CONTEXT.md D-08, verified against agent-browser SKILL.md env var list
function runAgentBrowser(args, operation, policyFile) {
  const childEnv = {
    ...process.env,
    AGENT_BROWSER_ACTION_POLICY: policyFile,
    AGENT_BROWSER_ALLOWED_DOMAINS: allowedDomain,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    // Pass browser path + profile via env vars (agent-browser reads these)
    AGENT_BROWSER_EXECUTABLE_PATH: process.env.OUTLOOK_BROWSER_PATH,
    AGENT_BROWSER_PROFILE: process.env.OUTLOOK_BROWSER_PROFILE,
  };
  const result = spawnSync('agent-browser', ['-q', '--session-name', 'outlook-skill', ...args], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return result;
}
```

[VERIFIED: agent-browser SKILL.md env var table — `AGENT_BROWSER_EXECUTABLE_PATH`, `AGENT_BROWSER_PROFILE` (via authentication.md line 95), `AGENT_BROWSER_ACTION_POLICY`, `AGENT_BROWSER_ALLOWED_DOMAINS`, `AGENT_BROWSER_CONTENT_BOUNDARIES` all confirmed as supported env vars]

### Pattern 2: Separate Action Policy Files Per Operation Type

**What:** `policy-auth.json` allows `navigate`, `snapshot`, `get`, `wait`, `scroll`, `close`, `state`, `session`, `click`, `fill`. `policy-read.json` allows the same list minus `click` and `fill`.

**When to use:** Pass `policy-auth.json` only for the `auth` subcommand. Pass `policy-read.json` for `search`, `read`, `digest`.

**Why separate over a single file:** The `auth` subcommand genuinely needs `click` and `fill` to drive the login form. All other subcommands are read-only and must never have those actions available — even if the browser navigates to an unexpected URL. A single policy file would either block login or leave read operations unnecessarily permissive.

```json
// policy-auth.json
// Source: CONTEXT.md D-08 + REQUIREMENTS.md SAFE-01
{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get", "wait", "scroll", "close", "state", "session", "click", "fill"]
}
```

```json
// policy-read.json
{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get", "wait", "scroll", "close", "state", "session"]
}
```

[VERIFIED: agent-browser SKILL.md — action policy format `{"default":"deny","allow":[...]}` confirmed; action names verified against SKILL.md command list]

### Pattern 3: Auth Detection by URL Inspection

**What:** After navigating to `OUTLOOK_BASE_URL`, call `agent-browser -q get url` and check if the result contains a Microsoft login domain.

**When to use:** At the start of every subcommand that touches the browser (to detect expired sessions) and inside the `auth` completion poll loop.

```javascript
// Source: CONTEXT.md D-04, D-05
const LOGIN_DOMAINS = ['login.microsoftonline.com', 'login.live.com', 'login.windows.net'];

function isLoginUrl(url) {
  return LOGIN_DOMAINS.some(d => url.includes(d));
}

function isSessionValid() {
  // Navigate to Outlook
  const openResult = runAgentBrowser(['open', process.env.OUTLOOK_BASE_URL], 'check', 'policy-read.json');
  if (openResult.status !== 0) return false;

  // Get current URL after navigation (redirects resolve before open returns)
  const urlResult = runAgentBrowser(['--json', 'get', 'url'], 'check', 'policy-read.json');
  const parsed = JSON.parse(urlResult.stdout);
  return !isLoginUrl(parsed.data.url);
}
```

[CITED: references/outlook-ui.md — confirmed inbox URL pattern is `https://<base>/mail/` after load; login redirect would land on `login.microsoftonline.com` domain]

### Pattern 4: Polling Loop for Interactive Login Completion

**What:** After launching the `--headed` browser, poll `get url` every N seconds until the URL leaves the login domain. Output `{"operation":"auth","status":"ok"}` when confirmed.

**When to use:** First-time auth only (AUTH-02 / D-05).

```javascript
// Source: CONTEXT.md D-05
// Note: --headed is passed as a CLI flag, not an env var, because it must
// apply per-invocation (auth only). AGENT_BROWSER_HEADED is an env var option
// but setting it globally would affect all subcommands.
function waitForLoginCompletion(timeoutMs = 300000, pollIntervalMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Small synchronous sleep via a tight loop is acceptable here; this is a
    // CLI tool waiting for human interaction, not a server.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollIntervalMs);
    const urlResult = runAgentBrowser(['--json', 'get', 'url'], 'auth', 'policy-auth.json');
    if (urlResult.status !== 0) continue;
    const parsed = JSON.parse(urlResult.stdout);
    if (!isLoginUrl(parsed.data.url)) return true;
  }
  return false; // timed out
}
```

[ASSUMED: `Atomics.wait` as synchronous sleep in Node.js CLI context — this is a known pattern for synchronous delay without a third-party library. Alternatively, a bash `sleep` call via spawnSync works and may be cleaner.]

### Pattern 5: JSON Output Envelope

**What:** All stdout output uses the standard envelope from D-11.

```javascript
// Source: CONTEXT.md D-11/D-12
function outputOk(operation, results = null) {
  process.stdout.write(JSON.stringify({
    operation,
    status: 'ok',
    results,
    error: null,
  }) + '\n');
}

function outputError(operation, code, message) {
  process.stdout.write(JSON.stringify({
    operation,
    status: 'error',
    results: null,
    error: { code, message },
  }) + '\n');
  process.exit(1);
}

function log(msg) {
  // Diagnostic goes to stderr ONLY — never mixes with stdout JSON
  process.stderr.write(`[outlook-skill] ${msg}\n`);
}
```

[VERIFIED: CONTEXT.md D-11/D-12/D-13 — envelope shape and stderr-only logging are locked decisions]

### Pattern 6: argv Dispatch with Early Validation

**What:** Parse `process.argv[2]` as the subcommand. Validate env vars first, then validate subcommand, then dispatch. No browser is touched during validation.

```javascript
// Source: CONTEXT.md D-01/D-02/D-10
const REQUIRED_ENV = ['OUTLOOK_BASE_URL', 'OUTLOOK_BROWSER_PATH', 'OUTLOOK_BROWSER_PROFILE'];
const VALID_COMMANDS = ['auth', 'search', 'read', 'digest'];

// Step 1: Env var validation (before argv parse — missing env is a config error)
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    outputError('startup', 'INVALID_ARGS', `Missing required env var: ${key}`);
    // outputError calls process.exit(1)
  }
}

// Step 2: Extract domain for AGENT_BROWSER_ALLOWED_DOMAINS
const allowedDomain = new URL(process.env.OUTLOOK_BASE_URL).hostname;

// Step 3: Subcommand dispatch
const cmd = process.argv[2];
if (!VALID_COMMANDS.includes(cmd)) {
  outputError(cmd ?? 'unknown', 'INVALID_ARGS', `Unknown subcommand: ${cmd}. Valid: ${VALID_COMMANDS.join(', ')}`);
}

switch (cmd) {
  case 'auth':   return runAuth();
  case 'search': return outputError('search', 'OPERATION_FAILED', 'search not yet implemented');
  case 'read':   return outputError('read', 'OPERATION_FAILED', 'read not yet implemented');
  case 'digest': return outputError('digest', 'OPERATION_FAILED', 'digest not yet implemented');
}
```

[VERIFIED: CONTEXT.md decisions D-01 through D-14 — all steps are locked]

### Anti-Patterns to Avoid

- **Mutating `process.env` globally:** Setting `process.env.AGENT_BROWSER_ACTION_POLICY = '...'` pollutes all subsequent subprocess calls including diagnostic ones. Always pass env as a merged object to `spawnSync`.
- **Parsing agent-browser stdout as free text:** agent-browser with `-q` + `--json` returns structured JSON. Always use `--json` when programmatically reading output (e.g., `get url`). Without `--json`, `get url` returns a bare URL string — fine for human use, fragile for parsing.
- **Using `networkidle` wait strategy:** SKILL.md explicitly warns against `wait --load networkidle` on Outlook — it has persistent WebSocket connections that will cause the wait to hang indefinitely. Use `wait 2000` or `wait --url` patterns instead.
- **Closing browser without `--session-name`:** Session state is only auto-saved to `~/.agent-browser/sessions/` if the `--session-name` flag was present on the original `open` call. A bare `close` saves nothing.
- **Importing agent-browser as a Node module:** The skill shells out to the CLI binary. Do not `require('@vercel/agent-browser')` — this is explicitly locked by D-14.
- **Setting `AGENT_BROWSER_HEADED=1` globally:** The `--headed` flag must apply only to the `auth` subcommand's first-time login invocation. If set in the shared env, `search`, `read`, and `digest` would open visible browser windows unnecessarily.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session persistence (cookies, localStorage) | Manual state file save/load logic | `--session-name outlook-skill` flag | agent-browser handles encryption, path management, and cross-invocation restore automatically |
| Browser subprocess management | Daemon lifecycle code | agent-browser daemon (implicit) | agent-browser's daemon persists across commands; no process management needed |
| URL wait/poll after navigation | `setInterval` + DOM check | `agent-browser open` (waits for page `load` event) + `agent-browser get url` | `open` already waits; manual polling over-complicates |
| Action policy enforcement | Per-action checks in Node.js code | `AGENT_BROWSER_ACTION_POLICY` env var | Policy is enforced at browser level — cannot be bypassed even if code is compromised |
| Domain restriction | Allowlist checks in Node.js before every navigate | `AGENT_BROWSER_ALLOWED_DOMAINS` env var | Enforced at the network layer, not at the code layer |

**Key insight:** The read-only safety constraint is achieved entirely through agent-browser's built-in environment variable controls, not through Node.js-level guards. Node.js validates inputs (argv, env vars) but browser-level policy is the true safety boundary.

---

## Common Pitfalls

### Pitfall 1: Session Not Persisting Across Invocations

**What goes wrong:** `node outlook.js auth` completes successfully, but the next invocation (`node outlook.js auth`) still opens a browser window.

**Why it happens:** The session is only auto-saved when `agent-browser close` is called with the same `--session-name` that was used on `open`. If `close` is omitted (or is called without `--session-name`), the daemon exits without saving.

**How to avoid:** Always call `agent-browser --session-name outlook-skill close` as the final step of the `auth` handler — even if an error occurred. Use a `try/finally` pattern.

**Warning signs:** `~/.agent-browser/sessions/` directory is empty after a successful `auth` run.

[VERIFIED: bash test — `open` + `close` with `--session-name` created `~/.agent-browser/sessions/test-session-default.json`; `open` without `close` left sessions directory empty]

### Pitfall 2: Bot Detection Blocks Managed Browser

**What goes wrong:** `agent-browser --headed --executable-path <chrome-path> open <outlook-url>` is immediately redirected to a Conditional Access error page rather than a login form.

**Why it happens:** Microsoft Entra Conditional Access evaluates the browser's user agent, device compliance certificates from the Chrome profile, and potentially window visibility. If the managed Chrome binary is launched with different flags than a normal user session, it may fail device compliance checks.

**How to avoid:** This is the primary risk in Phase 1 and CANNOT be fully mitigated in research — it must be tested live. Known mitigations that increase the chance of success:
1. Use `OUTLOOK_BROWSER_PROFILE` pointing to the SAME Chrome profile the user normally logs in from (preserves device tokens, certificates, and cached credentials)
2. Pass `--headed` so the browser is visible (some Conditional Access policies check headless mode)
3. Do NOT use the agent-browser-bundled "Chrome for Testing" binary — use the system Chrome or Edge binary

**Warning signs:** URL after `open` contains `account.activedirectory.windowsazure.com/applications/redirecttofederatedorganization` or similar Conditional Access error paths rather than `login.microsoftonline.com`.

**Fallback path (if managed binary blocked):** Use `--auto-connect` to import auth state from an already-running Chrome session (SKILL.md Option 1). This is documented as the bootstrap alternative in CONTEXT.md "Established Context".

[ASSUMED: Specific Conditional Access failure modes — based on CONTEXT.md which documents this as the primary risk and treats all mitigations as hypotheses]

### Pitfall 3: `get url` Returns `about:blank` Instead of Real URL

**What goes wrong:** `agent-browser -q --json get url` returns `{"data":{"url":"about:blank"}}` even after `open` completed.

**Why it happens:** The `--session-name` session daemon may have an active previous tab at `about:blank` while the new navigation is in progress. Or the session was restored to a blank state.

**How to avoid:** Always call `open` before `get url`. `open` waits for the `load` event before returning, so the URL will be the post-redirect final URL.

[VERIFIED: bash test — `agent-browser -q --json get url` without prior `open` returns `{"success":true,"data":{"url":"about:blank"},"error":null}`; this is the default state]

### Pitfall 4: Mixing Stdout and Stderr in agent-browser Output

**What goes wrong:** `outlook.js` emits non-JSON text on stdout (e.g., `✓ Browser closed`) that breaks JSON parsing by the calling agent.

**Why it happens:** Some agent-browser commands emit human-readable status text on stdout by default. The `-q` flag suppresses this for most commands, but `close` still outputs `✓ Browser closed` on stdout even with `-q`.

**How to avoid:** Always capture both `stdout` and `stderr` from `spawnSync` (use `stdio: ['ignore', 'pipe', 'pipe']`). Never pipe agent-browser output directly to `process.stdout` — only write the constructed JSON envelope to `process.stdout`.

[VERIFIED: bash test — `agent-browser --session-name test-session -q close` printed `✓ Browser closed` to stdout despite `-q` flag]

### Pitfall 5: `AGENT_BROWSER_PROFILE` Tilde Expansion

**What goes wrong:** `OUTLOOK_BROWSER_PROFILE=~/.chrome-profiles/work node outlook.js auth` fails because the tilde is not expanded by Node.js when passed as an env var value.

**Why it happens:** Shell tilde expansion happens when the shell parses the command. If the env var is set in a context where the shell doesn't expand it (e.g., in a config file or passed programmatically), `~` is passed literally to agent-browser, which may not expand it.

**How to avoid:** When reading `OUTLOOK_BROWSER_PROFILE` from env, expand `~` manually: `value.replace(/^~/, os.homedir())`. Apply this to both `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE` before passing to agent-browser.

[ASSUMED: Tilde expansion behavior in Node.js env var passthrough — standard Node.js behavior; no specific verification in this session]

---

## Code Examples

Verified patterns from official sources:

### Verified: agent-browser -q --json get url Output Format

```
$ agent-browser -q --json get url
{"success":true,"data":{"url":"about:blank"},"error":null}
```

URL extraction: `JSON.parse(result.stdout).data.url`

[VERIFIED: bash test — direct execution]

### Verified: Session Persistence Lifecycle

```bash
# Session is NOT saved until close is called
agent-browser --session-name outlook-skill open https://example.com  # starts session
agent-browser --session-name outlook-skill close                     # saves session

# Confirmed: ~/.agent-browser/sessions/test-session-default.json created after close
# Confirmed: no sessions dir created after open-only without close
```

[VERIFIED: bash test — direct execution; `~/.agent-browser/sessions/test-session-default.json` created]

### Verified: Action Policy JSON Format

```json
{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get", "wait", "scroll", "close", "state", "session"]
}
```

[VERIFIED: agent-browser SKILL.md line 531 — exact format confirmed]

### Verified: spawnSync with Env Passthrough

```javascript
const { spawnSync } = require('child_process');

const result = spawnSync(
  'agent-browser',
  ['-q', '--session-name', 'outlook-skill', 'get', 'url'],
  {
    env: { ...process.env, AGENT_BROWSER_ACTION_POLICY: './policy-read.json' },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }
);
// result.stdout: the raw stdout string
// result.stderr: diagnostic output from agent-browser
// result.status: exit code (0 = success)
```

[VERIFIED: bash node -e test — spawnSync with env passthrough works; exit code 0 returned]

### Verified: Known Outlook URL Patterns (from Phase 0)

```
Inbox loaded:    https://mail.example.com/mail/  (redirected from /mail/inbox)
Search state:    https://mail.example.com/mail/  (URL does NOT change on search)
Open message:    https://mail.example.com/mail/id/<URL-encoded-ItemID>
Login redirect:  https://login.microsoftonline.com/...
```

Session valid check: URL does NOT contain `login.microsoftonline.com`, `login.live.com`, or `login.windows.net`.

[VERIFIED: references/outlook-ui.md — confirmed-live annotations]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | `outlook.js` runtime | Yes | v25.9.0 | — |
| agent-browser CLI | browser automation | Yes | 0.25.3 | — |
| Chrome (managed) | AUTH-02/CFG-03 | Unconfirmed — user must set `OUTLOOK_BROWSER_PATH` | — | `--auto-connect` from existing Chrome session |
| `~/.agent-browser/sessions/` | AUTH-03/04 | Auto-created by agent-browser on first `close` with `--session-name` | — | — |

**Missing dependencies with no fallback:**
- None at the tooling level. The only runtime dependency is the managed Chrome/Edge binary at `OUTLOOK_BROWSER_PATH` — this is user-configured and its Entra compatibility must be validated empirically in Phase 1.

**Missing dependencies with fallback:**
- Managed Chrome binary blocked by Conditional Access: fallback is `--auto-connect` import from a running Chrome session (SKILL.md Option 1). This is the documented contingency.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `state save` / `state load` files | `--session-name` auto-save/restore | agent-browser 0.x | Zero file management; simpler code |
| Trust-based read-only (no enforcement) | `AGENT_BROWSER_ACTION_POLICY` JSON | Built-in feature | Safety enforced at browser level, not code level |

**No deprecated approaches apply to this phase.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Atomics.wait` is an acceptable synchronous delay mechanism in Node.js 25 CLI context | Pattern 4 (poll loop) | If wrong, use `spawnSync('sleep', ['3'])` instead — bash `sleep` is universally available |
| A2 | Tilde `~` in `OUTLOOK_BROWSER_PROFILE` env var is not expanded by Node.js | Pitfall 5 | Low risk — `os.homedir()` substitution is cheap insurance regardless |
| A3 | Managed Chrome binary at `OUTLOOK_BROWSER_PATH` is not blocked by Entra Conditional Access when launched via `--headed` + managed `--profile` | Pitfall 2 | HIGH risk if wrong — fallback to `--auto-connect` required; Phase 1 exists specifically to test this |
| A4 | `-q` flag on `close` does not fully suppress stdout (based on one test showing `✓ Browser closed`) | Pitfall 4 | If wrong (i.e., `-q` does suppress it on newer versions), the guidance is still correct: always capture stdout, never pipe through |

---

## Open Questions

1. **Does agent-browser's `--headed` + managed Chrome + `--profile` bypass Entra Conditional Access?**
   - What we know: CONTEXT.md documents this as the primary risk; REQUIREMENTS.md requires it (CFG-03); Phase 0 used `--auto-connect` (not `--headed`) for its session
   - What's unclear: Whether agent-browser can drive a managed enterprise Chrome binary with Entra device compliance tokens intact
   - Recommendation: Phase 1's auth task is the empirical test. If it fails, fallback to `--auto-connect` bootstrap (user opens Chrome manually, runs `agent-browser --auto-connect --session-name outlook-skill state save`, then subsequent invocations use `--session-name` without `--headed`)

2. **What `--profile` path should OUTLOOK_BROWSER_PROFILE point to on macOS?**
   - What we know: Standard Chrome profile path on macOS is `~/Library/Application Support/Google/Chrome/Default` or a named profile
   - What's unclear: Whether the user's managed Chrome uses the Default profile or a work-specific named profile (e.g., `Profile 1`)
   - Recommendation: Document the common macOS path in the skill's startup error message for misconfigured `OUTLOOK_BROWSER_PROFILE`

3. **Does `agent-browser -q close` suppress the `✓ Browser closed` stdout line in 0.25.3?**
   - What we know: Tested once; the confirmation message appeared on stdout despite `-q`
   - What's unclear: Whether this is intentional (always printed) or a bug/inconsistency
   - Recommendation: Regardless of answer, `spawnSync` with `stdio: 'pipe'` captures and discards it — not a blocker

---

## Project Constraints (from CLAUDE.md)

The following directives from `CLAUDE.md` apply to Phase 1 implementation:

| Constraint | Directive |
|------------|-----------|
| Interface | CLI-invocable only; no MCP server |
| Safety | Strictly read-only; zero write operations enforced at skill level |
| Browser | Uses `@vercel/agent-browser` npm package (CLI, not module import per D-14) |
| Auth | Session must survive across separate CLI invocations via `--session-name` |
| Output | JSON to stdout only; no mixed logging; agent-browser always invoked with `-q` |
| Script language | Node.js is primary for `outlook.js`; Bash acceptable for orchestration |
| Session persistence | `--session-name outlook-skill` is primary; `--profile` is secondary fallback |
| JSON construction | Node.js `JSON.stringify`, not `jq` |
| Action policy | `AGENT_BROWSER_ACTION_POLICY` env var enforced before any browser launch |
| Content boundaries | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` on all operations |
| GSD workflow | All code changes must go through `/gsd-execute-phase` — no direct edits outside GSD |

---

## Sources

### Primary (HIGH confidence)

- `.agents/skills/agent-browser/SKILL.md` — action policy format, env vars, `-q` flag, `--session-name`, `--headed`, `--executable-path`
- `.agents/skills/agent-browser/references/authentication.md` — `--profile` env var (`AGENT_BROWSER_PROFILE`), `--headed` auth flow, session persistence
- `.agents/skills/agent-browser/references/session-management.md` — `--session-name` auto-save/restore, session isolation
- `.agents/skills/agent-browser/references/commands.md` — `AGENT_BROWSER_EXECUTABLE_PATH`, complete command reference
- `references/outlook-ui.md` — confirmed Outlook URL patterns, login redirect behavior (Phase 0 output)
- `.planning/phases/01-auth-scaffold-cli-skeleton/01-CONTEXT.md` — all locked decisions (D-01 through D-14)

### Secondary (MEDIUM confidence)

- Bash tests (this session):
  - `agent-browser --version` → `0.25.3` confirmed
  - `node --version` → `v25.9.0` confirmed
  - `agent-browser -q --json get url` → `{"success":true,"data":{"url":"about:blank"},"error":null}` confirmed
  - `open` + `close` with `--session-name` → `~/.agent-browser/sessions/test-session-default.json` created
  - `spawnSync` with env passthrough → exit code 0 confirmed
  - `agent-browser -q close` → `✓ Browser closed` appeared on stdout (Pitfall 4)

### Tertiary (LOW confidence)

- A3: Managed browser / Entra Conditional Access compatibility — cannot be verified without a live test; Phase 1 is the test

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — agent-browser 0.25.3 and Node.js 25.9.0 confirmed installed; all env vars verified in skill docs
- Architecture patterns: HIGH — all patterns derived from locked CONTEXT.md decisions + verified skill documentation
- Pitfalls: MEDIUM-HIGH — Pitfalls 1, 3, 4 verified by direct bash tests; Pitfall 2 is documented primary risk (ASSUMED); Pitfall 5 is standard Node.js behavior

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (agent-browser releases frequently; re-verify if updating past 0.25.3)
