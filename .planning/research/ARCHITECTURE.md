# Architecture Patterns: Outlook Web Skill

**Domain:** Claude Code skill — browser-automated Outlook web reader
**Researched:** 2026-04-10
**Confidence:** HIGH (derived from agent-browser SKILL.md + reference docs) / MEDIUM (Outlook web DOM specifics — needs live validation)

---

## Recommended Architecture

### Skill as a Single Entry-Point Script with Subcommands

The skill is one Node.js CLI script (`outlook.js`) invoked by the personal assistant with a subcommand argument. This is the right shape because:

- The personal assistant invokes the skill via `Bash(node .agents/skills/outlook/outlook.js <subcommand> [args])` or an equivalent wrapper
- All three operations (search, read, digest) share the same auth-check logic and session setup
- One script means one session name, one state file path, one place to handle errors

```
.agents/skills/outlook/
  SKILL.md          ← Skill manifest + usage contract for the personal assistant
  outlook.js        ← Single CLI entry point (Node.js)
  lib/
    auth.js         ← Auth state detection + headed-browser login flow
    search.js       ← Search operation implementation
    read.js         ← Read-email operation implementation
    digest.js       ← Digest operation implementation
    browser.js      ← agent-browser command wrappers (spawn + stdout parse)
    output.js       ← JSON schema + stdout writer
  policy.json       ← agent-browser action policy (read-only allowlist)
  agent-browser.json ← agent-browser project config (session-name, allowed-domains)
```

### What Goes in SKILL.md vs. Scripts

**SKILL.md** — The contract document that the personal assistant Claude Code instance reads to know how to invoke the skill. It must contain:
- The exact `allowed-tools` frontmatter (`Bash(node .agents/skills/outlook/outlook.js:*)`)
- Invocation syntax for each subcommand with argument signatures
- The JSON output schema for each operation (so the assistant knows what fields to expect)
- Auth behavior description (what happens on first run vs. subsequent runs)
- What errors look like and how the assistant should react to them
- Hard constraints (read-only, never click send/delete/reply)

**Scripts** — All execution logic. Nothing about the skill's behavior should live only in SKILL.md prose — if SKILL.md says "search returns an array of emails", the script must enforce that schema.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `outlook.js` (entry point) | Parses subcommand + args, calls auth check, dispatches to operation, catches errors, writes final JSON to stdout | `auth.js`, `search.js`, `read.js`, `digest.js`, `output.js` |
| `auth.js` | Detects session state by loading `--session-name outlook-skill`, navigating to `/mail/`, checking landing URL vs. login URL. If unauthenticated: launches `--headed` browser, waits for user to reach `/mail/` URL, then session auto-persists on close | `browser.js` |
| `browser.js` | Wraps `agent-browser` CLI calls via Node `child_process.execSync` or `spawn`. Returns parsed stdout. Handles non-zero exit codes as structured errors | OS / agent-browser daemon |
| `search.js` | Navigates to Outlook search, enters query, waits for results, extracts email list from snapshot, returns array | `browser.js` |
| `read.js` | Navigates to a specific email (by URL or message ID), extracts full body + metadata from snapshot, returns single email object | `browser.js` |
| `digest.js` | Navigates to inbox today-filtered view, extracts email list with subjects/senders/previews, optionally reads top N in full | `browser.js`, `read.js` |
| `output.js` | Enforces JSON schema on all operation results, writes `JSON.stringify(result)` to stdout, writes structured error JSON on failure | stdout |
| `policy.json` | agent-browser action policy — `default: deny`, allows only `navigate, snapshot, get, wait, scroll, close` — blocks `fill, click, type, press, keyboard, form` to enforce read-only | agent-browser |
| `agent-browser.json` | Project-level config — sets `sessionName: "outlook-skill"`, `allowedDomains: ["outlook.office.com", "login.microsoftonline.com", "login.live.com"]` | agent-browser |

---

## Auth State Detection

### How Outlook Web Signals Auth State

**Confidence: MEDIUM** — Based on established Outlook web behavior; must be validated by running against a live session.

Outlook on the web (`outlook.office.com`) behaves as follows:

| State | Landing URL pattern after navigating to `https://outlook.office.com/mail/` |
|-------|-----------------------------------------------------------------------------|
| Authenticated | Stays on `outlook.office.com/mail/` or redirects to `outlook.office.com/mail/inbox` |
| Unauthenticated | Redirects to `login.microsoftonline.com` or `login.live.com` |
| MFA/consent required | Lands on a `login.microsoftonline.com/...` sub-path (still the login domain) |

**Detection algorithm:**

