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
- List upcoming calendar events for the next N days
- Read full event details including attendees and Teams/Zoom meeting links
- Search calendar events by keyword or date range
- Fetch Microsoft Teams activity feed, @mentions, and unread chats
- Get AI-generated summaries of emails and Teams messages from Copilot in Teams

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

**Finding your Chrome executable and profile path:** Open Chrome and navigate to `chrome://version/`. The **Executable Path** field gives you `OUTLOOK_BROWSER_PATH`. The **Profile Path** field shows your current profile directory — you can use that path (or a subdirectory next to it) for `OUTLOOK_BROWSER_PROFILE`. Keep the profile separate from your daily Chrome profile to avoid session conflicts.

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
node outlook.js search "<query>" [--limit <n>] [--folder <name>]
```

Searches your inbox using a KQL query. Returns up to `--limit` results (default: 20).

```bash
node outlook.js search "from:alice@example.com"
node outlook.js search "subject:budget is:unread"
node outlook.js search "hasattachment:true after:2024-01-01"
node outlook.js search "project alpha"              # free-text search
node outlook.js search "is:unread" --limit 50
node outlook.js search "from:alice" --folder sent       # search Sent Items
node outlook.js search "subject:draft" --folder drafts  # search Drafts
node outlook.js search "is:unread" --folder "Junk Email" # search with exact name
```

> **Folder aliases:** `sent` -> Sent Items, `drafts` -> Drafts, `inbox` -> Inbox, `deleted`/`trash` -> Deleted Items, `junk`/`spam` -> Junk Email, `archive` -> Archive. Multi-word names like `"Sent Items"` require shell quoting; aliases avoid this. Custom folder names are passed through as-is.

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
node outlook.js digest [--folder <name>]
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

```bash
node outlook.js digest --folder sent    # today's digest from Sent Items
```

> **Note:** `digest --folder` reads the "Today" group from the target folder. Folders without a "Today" group (e.g., Sent Items when no messages were sent today) return empty results — this is not an error.

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

### `calendar` — List upcoming events

```bash
node outlook.js calendar [--days <n>]
```

Lists calendar events within the next N days (default: 7), sorted chronologically. `--days 1` returns today only; `--days 30` returns the next month.

```bash
node outlook.js calendar             # next 7 days
node outlook.js calendar --days 1    # today only
node outlook.js calendar --days 30   # next month
```

**Response:**

```json
{
  "operation": "calendar",
  "status": "ok",
  "results": [
    {
      "id": "{\"subject\":\"Weekly Standup\",\"start_time\":\"2026-04-14T09:00:00.000Z\"}",
      "subject": "Weekly Standup",
      "organizer": "User, Alpha",
      "start_time": "2026-04-14T09:00:00.000Z",
      "end_time": "2026-04-14T09:30:00.000Z",
      "duration_minutes": 30,
      "location": "Microsoft Teams Meeting",
      "is_online_meeting": true,
      "is_all_day": false,
      "is_recurring": true,
      "response_status": "accepted"
    }
  ],
  "count": 1,
  "error": null
}
```

> **Note:** `id` is a composite key — pass it unchanged to `calendar-read`. Do not construct IDs manually. Empty results is not an error.

See [`references/calendar-events.md`](references/calendar-events.md) for full field documentation.

---

### `calendar-read` — Fetch full event details

```bash
node outlook.js calendar-read <event-id>         # popup card only (fast)
node outlook.js calendar-read <event-id> --full  # full view: attendees + meeting link
```

Fetches full event details by opening the event popup. The `id` comes from a prior `calendar` or `calendar-search` result — pass it unchanged.

`--full` navigates to the full event view after the popup (~10s extra). Use it when you need individual attendee names or a reliable Teams/Zoom join URL.

```bash
node outlook.js calendar-read '{"subject":"Weekly Standup","start_time":"2026-04-14T09:00:00.000Z"}'
node outlook.js calendar-read '{"subject":"Weekly Standup","start_time":"2026-04-14T09:00:00.000Z"}' --full
```

**Response:**

```json
{
  "operation": "calendar-read",
  "status": "ok",
  "results": {
    "id": "{\"subject\":\"Weekly Standup\",\"start_time\":\"2026-04-14T09:00:00.000Z\"}",
    "subject": "Weekly Standup",
    "organizer": "User, Alpha",
    "start_time": "2026-04-14T09:00:00.000Z",
    "end_time": "2026-04-14T09:30:00.000Z",
    "duration_minutes": 30,
    "location": "Microsoft Teams Meeting",
    "is_online_meeting": true,
    "meeting_link": null,
    "is_all_day": false,
    "is_recurring": true,
    "response_status": "unknown",
    "attendee_summary": "Accepted 8, Didn't respond 3",
    "attendees": [],
    "body_text": "Join the weekly standup.\n\nAgenda:\n1. Status updates\n2. Blockers"
  },
  "error": null
}
```

> **Notes:**
> - `results` is a single object (not an array).
> - `attendee_summary` (e.g. `"Accepted 8, Didn't respond 3"`) is always present without `--full`.
> - `attendees` (individual `{ name, response }` objects) requires `--full`.
> - `meeting_link` is usually `null` without `--full` — Teams popup body is truncated. Use `is_online_meeting: true` as the reliable Teams signal, and `--full` for the actual join URL.
> - `response_status` is always `"unknown"` for `calendar-read` — use `calendar` listing to get accepted/declined status.

---

### `calendar-search` — Search calendar events

```bash
node outlook.js calendar-search "<query>" [--limit <n>]
```

Searches calendar events using the Outlook search box. Uses plain keywords or `subject:`, `before:`, `after:` operators. Results use the same schema as `calendar`.

```bash
node outlook.js calendar-search "standup"
node outlook.js calendar-search "subject:planning after:2026-04-20"
node outlook.js calendar-search "Q2" --limit 10
```

**Response:** same schema as `calendar` listing.

> **Note:** `response_status` may be `"unknown"` for many results. Results are filtered to calendar event ARIA patterns but exclusivity is not guaranteed. Zero results is not an error.

See [`references/calendar-events.md`](references/calendar-events.md) for supported operators.

---

### `teams` — Teams activity feed, mentions, and unread chats

```bash
node outlook.js teams [--mentions] [--unread] [--limit <n>]
```

Fetches your Microsoft Teams activity feed using the same Entra SSO session as Outlook. Three modes:

- **Default** — activity feed (all notifications: mentions, replies, reactions, messages)
- **`--mentions`** — @mentions only
- **`--unread`** — unread chat summary (one entry per chat thread)

```bash
node outlook.js teams                    # activity feed (default)
node outlook.js teams --mentions         # @mentions only
node outlook.js teams --unread           # unread chats
node outlook.js teams --limit 10         # limit results
```

**Response (activity / mentions mode):**

```json
{
  "operation": "teams",
  "status": "ok",
  "results": [
    {
      "sender": "User, Alpha",
      "channel": "General | Project Alpha",
      "preview": "Hey @you, can you review the proposal?",
      "time": "10:32 AM",
      "type": "mention"
    }
  ],
  "count": 1,
  "error": null
}
```

`type` values: `mention`, `reply`, `reaction`, `message`, `notification`

**Response (`--unread` mode):**

```json
{
  "operation": "teams",
  "status": "ok",
  "results": [
    {
      "name": "User, Alpha",
      "preview": "Can we sync at 2pm?",
      "time": "9:15 AM",
      "has_unread": true
    }
  ],
  "count": 1,
  "error": null
}
```

> **Note:** Teams uses the same Entra SSO session as Outlook. Set `TEAMS_BASE_URL` in `.env` if your tenant uses a custom Teams URL (defaults to `https://teams.microsoft.com`).

