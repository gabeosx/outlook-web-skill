---
name: outlook-web
description: Read-only access to Outlook web email and Microsoft Teams. Use when the user needs to search emails, read an email, get a prioritized digest of today's inbox, check Teams activity/mentions, or get a Copilot-generated summary. Triggers include "check my email", "find email from", "read that email", "what's in my inbox today", "check Teams", "Teams mentions", "copilot summary", or any request to access, search, or summarize Outlook email or Teams messages. NEVER use for sending, replying, deleting, or any write operation.
allowed-tools: Bash(node outlook.js:*)
---

# Outlook Web Skill

Reads the user's Outlook web inbox and Microsoft Teams via a managed Chrome session — no Microsoft Graph API, no app registration. Invoke via `node outlook.js <subcommand>` from the skill root directory. This skill will NEVER send, delete, move, reply to, forward, flag, unflag, accept, or decline any email, Teams message, or calendar item.

## Safety Constraint: Read-Only

This skill enforces an Action Policy with `default: deny`. Only snapshot, navigation, and read operations are permitted at the browser layer. The calling agent MUST NOT attempt to use this skill to send, reply, delete, move, flag, or accept/decline anything — these operations are blocked at the browser level, not just by convention.

## Setup

Create a `.env` file at the skill root (add `.env` to `.gitignore` — it contains paths to credentials):

```bash
OUTLOOK_BASE_URL=https://your-company.com/mail   # Full URL of your Outlook web inbox
OUTLOOK_BROWSER_PATH=/path/to/managed/chrome     # Path to managed Chrome or Edge binary (tilde ok)
OUTLOOK_BROWSER_PROFILE=/path/to/chrome/profile  # Path to Chrome profile with Entra SSO tokens (tilde ok)
```

Tilde expansion (`~`) in `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE` is handled automatically.

**Scoring configuration:**
```bash
cp scoring.json.example scoring.json  # Edit to customize keyword weights for digest scoring
```

**First-time auth** (opens headed browser; complete login including MFA; session saved automatically):
```bash
node outlook.js auth
```

Session is saved to `~/.agent-browser/sessions/` and reused across all future invocations.

## Response Envelope

All subcommands return a single JSON line to stdout:

```json
{
  "operation": "search",   // subcommand name
  "status": "ok",          // "ok" or "error"
  "results": [...],         // array, single object, or null — shape varies by subcommand
  "error": null             // null on success; {"code": "...", "message": "..."} on error
}
```

**Exit codes:**
- `0` — JSON written to stdout; always check the `status` field
- `1` — JSON written to stdout with `{"status":"error",...}`; always parse stdout regardless of exit code

Note: In the rare case of a Node.js crash before `outputError()` runs (e.g., a syntax error in the skill itself), stdout may be empty. If stdout is empty and exit code is non-zero, surface the stderr output to the user.

Diagnostic logs go to **stderr only** and are safe to discard.

## Subcommands

### auth

```bash
node outlook.js auth
```

Checks session validity. If the session is already valid, returns immediately without opening a browser (idempotent — safe to run as a pre-flight check before any other subcommand). If the session is invalid or expired, opens a headed Chrome window for the user to complete login including MFA.

```json
{"operation": "auth", "status": "ok", "results": null, "error": null}
```

Note: If the headed browser fails to launch, auth returns `OPERATION_FAILED` (not `AUTH_REQUIRED`).

---

### search

```bash
node outlook.js search "<kql-query>" [--limit <n>]
```

- `<kql-query>` — KQL query string (required). **Read `references/kql-syntax.md` before constructing any query.**
- `--limit <n>` — Maximum results to return (default: 20)

```json
{
  "operation": "search",
  "status": "ok",
  "results": [
    {
      "id": "AAQkADM...",       // ConversationId — pass to 'read' unchanged
      "from": "Smith, Alice",  // WARNING: contains combined sender+subject text from list view
      "subject": "",           // ALWAYS empty string — subject only available via 'read'
      "date": "Mon 4/7/2026",
      "preview": "Here is the document you requested...",
      "is_read": false,
      "is_flagged": null,      // ALWAYS null — not determinable from list view
      "to": null               // ALWAYS null — only visible in reading pane
    }
  ],
  "count": 1,
  "error": null
}
```

