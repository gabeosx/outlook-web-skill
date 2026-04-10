# Technology Stack

**Project:** Outlook Web Skill
**Researched:** 2026-04-10
**Confidence:** HIGH (based on direct inspection of agent-browser SKILL.md, authentication.md, session-management.md, and PROJECT.md — web search unavailable)

---

## Recommended Stack

### Script Language: Bash (primary), with Node.js for JSON transformation

**Confidence: HIGH**

The agent-browser skill is already packaged as shell scripts (`templates/authenticated-session.sh`, `templates/capture-workflow.sh`). All agent-browser commands are CLI invocations. The skill implementation should be bash scripts that:

1. Invoke `agent-browser` commands in sequence
2. Capture stdout (snapshot text, `get text` output, `get url`)
3. Pipe to a lightweight JSON formatter
4. Print final JSON to stdout and exit

**Use bash for:** orchestration, session checks, auth flow branching, all agent-browser calls
**Use Node.js for:** JSON construction from scraped strings (jq is an alternative but Node is already present per `.claude/package.json`)

Avoid Python: not confirmed installed, unnecessary dependency. Avoid full Node.js scripts as the primary layer: shell is simpler, more debuggable, and matches the existing template convention.

---

### Claude Code Skill Packaging Convention

**Confidence: HIGH** (observed directly from `.claude/skills/agent-browser` symlink and `skills-lock.json`)

The convention in this project:

```
.agents/skills/<skill-name>/
  SKILL.md          ← frontmatter + documentation loaded by Claude
  references/       ← deep-dive docs
  templates/        ← reusable shell scripts

.claude/skills/<skill-name> → symlink to .agents/skills/<skill-name>
skills-lock.json    ← installed skill registry (source + hash)
```

The Outlook web skill should follow the same structure:

```
.agents/skills/outlook-web/
  SKILL.md          ← frontmatter declares allowed-tools + natural language triggers
  operations/
    search.sh       ← search operation
    read.sh         ← read single email
    digest.sh       ← daily digest
    auth-check.sh   ← check/initiate auth
  lib/
    to-json.js      ← JSON formatter (called from shell scripts)
    auth.sh         ← shared auth logic sourced by other scripts
```

The SKILL.md frontmatter format (from agent-browser SKILL.md):

```yaml
---
name: outlook-web
description: Read-only access to Outlook web inbox. Use when asked to read emails, search inbox, get email content, summarize today's emails, or check for messages from a sender. Returns structured JSON.
allowed-tools: Bash(bash .agents/skills/outlook-web/*:*)
---
```

The `allowed-tools` constraint is critical — it limits what Bash commands Claude can run through this skill.

---

### Session Persistence: `--session-name` (primary)

**Confidence: HIGH** (from authentication.md and session-management.md)

For Outlook web, use `--session-name outlook-web`. This auto-saves/restores cookies and localStorage to `~/.agent-browser/sessions/` on close.

**Why `--session-name` over alternatives:**

| Option | For Outlook web | Verdict |
|--------|-----------------|---------|
| `--session-name outlook-web` | Auto-saves cookies + localStorage on close. Zero file management. Works across invocations. | **USE THIS** |
| `--profile ~/.outlook-web-profile` | Persists everything (IndexedDB, service workers, cache). More durable for complex SPAs. | Secondary option if `--session-name` loses IndexedDB auth tokens |
| `--state ./auth.json` (manual) | Explicit save/load, more control but requires manual state save step | Fallback only |
| `--auto-connect` (import from running Chrome) | Good for first-time bootstrap: user is already logged in to Outlook in Chrome | Use for initial auth setup ONLY |

**Recommended auth strategy:**

```
Run 1 (first time):
  - Launch headed browser: agent-browser --headed --session-name outlook-web open https://outlook.office.com
  - Wait for user to complete MFA/SSO login
  - agent-browser close  (auto-saves state)

Run 2+ (subsequent):
  - agent-browser --session-name outlook-web open https://outlook.office.com/mail/
  - Check URL: if still on login page → session expired → re-run headed flow
  - Proceed with operations
```

**Encryption at rest:** Set `AGENT_BROWSER_ENCRYPTION_KEY` env var to encrypt session files. Document this as optional but recommended for enterprise accounts.

**Outlook-specific concern:** Microsoft 365 sessions typically last 1–24 hours depending on tenant Conditional Access policies. The skill must detect session expiry (URL contains `login.microsoftonline.com`) and gracefully prompt re-authentication rather than failing silently.

---

### JSON Output Format

**Confidence: HIGH** for format choice; MEDIUM for field names (no official standard found — LLM-consumable email JSON is not standardized)

**Use Node.js as JSON formatter** called from shell scripts:

```bash
# In shell script:
SNAPSHOT=$(agent-browser --session-name outlook-web snapshot -i --json)
echo "$SNAPSHOT" | node .agents/skills/outlook-web/lib/to-json.js search "$QUERY"
```

**Why Node.js over jq:**
- Complex string manipulation (email body parsing, date normalization) is painful in jq
- Node.js is confirmed present (`.claude/package.json` exists)
- `JSON.parse` + `JSON.stringify` are first-class, no quoting hazards
- Can be unit-tested independently of browser session

**Email JSON schema (recommended):**

```json
{
  "operation": "search",
  "query": "from:alice subject:report",
  "timestamp": "2026-04-10T09:00:00Z",
  "results": [
    {
      "id": "AAMkAGI2...",
      "subject": "Q1 Report",
      "from": { "name": "Alpha User", "email": "alice@example.com" },
      "to": [{ "name": "Bob", "email": "bob@example.com" }],
      "date": "2026-04-09T14:23:00Z",
      "preview": "Please find attached...",
      "hasAttachments": true,
      "isRead": false,
      "importance": "normal",
      "url": "https://outlook.office.com/mail/deeplink/..."
    }
  ],
  "count": 1,
  "error": null
}
```

