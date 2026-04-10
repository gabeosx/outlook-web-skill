# Feature Landscape — Outlook Web Browser Automation Skill

**Domain:** Read-only browser-automated Outlook web email reader (Claude Code skill)
**Researched:** 2026-04-10
**Confidence note:** WebSearch and WebFetch tools were unavailable during this research session. All findings are drawn from training-data knowledge (cutoff August 2025). Confidence levels reflect that limitation. UI selectors in particular MUST be validated against a live Outlook session before relying on them.

---

## 1. Outlook Web UI Structure

**Confidence: MEDIUM** — Outlook web's layout has been stable since the 2023–2024 "new Outlook" rollout, but Microsoft periodically refactors class names and attribute assignments.

### Key UI Regions

| Region | Description | Primary Selector Hints |
|--------|-------------|------------------------|
| Left nav rail | Folder tree (Inbox, Sent, Drafts, etc.) | `[role="tree"]`, `[aria-label="Folder list"]`, `nav[aria-label="Mail folders"]` |
| Search bar | Top-center search input | `[aria-label="Search"]`, `input[type="search"]`, `[role="searchbox"]` |
| Message list | Scrollable list of email rows | `[role="list"][aria-label*="Message"]`, `[role="listitem"]` per row |
| Reading pane | Full email body (right or bottom) | `[role="main"]`, `[aria-label="Message body"]`, `[data-testid="message-body"]` |
| Toolbar | Actions (Reply, Forward, Delete, etc.) | `[role="toolbar"]` — NOTE: must never be invoked |
| Subject line (list) | Per-row subject text | `[aria-label*="subject"]` or inner `span` inside the listitem |
| Sender (list) | Per-row sender name/address | `[aria-label*="From"]` or inner element within the listitem |
| Unread indicator | Bold row or dot marker for unread | Row with `aria-label` containing "Unread" or class indicating bold text |
| Flag indicator | Flag icon per message | `[aria-label*="flag"]`, `[aria-label*="Flag"]` |
| Attachment indicator | Paperclip icon per message | `[aria-label*="attachment"]`, `[aria-label*="has attachment"]` |

### Navigation Approach for agent-browser

The recommended pattern for Outlook web automation:

```
1. agent-browser batch "open <outlook_url>" "wait 3000"
2. agent-browser snapshot -i   # discover the actual refs in this session
3. Use refs + semantic locators for all subsequent actions
```

Outlook web is a React/TypeScript SPA. After initial load it may still be hydrating — a `wait 3000` or `wait --fn "document.querySelectorAll('[role=listitem]').length > 0"` guard is necessary.

**Critical:** Outlook web class names (e.g., `._3SWUl`, `ms-List-cell`) are auto-generated and change with deployments. **Never hard-code class-based selectors.** Rely exclusively on:
- `role` attributes (ARIA)
- `aria-label` attributes
- `data-testid` attributes (present in some builds)
- Semantic locators via `agent-browser find`

### ARIA Roles Confirmed Present (MEDIUM confidence)

- `role="listitem"` — each message row in the message list
- `role="list"` — the message list container
- `role="searchbox"` — the search input
- `role="tree"` and `role="treeitem"` — folder navigation
- `role="main"` — reading pane content area
- `role="button"` — toolbar actions (Reply, Delete, etc.) — read but never click
- `role="toolbar"` — toolbar container

---

## 2. URL Patterns

**Confidence: HIGH** — URL patterns for Outlook web are well-documented and stable.

| Scenario | Base URL |
|----------|----------|
| Personal Microsoft account (Hotmail, Live, Outlook.com) | `https://outlook.live.com/mail/0/` |
| Microsoft 365 / work or school account (standard) | `https://outlook.office.com/mail/` |
| Microsoft 365 legacy redirect | `https://outlook.office365.com/mail/` — redirects to `outlook.office.com` |
| Sovereign cloud (GCC, DoD) | `https://outlook.office365.us/mail/` |

### Deep Link Patterns

| Intent | URL Pattern |
|--------|-------------|
| Open inbox | `https://outlook.office.com/mail/inbox` |
| Open specific folder | `https://outlook.office.com/mail/[folderId]` |
| Open specific message | `https://outlook.office.com/mail/id/[messageId]` or `https://outlook.office.com/mail/[folderId]/id/[messageId]` |
| Search results | `https://outlook.office.com/mail/search` — search query injected via UI, not URL param (in new Outlook) |

**Note:** `outlook.office365.com` is functionally identical to `outlook.office.com` — the former HTTP-redirects to the latter. The skill should accept both as valid starting URLs and normalize to `outlook.office.com`.

**Live.com vs office.com:** The two are separate backends (consumer vs enterprise). Authentication state is not shared. The skill must support both but does not need to auto-detect — the user configures which URL to use.