**Critical notes:**
- `subject` is ALWAYS `""`. The combined sender+subject text from the Outlook list view is in `from`. To get the actual subject line, call `read` with the email's `id`.
- `id` is a ConversationId (`data-convid`). Pass it directly to `read` without modification.
- Zero results returns `{"status":"ok","results":[],"count":0}` — this is not an error.

---

### read

```bash
node outlook.js read <id> [--query <search-query>]
```

- `<id>` — ConversationId from a prior `search` or `digest` result (required)
- `--query <search-query>` — Optional but recommended. Pass the KQL query from the preceding search so `read` can locate the email in context. Without this flag, `read` uses a broad search; emails from weeks ago may not appear in the results list.

```json
{
  "operation": "read",
  "status": "ok",
  "results": {
    "subject": "Q1 Budget Review",
    "from": "Smith, Alice <alice@example.com>",
    "to": "You; Bob Jones",
    "cc": "Manager, Jane",           // null when no CC recipients
    "date": "Mon 4/7/2026 9:15 AM",
    "body_text": "Hi team,\nPlease review the attached...",
    "has_attachments": true,
    "attachment_names": ["Q1_Budget.xlsx"]  // empty array when no attachments
  },
  "error": null
}
```

Note: `results` is a **single object** (not an array) for `read`. `subject` is populated here — unlike `search` and `digest`.

---

### digest

```bash
node outlook.js digest
```

Fetches today's inbox messages and returns them sorted by importance score (descending). Reads only the "Today" group from the inbox view. See `references/digest-signals.md` for scoring explanation and natural-language templates.

```json
{
  "operation": "digest",
  "status": "ok",
  "results": [
    {
      "id": "AAQkADM...",
      "from": "Smith, Alice",           // same combined sender+subject as search
      "subject": "",                    // ALWAYS empty string
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

Note: Empty results (`[]`) means no "Today" group was found in the current inbox view — not necessarily an empty inbox. Try `node outlook.js search "is:unread"` as a fallback.

---

### tune

```bash
node outlook.js tune [--save]
```

Samples the inbox across multiple queries and grades the current scoring configuration. Returns tier distribution (Tier 0 = low noise/automated through Tier 4 = critical). Use when digest rankings seem miscalibrated.

- `--save` — Writes the effective configuration to `scoring.json`
- Grade report is written to **stderr**; the JSON envelope goes to stdout

**Verdict values:** `PASS` (Tier 3+4 ≤ 25%), `WARN` (26–40%), `FAIL` (>40%)

```json
{
  "operation": "tune",
  "status": "ok",
  "query_count": 25,
  "message_count": 87,
  "tier_distribution": [
    {"tier": 0, "label": "Tier 0 — Low noise (automated/bulk)", "count": 12, "percent": 13.8},
    {"tier": 1, "label": "Tier 1 — Low", "count": 30, "percent": 34.5},
    {"tier": 2, "label": "Tier 2 — Medium", "count": 20, "percent": 23.0},
    {"tier": 3, "label": "Tier 3 — High", "count": 18, "percent": 20.7},
    {"tier": 4, "label": "Tier 4 — Critical", "count": 7, "percent": 8.0}
  ],
  "verdict": "PASS",
  "effective_scoring_config": {"scoring_weights": {"unread_human": 40}, "...": "..."},
  "results": ["<array of scored messages>"],
  "error": null
}
```

### teams

```bash
node outlook.js teams [--mentions] [--unread] [--limit <n>]
```

Fetches Microsoft Teams activity from `teams.microsoft.com` (web). Three modes:

- **(default)** — Activity feed: all recent notifications (mentions, replies, reactions, messages)
- `--mentions` — Filter to @mentions only
- `--unread` — Unread chats only (navigates to Chat view)
- `--limit <n>` — Maximum results (default: 30)

```json
{
  "operation": "teams",
  "status": "ok",
  "mode": "activity",
  "results": [
    {
      "sender": "Smith, Alice",
      "channel": "Project Alpha",
      "preview": "Can you review the proposal by EOD?",
      "time": "2h ago",
      "type": "mention"
    }
  ],
  "count": 1,
  "error": null
}
```

**Type values:** `mention`, `reply`, `reaction`, `message`, `notification`

For `--unread` mode, results have a different shape:
```json
{
  "name": "Smith, Alice",
  "preview": "Latest message preview...",
  "time": "10:30 AM",
  "has_unread": true
}
```

**Note:** Teams uses the same Entra SSO as Outlook. If auth fails, run `node outlook.js auth` and ensure your browser profile has Teams cookies. Set `TEAMS_BASE_URL` in `.env` if your org uses a custom Teams URL (defaults to `https://teams.microsoft.com`).