For the `read` operation, add:
```json
{
  "operation": "read",
  "email": {
    "id": "...",
    "subject": "...",
    "body": "Full plain text body here...",
    "bodyHtml": null,
    "attachments": [{ "name": "report.pdf", "size": 45312 }]
  },
  "error": null
}
```

For the `digest` operation:
```json
{
  "operation": "digest",
  "date": "2026-04-10",
  "summary": {
    "total": 12,
    "unread": 3,
    "important": 1
  },
  "emails": [ /* same schema as search results */ ],
  "error": null
}
```

**Error envelope** (always present, null on success):
```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Session expired. Run with --headed to re-authenticate.",
    "retry": false
  }
}
```

This schema is LLM-consumable: flat, self-describing field names, ISO 8601 dates, no nested complexity beyond one level.

---

### Action Policy (Read-Only Enforcement)

**Confidence: HIGH** (from SKILL.md security section)

Create `policy.json` in the skill root:

```json
{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get", "scroll", "wait", "state", "session", "close"]
}
```

Apply via environment variable set in the skill scripts:

```bash
export AGENT_BROWSER_ACTION_POLICY="$(dirname "$0")/../policy.json"
```

This enforces read-only at the browser level — even if Claude somehow constructs a `fill` or `click` command targeting a destructive element, agent-browser will reject it.

**Domain allowlist:**

```bash
export AGENT_BROWSER_ALLOWED_DOMAINS="outlook.office.com,*.outlook.office.com,login.microsoftonline.com,*.microsoftonline.com,*.office365.com"
```

Include `login.microsoftonline.com` because SSO redirects go through Microsoft's identity platform. Include the login domains so the auth check flow can detect and handle redirect to login pages.

---

### Content Boundaries (Prompt Injection Defense)

**Confidence: HIGH** (from SKILL.md security section)

Enable content boundaries to prevent Outlook email content from being interpreted as agent-browser commands or Claude instructions:

```bash
export AGENT_BROWSER_CONTENT_BOUNDARIES=1
```

This wraps page-sourced output in `--- AGENT_BROWSER_PAGE_CONTENT nonce=<hex> ---` markers. The `to-json.js` formatter must strip these markers before constructing JSON output.

---

### Output Size Limits

**Confidence: HIGH**

Set `AGENT_BROWSER_MAX_OUTPUT=100000` (100KB) to prevent context flooding from large inboxes. For the `read` operation on long emails, consider 200KB. The JSON formatter should truncate body text at ~10,000 characters and note truncation in the output.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Script language | Bash + Node.js | Pure Python | Python not confirmed present; adds dependency |
| Script language | Bash + Node.js | Pure Node.js | Shell is simpler for CLI orchestration; templates already use bash |
| Session persistence | `--session-name` | `--profile` | `--session-name` requires less manual management; `--profile` is a fallback |
| Session persistence | `--session-name` | Manual `state save/load` | Manual approach requires explicit save step; `--session-name` is automatic |
| JSON construction | Node.js | jq | jq struggles with complex string manipulation; Node.js is already available |
| Auth bootstrap | `--headed` interactive | `--auto-connect` from existing Chrome | `--auto-connect` requires Chrome to be running with remote debugging; `--headed` is self-contained |
| Read-only enforcement | action policy JSON | Trust-based (no enforcement) | Trust-based is insufficient for safety boundary; policy enforces at browser level |

---

## Key Environment Variables

The skill scripts should export these (documented in SKILL.md, set at invocation time or in a `.env` equivalent):

```bash
# Required
AGENT_BROWSER_SESSION_NAME=outlook-web        # or set via --session-name flag

# Recommended
AGENT_BROWSER_ENCRYPTION_KEY=<hex>            # Encrypt session state at rest
AGENT_BROWSER_CONTENT_BOUNDARIES=1           # Prompt injection defense
AGENT_BROWSER_ALLOWED_DOMAINS="outlook.office.com,*.outlook.office.com,login.microsoftonline.com,*.microsoftonline.com"
AGENT_BROWSER_ACTION_POLICY=./policy.json    # Read-only enforcement
AGENT_BROWSER_MAX_OUTPUT=100000              # Prevent context flooding
AGENT_BROWSER_DEFAULT_TIMEOUT=30000         # 30s (Outlook SPA can be slow)

# Debug only
AGENT_BROWSER_HEADED=1                       # Show browser (use for auth setup)
```

---

## Sources

- `/Users/username/outlook-web-skill/.agents/skills/agent-browser/SKILL.md` — agent-browser CLI reference (direct inspection, HIGH confidence)
- `/Users/username/outlook-web-skill/.agents/skills/agent-browser/references/authentication.md` — auth patterns (direct inspection, HIGH confidence)
- `/Users/username/outlook-web-skill/.agents/skills/agent-browser/references/session-management.md` — session patterns (direct inspection, HIGH confidence)
- `/Users/username/outlook-web-skill/.planning/PROJECT.md` — requirements and constraints (direct inspection, HIGH confidence)
- `.claude/skills/agent-browser` symlink structure — observed skill packaging convention (direct inspection, HIGH confidence)
- `skills-lock.json` — skill registry format (direct inspection, HIGH confidence)
- Email JSON schema: synthesized from project requirements; no authoritative standard for LLM-consumable email JSON exists (MEDIUM confidence — field names are conventional, not standardized)