```
1. agent-browser --session-name outlook-skill open https://outlook.office.com/mail/
2. agent-browser --session-name outlook-skill get url
3. If URL contains "outlook.office.com" AND does NOT contain "login" → AUTHENTICATED
4. If URL contains "login.microsoftonline.com" OR "login.live.com" → NOT AUTHENTICATED
```

Secondary confirmation (more robust against partial-auth states): after URL check, take a snapshot and look for the presence/absence of the Outlook inbox landmark. If the accessibility tree contains a `[navigation]` with "Inbox" text or a `[main]` region with email list rows, auth is confirmed. If it contains an `[input type="email"]` at a login domain, auth has failed.

### First-Run Auth Flow (Headed Mode)

```
1. Detect: not authenticated
2. Log to stderr: "Outlook session not found. Opening browser for login..."
3. agent-browser --session-name outlook-skill --headed open https://outlook.office.com/mail/
4. Poll (every 5s, up to 300s): agent-browser --session-name outlook-skill get url
5. When URL matches outlook.office.com/mail/* → auth complete
6. agent-browser --session-name outlook-skill close  ← auto-saves session state to ~/.agent-browser/sessions/
7. Return: { "status": "authenticated", "firstRun": true }
```

On all subsequent runs, `--session-name outlook-skill` auto-restores the session. No state file management needed by the skill code — agent-browser handles it.

### Session Expiry Detection + Recovery

```
1. Load session, open /mail/, check URL
2. URL is login domain → session expired
3. Emit stderr: "Session expired. Re-authentication required."
4. Emit stdout: { "error": "SESSION_EXPIRED", "requiresInteraction": true }
5. Exit non-zero
6. Personal assistant surfaces this to the user; user re-runs the skill (which will go through headed login again)
```

Do NOT attempt silent background re-auth. Outlook uses MFA/SSO that requires human interaction.

---

## Data Flow: Search Operation (End-to-End)

```
Personal Assistant
  │
  │  Bash: node outlook.js search --query "from:boss@example.com subject:quarterly"
  ▼
outlook.js (entry point)
  │
  ├── auth.js: check session → AUTHENTICATED
  │     agent-browser --session-name outlook-skill open https://outlook.office.com/mail/
  │     agent-browser --session-name outlook-skill get url  → "outlook.office.com/mail/inbox"
  │
  ├── search.js: execute search
  │     1. Navigate to search URL (Outlook web supports query string search):
  │        agent-browser open "https://outlook.office.com/mail/search?q=<encoded-query>"
  │        [OR: use the search box if query-string approach is unreliable]
  │     2. Wait for results: agent-browser wait --text "results" OR wait 3000
  │     3. Snapshot the results region:
  │        agent-browser snapshot -i -s "[role=list]"  (inbox/results list)
  │     4. For each result row in snapshot:
  │        agent-browser get text @eN  (subject, sender, date, preview)
  │        agent-browser get text @eN --urls  (message URL if available)
  │     5. Return raw array of {ref, text, url} tuples
  │
  ├── output.js: normalize to schema
  │     Map raw tuples → EmailSummary[]
  │     { id, subject, sender, date, preview, url }
  │
  └── stdout: JSON.stringify({ operation: "search", query: "...", results: [...], count: N })

Personal Assistant reads stdout, parses JSON, uses results.
```

### Why Query-String Navigation Over Search-Box Interaction

Outlook web supports `https://outlook.office.com/mail/search?q=<query>` (deep link to search). Using this avoids the need to click, find, and fill the search box — which is a read-only constraint risk (could accidentally interact with compose if misidentified). Deep link navigation is also more deterministic across Outlook versions.

**Risk:** Microsoft may change the search URL format without notice. The search-box fallback is the backup approach. Both should be tested in Phase 1.

---

## JSON Output Schema

All operations emit to stdout. Stderr is for human-readable status messages only. The personal assistant only reads stdout.

### Envelope (all operations)

```json
{
  "operation": "search" | "read" | "digest",
  "timestamp": "2026-04-10T14:23:00Z",
  "status": "ok" | "error",
  "data": { ... },
  "error": null | { "code": "...", "message": "...", "requiresInteraction": false }
}
```

### search — data field

```json
{
  "query": "from:boss@example.com",
  "results": [
    {
      "id": "AAMkAGI...",
      "subject": "Q1 Results",
      "sender": { "name": "Boss Name", "email": "boss@example.com" },
      "date": "2026-04-09T10:00:00Z",
      "preview": "Please review the attached...",
      "url": "https://outlook.office.com/mail/AAMkAGI..."
    }
  ],
  "count": 1,
  "hasMore": false
}
```

### read — data field

