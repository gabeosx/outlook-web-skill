# Requirements: Outlook Web Skill

**Defined:** 2026-04-10
**Core Value:** A personal assistant Claude Code instance can reliably read and search the user's Outlook inbox without ever sending, deleting, or mutating anything.

## v1 Requirements

### Configuration

- [ ] **CFG-01**: User can configure their Outlook web base URL (e.g., `https://mail.example.com`) via a config file or environment variable
- [ ] **CFG-02**: Configuration is read at skill invocation time, not hardcoded

### Authentication & Session

- [ ] **AUTH-01**: Skill detects auth state by navigating to the configured Outlook URL and checking whether the landing URL redirects to a Microsoft login page
- [ ] **AUTH-02**: When session is invalid, skill launches a visible (`--headed`) browser so the user can complete login (including MFA/SSO) interactively
- [ ] **AUTH-03**: After successful human login, skill persists session via `--session-name outlook-skill` (auto-saves to `~/.agent-browser/sessions/`)
- [ ] **AUTH-04**: On subsequent invocations, skill restores session automatically without human interaction
- [ ] **AUTH-05**: Skill detects session expiry mid-operation and returns a structured `SESSION_INVALID` JSON error rather than crashing

### Read-Only Safety

- [ ] **SAFE-01**: All agent-browser invocations use an Action Policy file that sets `default: deny` and allows only `navigate`, `snapshot`, `get`, `wait`, `scroll`, `close`, `state`, `session`
- [ ] **SAFE-02**: `AGENT_BROWSER_ALLOWED_DOMAINS` is set to the configured Outlook domain to prevent navigation outside it
- [ ] **SAFE-03**: `AGENT_BROWSER_CONTENT_BOUNDARIES=1` is set on all operations to prevent prompt injection from email content reaching the calling agent
- [ ] **SAFE-04**: Skill rejects any subcommand other than `search`, `read`, `digest`, and `auth` at the CLI argument level before touching the browser

### Search Operation

- [ ] **SRCH-01**: Skill accepts a KQL query string (supporting `from:`, `subject:`, `has:attachment`, `is:unread`, `is:flagged`, `before:`, `after:` operators)
- [ ] **SRCH-02**: Skill types the query into the Outlook search box (`role="searchbox"`), submits it, and waits for results to render
- [ ] **SRCH-03**: Skill scroll-accumulates the result list to handle Outlook's virtual DOM (only ~20 items rendered at a time)
- [ ] **SRCH-04**: Skill accepts an optional result limit parameter (default: 20)
- [ ] **SRCH-05**: Search results are returned as a JSON array where each item contains: `id`, `subject`, `from`, `to`, `date`, `preview`, `is_read`, `is_flagged`

### Read Operation

- [ ] **READ-01**: Skill accepts an email identifier (from a prior search result) and opens that email in the reading pane
- [ ] **READ-02**: Skill extracts the full email body text via accessibility snapshot
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

- [ ] **PKG-01**: Skill is packaged with a `SKILL.md` that documents invocation syntax, JSON schemas, error codes, and the read-only constraint
- [ ] **PKG-02**: Skill is structured as a single `outlook.js` entry point with `search`, `read`, `digest`, and `auth` subcommands
- [ ] **PKG-03**: All agent-browser calls use `-q` and `--json` flags to ensure no non-JSON text reaches stdout

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
| CFG-01 | Phase 1 | Pending |
| CFG-02 | Phase 1 | Pending |
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

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
