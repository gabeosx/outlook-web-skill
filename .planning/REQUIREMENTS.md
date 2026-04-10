# Requirements: Outlook Web Skill

**Defined:** 2026-04-10
**Core Value:** A personal assistant Claude Code instance can reliably read and search the user's Outlook inbox without ever sending, deleting, or mutating anything.

## v1 Requirements

### Configuration

- [ ] **CFG-01**: User can configure their Outlook web base URL (e.g., `https://myemail.accenture.com`) via a config file or environment variable
- [ ] **CFG-02**: Configuration is read at skill invocation time, not hardcoded
- [ ] **CFG-03**: User can configure the browser executable path (`OUTLOOK_BROWSER_PATH`) — must point to a real managed browser (Chrome or Edge); skill must never fall back to agent-browser's default "Chrome for Testing" binary, which is blocked by Entra Conditional Access policies on managed devices
- [ ] **CFG-04**: User can configure the browser profile path (`OUTLOOK_BROWSER_PROFILE`) — must point to the Chrome/Edge profile that holds the user's Entra SSO tokens and device compliance certificates

### Authentication & Session

- [ ] **AUTH-01**: Skill detects auth state by navigating to the configured Outlook URL and checking whether the landing URL redirects to a Microsoft login page
- [ ] **AUTH-02**: When session is invalid, skill launches a visible (`--headed`) browser using the configured `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE` so the user can complete login (including MFA/SSO) interactively; headless or "Chrome for Testing" will be rejected by Entra Conditional Access
- [ ] **AUTH-03**: After successful human login, skill persists session via `--session-name outlook-skill` (auto-saves to `~/.agent-browser/sessions/`)
- [ ] **AUTH-04**: On subsequent invocations, skill restores session automatically without human interaction
- [ ] **AUTH-05**: Skill detects session expiry mid-operation and returns a structured `SESSION_INVALID` JSON error rather than crashing

### Read-Only Safety

- [ ] **SAFE-01**: The Action Policy file (`default: deny`, allowing only `navigate`, `snapshot`, `get`, `wait`, `scroll`, `close`, `state`, `session`) is set via `AGENT_BROWSER_ACTION_POLICY` environment variable before the browser process is launched — not applied after; the only exception is the `auth` subcommand which additionally requires `click` and `fill` to complete the login form
- [ ] **SAFE-02**: `AGENT_BROWSER_ALLOWED_DOMAINS` is set to the configured Outlook domain to prevent navigation outside it
- [ ] **SAFE-03**: `AGENT_BROWSER_CONTENT_BOUNDARIES=1` is set on all operations to prevent prompt injection from email content reaching the calling agent
- [ ] **SAFE-04**: Skill rejects any subcommand other than `search`, `read`, `digest`, and `auth` at the CLI argument level before touching the browser

### Search Operation

- [ ] **SRCH-01**: Skill accepts a KQL query string (supporting `from:`, `subject:`, `has:attachment`, `is:unread`, `is:flagged`, `before:`, `after:` operators)
- [ ] **SRCH-02**: Skill locates and interacts with the Outlook search box using verified ARIA roles/attributes (established in Phase 0 accessibility research); submits query and waits for results to render
- [ ] **SRCH-03**: Skill scroll-accumulates the result list to handle Outlook's virtual DOM (only ~20 items rendered at a time)
- [ ] **SRCH-04**: Skill accepts an optional result limit parameter (default: 20)
- [ ] **SRCH-05**: Search results are returned as a JSON array where each item contains: `id`, `subject`, `from`, `to`, `date`, `preview`, `is_read`, `is_flagged`

### Read Operation

- [ ] **READ-01**: Skill accepts an email identifier (from a prior search result) and opens that email using verified ARIA landmarks for the reading pane (established in Phase 0 accessibility research)
- [ ] **READ-02**: Skill extracts the full email body text via accessibility snapshot, scoped to the reading pane landmark to minimize token usage
- [ ] **READ-03**: Read result is returned as JSON containing: `subject`, `from`, `to`, `cc`, `date`, `body_text`, `has_attachments`, `attachment_names`

### Daily Digest Operation

- [ ] **DIGT-01**: Skill fetches today's inbox messages (using an `after: today` equivalent query)
- [ ] **DIGT-02**: Skill scores each message by importance using: unread status, flagged status, high-importance marker, urgency keywords in subject/preview
- [ ] **DIGT-03**: Digest result is returned as a JSON array sorted by importance score, each item including: `id`, `subject`, `from`, `date`, `preview`, `is_read`, `is_flagged`, `importance_score`, `importance_signals`

### Output Contract

- [ ] **OUT-01**: All operations write only valid JSON to stdout (no mixed status text)
- [ ] **OUT-02**: All JSON responses use a standard envelope: `{ "operation": "...", "status": "ok|error", "results": [...], "error": null|{ "code": "...", "message": "..." } }`
- [ ] **OUT-03**: Error codes include: `SESSION_INVALID`, `AUTH_REQUIRED`, `OPERATION_FAILED`, `INVALID_ARGS`

