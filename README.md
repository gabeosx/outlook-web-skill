# outlook-web-skill

A command-line tool that gives an AI assistant **read-only access to your Outlook web inbox** — no Microsoft Graph API, no app registration, no OAuth dance. It drives a real Chrome session the same way you would, and returns structured JSON that any AI can parse.

Works with Claude Code, Codex, Gemini, or any AI that can run shell commands.

```bash
npx skills add gabeosx/outlook-web-skill
```

---

## Why this exists

Microsoft's Graph API requires an app registration, admin consent, and periodic token refresh — significant overhead for personal productivity use. This tool takes a different approach: it reuses the Chrome session where you're already logged in to Outlook, navigates the web UI programmatically, and extracts what you need as clean JSON.

The tradeoff is that it's tightly coupled to the Outlook web UI. If Microsoft redesigns the inbox, selectors may need updating. But for personal daily use it's fast to set up and requires zero IT involvement.

**What it can do:**
- Search your inbox with KQL queries (sender, subject, date range, attachments, read/unread)
- Read the full body, subject, recipients, and attachments of any email
- Return a prioritized digest of today's inbox sorted by importance score
- Recalibrate the scoring algorithm when rankings seem off

**What it will never do:** send, reply, delete, move, flag, forward, or accept/decline anything. This is enforced at the browser layer with an action policy — not just by convention.

---

## How it works

```
Your AI assistant
  │
  │  runs
  ▼
node outlook.js <subcommand>
  │
  │  drives Chrome via
  ▼
@vercel/agent-browser (CDP)
  │
  │  navigates to
  ▼
Outlook web (your existing login session)
  │
  │  returns
  ▼
JSON → stdout
```

