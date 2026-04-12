# Phase 5: Skill Packaging - Context

**Gathered:** 2026-04-12 (assumptions mode — user delegated all decisions)
**Status:** Ready for planning

<domain>
## Phase Boundary

Write `SKILL.md` and three reference files so a calling Claude Code agent can invoke all four subcommands (`auth`, `search`, `read`, `digest`) correctly without ever reading the skill's source code. No code changes — documentation only.

Deliverables:
- `SKILL.md` at the skill root (new file)
- `references/kql-syntax.md` (new file)
- `references/error-recovery.md` (new file)
- `references/digest-signals.md` (new file)

</domain>

<decisions>
## Implementation Decisions

### SKILL.md Structure and Depth

- **D-01:** SKILL.md uses a **hybrid format**: full JSON schemas for all four subcommands are included inline, AND SKILL.md explicitly instructs the calling agent to read each reference file for domain-specific knowledge. This lets the calling agent work from SKILL.md alone for invocation/parsing while refs handle KQL, error recovery, and scoring explanation.
- **D-02:** SKILL.md stays under 500 lines (skill-creator progressive-disclosure convention). If schemas push past this, schemas move to a `references/schemas.md` and SKILL.md points to it.
- **D-03:** SKILL.md uses the agent-browser SKILL.md frontmatter convention: YAML frontmatter with `name`, `description` (triggering text), and `allowed-tools`.
- **D-04:** SKILL.md includes a brief **Setup section** documenting the three required env vars (`OUTLOOK_BASE_URL`, `OUTLOOK_BROWSER_PATH`, `OUTLOOK_BROWSER_PROFILE`), `scoring.json.example` → `scoring.json` copy step, and the first-time auth command. This is domain knowledge the calling agent cannot be assumed to know from general training.
- **D-05:** SKILL.md states the read-only constraint explicitly and unconditionally — the skill will NEVER send, delete, move, reply to, or accept/decline anything. This is the safety boundary the calling agent must surface to users.

### JSON Schema Representation

- **D-06:** Schemas are written as **annotated JSON examples** (not TypeScript interfaces, not JSON Schema format) — one example per subcommand showing a realistic successful response and one showing an error response. This is the most readable format for a calling LLM.
- **D-07:** All four subcommands use the standard envelope: `{"operation": "...", "status": "ok|error", "results": [...], "error": null|{"code": "...", "message": "..."}}`. Document this envelope once at the top, then show per-subcommand `results` shape.

### KQL Reference Scope (`references/kql-syntax.md`)

- **D-08:** Document exactly the **7 tested operators** from REQUIREMENTS (SRCH-01): `from:`, `subject:`, `has:attachment`, `is:unread`, `is:flagged`, `before:`, `after:` — each with at least one working example drawn from real-world patterns (e.g., `from:alice@example.com`, `before:2024-01-01`).
- **D-09:** Also document **AND/OR/NOT combinations** with examples — these are standard KQL and the calling agent needs them for compound queries.
- **D-10:** Any Outlook KQL features beyond these are explicitly labelled **"Unverified — not tested against this deployment"** to prevent the calling agent from confidently issuing queries that may not work.
- **D-11:** Include a section on **free-text keyword search** (no operator prefix) since it's the most common pattern for natural-language queries.
- **D-12:** Include a section on **date format** for `before:`/`after:` (ISO 8601 `YYYY-MM-DD` confirmed working).

### Error Recovery Documentation (`references/error-recovery.md`)

- **D-13:** Document all four error codes: `SESSION_INVALID`, `AUTH_REQUIRED`, `OPERATION_FAILED`, `INVALID_ARGS`. Per REQUIREMENTS PKG-05:
  - `SESSION_INVALID` → run `node outlook.js auth`, prompt user to complete login if browser opens
  - `AUTH_REQUIRED` → same as SESSION_INVALID (headed auth required)
  - `OPERATION_FAILED` → retry the operation once; if still fails, surface the raw `error.message` to the user
  - `INVALID_ARGS` → programming error; do not retry; fix the command
- **D-14:** Write as **decision trees**, not just descriptions — the calling agent should be able to follow the exact steps without judgment calls.
- **D-15:** Note that `SESSION_INVALID` mid-operation (during `search`, `read`, or `digest`) means the session expired after the skill was invoked successfully at least once. The correct response is always `auth` first, then retry the original operation.

### Digest Signals Documentation (`references/digest-signals.md`)

