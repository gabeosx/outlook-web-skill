# Phase 01: PR Review (gabeosx/outlook-web-skill#1) - Research

**Researched:** 2026-04-15
**Domain:** GitHub PR review, Node.js codebase diff analysis, action policy security
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Teams + Copilot subcommands are in scope for this project — accept the capability expansion
- **D-02:** `teams` is confirmed read-only (ARIA snapshot only, no keyboard input, no message sends)
- **D-03:** `copilot-summary` sends prompts to Copilot AI only — does not send Teams messages to any person
- **D-04:** Request changes: revert `lib/run.js` to always use `--session-name outlook-skill`; remove the `OUTLOOK_BROWSER_PROFILE`-gated `--profile` branch
- **D-05:** Rationale: STATE.md architecture decision stands — "Chrome SingletonLock prevents two processes on same profile"; `--session-name` is sufficient for Teams auth once the session is established
- **D-06:** `filterStderr` helper can be retained (it suppresses unrelated warnings)
- **D-07:** `copilot-summary` is not a read-only violation — accept as-is
- **D-08:** No additional safety documentation needed for copilot safety distinction
- **D-09:** Request changes: split `policy-search.json` into separate files for teams/copilot
  - `policy-search.json` — email/digest/search operations only; NO `keyboard`, `getbytext`, `getbylabel`, `getbyplaceholder`
  - `policy-teams.json` — teams subcommand; allow `getbytext`, `click`, `snapshot`, `eval`
  - `policy-copilot.json` — copilot-summary subcommand; allow `keyboard`, `getbytext`, `getbylabel`, `getbyplaceholder`, `click`, `press`, `fill`, `snapshot`, `eval`
- **D-10:** Principle: each subcommand should use the most restrictive policy that enables its operation

### Claude's Discretion

- Whether to surface any additional non-blocking code quality observations (e.g., `isTeamsLoginUrl` duplicating `isLoginUrl` from session.js)
- Exact wording of PR review comments
- Whether to test the Teams/Copilot subcommands locally before merging

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

PR #1 (`feat: add teams and copilot-summary subcommands`) by Greg Callegari adds +1005 lines / -27
across 9 files. It is currently in a `CONFLICTING` merge state against `main` because the local
`main` branch has advanced significantly since the PR branched off (commit `1beae72`). The diverging
`main` commits added calendar subcommands, a `--folder` flag, a `dialog` action in
`policy-search.json`, and various bug fixes that the PR branch does not have.

Two blocking changes are required before merge: (1) revert the `--profile` / `OUTLOOK_BROWSER_PROFILE`-
gated session logic in `lib/run.js` to hardcode `--session-name outlook-skill`, and (2) split the
expanded `policy-search.json` into three separate files (`policy-search.json`, `policy-teams.json`,
`policy-copilot.json`). The new `lib/teams.js` and `lib/copilot.js` modules are functionally
accepted as-is once those two changes land.

**Primary recommendation:** Post a "request changes" review comment on the PR with the two
blocking items; the planner should also produce a merge plan that resolves the conflict and
applies the required changes, rather than waiting for the PR author (who may not be active).

---

## PR State — What the Diff Actually Contains

### Files changed in PR vs. local `main`