---

## 3. Search Operators

**Confidence: MEDIUM** — Outlook web search operators are documented by Microsoft but exact UI behavior varies between new Outlook and classic Outlook web. The operators below are sourced from Microsoft's published KQL (Keyword Query Language) documentation for Exchange/Outlook search.

### Supported Operators (KQL / Outlook Web)

| Operator | Example | Notes |
|----------|---------|-------|
| `from:` | `from:alice@example.com` | Match sender email or name |
| `to:` | `to:bob@example.com` | Match recipient |
| `cc:` | `cc:carol@example.com` | Match CC recipient |
| `subject:` | `subject:quarterly report` | Match subject line words |
| `body:` | `body:invoice` | Search message body text |
| `has:attachment` | `has:attachment` | Messages with any attachment |
| `filename:` | `filename:*.pdf` | Specific attachment filename |
| `received:` | `received:2024-01-01..2024-12-31` | Date range |
| `sent:` | `sent:last week` | Relative date for sent items |
| `before:` | `before:2024-06-01` | Messages before date |
| `after:` | `after:2024-01-01` | Messages after date |
| `is:unread` | `is:unread` | Unread messages only |
| `is:flagged` | `is:flagged` | Flagged messages only |
| `is:important` | `is:important` | Marked high importance |
| `size:` | `size:>1MB` | Filter by message size |
| `category:` | `category:red` | By color category |
| Quoted phrase | `"project kickoff"` | Exact phrase match |
| Boolean AND | `from:alice subject:report` (space = AND) | Implicit AND between terms |
| Boolean OR | `from:alice OR from:bob` | Explicit OR |
| Boolean NOT | `from:alice NOT subject:newsletter` | Exclusion |

**Validation needed:** The `before:`/`after:` operators work in Exchange search but may render differently in the new Outlook web UI vs classic. Date format acceptance (`YYYY-MM-DD` vs `MM/DD/YYYY`) should be validated against a live session.

**How search is invoked in Outlook web:** The user types into the search box (`role="searchbox"`), presses Enter or clicks the search button. Results replace the message list. There is no URL-parameter-based search in the new Outlook — the search query is submitted through the UI interaction, which means the skill must:
1. Click or focus the search box
2. Type the query string
3. Press Enter or click the search button
4. Wait for results to load
5. Snapshot and extract result rows

---

## 4. Structured Email JSON Schema

**Confidence: HIGH** — This is a design decision for the skill, informed by standard email data models (RFC 5322, Microsoft Graph API schema, and IMAP conventions).

### Recommended JSON Schema

```json
{
  "id": "string — unique message identifier (from URL or data-convid attribute)",
  "thread_id": "string — conversation/thread ID (if available in DOM)",
  "subject": "string",
  "preview": "string — first ~200 chars of body, for list view",
  "body": "string — full plain-text body (HTML stripped), populated only in read operation",
  "body_html": "string | null — raw HTML body, populated only if explicitly requested",
  "from": {
    "name": "string",
    "address": "string"
  },
  "to": [
    { "name": "string", "address": "string" }
  ],
  "cc": [
    { "name": "string", "address": "string" }
  ],
  "bcc": [],
  "date": "string — ISO 8601 datetime, e.g. 2024-03-15T09:23:00Z",
  "date_received": "string — ISO 8601, when it arrived in mailbox",
  "is_read": "boolean",
  "is_flagged": "boolean",
  "is_important": "boolean — high-importance flag from sender",
  "has_attachments": "boolean",
  "attachments": [
    {
      "name": "string — filename",
      "size_bytes": "number | null",
      "content_type": "string | null"
    }
  ],
  "categories": ["string — color category labels"],
  "folder": "string — mailbox folder name (Inbox, Sent, etc.)",
  "url": "string — direct deep-link URL to this message in Outlook web",
  "source_operation": "string — 'search' | 'digest' | 'read'"
}
```

### Field Availability by Operation

| Field | `search` | `digest` | `read` |
|-------|----------|----------|--------|
| id | yes | yes | yes |
| thread_id | maybe | maybe | yes |
| subject | yes | yes | yes |
| preview | yes | yes | yes |
| body | no | no | yes |
| body_html | no | no | opt-in |
| from | yes | yes | yes |
| to | partial | partial | yes |
| cc | no | no | yes |
| date | yes | yes | yes |
| is_read | yes | yes | yes |
| is_flagged | yes | yes | yes |
| is_important | yes | yes | yes |
| has_attachments | yes | yes | yes |
| attachments detail | no | no | yes |
| categories | maybe | maybe | yes |
| url | yes | yes | yes |

---

## 5. Daily Digest — Importance Signals