---

### copilot-summary

```bash
node outlook.js copilot-summary [--type email|teams|both] [--since "<date>"] [--prompt "<custom>"]
```

Navigates to Copilot in Teams web, sends a focused prompt, and captures the AI-generated summary response. This is the only subcommand that interacts with Copilot — all other subcommands scrape the UI directly.

- `--type` — What to summarize: `email`, `teams`, or `both` (default: `both`)
- `--since` — Time window: `"April 10, 2026"`, `"yesterday"`, etc. (default: last 24 hours)
- `--prompt` — Override with a custom Copilot prompt (replaces the built-in template)

```json
{
  "operation": "copilot-summary",
  "status": "ok",
  "type": "both",
  "raw_response": "EMAILS:\n1. Alice Smith | Q2 Budget Review | Apr 12 | Needs approval by EOD | yes - approve\n...",
  "items": [
    {
      "sender": "Alice Smith",
      "subject": "Q2 Budget Review",
      "date": "Apr 12",
      "summary": "Needs approval by EOD",
      "action": "yes - approve"
    }
  ],
  "count": 1,
  "error": null
}
```

**Critical notes:**
- `raw_response` always contains the full Copilot output text — use this if `items` parsing misses anything.
- `items` is a best-effort parse of Copilot's pipe-delimited format. Copilot does not always comply with the format — fall back to `raw_response`.
- Copilot generation takes 10-30 seconds. The skill polls up to 6 times (5s each) waiting for completion.
- If the Researcher plugin auto-attaches, the skill attempts to remove it (it causes 5-10 min delays and crashes).
- Copilot truncates at ~25 items. For large time windows, use two separate calls with split date ranges.

---

## Error Codes

| Code | When emitted | Meaning |
|------|-------------|---------|
| `INVALID_ARGS` | startup, search, read | Missing env var, missing subcommand, or missing required argument |
| `SESSION_INVALID` | search, read, digest, teams, copilot-summary | Session expired mid-operation — run `auth`, then retry the original operation |
| `AUTH_REQUIRED` | session check | Session absent (per REQUIREMENTS; in practice `SESSION_INVALID` is the operational code) |
| `OPERATION_FAILED` | read, digest, auth, teams, copilot-summary | Browser error, timeout, or empty snapshot — retry once; if still fails, surface `error.message` to user |
| `MESSAGE_NOT_FOUND` | read only | Email with given `id` not found in search results — pass `--query` flag with the original search query |

For full recovery decision trees, read `references/error-recovery.md`.

## Reference Files

| File | Read when |
|------|-----------|
| `references/kql-syntax.md` | **BEFORE constructing any search query** — covers all supported operators, date format, free-text, AND/OR/NOT |
| `references/error-recovery.md` | When an error code is returned — step-by-step recovery paths for each code |
| `references/digest-signals.md` | When explaining digest results to the user — scoring weights, all signal values, natural language templates |
| `references/outlook-ui.md` | NOT needed for invocation — internal ARIA selector documentation for skill maintainers |
