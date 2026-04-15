---
phase: 01-review-critique-and-potentially-merge-this-pr
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - .env.example
  - CLAUDE.md
  - lib/copilot.js
  - lib/run.js
  - lib/teams.js
  - outlook.js
  - policy-copilot.json
  - policy-teams.json
  - README.md
  - SKILL.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This PR adds two new subcommands — `teams` and `copilot-summary` — along with their supporting library modules (`lib/teams.js`, `lib/copilot.js`), action policies (`policy-teams.json`, `policy-copilot.json`), and documentation updates (README.md, SKILL.md). The env validation in `outlook.js` was also updated to be command-aware.

The overall implementation is solid: the read-only safety architecture is consistent, the action policies correctly use `"default": "deny"`, and the JSON output contract is well-defined. No security vulnerabilities or data-loss risks were found.

Three warnings require attention before merge: a `spawnSync` call that does not check for process spawn failure (would throw uncaught), an unused variable that indicates dead control-flow code, and a prompt injection vector in the `--prompt` flag that is explicitly passed to Copilot without any content-boundary annotation. Three informational items are also noted.

---

## Warnings

### WR-01: `spawnSync` spawn failure not detected in `runAgentBrowser`, `runBatch`, and `runEval`

**File:** `lib/run.js:61-77`, `lib/run.js:112-129`, `lib/run.js:154-171`

**Issue:** `spawnSync` returns an object with an `error` property when the binary cannot be found or fails to launch (e.g., `ENOENT` when `agent-browser` is not on `PATH`). All three wrappers read `result.status ?? 1` as the error sentinel, but if `result.error` is set (spawn failure), `result.status` is `null` — the `?? 1` correctly converts null to 1, so callers do detect a non-zero status. However, the actual error object is silently swallowed: `result.stderr` is also empty on spawn failure, so the logged `stderr` message is blank and the diagnostic message gives the operator no actionable information. This is a pre-existing issue, but `runBatch` is new code that replicates the same pattern.

More critically, if `spawnSync` throws (which can happen if `input` exceeds the OS pipe buffer on some platforms), the exception is completely unhandled and will crash the process with an unformatted stack trace on stdout, violating the JSON-only stdout contract.

**Fix:**
```javascript
const result = spawnSync('agent-browser', finalArgs, { ... });

// Detect spawn failure (binary not found, permission denied, etc.)
if (result.error) {
  log(`spawn error: ${result.error.message}`);
  return { stdout: '', stderr: result.error.message, status: 1 };
}
```
Add this check immediately after each `spawnSync` call in `runAgentBrowser` (line 61), `runBatch` (line 112), and `runEval` (line 154).

---

### WR-02: `inResponse` flag assigned but never read — dead control-flow in `extractCopilotResponse`

**File:** `lib/copilot.js:220`, `lib/copilot.js:239`

**Issue:** The variable `inResponse` is set to `true` when the first matching content line is found (line 239), but it is never subsequently read or used as a gate. This means the function's intent to track "are we inside the response block?" has no effect. It's likely that a filtering condition such as `if (!inResponse && someCondition) continue;` was omitted. As written, all lines passing the filters are appended regardless of where they appear in the snapshot, which may include UI chrome or earlier messages that happen to survive the keyword filters.

This is a logic correctness issue: the output could include text from earlier Copilot responses in the same chat session when `copilot-summary` is run more than once.

**Fix:** Either implement the `inResponse` gate (e.g., skip lines before the first match if there is a known anchor in the snapshot), or remove the variable entirely if the design intent is truly to collect all matching lines unconditionally:
```javascript
// Option A: remove dead variable
// Delete lines 220 and 239 entirely

// Option B: implement the intended gate (if the goal is to skip pre-response lines)
// Define what "start of response" means in the snapshot and set inResponse=true there,
// then add `if (!inResponse) continue;` before appending to responseLines
```

---

### WR-03: User-supplied `--prompt` value passed to Copilot without content-boundary annotation

**File:** `lib/copilot.js:286-287`, `lib/copilot.js:143-145`

