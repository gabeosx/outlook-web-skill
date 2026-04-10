# Project Research Summary

**Project:** Outlook Web Skill
**Domain:** Claude Code skill — browser-automated read-only Outlook web reader
**Researched:** 2026-04-10
**Confidence:** MEDIUM (stack HIGH, DOM selectors and bot detection MEDIUM — require live validation)

## Executive Summary

This project is a Claude Code skill that gives a personal assistant Claude Code instance read-only access to Outlook web via `agent-browser` (Chrome/Chromium over CDP). The recommended implementation is a single Node.js entry point (`outlook.js`) with three subcommands — `search`, `read`, `digest` — backed by modular lib files. All authentication is handled via `--session-name outlook-skill` for automatic cookie/token persistence; the first run opens a headed browser for the user to complete MFA interactively. All output is structured JSON to stdout; stderr is for logs only.

The dominant technical risk is Microsoft's bot detection infrastructure. Headless Chrome via CDP exposes `navigator.webdriver=true` and other fingerprint signals that Azure AD's bot management layer may detect, causing auth failures or silent redirects. The primary mitigation is using `--headed` mode for authentication and a persistent session (not a fresh CDP launch each time) to reduce detection risk. This risk must be validated in Phase 1 before any feature work begins — bot detection is the only unknown that could invalidate the entire approach.

A hard read-only constraint is enforced at the browser level via an agent-browser Action Policy (`default: deny`, allowlist of `navigate, snapshot, get, wait, scroll, close`). This prevents any write action — click, fill, keyboard press — even if a prompt-injected email body attempts to instruct the browser to reply or delete. The skill's SKILL.md contract also explicitly describes what Claude may and may not do, giving the personal assistant a clear behavioral boundary.

## Key Findings

### Recommended Stack

The skill is implemented as a single Node.js CLI (`outlook.js`) with modular lib files rather than pure Bash, because JSON construction from scraped accessibility-tree text requires real string manipulation. All agent-browser calls are spawned as child processes and their stdout captured — never passed through. Node.js is confirmed present in the project (`.claude/package.json`). Session persistence uses `--session-name outlook-skill`, which auto-saves cookies and localStorage to `~/.agent-browser/sessions/` without any manual file management. If enterprise accounts require IndexedDB token storage, the fallback is `--profile ~/.outlook-skill-profile` (full Chrome user data directory).

**Core technologies:**
- `agent-browser` CLI: browser control via CDP — specified tool, designed for agentic CLI use
- Node.js: JSON construction, DOM text processing, operation logic — already present in project
- `--session-name outlook-skill`: session persistence — zero file management, automatic save/restore
- `policy.json` (Action Policy): read-only enforcement at the browser layer — blocks write actions regardless of instruction source
- `AGENT_BROWSER_CONTENT_BOUNDARIES=1`: prompt injection defense — wraps page content in markers so email body text cannot be interpreted as skill commands

**Key env vars to set in all scripts:**
- `AGENT_BROWSER_SESSION_NAME=outlook-skill`
- `AGENT_BROWSER_CONTENT_BOUNDARIES=1`
- `AGENT_BROWSER_ALLOWED_DOMAINS=outlook.office.com,*.outlook.office.com,login.microsoftonline.com,*.microsoftonline.com`
- `AGENT_BROWSER_ACTION_POLICY=./policy.json`
- `AGENT_BROWSER_MAX_OUTPUT=100000`
- `AGENT_BROWSER_DEFAULT_TIMEOUT=30000`

### Expected Features

**Must have (table stakes):**
- Auth detection on every invocation — check URL after `open` for login domain redirect
- First-run headed login — launch visible browser, poll until inbox URL reached, session auto-saves
- Session expiry recovery — return `SESSION_EXPIRED` JSON error with `requiresInteraction: true`; never attempt silent re-auth
- Clean JSON stdout — all output is valid JSON; agent-browser invoked with `-q`; logs to stderr only
- `search` operation — KQL query string, navigate to Outlook search, extract result list
- `read` operation — message URL or ID, navigate to message, extract full body and metadata
- `digest` operation — today's inbox, extract and score emails by unread/flagged/importance/recency
- ARIA-only selectors — never CSS class names; use `role`, `aria-label`, `data-convid`