Uses [`@vercel/agent-browser`](https://github.com/vercel-labs/agent-browser) to control Chrome via the Chrome DevTools Protocol. Your existing Entra SSO session (cookies + localStorage) is reused across invocations via a named session stored in `~/.agent-browser/sessions/`.

---

## Prerequisites

- **Node.js** — v18 or later
- **agent-browser CLI** — install globally:
  ```bash
  npm install -g agent-browser
  agent-browser install   # downloads a Chromium build
  ```
- **Chrome or Edge** with a profile where you're logged in to Outlook web (used for the initial auth bootstrap)

---

## Setup

### 1. Install and configure

**Via npx skills (recommended):**

```bash
npx skills add gabeosx/outlook-web-skill
cd .claude/skills/outlook-web-skill
cp .env.example .env
```

**Via git clone:**

```bash
git clone https://github.com/gabeosx/outlook-web-skill
cd outlook-web-skill
cp .env.example .env
```

Edit `.env`:

```bash
# Your Outlook web URL — the URL you see after logging in
OUTLOOK_BASE_URL=https://outlook.office.com/mail/0/

# Path to Chrome or Edge binary
OUTLOOK_BROWSER_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# A dedicated Chrome profile directory for this tool's session
# (will be created on first run — keep separate from your daily Chrome profile)
OUTLOOK_BROWSER_PROFILE=~/.outlook-skill-profile
```

Tilde expansion in `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE` is handled automatically.

### 2. Configure digest scoring (optional)

```bash
cp scoring.json.example scoring.json
```

Edit `scoring.json` to add urgency keywords relevant to your work (project names, deadlines, key contacts). The defaults are a reasonable starting point. See [Digest Scoring](#digest-scoring) for details.

### 3. Authenticate

Run this from the directory where you installed the skill:

```bash
node outlook.js auth
```

This opens a visible Chrome window pointed at your `OUTLOOK_BASE_URL`. Log in normally, including MFA. When you reach your inbox, close the browser or wait — the session is saved automatically to `~/.agent-browser/sessions/` and reused on every future invocation without opening a browser.

Re-run `auth` whenever your session expires (typically after days to weeks depending on your organization's Entra policy).

---

## Subcommands

### `auth` — Check or renew session

```bash
node outlook.js auth
```

Checks whether the saved session is still valid. If it is, returns immediately (no browser opened). If it's expired, opens a headed browser for login. Safe to run as a pre-flight check before any other subcommand.

```json
{"operation": "auth", "status": "ok", "results": null, "error": null}
```

---

### `search` — Find emails by query

```bash
node outlook.js search "<query>" [--limit <n>]
```

Searches your inbox using a KQL query. Returns up to `--limit` results (default: 20).

```bash
node outlook.js search "from:alice@example.com"
node outlook.js search "subject:budget is:unread"
node outlook.js search "hasattachment:true after:2024-01-01"
node outlook.js search "project alpha"              # free-text search
node outlook.js search "is:unread" --limit 50
```

**Response:**

```json
{
  "operation": "search",
  "status": "ok",
  "results": [
    {
      "id": "AAQkADM...",
      "from": "User, Alpha — Re: Q1 Budget Review",
      "subject": "",
      "date": "Mon 4/7/2026",
      "preview": "Here is the document you requested...",
      "is_read": false,
      "is_flagged": null,
      "to": null
    }
  ],
  "count": 1,
  "error": null
}
```

> **Note:** `subject` is always `""` in search results — the Outlook list view combines sender and subject into a single field, which appears in `from`. To get the actual subject line, pass the `id` to `read`.

See [KQL Syntax](#kql-syntax) for supported operators.

---

### `read` — Fetch full email content

```bash
node outlook.js read <id> [--query <search-query>]
```

Fetches the full body, subject, recipients, and attachment list for an email. The `id` is the `ConversationId` from a `search` or `digest` result — pass it unchanged.

Pass `--query` with the same KQL string used to find the email. This helps `read` locate the email in context and is especially important for older messages.

```bash
node outlook.js read "AAQkADM..." --query "from:alice@example.com"
```

**Response:**

```json
{
  "operation": "read",
  "status": "ok",
  "results": {
    "subject": "Q1 Budget Review",
    "from": "User, Alpha <alice@example.com>",
    "to": "You; Bob Jones",
    "cc": "Manager, Jane",
    "date": "Mon 4/7/2026 9:15 AM",
    "body_text": "Hi team,\nPlease review the attached...",
    "has_attachments": true,
    "attachment_names": ["Q1_Budget.xlsx"]
  },
  "error": null
}
```

> **Note:** `results` is a single object for `read` (not an array). `subject` is populated here — it's always empty in `search`/`digest`.

---

### `digest` — Today's inbox, sorted by importance

```bash
node outlook.js digest
```

Reads the "Today" group from your inbox view and returns emails sorted by importance score (highest first). Useful as a morning briefing: "what actually needs my attention today?"

```json
{
  "operation": "digest",
  "status": "ok",
  "results": [
    {
      "id": "AAQkADM...",
      "from": "User, Alpha — Action Required: Q2 Planning",
      "subject": "",
      "date": "4/12/2026",
      "preview": "Please review before EOD...",
      "is_read": false,
      "is_flagged": null,
      "importance_score": 85,
      "importance_signals": ["unread", "high_importance", "keyword:eod"]
    }
  ],
  "count": 1,
  "error": null
}
```

If results are empty, no "Today" group was visible in the current inbox view. Fall back to `search "is:unread"`.

See [Digest Scoring](#digest-scoring) for how scores are calculated.

---

### `tune` — Recalibrate scoring

```bash
node outlook.js tune [--save]
```

Samples your inbox across 25 queries and grades the current scoring config. Returns a tier distribution report — if too many emails are landing in high-priority tiers (Tier 3–4 > 25%), your keywords or weights may need adjustment.

- Grade report → **stderr** (human-readable)
- JSON envelope → **stdout** (machine-readable)
- `--save` → writes the effective config to `scoring.json`

**Verdict thresholds:**

| Verdict | Tier 3+4 share |
|---------|----------------|
| `PASS` | ≤ 25% |
| `WARN` | 26–40% |
| `FAIL` | > 40% |

---

## Response envelope

Every subcommand writes a single JSON line to stdout:

```json
{
  "operation": "search",
  "status": "ok",
  "results": [...],
  "error": null
}
```

- **Exit code 0** — `status` is `"ok"` or `"error"` — always parse stdout
- **Exit code 1** — `status` is `"error"` — JSON still on stdout; always parse it
- **Diagnostic logs** → stderr only, safe to discard

If stdout is empty and exit code is non-zero, a Node.js crash occurred before the error handler ran — surface stderr to the user.

---

## Error codes

| Code | When | Recovery |
|------|------|----------|
| `INVALID_ARGS` | Startup, search, read | Missing `.env` var, unknown subcommand, or missing required argument — fix config, do not retry |
| `SESSION_INVALID` | Search, read, digest | Session expired — run `auth`, then retry the original command |
| `AUTH_REQUIRED` | Session check | Session absent — run `auth` |
| `OPERATION_FAILED` | Read, digest, auth | Browser timeout or empty snapshot — retry once; if it recurs, surface `error.message` |
| `MESSAGE_NOT_FOUND` | Read only | Email ID not found — retry with `--query` flag from the original search |

Full step-by-step recovery trees are in [`references/error-recovery.md`](references/error-recovery.md).

---

## KQL syntax

Supported operators (tested and confirmed working):

| Operator | Example |
|----------|---------|
| Sender address | `from:alice@example.com` |
| Subject word/phrase | `subject:budget` · `subject:"Q1 budget"` |
| Has attachment | `hasattachment:true` |
| Unread | `is:unread` |
| Flagged | `is:flagged` |
| Before date | `before:2024-01-01` |
| After date | `after:2024-01-01` |
| Free-text | `project alpha kickoff` |

Dates must be `YYYY-MM-DD`. Combining operators with spaces (implicit AND) and `OR`/`NOT` follows standard KQL rules but has not been tested on every tenant — start simple if a compound query returns unexpected results.

Full reference: [`references/kql-syntax.md`](references/kql-syntax.md)

---

## Digest scoring

Each email in a `digest` result has an `importance_score` (0–100) and an `importance_signals` array explaining why it scored that way.

**Score ranges:**

| Range | Label |
|-------|-------|
| 80–100 | Critical |
| 60–79 | High |
| 40–59 | Medium |
| 20–39 | Low |
| 0–19 | Noise / automated |

**Signals and their weights** (defaults from `scoring.json.example`):

| Signal | Points | Condition |
|--------|--------|-----------|
| `unread` (human sender) | +40 | Unread email from a real person |
| `unread` (channel/group) | +20 | Unread email from a group or distribution list |
| `high_importance` | +40 | Outlook high-importance flag |
| `keyword:<word>` | +5 each | Subject/preview matches an urgency keyword (max +20) |

Emails matching bulk patterns (`noreply`, `newsletter`, `unsubscribe`, etc.) are suppressed to score 0 regardless of other signals.

To tune for your inbox: add urgency keywords to `scoring.json`, then run `node outlook.js tune` to see the effect before committing with `--save`. Full reference: [`references/digest-signals.md`](references/digest-signals.md).

---

## AI assistant integration

The tool is a plain CLI — any AI assistant that can run shell commands can use it.

### Install with npx skills (recommended)

[`npx skills`](https://github.com/vercel-labs/skills) is the standard package manager for AI agent skills. It works with Claude Code, Cursor, OpenCode, GitHub Copilot, and 40+ other assistants.

```bash
# Install into the current project
npx skills add gabeosx/outlook-web-skill

# Or install globally (available in all projects)
npx skills add gabeosx/outlook-web-skill --global
```

This copies the skill files into `.claude/skills/outlook-web-skill/` (or the equivalent directory for your AI assistant). Then complete the [Setup](#setup) steps to configure `.env` and authenticate — the CLI files are already in place.

Manage installed skills:
```bash
npx skills list                              # see what's installed
npx skills update gabeosx/outlook-web-skill  # pull latest changes
npx skills remove outlook-web-skill          # uninstall
```

### Manual install (Claude Code)

`SKILL.md` at the repo root is a Claude Code skill descriptor. Place it (and the `references/` directory) at `.claude/skills/outlook-web/` inside your Claude Code project, with `outlook.js` and `lib/` accessible from the same directory:

```
your-project/
  .claude/
    skills/
      outlook-web/
        SKILL.md          ← skill descriptor (copy or symlink)
        references/       ← reference docs (copy or symlink)
        outlook.js        ← symlink to the CLI entry point
        lib/              ← symlink to the lib directory
```

### Other AI assistants (Codex, Gemini, etc.)

Include the contents of `SKILL.md` in your system prompt, or summarize it as tool documentation. The assistant calls `node outlook.js <subcommand>` directly as a shell command. The `references/` files (`kql-syntax.md`, `error-recovery.md`, `digest-signals.md`) can be included as additional context.

---

## Safety

The action policy (`policy-read.json`, `policy-search.json`, `policy-auth.json`) is enforced at the `agent-browser` layer with `"default": "deny"`. Only `navigate`, `snapshot`, `get`, `scroll`, `wait`, `click`, `fill`, `press`, and `evaluate` actions are permitted — the exact set needed for reading. Any action not on the allowlist is rejected before it reaches the browser.

This means even if a prompt injection in an email body instructed the assistant to reply or delete, the browser layer would refuse the attempt regardless of what the AI tries to do.

---

## Limitations

- **UI coupling** — relies on Outlook web's ARIA structure and CSS selectors. Microsoft UI updates may require selector maintenance.
- **Subject field** — the Outlook list view doesn't expose subject and sender separately; `search` and `digest` results have an empty `subject`. Use `read` to get the actual subject.
- **"Today" group** — `digest` reads only the Today group visible in the current inbox view. If your inbox is heavily filtered or grouped differently, results may be incomplete.
- **Multi-tenant** — tested on a single Outlook tenant. Different organizations may have slightly different UI configurations.
- **Attachments** — names are listed but content is not downloaded.

---

## Project structure

```
outlook.js              Entry point — env validation, subcommand dispatch
lib/
  session.js            Auth flow and session management
  search.js             KQL search implementation
  read.js               Full email reader
  digest.js             Inbox digest with scoring
  tune.js               Scoring calibration
  output.js             JSON envelope helpers
  run.js                agent-browser wrapper with action policy
policy-auth.json        Action allowlist for auth operations
policy-read.json        Action allowlist for read operations
policy-search.json      Action allowlist for search/digest operations
scoring.json.example    Default scoring config — copy to scoring.json
SKILL.md                Claude Code skill descriptor
references/
  kql-syntax.md         KQL operator reference
  error-recovery.md     Error code decision trees
  digest-signals.md     Scoring algorithm documentation
  outlook-ui.example.md Template for capturing tenant UI snapshots
```

---

## License

MIT