**Confidence: MEDIUM** — These signals are derived from standard email triage practice and what the Outlook web UI exposes in the message list.

### What Makes a Message "Important" for a Digest

| Signal | Weight | Source in UI |
|--------|--------|--------------|
| Unread | High | `aria-label` containing "Unread", or bold rendering |
| Flagged | High | Flag icon, `aria-label*="flagged"` |
| High importance (sender-set) | High | `!` icon, `aria-label*="High importance"` |
| Received today | High | Date stamp is today |
| Received in last 24h | Medium | Date stamp within 24 hours |
| Focused inbox (if enabled) | Medium | Outlook's own ML classifier places it in Focused tab |
| Has attachment | Medium | Paperclip icon |
| From VIP / known sender | Medium | Skill-configurable sender list |
| Subject contains urgency keywords | Low | Heuristic: "urgent", "action required", "deadline", "ASAP", "by EOD", "by end of day", "time-sensitive" |
| @mention of user | Medium | `@` indicator in message list (if present in DOM) |
| Reply requested | Low | "Please reply" patterns in preview text |

### Digest Filtering Strategy

The digest operation should:
1. Navigate to the inbox
2. Snapshot the message list (first 50 rows, or scroll to load more)
3. For each row, extract all available signals from the list view
4. Score each message by signal count/weight
5. Return the top N messages (configurable, default 20) sorted by score then recency
6. Optionally open each important message to populate `body` field

### Digest Should NOT:
- Use Outlook's "Focused" vs "Other" tab as the sole filter — Focused is unreliable and can miss genuinely important messages
- Mark messages as read (read-only constraint)
- Click "Mark as important" or any mutation

---

## Table Stakes

Features without which the skill is useless. Must ship in v1.

| Feature | Why Required | Implementation Notes |
|---------|--------------|---------------------|
| Authentication detection | Can't do anything without a valid session | Check for `role="searchbox"` or inbox list presence after navigation; if login form detected, prompt user |
| Session persistence across CLI invocations | Without this, every run requires manual login | Use `agent-browser --session-name outlook` or `--profile ~/.outlook-skill` |
| Visible browser for first-time auth | MFA/SSO cannot be automated | Launch headed (`--headed`) on first run; detect completion by waiting for inbox to load |
| `search` operation | Core feature; find emails by criteria | Navigate to inbox, use search box, extract result rows |
| `read` operation | Get full body of a specific email | Navigate to message URL or click message in list, extract body from reading pane |
| `digest` operation | Surface today's important messages | Load inbox, extract and score message list rows |
| JSON output to stdout | Calling agent parses this | All output must be valid JSON; logs must go to stderr only |
| Support for outlook.office.com | Primary work email URL | Required for M365 users (the majority of enterprise users) |
| Support for outlook.live.com | Personal Microsoft accounts | Required for consumer users |
| ARIA-based selectors only | Class names change on deployments | Never use auto-generated class names |

---

## Differentiators

Nice-to-have features that make the skill significantly more powerful.

| Feature | Value Proposition | Complexity | Notes |
|---------|------------------|------------|-------|
| `from:` / `subject:` / date-range convenience wrappers | Caller passes structured params; skill builds KQL query string | Low | Shields caller from knowing KQL syntax |
| Configurable VIP sender list for digest scoring | Personalized importance ranking | Low | JSON config file or env var |
| Urgency keyword heuristics for digest | Surfaces "ASAP", "deadline" emails even if not explicitly flagged | Low | Regex over subject + preview |
| Thread reading (fetch full conversation) | Understand full context of a thread, not just one message | Medium | Requires clicking thread header, expanding all messages |
| Attachment metadata extraction (filename, size) | Caller knows what's attached without downloading | Medium | Available in reading pane header |
| Pagination / scroll-to-load for large inboxes | Inbox may have 1000s of messages; need to surface more than the initial viewport | Medium | Scroll message list, re-snapshot |
| Multi-folder support for search | Search across Sent, Drafts, etc. | Low | Navigate to folder before or after search |
| Digest date range param | "Give me digest for last 3 days" | Low | Filter by `date_received` after extraction |
| Error typing to stdout | Structured error JSON `{"error": "...", "code": "..."}` instead of generic failure | Low | Better DX for calling agent |
| Bot detection evasion — human-like timing | Outlook may rate-limit or challenge automated browsers | Medium | Random waits 500–2000ms between actions; reuse session |
| Domain allowlist in agent-browser config | Restricts navigation to outlook domains only — extra safety | Low | `AGENT_BROWSER_ALLOWED_DOMAINS=outlook.live.com,outlook.office.com,outlook.office365.com,login.microsoftonline.com` |
| Action policy file (read-only enforcement) | Prevents accidental writes at the browser automation layer | Low | `policy.json` with `"allow": ["navigate","snapshot","get","wait","scroll"]` |

