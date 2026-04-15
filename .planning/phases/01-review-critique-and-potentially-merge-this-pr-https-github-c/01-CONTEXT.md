# Phase 1: PR Review (gabeosx/outlook-web-skill#1) - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Review, critique, and decide on merging PR #1 (feat: add teams and copilot-summary subcommands).
PR adds +1005 lines / -27: `lib/teams.js`, `lib/copilot.js`, run.js changes, policy expansion, and docs.
Phase delivers a review with documented findings, requested changes, and a final merge/reject decision.

</domain>

<decisions>
## Implementation Decisions

### Scope
- **D-01:** Teams + Copilot subcommands are in scope for this project — accept the capability expansion
- **D-02:** `teams` is confirmed read-only (ARIA snapshot only, no keyboard input, no message sends)
- **D-03:** `copilot-summary` sends prompts to Copilot AI only — does not send Teams messages to any person

### --profile regression
- **D-04:** Request changes: revert `lib/run.js` to always use `--session-name outlook-skill`; remove the `OUTLOOK_BROWSER_PROFILE`-gated `--profile` branch
- **D-05:** Rationale: STATE.md architecture decision stands — "Chrome SingletonLock prevents two processes on same profile"; `--session-name` is sufficient for Teams auth once the session is established
- **D-06:** `filterStderr` helper can be retained (it suppresses unrelated warnings)

### copilot-summary safety framing
- **D-07:** Not a read-only violation — accept as-is. The read-only constraint applies to Outlook/Teams data (email, calendar, chat messages). Copilot chat is a separate AI surface; typing a summary prompt does not mutate any user data.
- **D-08:** No additional safety documentation needed for this distinction

### Policy files
- **D-09:** Request changes: split `policy-search.json` into separate files for teams/copilot
  - `policy-search.json` — email/digest/search operations only; NO `keyboard`, `getbytext`, `getbylabel`, `getbyplaceholder`
  - `policy-teams.json` — teams subcommand; allow `getbytext`, `click`, `snapshot`, `eval`
  - `policy-copilot.json` — copilot-summary subcommand; allow `keyboard`, `getbytext`, `getbylabel`, `getbyplaceholder`, `click`, `press`, `fill`, `snapshot`, `eval`
- **D-10:** Principle: each subcommand should use the most restrictive policy that enables its operation

### Claude's Discretion
- Whether to surface any additional non-blocking code quality observations (e.g., `isTeamsLoginUrl` duplicating `isLoginUrl` from session.js)
- Exact wording of PR review comments
- Whether to test the Teams/Copilot subcommands locally before merging

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PR under review
- `https://github.com/gabeosx/outlook-web-skill/pull/1` — PR #1, author: Greg Callegari (calleggr)

### Architecture decisions (must be respected)
- `.planning/STATE.md` §Decisions — "No `--profile` CLI flag" decision and other locked architectural choices
- `CLAUDE.md` §Technology Stack — `--session-name` vs `--profile` decision table

### Files changed in the PR
- `lib/run.js` — `--profile` / `--session-name` switching logic (revert target)
- `lib/teams.js` — new Teams subcommand (409 lines)
- `lib/copilot.js` — new Copilot subcommand (341 lines)
- `policy-search.json` — expanded action allowlist (split target)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/session.js` — `isLoginUrl()` exists; `isTeamsLoginUrl()` in `teams.js` duplicates it; non-blocking but worth noting
- `lib/run.js` — `filterStderr()` added in PR is a net improvement regardless of `--profile` decision; keep it
- `policy-auth.json` — reference for how a per-operation policy file is structured (use as template for policy-teams.json / policy-copilot.json)

### Established Patterns
- Session persistence uses `--session-name outlook-skill` throughout all existing subcommands
- All subcommands write JSON to stdout, log to stderr via `log()` — teams/copilot follow this correctly
- `runBatch` is the standard for all browser operations — teams/copilot use it correctly

### Integration Points
- `outlook.js` dispatch switch — PR extends `VALID_COMMANDS` and adds two `case` entries; pattern is correct
- Env validation in `outlook.js` — PR adds command-aware validation; the approach (skip `OUTLOOK_BASE_URL` for teams/copilot) is sound and should be kept

</code_context>

<specifics>
## Specific Ideas

- The `--profile` revert is the primary blocker — no merge until this is resolved
- Policy split is a required change before merge; three files: `policy-search.json` (email), `policy-teams.json` (teams), `policy-copilot.json` (copilot)
- Teams + Copilot functionality is accepted as-is if the two blockers are addressed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-review-critique-and-potentially-merge-this-pr-https-github-c*
*Context gathered: 2026-04-15*
