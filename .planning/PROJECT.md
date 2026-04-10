# Outlook Web Skill

## What This Is

A Claude Code skill (or set of skills) that gives a personal assistant Claude Code instance read-only access to Outlook web. It uses the `@vercel/agent-browser` npm package to control a browser via CLI, navigates to the Outlook web UI, handles authentication state detection, and returns structured JSON data to the calling agent.

## Core Value

A personal assistant Claude Code instance can reliably read and search the user's Outlook inbox without ever sending, deleting, or mutating anything.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Skill detects whether the Outlook web session is authenticated
- [ ] When not authenticated, skill launches a visible browser so the user can log in manually, then persists the session for future runs
- [ ] Skill exposes a `search` operation: find emails by query (sender, subject, date range, keywords)
- [ ] Skill exposes a `read` operation: fetch full content of a specific email by ID or URL
- [ ] Skill exposes a `digest` operation: pull today's inbox and surface important messages
- [ ] All operations return structured JSON to stdout
- [ ] Skill is strictly read-only — it must never send, delete, move, reply to, or accept/decline any email or calendar item
- [ ] Skill is loadable by a Claude Code personal assistant instance (packaged as a Claude Code skill)
- [ ] Bot detection risk is mitigated (human-like timing, session reuse)

### Out of Scope

- Sending or replying to emails — read-only constraint is a hard safety boundary
- Deleting, archiving, moving, or labeling emails — same reason
- Accepting or declining calendar invites — same reason
- Microsoft Graph API integration — using browser automation instead per design decision
- MCP server interface — the personal assistant can only invoke CLI; skill must work without MCP

## Context

- The personal assistant is a separate Claude Code project that will load this skill and invoke its operations
- The `@vercel/agent-browser` package provides a CLI-controlled browser designed for agentic use cases
- Primary concern: Outlook web may detect and block automated browsers — session reuse and human-like interaction patterns are the mitigation strategy
- Authentication requires human interaction on first run (MFA, SSO, etc.) — the skill must handle this gracefully by launching a visible browser and waiting for the user to complete login
- Session state (cookies) must be persisted to disk so subsequent runs are seamless
- The calling agent receives JSON on stdout and can parse it directly

## Constraints

- **Interface**: CLI-invocable only — must work without an MCP server, invoked as a Claude Code skill by the personal assistant
- **Safety**: Strictly read-only — zero write operations, enforced at the skill level
- **Browser**: Uses `@vercel/agent-browser` npm package — no Playwright/Puppeteer directly unless agent-browser depends on it
- **Auth**: Session must survive across separate CLI invocations (cookie/storage persistence)
- **Output**: JSON to stdout — clean, parseable, no mixed logging on stdout

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser automation over Graph API | User preference; avoids Azure app registration complexity | — Pending |
| @vercel/agent-browser as browser engine | Built for agentic CLI use; user's specified tool | — Pending |
| Visible browser for first-time auth | MFA/SSO flows need human interaction; headless can't handle them | — Pending |
| JSON to stdout as output format | Personal assistant Claude Code instance can parse it directly | — Pending |
| Read-only enforcement at skill level | Safety boundary — prevents accidental or prompt-injected mutations | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after initialization*