- **D-16:** Document the scoring algorithm with **default weights** (from `scoring.json.example`): unread-human +40, unread-channel +20, high-importance prefix +40, urgency keyword +5 each (max +20 total). Note that `scoring.json` overrides these defaults and can be customized per-user.
- **D-17:** Document all possible `importance_signals` string values: `"unread"`, `"unread:channel"`, `"high_importance"`, `"keyword:<term>"`, `"bulk"` — with plain-English meanings the calling agent can use to explain results.
- **D-18:** Include a **natural language explanation template** — example phrasing the calling agent can use when explaining a digest result to a user (e.g., "This email from Alice scored 80 because it's unread (+40) and marked high-importance (+40)").
- **D-19:** Document the `bulk` suppression signal explicitly: `"bulk"` in `importance_signals` means the unread bonus was suppressed because the sender matches a bulk-email pattern. The calling agent should communicate this as "newsletter/automated email."
- **D-20:** Reference `scoring.json.example` in the doc — if a user wants to calibrate scores, they copy the example to `scoring.json` and edit it. The `tune` subcommand samples the inbox to recommend calibration.

### Claude's Discretion

- Exact wording/tone in SKILL.md prose (informative, not verbose)
- Whether to add a `tune` subcommand section in SKILL.md (it's operational, not safety-critical — include it briefly)
- Ordering of sections within SKILL.md
- Whether `references/schemas.md` is needed (only if inline schemas push SKILL.md over 500 lines)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` §Skill Packaging — PKG-01 through PKG-07, the primary acceptance criteria for this phase
- `.planning/ROADMAP.md` §Phase 5: Skill Packaging — success criteria and plan count

### Existing Skill Packaging Convention

- `.agents/skills/agent-browser/SKILL.md` — canonical example of a well-structured SKILL.md with YAML frontmatter; use as format reference
- `.agents/skills/agent-browser/references/` — example of how reference files are organized; note that this skill's references teach agent-browser CLI usage, the outlook skill's references should teach Outlook-domain knowledge

### Source of Truth for Schema and Behavior

- `outlook.js` — entry point; env vars, subcommand dispatch, error handling for INVALID_ARGS
- `lib/output.js` — JSON envelope construction; authoritative source for output format
- `lib/session.js` — session detection, login URL patterns, error codes
- `lib/search.js` — search result JSON shape; field names for SRCH-05
- `lib/read.js` — read result JSON shape; field names for READ-03
- `lib/digest.js` — digest result JSON shape, scoring logic; field names for DIGT-03
- `lib/tune.js` — tune subcommand (if it exists); document in SKILL.md

### Scoring Configuration

- `scoring.json.example` — default weights and patterns; digest-signals.md should reference this
- `.planning/STATE.md` §Decisions — D-14 scoring model decisions and unread tier decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `lib/output.js` — `outputOk()` and `outputError()` define the JSON envelope format; read it to get the exact field names before writing schemas
- `scoring.json.example` — has the exact default scoring weights to document in digest-signals.md

### Established Patterns

- **Session name:** `--session-name outlook-skill` (hard-coded in `lib/run.js`) — document this in SKILL.md setup
- **Env vars:** `OUTLOOK_BASE_URL`, `OUTLOOK_BROWSER_PATH`, `OUTLOOK_BROWSER_PROFILE` — all required; validated at startup before any browser launch
- **Policy files:** `policy-auth.json`, `policy-search.json`, `policy-read.json` — exist at project root; the calling agent doesn't need to know about these but they're the safety enforcement layer
- **Content boundaries:** `AGENT_BROWSER_CONTENT_BOUNDARIES=1` prevents email content from reaching the calling agent via prompt injection (SAFE-03) — worth mentioning in SKILL.md's safety section

### Integration Points

- The calling personal assistant agent invokes `node outlook.js <subcommand> [args]` via `Bash` tool
- All output goes to stdout as a single JSON line; stderr has diagnostic logs only
- Exit code 0 = operation completed (check `status` field), exit code 1 = fatal error before JSON was written
- `tune` subcommand exists in `outlook.js` as a valid command (added in quick task 260412-hek); document it briefly in SKILL.md

</code_context>

<specifics>
## Specific Ideas

- User delegated all decisions to Claude — no specific references or "I want it like X" moments
- Memory note: skills need reference files that **teach domain knowledge to the calling LLM** — KQL syntax, UI patterns, error recovery. SKILL.md alone is insufficient if the calling agent doesn't know Outlook's KQL dialect.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)

No pending todos found for this phase.

</deferred>

---

*Phase: 05-skill-packaging*
*Context gathered: 2026-04-12*