```json
{
  "id": "AAMkAGI...",
  "subject": "Q1 Results",
  "sender": { "name": "Boss Name", "email": "boss@example.com" },
  "to": [{ "name": "Me", "email": "me@example.com" }],
  "cc": [],
  "date": "2026-04-09T10:00:00Z",
  "body": "Plain text or markdown-extracted body content",
  "hasAttachments": true,
  "attachments": [{ "name": "Q1.xlsx", "size": 24576 }],
  "url": "https://outlook.office.com/mail/AAMkAGI..."
}
```

### digest — data field

```json
{
  "date": "2026-04-10",
  "totalUnread": 12,
  "messages": [
    {
      "id": "...",
      "subject": "...",
      "sender": { "name": "...", "email": "..." },
      "date": "...",
      "preview": "...",
      "isUnread": true,
      "url": "..."
    }
  ],
  "count": 12
}
```

### Error envelope

```json
{
  "operation": "search",
  "timestamp": "2026-04-10T14:23:00Z",
  "status": "error",
  "data": null,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Outlook session expired. Run with no arguments to re-authenticate.",
    "requiresInteraction": true
  }
}
```

**Error codes:**
- `SESSION_EXPIRED` — cookies invalid, headed login required
- `AUTH_REQUIRED` — no session exists yet, first run
- `PAGE_LOAD_TIMEOUT` — Outlook page didn't load in time
- `RESULTS_NOT_FOUND` — search returned no results (not an error per se, count=0)
- `ELEMENT_NOT_FOUND` — expected DOM element missing (Outlook UI changed)
- `BROWSER_ERROR` — agent-browser exited non-zero

---

## Single Skill vs. Multiple Skills

**Decision: One skill, three subcommands.**

Rationale:
- Auth check is shared — duplicating it across three separate skills would mean three separate session checks, three browser launches
- The `--session-name outlook-skill` must be consistent across all operations; one entry point guarantees this
- The personal assistant's invocation is cleaner: `node outlook.js search ...` vs. maintaining three separate SKILL.md files
- Digest can internally call the read operation for top-priority messages — this is trivial within one script, awkward across separate processes

Invocation contract in SKILL.md:

```bash
node .agents/skills/outlook/outlook.js search --query "<query>" [--limit N]
node .agents/skills/outlook/outlook.js read --url "<message-url>"
node .agents/skills/outlook/outlook.js read --id "<message-id>"
node .agents/skills/outlook/outlook.js digest [--date today|yesterday|YYYY-MM-DD] [--limit N]
node .agents/skills/outlook/outlook.js auth   # Explicit re-auth trigger (headed mode)
```

---

## Security Architecture

### Read-Only Enforcement via Action Policy

`policy.json` passed as `AGENT_BROWSER_ACTION_POLICY=./policy.json`:

```json
{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get", "wait", "scroll", "close", "state", "session"]
}
```

This blocks `fill`, `click`, `type`, `press`, `keyboard`, `form`, `eval` at the agent-browser level — not just at the script level. Even if a prompt injection in an email body tries to instruct the browser to click "Send", the action policy rejects it.

**Important:** `click` is excluded from the allowlist. This means navigation via link clicks is not available. Instead, use direct URL navigation (`open <url>`) for all page changes. This is the correct pattern for this skill — all Outlook pages are directly addressable by URL.

### Domain Allowlist

`agent-browser.json` sets `allowedDomains`:

```json
{
  "sessionName": "outlook-skill",
  "allowedDomains": [
    "outlook.office.com",
    "login.microsoftonline.com",
    "login.live.com",
    "res.cdn.office.net",
    "substrate.office.com"
  ]
}
```

This prevents any navigation to non-Microsoft domains even if prompted by email content.

### Content Boundaries

Enable `AGENT_BROWSER_CONTENT_BOUNDARIES=1` so that page-sourced content (email bodies) is wrapped in markers. This helps the personal assistant's Claude instance distinguish Outlook UI output from email content — critical for preventing prompt injection in email bodies from affecting skill behavior.

---

## Build Order (Phase Dependencies)