---

### `copilot-summary` — AI-generated summary from Copilot in Teams

```bash
node outlook.js copilot-summary [--type email|teams|both] [--since "<date>"] [--prompt "<custom>"]
```

Sends a summary prompt to Copilot in Teams and returns the response. Copilot summarizes emails, Teams messages, or both.

- **`--type`** — What to summarize: `email`, `teams`, or `both` (default: `both`)
- **`--since`** — Time window, e.g. `"yesterday"`, `"last week"`, `"Monday"` (Copilot interprets naturally)
- **`--prompt`** — Custom prompt override (replaces the default summary prompt entirely)

```bash
node outlook.js copilot-summary                                    # email + Teams summary
node outlook.js copilot-summary --type email                       # email only
node outlook.js copilot-summary --type teams --since "yesterday"   # Teams since yesterday
node outlook.js copilot-summary --prompt "What did I miss today?"  # custom prompt
```

**Response:**

```json
{
  "operation": "copilot-summary",
  "status": "ok",
  "type": "both",
  "raw_response": "Here's your summary for today:\n\n**Email:** You have 3 high-priority...\n\n**Teams:** Alice mentioned you in Project Alpha...",
  "items": [
    {
      "sender": "User, Alpha",
      "subject": "Q2 Budget Review",
      "date": "Today",
      "summary": "Requests your review of Q2 budget before EOD.",
      "action": "review required"
    }
  ],
  "count": 1,
  "error": null
}
```