**Issue:** The `--prompt` argument is accepted from the command line and passed verbatim as the prompt to Copilot in Teams. The calling agent (a personal assistant Claude Code instance) constructs this prompt, potentially including content from emails or Teams messages it has already read. If adversarial text from an email body reaches the `--prompt` argument, it is sent directly to Copilot, which has access to the user's full mailbox. This is a prompt injection amplification path: malicious content in an email body → agent reads email → agent passes summary to `--prompt` → Copilot acts on it with elevated context.

This is lower-severity than a direct injection (it requires the calling agent to make a poor decision), but it is worth a design note and a defensive measure.

**Fix:** Document this risk in `SKILL.md` and `README.md` under the copilot-summary section. Optionally, add a length cap and a content warning in the skill descriptor instructing the calling agent never to pass user-sourced content as `--prompt`:
```javascript
// In parseArgs, add a length limit
if (args[i] === '--prompt' && i + 1 < args.length) {
  customPrompt = args[i + 1].slice(0, 2000);  // prevent oversized injection attempts
  i++;
}
```
And in SKILL.md:
```
**Security note:** Never pass content from emails or Teams messages as `--prompt`. 
The `--prompt` flag is for operator-defined prompts only.
```

---

## Info

### IN-01: `OUTLOOK_BROWSER_PROFILE` env var is validated and expanded but never passed to `agent-browser`

**File:** `outlook.js:22`, `lib/run.js` (all three wrappers)

**Issue:** `OUTLOOK_BROWSER_PROFILE` is listed in `ALWAYS_REQUIRED`, tilde-expanded, and logged during `auth` (`lib/session.js:145`). However, none of the `runAgentBrowser`, `runBatch`, or `runEval` wrappers in `lib/run.js` pass it to `agent-browser` as a `--profile` flag. The session is persisted via `--session-name outlook-skill` instead. This makes `OUTLOOK_BROWSER_PROFILE` a required but non-functional env var — a confusing contract for users who set it expecting it to affect behavior.

The CLAUDE.md stack decision explicitly chose `--session-name` over `--profile`. Either the env var should be optional (remove from `ALWAYS_REQUIRED`), or the README/SKILL.md should clarify that it is used for reference/documentation purposes only, not passed to the browser.

**Fix:** Either remove `OUTLOOK_BROWSER_PROFILE` from `ALWAYS_REQUIRED` (the session-name approach does not need it), or add a comment explaining why it's required but not forwarded to `agent-browser`. The current setup will confuse operators who misconfigure the path and see no error from the browser layer.

---

### IN-02: `policy-copilot.json` allows `fill` and `press` actions not used by the Teams navigation flow

**File:** `policy-copilot.json:14-15`

**Issue:** `policy-copilot.json` includes `fill`, `press`, `eval`, `evaluate`, `keyboard`, `getbytext`, `getbylabel`, `getbyplaceholder`, and `find` in its allowlist. The `fill` action is for form filling (write operation on form inputs) and is a broader permission than what `lib/copilot.js` actually uses. The Copilot flow uses `keyboard type` and `press Enter` to type into the compose box (due to the cross-origin iframe constraint documented in `lib/copilot.js:133`), so `fill` is unnecessary and expands the attack surface.

**Fix:** Remove `fill`, `getbylabel`, and `getbyplaceholder` from `policy-copilot.json` since the copilot flow does not use them:
```json
{
  "default": "deny",
  "allow": [
    "launch", "navigate", "snapshot", "get", "url", "wait", "scroll",
    "close", "state", "session", "click", "press", "eval", "evaluate",
    "keyboard", "getbytext", "find"
  ]
}
```

---

### IN-03: README safety section references policy files that do not exist in the new subcommands

**File:** `README.md:668`

**Issue:** The Safety section states: "The action policy (`policy-read.json`, `policy-search.json`, `policy-auth.json`) is enforced at the `agent-browser` layer…". This list is incomplete — `policy-teams.json` and `policy-copilot.json` are not mentioned, even though both were added in this PR. The omission is minor but leaves the safety documentation incomplete for the new subcommands.

**Fix:** Update the Safety section to include all five policy files:
```
The action policy (`policy-read.json`, `policy-search.json`, `policy-auth.json`,
`policy-teams.json`, `policy-copilot.json`) is enforced at the `agent-browser` layer…
```

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