| File | PR changes (vs. merge-base) | Conflict with local main? |
|------|-----------------------------|---------------------------|
| `lib/teams.js` | New file, 409 lines | No (file doesn't exist on main) |
| `lib/copilot.js` | New file, 341 lines | No (file doesn't exist on main) |
| `lib/run.js` | `filterStderr` helper + `--profile` / `--session-name` switching in all 3 call sites | YES — main has `log(...)` statements added, same lines touched |
| `outlook.js` | Command-aware env validation, drops `OUTLOOK_BROWSER_PROFILE` from REQUIRED, adds teams/copilot dispatch, drops calendar subcommands | YES — main has calendar commands, `log()` call, different required env list |
| `policy-search.json` | Adds `getbytext`, `getbylabel`, `getbyplaceholder`, `keyboard`; removes `dialog` | YES — main has `dialog` in the allow list |
| `CLAUDE.md` | Expands project description to mention Teams | Minor — main has different content |
| `README.md` | Adds `teams` + `copilot-summary` documentation sections | YES — main has `--folder` and calendar docs |
| `SKILL.md` | Adds `teams` + `copilot-summary` subcommand docs, updates error codes table | YES — main has `--folder` docs |
| `.env.example` | Adds `TEAMS_BASE_URL` optional env var comment | No — clean addition |

### Merge conflict state

```
mergeable: CONFLICTING
mergeStateStatus: DIRTY
```

The PR cannot be merged via GitHub's button. Conflict resolution must happen locally:
either the PR author rebases, or the reviewer cherry-picks/applies the changes manually
to a new branch off `main`.

---

## Standard Stack

This phase is about code review and conflict resolution — no new libraries introduced.

### Existing infrastructure used by the PR

| Component | Where | Relevant Detail |
|-----------|-------|-----------------|
| `lib/run.js` — `runBatch()` | `teams.js`, `copilot.js` | Correct usage; both new files call it the same way as existing subcommands |
| `lib/output.js` — `outputError()`, `log()` | `teams.js`, `copilot.js` | Correct — JSON to stdout, log to stderr |
| `lib/session.js` — `isLoginUrl()` | `teams.js` (indirectly via `isTeamsLoginUrl`), `copilot.js` (directly) | `copilot.js` correctly imports `isLoginUrl`; `teams.js` re-implements it as `isTeamsLoginUrl` |
| `policy-auth.json` | Template for new policy files | Use as structural template |

---

## Architecture Patterns

### What the existing subcommand pattern looks like

```
1. Parse argv (parseArgs in each lib/*.js)
2. Call runBatch([...commands], 'policy-xxx.json')
3. stripContentBoundaries(result.stdout)
4. Session check (isLoginUrl on URL line in output)
5. Parse ARIA snapshot text into structured items
6. process.stdout.write(JSON.stringify({...}) + '\n')
7. log() for all diagnostic output
```

Both `teams.js` and `copilot.js` follow this pattern correctly. [VERIFIED: direct inspection of lib/teams.js and lib/copilot.js]

### Policy file pattern (existing)

```json
{
  "default": "deny",
  "allow": ["launch", "navigate", "snapshot", ...]
}
```

`policy-auth.json` allow list: `["launch","navigate","snapshot","get","url","wait","scroll","close","state","session"]`
`policy-read.json` allow list: same as auth plus `"click"` and `"fill"`
`policy-search.json` (current main) allow list: adds `"press"`, `"eval"`, `"evaluate"`, `"getbyrole"`, `"dialog"`

[VERIFIED: direct inspection of all three policy files on main]

### Current `policy-search.json` on main

Contains `"dialog"` in the allow list — added by the `cd3beea` commit to handle Office add-in dialogs during folder navigation. The PR branch removes `"dialog"` (PR was branched before `cd3beea`). This must be preserved in the post-merge `policy-search.json`.

---

## Exact Required Changes

### Blocker 1: Revert `--profile` logic in `lib/run.js` (D-04)

**What the PR added** (3 locations in run.js):
```javascript
const profileFlag = process.env.OUTLOOK_BROWSER_PROFILE
  ? ['--profile', process.env.OUTLOOK_BROWSER_PROFILE]
  : ['--session-name', 'outlook-skill'];
```

**What it must be** (current main pattern):
```javascript
// runAgentBrowser:
const finalArgs = ['-q', '--session-name', 'outlook-skill', ...headedFlag, ...args];

// runBatch:
const finalArgs = ['-q', '--session-name', 'outlook-skill', ...headedFlag, 'batch'];

// runEval:
const finalArgs = ['-q', '--session-name', 'outlook-skill', 'eval', '--stdin'];
```

**Keep from the PR:** `filterStderr` helper + its usage replacing the raw `.stderr.trim()` calls.
Also keep the `log(...)` calls that the PR adds before each `spawnSync` call.

**Note:** Current main already has the `log(...)` lines in `runBatch` but NOT in `runAgentBrowser` or `runEval`. The PR adds `log(...)` to all three. This is a net improvement — keep all three.

### Blocker 2: Split `policy-search.json` into three files (D-09)

**New `policy-search.json`** (email/digest/search/folder only) — must retain `dialog`:
```json
{
  "default": "deny",
  "allow": [
    "launch", "navigate", "snapshot", "get", "url", "wait",
    "scroll", "close", "state", "session", "click", "fill",
    "press", "eval", "evaluate", "getbyrole", "dialog"
  ]
}
```

**New `policy-teams.json`** (teams subcommand):
```json
{
  "default": "deny",
  "allow": [
    "launch", "navigate", "snapshot", "get", "url", "wait",
    "scroll", "close", "state", "session",
    "click", "eval", "getbytext", "find"
  ]
}
```

**New `policy-copilot.json`** (copilot-summary subcommand):
```json
{
  "default": "deny",
  "allow": [
    "launch", "navigate", "snapshot", "get", "url", "wait",
    "scroll", "close", "state", "session",
    "click", "fill", "press", "eval", "evaluate",
    "keyboard", "getbytext", "getbylabel", "getbyplaceholder", "find"
  ]
}
```

**Update `lib/teams.js`:** Change `const POLICY = 'policy-search.json'` to `'policy-teams.json'`
**Update `lib/copilot.js`:** Change `const POLICY = 'policy-search.json'` to `'policy-copilot.json'`

### Conflict resolution: `outlook.js`

The PR drops calendar commands from `VALID_COMMANDS` and the dispatch switch. This is a regression —
`main` added `calendar`, `calendar-read`, `calendar-search` after the PR branched. The merge must
keep all of: email commands + folder awareness + calendar commands + teams + copilot-summary.

**Final `VALID_COMMANDS`** must be:
```javascript
const VALID_COMMANDS = ['auth', 'search', 'read', 'digest', 'tune', 'calendar', 'calendar-read', 'calendar-search', 'teams', 'copilot-summary'];
```

**Final env validation** — the PR's command-aware approach (skip `OUTLOOK_BASE_URL` for teams/copilot) is correct and should be kept. `calendar` does use `OUTLOOK_BASE_URL` so it should be included in `emailCommands`:
```javascript
const emailCommands = ['auth', 'search', 'read', 'digest', 'tune', 'calendar', 'calendar-read', 'calendar-search'];
```

### Conflict resolution: `policy-search.json`

The PR removes `"dialog"` (which arrived on main after the branch point). The final
`policy-search.json` must include `"dialog"` (required for folder navigation) and must NOT
include `keyboard`, `getbytext`, `getbylabel`, `getbyplaceholder` (those go in policy-copilot.json).

---

## Non-Blocking Observations (Claude's Discretion)

### `isTeamsLoginUrl` duplication

`lib/teams.js` defines its own `isTeamsLoginUrl()`:
```javascript
const TEAMS_LOGIN_DOMAINS = ['login.microsoftonline.com', 'login.live.com', 'login.windows.net'];
function isTeamsLoginUrl(url) {
  if (!url || url === 'about:blank') return true;
  return TEAMS_LOGIN_DOMAINS.some(d => url.includes(d));
}
```

`lib/session.js` already exports `isLoginUrl()` which checks identical domains:
```javascript
const LOGIN_DOMAINS = ['login.microsoftonline.com', 'login.live.com', 'login.windows.net'];
function isLoginUrl(url) {
  if (!url || url === 'about:blank') return true;
  return LOGIN_DOMAINS.some(d => url.includes(d));
}
```

Note: `lib/copilot.js` already imports `isLoginUrl` from `./session` correctly. The duplication in
`teams.js` is non-blocking but worth noting in the review comment.

### PR drops `OUTLOOK_BROWSER_PROFILE` from `ALWAYS_REQUIRED`

The PR removes `OUTLOOK_BROWSER_PROFILE` from the always-required env var list. This is correct
in spirit — `--profile` is no longer used — but `OUTLOOK_BROWSER_PROFILE` is still referenced in
`run.js` via `process.env.OUTLOOK_BROWSER_PROFILE` (for the tilde expansion). After reverting the
`--profile` logic in `run.js`, `OUTLOOK_BROWSER_PROFILE` will no longer be read by `run.js`, so it
becomes truly optional. However, `session.js` still references it in the `auth` log output:
```javascript
log(`auth: using profile: ${process.env.OUTLOOK_BROWSER_PROFILE}`);
```
That log line is cosmetic — it won't break. Worth noting but not a blocker.

### `find` action in `teams.js` / `copilot.js`

Both new files call `runBatch` with `['find', 'text', 'Activity', 'click']` style commands. The
action name `"find"` does not appear in the current `policy-search.json` allow list, but it is
NOT explicitly denied — the default is deny, so `"find"` would be blocked by default. The
policy-teams.json and policy-copilot.json created under D-09 must include `"find"` in their
allow lists for these subcommands to work.

[VERIFIED: direct inspection of lib/teams.js lines using `['find', ...]` and policy file structure]

---

## Conflict Resolution Strategy

The PR is marked `CONFLICTING` and cannot be merged via GitHub UI. Two approaches:

**Option A — Reviewer resolves conflicts locally and pushes to PR branch**
1. Check out PR branch: `git fetch origin feat/teams-copilot-v2 && git checkout feat/teams-copilot-v2`
2. Rebase onto main: `git rebase main` (resolve conflicts in outlook.js, lib/run.js, policy-search.json, README.md, SKILL.md, CLAUDE.md)
3. Apply the two required changes (--profile revert, policy split)
4. Push and merge

**Option B — Reviewer applies changes directly to main on a new branch**
1. Create `feat/teams-copilot-merge` branch off `main`
2. Copy `lib/teams.js` and `lib/copilot.js` from the PR branch directly (no conflicts — new files)
3. Hand-merge the required changes to `outlook.js`, `lib/run.js`, `policy-search.json`, docs
4. Apply the two required changes inline
5. Open a new PR or merge directly

Option B is simpler because: new files have no conflicts, and the conflicting files (outlook.js, run.js, policy-search.json) need hand-editing for the required changes anyway.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Policy file format | Custom permission system | `{"default":"deny","allow":[...]}` pattern already established |
| Session persistence | Manual cookie export | `--session-name outlook-skill` already handles this |
| JSON output | Custom format | `outputOk()` / `outputError()` from `lib/output.js` |

---

## Common Pitfalls

### Pitfall 1: Dropping `dialog` from `policy-search.json`
**What goes wrong:** The `cd3beea` commit added `"dialog"` to `policy-search.json` for the folder navigation feature. The PR branch predates this. Naively merging the PR's policy-search.json would silently break folder navigation.
**Prevention:** The post-merge `policy-search.json` must include `"dialog"`.

### Pitfall 2: Dropping calendar commands from `outlook.js`
**What goes wrong:** The PR's outlook.js diff removes calendar dispatch cases (they didn't exist when the branch was cut). Merging without reconciling would break `node outlook.js calendar`.
**Prevention:** Final VALID_COMMANDS and switch must include all calendar subcommands plus teams/copilot-summary.

### Pitfall 3: `find` action not in policy allow list
**What goes wrong:** `teams.js` uses `['find', 'text', 'Activity', 'click']` batch commands. If `"find"` is not in the allow list, these operations will be denied at the policy layer and fail silently.
**Prevention:** `policy-teams.json` and `policy-copilot.json` must include `"find"`.

### Pitfall 4: `OUTLOOK_BROWSER_PROFILE` still required by `tilde expand` in outlook.js
**What goes wrong:** After removing `--profile` from run.js, outlook.js still calls `expandTilde(process.env.OUTLOOK_BROWSER_PROFILE)`. If the env var is absent, `expandTilde` returns `undefined`, which would be set as `process.env.OUTLOOK_BROWSER_PROFILE = undefined`. This is benign (sets the string "undefined"), but confusing.
**Prevention:** Keep `OUTLOOK_BROWSER_PROFILE` in the required env list OR guard the expandTilde call. Simplest: keep it required (no behavior change for users who already have it set).

---

## Code Examples

### How the PR's `filterStderr` should be retained (keep, not revert)

```javascript
// Source: direct inspection of PR diff lib/run.js
function filterStderr(stderr) {
  if (!stderr) return '';
  return stderr.split('\n')
    .filter(line => !line.includes('--profile ignored'))
    .join('\n')
    .trim();
}
```

Replace raw `result.stderr.trim()` checks in all three call sites with `filterStderr(result.stderr)`.

### Final run.js `runBatch` pattern (after applying blocker 1)

```javascript
// Keep --session-name hardcoded (D-04)
// Keep filterStderr (D-06)
// Keep log() call added by PR
const headedFlag = (opts.headed || process.env.OUTLOOK_HEADED === '1') ? ['--headed'] : [];
const finalArgs = ['-q', '--session-name', 'outlook-skill', ...headedFlag, 'batch'];
log(`agent-browser batch (${commandArrays.length} commands)${headedFlag.length ? ' [--headed]' : ''}`);
// ...
const filteredBatch = filterStderr(result.stderr);
if (filteredBatch) {
  log(`batch stderr: ${filteredBatch}`);
}
```

---

## Environment Availability

Step 2.6: SKIPPED — this phase makes code changes and posts a PR review; no external runtime dependencies beyond `git` and `gh` CLI, which are confirmed available.

---

## Validation Architecture

Step 4: No automated test infrastructure exists in this project that covers the PR changes.
`lib/teams.js` and `lib/copilot.js` have no corresponding test files. Manual verification (run
`node outlook.js teams` against a live Teams session) is the only validation path, and this is
at-discretion per CONTEXT.md.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `"find"` is an agent-browser batch action that needs to be in the policy allow list | Pitfall 3 / Don't Hand-Roll | If `find` is always allowed or uses a different name, policy-teams.json would be wrong; verify against agent-browser SKILL.md |

---

## Open Questions

1. **Does `"find"` need to be in the policy allow list?**
   - What we know: `policy-search.json` allow list uses granular action names (`click`, `eval`, `getbyrole`, etc.)
   - What's unclear: The SKILL.md for agent-browser may clarify whether `find` is a recognized action name or whether it maps to something else
   - Recommendation: Include `"find"` in both `policy-teams.json` and `policy-copilot.json`. If it turns out not to be needed, it can be removed later without breaking anything.

2. **Should the PR author rebase, or should we apply the changes manually?**
   - What we know: PR is `CONFLICTING`, author (`calleggr`) may not be active
   - What's unclear: Whether `gabeosx` wants to post a review comment requesting changes first, or just fix and merge
   - Recommendation: Plan for Option B (apply to main locally) since it's simpler and the required changes are well-defined

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `lib/run.js`, `lib/session.js`, `outlook.js`, `policy-*.json` on local `main` branch
- `gh pr view https://github.com/gabeosx/outlook-web-skill/pull/1` — PR metadata (CONFLICTING, no reviews)
- `gh pr diff` — full PR diff text, all 9 files
- `git diff main FETCH_HEAD` — exact per-file deltas between local main and PR branch
- `.planning/phases/01-review-critique-and-potentially-merge-this-pr-https-github-c/01-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- None required — all research was done from direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- PR content and diff: HIGH — fetched live from GitHub, diffed against local main
- Required changes (blockers): HIGH — derived from CONTEXT.md locked decisions + direct file inspection
- Policy file contents: HIGH — read directly from repo
- Conflict scope: HIGH — verified via `git diff main FETCH_HEAD --name-only` and per-file diffs
- `"find"` action policy requirement: MEDIUM (A1 above)

**Research date:** 2026-04-15
**Valid until:** Stable — the PR and codebase are static; valid until the PR is merged or rebased
