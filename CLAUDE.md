<!-- GSD:project-start source:PROJECT.md -->
## Project

**Outlook Web Skill**

A Claude Code skill (or set of skills) that gives a personal assistant Claude Code instance read-only access to Outlook web. It uses the `@vercel/agent-browser` npm package to control a browser via CLI, navigates to the Outlook web UI, handles authentication state detection, and returns structured JSON data to the calling agent.

**Core Value:** A personal assistant Claude Code instance can reliably read and search the user's Outlook inbox without ever sending, deleting, or mutating anything.

### Constraints

- **Interface**: CLI-invocable only — must work without an MCP server, invoked as a Claude Code skill by the personal assistant
- **Safety**: Strictly read-only — zero write operations, enforced at the skill level
- **Browser**: Uses `@vercel/agent-browser` npm package — no Playwright/Puppeteer directly unless agent-browser depends on it
- **Auth**: Session must survive across separate CLI invocations (cookie/storage persistence)
- **Output**: JSON to stdout — clean, parseable, no mixed logging on stdout
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Script Language: Bash (primary), with Node.js for JSON transformation
### Claude Code Skill Packaging Convention
### Session Persistence: `--session-name` (primary)
| Option | For Outlook web | Verdict |
|--------|-----------------|---------|
| `--session-name outlook-web` | Auto-saves cookies + localStorage on close. Zero file management. Works across invocations. | **USE THIS** |
| `--profile ~/.outlook-web-profile` | Persists everything (IndexedDB, service workers, cache). More durable for complex SPAs. | Secondary option if `--session-name` loses IndexedDB auth tokens |
| `--state ./auth.json` (manual) | Explicit save/load, more control but requires manual state save step | Fallback only |
| `--auto-connect` (import from running Chrome) | Good for first-time bootstrap: user is already logged in to Outlook in Chrome | Use for initial auth setup ONLY |
### JSON Output Format
# In shell script:
- Complex string manipulation (email body parsing, date normalization) is painful in jq
- Node.js is confirmed present (`.claude/package.json` exists)
- `JSON.parse` + `JSON.stringify` are first-class, no quoting hazards
- Can be unit-tested independently of browser session
### Action Policy (Read-Only Enforcement)
### Content Boundaries (Prompt Injection Defense)
### Output Size Limits
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
## Key Environment Variables
# Required
# Recommended
# Debug only
## Sources
- `/Users/b.g.albert/outlook-web-skill/.agents/skills/agent-browser/SKILL.md` — agent-browser CLI reference (direct inspection, HIGH confidence)
- `/Users/b.g.albert/outlook-web-skill/.agents/skills/agent-browser/references/authentication.md` — auth patterns (direct inspection, HIGH confidence)
- `/Users/b.g.albert/outlook-web-skill/.agents/skills/agent-browser/references/session-management.md` — session patterns (direct inspection, HIGH confidence)
- `/Users/b.g.albert/outlook-web-skill/.planning/PROJECT.md` — requirements and constraints (direct inspection, HIGH confidence)
- `.claude/skills/agent-browser` symlink structure — observed skill packaging convention (direct inspection, HIGH confidence)
- `skills-lock.json` — skill registry format (direct inspection, HIGH confidence)
- Email JSON schema: synthesized from project requirements; no authoritative standard for LLM-consumable email JSON exists (MEDIUM confidence — field names are conventional, not standardized)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| agent-browser | Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", or any task requiring programmatic web interaction. | `.agents/skills/agent-browser/SKILL.md` |
| skill-creator | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy. | `.agents/skills/skill-creator/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