```
Phase 1: Browser scaffolding + auth
  ├── Create skill directory structure
  ├── Create browser.js wrapper (agent-browser spawn/parse)
  ├── Create auth.js (session detection + headed login flow)
  ├── Create policy.json + agent-browser.json
  ├── Create output.js (JSON envelope + error codes)
  └── Create outlook.js entry point (routes subcommands, calls auth)
  [VALIDATES: session persistence works, headed login works, URL detection reliable]

Phase 2: Search operation
  ├── Implement search.js (URL-based navigation to search results)
  ├── Implement snapshot parsing for email list rows
  ├── Map raw snapshot data to EmailSummary schema
  └── Wire into outlook.js + output.js
  [VALIDATES: search returns correct results, schema is parseable by assistant]

Phase 3: Read operation
  ├── Implement read.js (navigate to message URL, extract full body)
  ├── Handle email body extraction (snapshot -s on message body region)
  ├── Extract metadata (subject, sender, to, cc, date, attachments)
  └── Wire into outlook.js + output.js
  [VALIDATES: full email content correctly extracted]

Phase 4: Digest operation
  ├── Implement digest.js (today's inbox, unread filter)
  ├── Reuse search.js patterns for list extraction
  ├── Optionally call read.js for top N messages
  └── Wire into outlook.js + output.js
  [VALIDATES: digest returns useful summary for daily use]

Phase 5: Hardening
  ├── Bot detection mitigation (human-like timing, realistic viewport)
  ├── Error recovery (retry logic for PAGE_LOAD_TIMEOUT)
  ├── Session expiry detection refinement
  ├── SKILL.md final documentation
  └── Integration test with personal assistant
  [VALIDATES: skill works reliably across multiple days of use]
```

**Critical dependency:** Phase 1 must be complete before any other phase starts. The auth and browser wrapper are shared infrastructure.

**Phase 2 before Phase 3** because search produces message URLs that Phase 3's `read` operation consumes. Validating the URL format from search confirms the input contract for read.

**Phase 4 last among features** because digest is a composition of search + read patterns. It can be built quickly once those are stable.

---

## Scalability Considerations

This is a single-user personal assistant skill. Scale considerations are latency and reliability, not throughput.

| Concern | Now (personal use) | If shared across users |
|---------|-------------------|----------------------|
| Session isolation | One `--session-name outlook-skill` per machine | One session name per user (include user ID) |
| Auth state | One `~/.agent-browser/sessions/outlook-skill-*` file | Per-user state files, encrypted |
| Concurrency | Single-threaded, sequential operations | Not a design goal — out of scope |
| Bot detection | Single user, low frequency | Higher risk at scale — not addressed here |

---

## Key Architecture Risks

### Risk 1: Outlook Web UI Changes Break Selectors
**Probability:** Medium — Microsoft updates the Outlook web UI regularly.
**Impact:** High — any extraction logic tied to specific CSS classes or element positions breaks.
**Mitigation:** Rely on semantic snapshot landmarks (`[role=list]`, `[role=listitem]`, heading text) rather than CSS classes. Use `agent-browser wait --text "Inbox"` rather than `wait "#dividing-rule"`. This makes extraction resilient to visual redesigns as long as accessibility roles are preserved.

### Risk 2: Microsoft Bot Detection Blocks Headless Browser
**Probability:** Medium — Microsoft does fingerprint automated browsers.
**Impact:** High — skill silently fails or gets into a CAPTCHA loop.
**Mitigation:** Use `--session-name` to persist cookies (avoiding repeated cold starts), use realistic viewport (1280x720, not 1920x1080 default), ensure `--headed` is used for auth (not headless). The session reuse pattern means most runs don't trigger new login flows. Flag this for Phase 5 validation.

### Risk 3: MFA/Conditional Access Makes Session Persistence Unreliable
**Probability:** Medium-High — corporate O365 tenants often have 8-hour or daily MFA requirements.
**Impact:** Medium — skill works fine for 8 hours then requires re-auth.
**Mitigation:** Detect `SESSION_EXPIRED` gracefully, surface clear error to personal assistant, which surfaces it to user. Make re-auth a single explicit command: `node outlook.js auth`.

### Risk 4: Email Body Extraction is Lossy for Rich HTML
**Probability:** High — Outlook email bodies are rich HTML. The accessibility snapshot extracts text, not HTML structure.
**Impact:** Medium — body text is useful, but formatting/tables/images are lost.
**Mitigation:** For the personal assistant use case, plain-text body extraction is sufficient. Document this limitation in SKILL.md. If full HTML is needed later, use `eval` to extract `document.querySelector('[role=document]').innerHTML` — but only add this if the plain-text path proves insufficient.

---

## Sources

- agent-browser SKILL.md (read directly from `.agents/skills/agent-browser/SKILL.md`)
- agent-browser references/authentication.md (read directly)
- agent-browser references/session-management.md (read directly)
- agent-browser references/snapshot-refs.md (read directly)
- PROJECT.md (read directly from `.planning/PROJECT.md`)
- Outlook web URL structure: HIGH confidence based on established Microsoft URL conventions (`outlook.office.com/mail/`, `login.microsoftonline.com` redirects) — consistent since 2017
- Outlook web accessibility/DOM specifics: MEDIUM confidence — training data knowledge, needs live validation in Phase 1