---

## Anti-Features

Explicitly out of scope. The skill must never implement these.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Send / Reply / Forward | Hard safety boundary — read-only skill | Refuse at CLI arg parse time; exit with error code and JSON error |
| Delete / Archive / Move email | Hard safety boundary | Same |
| Mark as read / unread | Mutation of state | Caller infers read status from `is_read` field in JSON |
| Accept / Decline calendar invites | Hard safety boundary | Return invite metadata if visible; never click Accept/Decline |
| Flag / Unflag messages | Mutation of state | Return `is_flagged` field; never click the flag button |
| Compose new email | Obvious mutation | Never click Compose |
| Mark as important | Mutation | Return `is_important` from sender's flag; never click importance button |
| Download attachments | File write to disk; scope creep | Return attachment metadata only (name, size, type) |
| Add/remove categories | Mutation | Return existing `categories` list; never modify |
| Any clicking of toolbar buttons | All toolbar actions are mutations | The toolbar should be snapshotted for structure but never interacted with |
| Unsubscribe from mailing lists | Mutation and potential navigation away from Outlook | Out of scope |
| Calendar reading | Separate domain; different UI | Future separate skill if needed |
| Contact management | Separate domain | Future separate skill if needed |
| Settings / preferences changes | Obvious mutation | Never navigate to Settings |
| Graph API calls | Not this skill's approach | If ever added, it's a separate skill; this skill is browser-only |

---

## Feature Dependencies

```
session persistence
    → authentication detection
        → search operation
        → digest operation
        → read operation
            → attachment metadata extraction
            → thread reading

search operation
    → pagination / scroll-to-load (for large result sets)

digest operation
    → importance scoring (urgency keywords, VIP list)
    → read operation (to populate body for top messages)
```

---

## MVP Recommendation

Ship in Phase 1:
1. Authentication detection + session persistence (blocker for everything else)
2. `search` operation — find emails by free-text query (KQL string passed as-is)
3. `read` operation — fetch full body by message URL or ID
4. `digest` operation — inbox snapshot with basic importance scoring (unread, flagged, is_important, recency)
5. JSON stdout with stderr-only logging
6. ARIA-only selectors, never class-based

Defer to later phases:
- Thread reading (full conversation fetch) — Medium complexity, verify need first
- Convenience query builders (from:/subject: wrappers) — Easy but not blocking MVP
- Pagination for large inboxes — Implement only if 50-message viewport proves insufficient
- VIP sender config — Add after first real-world usage reveals what signals matter most
- Bot detection tuning — Start with session reuse; add timing randomization if challenges appear

---

## Validation Gaps

The following MUST be verified against a live Outlook web session before finalizing implementation:

1. **Actual ARIA attributes on message list rows** — snapshot a real Outlook session and audit what `aria-label` values appear on `[role="listitem"]` elements. They encode subject, sender, date, read status, flag status in a combined string like "Subject: Q3 Report, From: Alpha User, Received: Thursday 3:42 PM, Unread, Flagged."

2. **Message ID extraction** — how to extract a stable message ID from the DOM (likely `data-convid` or similar attribute on the listitem, or from the URL when the message is opened in reading pane).

3. **Search result loading timing** — how long after pressing Enter before results appear; whether a `wait --text` or `wait [role=listitem]` strategy is sufficient.

4. **`before:`/`after:` date format** — verify whether Outlook web accepts ISO 8601 (`2024-01-01`) or requires localized format.

5. **Focused Inbox tab** — whether new Outlook defaults to Focused tab (which filters messages). If so, the skill must either switch to "All" tab before extracting or account for both tabs in digest.

6. **Reading pane vs new window** — whether clicking a message opens it in the right-side reading pane (default) or a new window/tab. The skill should work in reading-pane mode.

7. **Bot detection behavior** — whether headless Chrome triggers a challenge on first session. `agent-browser --session-name outlook` with session reuse is the primary mitigation; test whether additional evasion is needed.

---

## Sources

- Training data knowledge of Outlook web (OWA) UI as of August 2025 — MEDIUM confidence
- Microsoft KQL search syntax for Exchange/Outlook — MEDIUM confidence (operator list is from Exchange documentation patterns; validate against live UI)
- RFC 5322 email data model — HIGH confidence
- Microsoft Graph API email resource schema (used as reference for JSON field naming) — MEDIUM confidence
- agent-browser SKILL.md (local, loaded at session start) — HIGH confidence
- PROJECT.md requirements (local, loaded at session start) — HIGH confidence
- WebSearch and WebFetch were unavailable; no live URL verification was performed
