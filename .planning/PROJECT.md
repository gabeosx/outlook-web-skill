# Outlook Web Skill

## What This Is

A Claude Code skill that gives a personal assistant Claude Code instance read-only access to Outlook web. It uses the `@vercel/agent-browser` npm package to control a browser via CLI, navigates the Outlook web UI, handles authentication state detection, and returns structured JSON data. Supports email (search, read, digest) and calendar (calendar, calendar-read, calendar-search) operations.

## Core Value

A personal assistant Claude Code instance can reliably read and search the user's Outlook inbox and calendar without ever sending, deleting, or mutating anything.

## Requirements

### Validated

- ✓ Skill detects whether the Outlook web session is authenticated — v1.0
- ✓ When not authenticated, skill launches a visible browser so the user can log in manually, then persists the session for future runs — v1.0
- ✓ Skill exposes a `search` operation: find emails by KQL query (sender, subject, date range, keywords) — v1.0
- ✓ Skill exposes a `read` operation: fetch full content of a specific email by ID — v1.0
- ✓ Skill exposes a `digest` operation: pull today's inbox and surface important messages with importance scoring — v1.0
- ✓ Skill exposes `calendar`, `calendar-read`, `calendar-search` operations for read-only calendar access — v1.0
- ✓ All operations return structured JSON to stdout — v1.0
- ✓ Skill is strictly read-only — never sends, deletes, moves, replies, or accepts/declines — v1.0
- ✓ Skill is loadable by a Claude Code personal assistant instance (packaged as a Claude Code skill) — v1.0
- ✓ Bot detection risk is mitigated (managed Chrome binary + session reuse) — v1.0 (confirmed live against Entra CA)
- ✓ `search` and `digest` support `--folder <name>` to scope to any Outlook folder — v1.1

### Active

- [ ] `calendar-read --full` attendee parsing is best-effort — full attendee list ARIA structure varies by Outlook version; needs live validation across event types
- [ ] `calendar-read` does not return `response_status` — popup card doesn't expose ShowAs field; would require full event view navigation

### Out of Scope

- Sending or replying to emails — read-only constraint is a hard safety boundary
- Deleting, archiving, moving, or labeling emails — same reason
- Accepting or declining calendar invites — same reason
- Microsoft Graph API integration — using browser automation instead per design decision
- MCP server interface — the personal assistant can only invoke CLI; skill must work without MCP
- Personal Microsoft account support — M365/work accounts only in v1; personal accounts may have different ARIA structures

## Context

**Shipped v1.1:** ~3,416 lines Node.js. 8 subcommands: `auth`, `search`, `read`, `digest`, `tune`, `calendar`, `calendar-read`, `calendar-search`. Both `search` and `digest` now accept `--folder <name>`.

**Tech stack:** Node.js (Bash entry point), `@vercel/agent-browser` CLI, `--session-name` for cookie persistence, Action Policy JSON for read-only enforcement.

**Key observations:**
- Microsoft's bot detection passes with managed Chrome binary + `--headed` flag. `--session-name` persists auth across invocations.
- Outlook's accessibility tree is stable enough for automation but has quirks: snapshots must be last in a batch (page resets to about:blank), eval returns are double-encoded, calendar events have no stable DOM ID.
- Calendar popup card is truncated — Teams join URLs and full attendee lists require navigating to the full event view (`--full`).
- `references/outlook-ui.md` is gitignored (contains live ARIA from real emails/meetings). `references/outlook-ui.example.md` provides sanitised examples.
- Outlook shows an Office add-in consent DOM modal (not a native browser dialog) on every invocation. Dismissed via `document.querySelectorAll('button')` eval targeting the OK button before folder navigation.
- Treeitem names in the nav pane include unread counts and state (e.g., `"Inbox selected 564 unread"`) — aliases need to match prefixes only. `Junk E-mail` is hyphenated (not `Junk Email`).

**Known technical debt:**
- Folder navigation via treeitem click is susceptible to the DOM modal re-appearing between batch commands — URL-based navigation would be more reliable for v1.2
- `calendar-read` all-day popup date parsing produces null times (WR-01, 06-REVIEW.md)
- `runCalendar` parses rows twice during dedup + output (WR-02)
- Organizer name heuristic matches digits in location tokens (WR-03)
- `calendar-search` combobox `find` lacks `--name` filter (WR-04)

## Constraints

- **Interface**: CLI-invocable only — must work without an MCP server, invoked as a Claude Code skill by the personal assistant
- **Safety**: Strictly read-only — zero write operations, enforced at the skill level via Action Policy JSON (`default: deny`)
- **Browser**: Uses `@vercel/agent-browser` npm package — no Playwright/Puppeteer directly
- **Auth**: Session must survive across separate CLI invocations (`--session-name outlook-skill`)
- **Output**: JSON to stdout — clean, parseable; stderr for diagnostic logging only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser automation over Graph API | User preference; avoids Azure app registration complexity | ✓ Good — passed bot detection, no OAuth complexity |
| `@vercel/agent-browser` as browser engine | Built for agentic CLI use; user's specified tool | ✓ Good — batch mode + eval support sufficient for all use cases |
| Visible browser for first-time auth | MFA/SSO flows need human interaction; headless can't handle them | ✓ Good — `--headed` passes Entra Conditional Access |
| JSON to stdout, stderr for logging | Personal assistant Claude Code instance can parse it directly | ✓ Good — clean separation maintained throughout |
| Read-only enforcement at skill level (Action Policy JSON) | Safety boundary — prevents accidental or prompt-injected mutations | ✓ Good — `default: deny` policy enforced before every browser launch |
| `--session-name outlook-skill` (no `--profile`) | `--profile` causes Chrome SingletonLock conflicts across invocations | ✓ Good — sessions persist reliably across separate Node.js processes |
| Composite key IDs for calendar events | No stable DOM ID on calendar event buttons | ✓ Good — `JSON.stringify({ subject, start_time })` works; limitation documented |
| `attendee_summary` always present, `--full` opt-in for individual attendees + meeting link | Avoids fetching full event view for every calendar-read call | ✓ Good — fast by default, rich data on demand |
| `scoring.json` for digest scoring weights (externalised) | Allows per-user calibration without code changes | ✓ Good — `tune` subcommand enables live adjustment |

---
*Last updated: 2026-04-15 after v1.1 milestone*
