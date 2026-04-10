# Phase 1: Auth Scaffold + CLI Skeleton - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the `outlook.js` CLI entry point with `search`, `read`, `digest`, and `auth` subcommands. Implement the auth flow: detect session state, launch a visible managed browser for first-time login, persist the session across invocations. Enforce the read-only Action Policy before any browser launch. Establish the JSON stdout contract. Phase 1 validates bot detection and session persistence before any feature work begins in Phases 2–4.

</domain>

<decisions>
## Implementation Decisions

### Configuration
- **D-01:** Read `OUTLOOK_BASE_URL`, `OUTLOOK_BROWSER_PATH`, and `OUTLOOK_BROWSER_PROFILE` from `process.env` at startup. No config file in Phase 1 — config file support (e.g., `~/.outlook-skill/config.json`) is explicitly deferred to v2 (AUTH-06).
- **D-02:** All three env vars are required. If any is missing, fail fast at argv-validation time with a JSON error on stdout: `{"operation":"startup","status":"error","error":{"code":"INVALID_ARGS","message":"Missing required env var: OUTLOOK_BASE_URL"}}`. No browser is launched for missing config.

### Authentication
- **D-03:** Session persistence uses `--session-name outlook-skill` (auto-saves to `~/.agent-browser/sessions/`). No manual state file management.
- **D-04:** Auth detection (AUTH-01): navigate to `OUTLOOK_BASE_URL` with the persisted session; if the final URL contains a Microsoft login domain (`login.microsoftonline.com`, `login.live.com`, or `login.windows.net`), session is invalid. If an inbox URL loads, session is valid.
- **D-05:** First-time auth (AUTH-02): launch a `--headed` browser using `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE`. Wait for the user to complete MFA/SSO interactively. Detect completion by polling until the final URL is no longer a login-domain URL. Return `{"operation":"auth","status":"ok"}` once confirmed.
- **D-06:** Subsequent `auth` call with valid session (AUTH-04): return `{"operation":"auth","status":"ok"}` without launching a browser — session is restored from disk automatically.
- **D-07:** Session expiry mid-operation (AUTH-05): return `{"operation":"<op>","status":"error","error":{"code":"SESSION_INVALID","message":"Session expired — run: node outlook.js auth"}}`.

### Read-Only Safety
- **D-08:** `AGENT_BROWSER_ACTION_POLICY`, `AGENT_BROWSER_ALLOWED_DOMAINS`, and `AGENT_BROWSER_CONTENT_BOUNDARIES=1` are set as environment variables in the Node.js process before any agent-browser subprocess is spawned — not injected after (SAFE-01/02/03).
- **D-09:** All agent-browser invocations include the `-q` flag to suppress non-JSON text from reaching stdout (PKG-03).
- **D-10:** Unknown subcommands (anything other than `auth`, `search`, `read`, `digest`) are rejected at argv-parse time before any browser launch: `{"operation":"<cmd>","status":"error","error":{"code":"INVALID_ARGS",...}}` with exit code 1 (SAFE-04).

### Output Contract
- **D-11:** All stdout is valid JSON using the standard envelope: `{"operation":"...","status":"ok|error","results":[...],"error":null|{"code":"...","message":"..."}}` (OUT-01/02).
- **D-12:** Diagnostic logging goes to stderr only — never mixed with stdout JSON output.
- **D-13:** Error codes: `SESSION_INVALID`, `AUTH_REQUIRED`, `OPERATION_FAILED`, `INVALID_ARGS` (OUT-03).

### CLI Entry Point
- **D-14:** `outlook.js` is the single Node.js entry point (PKG-02). It shells out to the `agent-browser` CLI — it does not import the npm package as a module.

### Claude's Discretion
- Action policy file layout — one policy file per operation type (e.g., `policy-read.json` vs. `policy-auth.json`) or a single file; agent should choose the approach that provides the strongest read-only isolation
- Code organization — monolithic `outlook.js` vs. `lib/` modules; agent should choose the structure that best supports incremental addition of `search`, `read`, and `digest` in Phases 2–4
- npm/`package.json` — whether to add one and what to pin; agent should decide based on what makes the skill most self-contained for the calling agent's environment

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 requirements
- `.planning/REQUIREMENTS.md` — Full Phase 1 requirements: §CFG-01–04, §AUTH-01–05, §SAFE-01–04, §OUT-01–03, §PKG-02–03
- `.planning/ROADMAP.md` — Phase 1 goal and all six success criteria

### agent-browser CLI
- `.agents/skills/agent-browser/SKILL.md` — Core CLI reference, action policy syntax, `-q` flag, `--session-name`, `AGENT_BROWSER_*` env vars
- `.agents/skills/agent-browser/references/authentication.md` — `--headed` auth flow, session persistence patterns, SSO/MFA handling
- `.agents/skills/agent-browser/references/session-management.md` — `--session-name` auto-save/restore, session isolation properties

### Phase 0 output
- `references/outlook-ui.md` — Verified Outlook web ARIA patterns and URL behavior from Phase 0; contains the login redirect URL patterns required to implement AUTH-01 session detection

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `references/outlook-ui.md` — Phase 0 produced this. Contains confirmed Outlook URL patterns and login-redirect behavior. Phase 1 reads this to implement AUTH-01 (session detection by URL).

### Established Patterns
- Session pattern: `agent-browser --session-name outlook-skill open <url>` auto-saves on close, auto-restores on next launch from `~/.agent-browser/sessions/`
- Policy pattern: `export AGENT_BROWSER_ACTION_POLICY=./policy.json` (or set in `process.env` before spawning the subprocess)
- Node.js shells out to the `agent-browser` CLI via `child_process.execSync` or `spawnSync`; does not import the npm package as a module

### Established Context
- No production code exists yet — `outlook.js` is the first file written
- `references/` directory exists at project root (contains `outlook-ui.md`)
- Managed browser requirement: must use `OUTLOOK_BROWSER_PATH` pointing to a real Chrome/Edge binary; the default "Chrome for Testing" binary shipped with agent-browser is blocked by Entra Conditional Access on managed devices

### Integration Points
- `outlook.js` is invoked directly by the calling Claude Code personal assistant instance (via skill invocation)
- Phases 2–4 extend `outlook.js` with implementations of `search`, `read`, and `digest` — the code structure chosen in Phase 1 determines how cleanly those additions land

</code_context>

<specifics>
## Specific Ideas

- No specific implementation preferences beyond what's captured in decisions above.

</specifics>

<deferred>
## Deferred Ideas

- Config file support (`~/.outlook-skill/config.json`) — explicitly deferred to v2 per AUTH-06
- Local `.env` file loading — not needed in Phase 1 given env-vars-only decision (D-01)

</deferred>

---

*Phase: 01-auth-scaffold-cli-skeleton*
*Context gathered: 2026-04-10*