**Should have (differentiators):**
- Scroll-and-accumulate pagination for large inboxes (virtual DOM shows only ~20 rows at a time)
- Urgency keyword heuristics in digest scoring ("urgent", "deadline", "ASAP")
- Configurable VIP sender list for digest priority
- `auth` subcommand for explicit re-authentication trigger
- Retry with exponential backoff for search rate limiting

**Defer to v2+:**
- Thread reading (full conversation fetch) — validate need after first real-world usage
- Convenience KQL query builders (from:/subject:/date: wrappers)
- Multi-folder search
- Bot detection tuning beyond session reuse

**Hard anti-features (never implement):**
- Send, reply, forward, delete, move, archive, mark as read/unread, flag/unflag
- Calendar reading, contact management, settings changes
- Download attachments to disk
- Graph API calls

### Architecture Approach

One skill directory, one Node.js entry point with three subcommands, auth check on every invocation. The `browser.js` module wraps all agent-browser child process calls. The `output.js` module is the only thing that writes to stdout. All navigation is by URL — not by clicking — because `click` is excluded from the action policy allowlist. Outlook's deep link structure (`/mail/inbox`, `/mail/search?q=`, `/mail/id/<id>`) makes this viable.

**Major components:**
1. `outlook.js` (entry point) — parses subcommand and args, runs auth check, dispatches to operation, writes final JSON
2. `auth.js` — URL-based session detection, headed first-run flow, returns `SESSION_EXPIRED` on redirect; does not retry silently
3. `browser.js` — wraps all agent-browser CLI calls, captures stdout into variables, handles non-zero exits as structured errors
4. `search.js` / `read.js` / `digest.js` — operation implementations using URL navigation and ARIA selectors
5. `output.js` — enforces JSON envelope `{ operation, timestamp, status, data, error }`, sole stdout writer
6. `policy.json` — `default: deny`, allowlist: `navigate, snapshot, get, wait, scroll, close`
7. `SKILL.md` — invocation contract: exact CLI signatures, JSON schemas, error codes, read-only constraints

### Critical Pitfalls

1. **CDP fingerprint / bot detection** — `navigator.webdriver=true` and headless signals may cause Microsoft to block the session. Use `--headed` for auth; use `--session-name` for session reuse. Must be validated in Phase 1 before feature work. Fallback: `--profile` with pre-populated Chrome user data directory.

2. **MFA / Conditional Access mid-session expiry** — Azure AD can revoke sessions at any time. Detect redirect to login domain on every operation entry; return `SESSION_EXPIRED` JSON. The personal assistant surfaces this to the user for manual re-auth.

3. **Accidental write action** — Outlook has destructive keyboard shortcuts (Delete, R for Reply) adjacent to read targets. Enforce `policy.json` Action Policy from day one. Never use `agent-browser keyboard` or `press` on Outlook pages. Never allow `click` in the action policy allowlist.

4. **SPA DOM settling** — Outlook is a React SPA; DOM updates asynchronously after navigation. Always wait before snapshotting: `agent-browser wait --text <landmark>` or `wait 1500`. Never use `wait --load networkidle` — Outlook's SignalR WebSocket connections prevent it from resolving.

5. **Virtual scrolling in message list** — Only ~20 message rows exist in the DOM at once. Digest and large search results require a scroll-and-accumulate loop: snapshot, extract, scroll `[role=list]` container, re-snapshot, repeat.

6. **stdout contamination** — Always invoke agent-browser with `-q`; capture output into variables; compose final JSON in Node.js. Never pipe agent-browser output directly to stdout.