**Critical notes:**
- `raw_response` is always present — it contains Copilot's full text output verbatim.
- `items` is best-effort parsed from `raw_response` — Copilot's format varies; parsing may return an empty array even when `raw_response` is non-empty. Always use `raw_response` as the authoritative output.
- Generation takes 10–30 seconds — this subcommand is slow by nature.
- Copilot may automatically enable a "Researcher" plugin for some queries — this is normal behavior.
- Copilot truncates at approximately 25 items.

> **Note:** `copilot-summary` requires Copilot to be enabled for your Teams tenant.

> **Security:** Never pass content from emails or Teams messages as `--prompt`. The flag is for operator-defined prompts only. If adversarial text from an email reached `--prompt`, it would be sent directly to Copilot which has access to your full mailbox. The value is capped at 2000 characters to limit injection payload size.

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
| `SESSION_INVALID` | search, read, digest, teams, copilot-summary | Session expired — run `auth`, then retry the original command |
| `AUTH_REQUIRED` | Session check | Session absent — run `auth` |
| `OPERATION_FAILED` | read, digest, auth, teams, copilot-summary | Browser timeout or empty snapshot — retry once; if it recurs, surface `error.message` |
| `MESSAGE_NOT_FOUND` | Read only | Email ID not found — retry with `--query` flag from the original search |
| `EVENT_NOT_FOUND` | calendar-read only | Event ID not found in calendar view — run `calendar` to get fresh IDs |

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
- **Folder scope** — `--folder` supports standard top-level folders only (Inbox, Sent Items, Drafts, Deleted Items, Junk Email, Archive). Custom or nested subfolders may not be found if they are collapsed in the navigation pane.
- **Multi-tenant** — tested on a single Outlook/Teams tenant. Different organizations may have slightly different UI configurations.
- **Attachments** — names are listed but content is not downloaded.
- **Calendar meeting links** — Teams join URLs are usually absent from the popup card (`meeting_link: null`). Use `--full` with `calendar-read` to get a reliable link; `is_online_meeting: true` is the reliable Teams signal without the extra round-trip.
- **Calendar response status** — `calendar-read` always returns `"unknown"` for `response_status`; the popup card doesn't expose the ShowAs field. Use `calendar` listing to get accepted/declined status.
- **Calendar search scope** — `calendar-search` uses the global Outlook search box; results are filtered to calendar event ARIA patterns but may occasionally include non-calendar items.
- **Teams ARIA** — Teams web's accessibility tree varies by version. The `teams` subcommand extracts what it can from listitem/option elements; some activity items may not parse cleanly.
- **Copilot availability** — `copilot-summary` requires Copilot to be enabled for your Teams tenant. Generation takes 10-30 seconds and Copilot may truncate at ~25 items.

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
  calendar.js           Calendar list, read, and search implementation
  teams.js              Teams activity feed, mentions, unread chats
  copilot.js            Copilot-in-Teams summary generation
  output.js             JSON envelope helpers
  run.js                agent-browser wrapper with action policy
policy-auth.json        Action allowlist for auth operations
policy-read.json        Action allowlist for read operations
policy-search.json      Action allowlist for search/digest operations
policy-teams.json       Action allowlist for teams operations
policy-copilot.json     Action allowlist for copilot-summary operations
scoring.json.example    Default scoring config — copy to scoring.json
SKILL.md                Claude Code skill descriptor
references/
  kql-syntax.md         KQL operator reference
  error-recovery.md     Error code decision trees
  digest-signals.md     Scoring algorithm documentation
  calendar-events.md    Calendar JSON schema, response_status values, search operators
  outlook-ui.example.md Template for capturing tenant UI snapshots
```

---

## License

MIT