### Skill Packaging

- [ ] **PKG-01**: Skill is packaged with a `SKILL.md` that documents invocation syntax, JSON schemas, error codes, the read-only constraint, and pointers to all reference files — teaching the calling LLM everything it cannot be assumed to know from general training
- [ ] **PKG-02**: Skill is structured as a single `outlook.js` entry point with `search`, `read`, `digest`, and `auth` subcommands
- [ ] **PKG-03**: All agent-browser calls use `-q` and `--json` flags to ensure no non-JSON text reaches stdout
- [ ] **PKG-04**: `references/kql-syntax.md` — Outlook KQL operator reference with examples covering `from:`, `subject:`, `has:attachment`, `is:unread`, `is:flagged`, `before:`, `after:`, free-text keyword search, and operator combinations; SKILL.md instructs the calling agent to read this before constructing queries
- [ ] **PKG-05**: `references/error-recovery.md` — Documents what the calling agent should do for each error code: `SESSION_INVALID` (run `auth`, prompt user to re-login), `AUTH_REQUIRED` (run `auth --headed`), `OPERATION_FAILED` (retry once, then surface raw error to user)
- [ ] **PKG-06**: `references/digest-signals.md` — Documents the `importance_score` algorithm (0–100 scale, scoring weights) and all possible `importance_signals` values so the calling agent can describe and explain digest results in natural language
- [ ] **PKG-07**: `references/outlook-ui.md` — Documents verified ARIA landmarks, roles, and accessibility snapshot patterns for key Outlook web UI elements: search box, result list, individual result items, reading pane, attachment indicators, unread/flagged states; derived from Phase 0 interactive research sessions

## v2 Requirements

### Enhanced Data Extraction

- **READ-04**: Extract attachment metadata (name, size, type) in addition to presence flag
- **READ-05**: Preserve email threading context (thread ID, reply count)

### Robustness

- **AUTH-06**: Support storing the Outlook URL in `~/.outlook-skill/config.json` as a persistent user-level default
- **SAFE-05**: Detect and warn if a new MFA challenge appears mid-session (rather than returning a generic error)
- **SRCH-06**: Auto-detect whether user is on "Focused" or "All" inbox tab and normalize accordingly

### Personal Account Support

- **CFG-03**: Support `outlook.live.com` (personal Microsoft accounts) as an alternative to work M365 accounts

## Out of Scope

| Feature | Reason |
|---------|--------|
| Sending emails | Core read-only safety constraint — non-negotiable |
| Replying to emails | Same — read-only constraint |
| Deleting / archiving / moving emails | Same — read-only constraint |
| Accepting / declining calendar invites | Same — read-only constraint |
| Microsoft Graph API integration | User chose browser automation; avoids Azure app registration |
| MCP server interface | Personal assistant can only invoke CLI; MCP not available |
| Outlook desktop app automation | Skill targets Outlook web specifically |
| Real-time inbox monitoring / webhooks | CLI-invocation model; not a daemon |
| Attachment downloading | Out of scope for v1 — read body text only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-07 | Phase 0 | Pending |
| CFG-01 | Phase 1 | Pending |
| CFG-02 | Phase 1 | Pending |
| CFG-03 | Phase 1 | Pending |
| CFG-04 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| SAFE-01 | Phase 1 | Pending |
| SAFE-02 | Phase 1 | Pending |
| SAFE-03 | Phase 1 | Pending |
| SAFE-04 | Phase 1 | Pending |
| OUT-01 | Phase 1 | Pending |
| OUT-02 | Phase 1 | Pending |
| OUT-03 | Phase 1 | Pending |
| PKG-02 | Phase 1 | Pending |
| PKG-03 | Phase 1 | Pending |
| SRCH-01 | Phase 2 | Pending |
| SRCH-02 | Phase 2 | Pending |
| SRCH-03 | Phase 2 | Pending |
| SRCH-04 | Phase 2 | Pending |
| SRCH-05 | Phase 2 | Pending |
| READ-01 | Phase 3 | Pending |
| READ-02 | Phase 3 | Pending |
| READ-03 | Phase 3 | Pending |
| DIGT-01 | Phase 4 | Pending |
| DIGT-02 | Phase 4 | Pending |
| DIGT-03 | Phase 4 | Pending |
| PKG-01 | Phase 5 | Pending |
| PKG-04 | Phase 5 | Pending |
| PKG-05 | Phase 5 | Pending |
| PKG-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 34 total (28 original + PKG-04–07 + CFG-03–04)
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 — added CFG-03/04 (real browser executable + profile required for Entra); tightened SAFE-01 (policy before browser launch); updated AUTH-02 to require managed browser; added PKG-04–07 (LLM reference docs + accessibility research); updated SRCH-02, READ-01/02 for ARIA selectors*