## Implications for Roadmap

### Phase 1: Auth and Browser Scaffolding
**Rationale:** Auth is a blocker for everything. Bot detection is the highest project risk and must be validated before feature investment. Browser wrapper and output module are shared infrastructure.
**Delivers:** Working session persistence, headed first-run login, URL-based auth detection, `SESSION_EXPIRED` error path, clean JSON output pipe, action policy in place.
**Addresses:** Auth detection, session persistence, first-run login, clean stdout (all table stakes).
**Avoids:** CDP fingerprint pitfall (must resolve here), stdout contamination, accidental write actions.
**Live validation required:** Does `--headed` + `--session-name` authenticate and persist successfully? Does Microsoft detect the automated browser? Does the session survive across separate CLI invocations?

### Phase 2: Search Operation
**Rationale:** Search is the fundamental read primitive and produces message URLs that `read` consumes. ARIA selector strategy is validated here before being reused across all operations.
**Delivers:** `search` subcommand returning `{ operation, query, results[], count }` JSON.
**Implements:** `search.js`, URL navigation to `/mail/search?q=<query>`, snapshot of `[role=list]`, ARIA-based row data extraction.
**Avoids:** Dynamic CSS class pitfall, SPA settling pitfall (explicit wait before snapshot).
**Live validation required:** Does `?q=` URL search work in current Outlook build? What is the exact `aria-label` format on `[role=listitem]` rows? How is a stable message ID extracted from the DOM?

### Phase 3: Read Operation
**Rationale:** Depends on message URLs from Phase 2. Full email body reading unlocks the most valuable personal assistant queries.
**Delivers:** `read` subcommand returning full body, sender, to, cc, date, and attachment metadata.
**Implements:** `read.js`, navigate to message permalink, extract body from `[role=document]` or `[aria-label="Message body"]`.
**Avoids:** iframe body extraction pitfall (use `snapshot -i` to inline iframe content).
**Live validation required:** Does the reading pane body render in the accessibility snapshot? Are attachment filenames present in the DOM?

### Phase 4: Digest Operation
**Rationale:** Digest composes search and read patterns; build it once both are stable. Reuses Phase 2 list extraction and optionally calls Phase 3 `read` for top messages.
**Delivers:** `digest` subcommand returning today's scored/ranked inbox.
**Implements:** `digest.js`, inbox navigation, scroll-and-accumulate for virtual list, importance scoring (unread, flagged, high-importance, recency).
**Avoids:** Virtual scrolling pitfall (scroll loop required), search rate limiting (prefers inbox scroll over search query).
**Live validation required:** Does scrolling the list container with `--selector` load additional DOM rows? Does Outlook default to "Focused" tab (requires switching to "All")?

### Phase 5: Hardening
**Rationale:** After Phases 1-4 deliver working features, harden for reliability across multiple days of real use.
**Delivers:** Retry logic, human-like timing if needed, session expiry recovery refinement, Outlook variant detection, final SKILL.md documentation, integration test with personal assistant.
**Addresses:** Any bot detection issues surfaced in Phase 1, search rate limiting (exponential backoff), Outlook personal vs. org account variant differences.

### Phase Ordering Rationale

- Phase 1 must come first: auth and bot detection are the only unknowns that could invalidate the approach entirely. Building features before confirming the browser can reach Outlook is wasted effort.
- Phase 2 before Phase 3: `read` consumes message URLs produced by `search`. Phase 2 validation confirms the URL format and ARIA attribute structure used in Phase 3.
- Phase 4 last among features: digest is a composition of Phases 2 and 3. Building it on stable primitives takes a fraction of the time of building it in parallel.
- Phase 5 requires real usage data to know which hardening is needed. Premature hardening risks solving the wrong problems.

### Research Flags

Phases requiring live validation — static research cannot resolve these:
- **Phase 1:** Bot detection outcome is the project's critical unknown. Treat mitigation strategies as hypotheses until tested against a real account.
- **Phase 2:** Actual ARIA attribute values and message ID attribute names on Outlook message list rows — version-dependent, requires a live snapshot to confirm.
- **Phase 2:** Whether `/mail/search?q=<query>` URL parameter search works in the current new Outlook build. Architecture assumes yes; search-box fallback exists if no.
- **Phase 4:** Focused Inbox tab default behavior. If inbox loads filtered to "Focused" only, digest must navigate to "All" view — which may require a click not in the action policy allowlist.

Phases with well-documented, stable patterns (skip additional research):
- **Phase 1 (JSON output + action policy):** Output schema, error codes, and policy.json format are fully specified from agent-browser SKILL.md with HIGH confidence.
- **Phase 5 (retry logic):** Standard exponential backoff — no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Derived directly from agent-browser SKILL.md, authentication.md, session-management.md — all local authoritative sources. Node.js presence confirmed. |
| Features | MEDIUM | Table stakes and anti-features clear. ARIA selector specifics are training-data knowledge as of Aug 2025; Outlook UI changes continuously. |
| Architecture | HIGH | Component boundaries, data flow, and JSON schema fully specified from agent-browser docs + project requirements. Single-entry-point pattern is low-risk. |
| Pitfalls | MEDIUM | Bot detection and MFA behavior from training data. Microsoft's detection posture evolves. Treat all mitigations as hypotheses to test in Phase 1. |

**Overall confidence:** MEDIUM — architecture and stack decisions are solid. Uncertainty concentrates in runtime behavior: bot detection outcome, exact ARIA attribute formats, SPA settling timing. All are resolvable by Phase 1-2 live validation before significant feature investment.

### Gaps to Address

- **ARIA label format on message list rows:** Must snapshot a real Outlook session to confirm the exact `aria-label` encoding on `[role=listitem]` elements (subject, sender, date, flags). Drives the JSON extraction parser design.
- **Message ID extraction from DOM:** Whether `data-convid`, `data-item-id`, or another attribute provides a stable, usable message ID. Required for `read` operation by ID.
- **Bot detection outcome:** Biggest unknown. If `--headed` + `--session-name` is insufficient, escalate to `--profile` with a pre-populated Chrome user data directory.
- **Focused Inbox tab:** If Outlook defaults to "Focused" filter, digest must switch to "All" — potentially requiring a click not in the action policy allowlist. Workaround: investigate whether an `?view=all` URL parameter exists.
- **Search URL format:** Whether `/mail/search?q=<encoded-query>` works in the current new Outlook build. If not, a search-box `fill` interaction is needed — requiring a narrow action policy exception for the search input element only.

## Sources

### Primary (HIGH confidence)
- `.agents/skills/agent-browser/SKILL.md` — agent-browser CLI reference, action policy, content boundaries
- `.agents/skills/agent-browser/references/authentication.md` — session persistence, --session-name vs --profile trade-offs
- `.agents/skills/agent-browser/references/session-management.md` — session lifecycle, encryption at rest
- `.planning/PROJECT.md` — requirements and hard constraints

### Secondary (MEDIUM confidence)
- Training data knowledge of Outlook web UI (ARIA roles, URL patterns, SPA behavior) — as of August 2025; requires live validation
- Microsoft KQL search syntax for Exchange/Outlook
- Chrome DevTools Protocol automation detection signal documentation
- Microsoft Entra ID conditional access token lifetime behavior

### Tertiary (LOW confidence — validate before relying)
- ARIA attribute format on Outlook message list rows — inferred from general knowledge; exact format requires live snapshot
- `/mail/search?q=` URL parameter behavior in current new Outlook — assumed from URL conventions; must be tested
- Bot detection outcome with `--headed` + session reuse — documented as mitigation; efficacy unconfirmed

---
*Research completed: 2026-04-10*
*Ready for roadmap: yes*
