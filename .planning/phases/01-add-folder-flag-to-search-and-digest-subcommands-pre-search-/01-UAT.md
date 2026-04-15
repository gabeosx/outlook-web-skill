---
status: partial
phase: 01-add-folder-flag-to-search-and-digest-subcommands-pre-search-
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md]
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. search --folder usage line
expected: Running the search subcommand with no args (or wrong args) prints a usage string that includes `[--folder <name>]`. The flag should be visible in the help/usage output.
result: pass

### 2. search --folder with known alias
expected: Running `search --query "test" --folder sent` (with an active Outlook session) navigates to the Sent folder in the sidebar before running the search. Results returned are from Sent, not Inbox.
result: issue
reported: "Initially appeared to work but user confirmed results were inbox emails, not sent items. Dialog likely blocked treeitem click silently, search ran against inbox instead."
severity: major

### 3. search --folder with custom folder name
expected: Running `search --query "test" --folder "My Custom Folder"` (with an active session) navigates to a folder matching that exact name in the sidebar. Unknown names pass through without error (no crash or rejection for unregistered folder names).
result: issue
reported: "A JavaScript confirm dialog (Office add-in consent for mail.example.com) blocks the page. Treeitem click fails with 'Element not found'. Skill reports SESSION_INVALID but root cause is the unhandled dialog. Dialog repeats on every batch command until dismissed."
severity: major

### 4. digest --folder usage line
expected: Running the digest subcommand with no args (or wrong args) prints a usage string that includes `[--folder <name>]`. The flag should be visible in the help/usage output.
result: issue
reported: "Digest has no usage error path — all args are optional so there is no error trigger. Additionally, `digest --folder` with no value silently falls back to inbox with no warning to the user."
severity: minor

### 5. digest --folder with known alias
expected: Running `digest --folder sent` (with an active Outlook session) navigates to the Sent folder before collecting today's emails. The JSON output contains emails from Sent, not Inbox.
result: issue
reported: "Alias resolved to 'Sent Items' but results are identical to previous inbox run (same IDs, same received emails — not sent mail). Dialog blocked the treeitem click, batch continued past the failure, and inbox data was returned silently with no error."
severity: major

### 6. digest --folder empty results (no Today group)
expected: Running `digest --folder` against a folder that has no "Today" grouping (e.g., Sent if it has no today emails) returns an empty results array in valid JSON — not an error or crash.
result: blocked
blocked_by: prior-phase
reason: "Folder navigation is broken due to dialog blocking treeitem clicks — digest always returns inbox data regardless of --folder. Cannot test empty-results behavior until dialog fix is in place."

### 7. README.md --folder documentation
expected: Opening README.md shows: (a) search usage line contains `[--folder <name>]`, (b) at least one `--folder` search example, (c) a folder aliases note listing the supported aliases, (d) digest usage line contains `[--folder <name>]`, (e) a digest `--folder` example, and (f) a Limitations note about folder scope.
result: pass

### 8. SKILL.md --folder documentation
expected: Opening SKILL.md shows: (a) search section usage line contains `[--folder <name>]`, (b) `--folder <name>` argument documented with aliases listed, (c) digest section usage line contains `[--folder <name>]`, (d) `--folder <name>` documented in digest section, and (e) a Critical note about top-level folder limitation.
result: pass

## Summary

total: 8
passed: 3
issues: 5
pending: 0
skipped: 0
blocked: 1

## Gaps

- truth: "search --folder navigates to target folder; results come from that folder, not Inbox"
  status: failed
  reason: "User confirmed results from search --folder sent were inbox emails, not sent items. Dialog blocks treeitem click silently and search runs against inbox instead."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Folder navigation (--folder flag) works even when Outlook shows a confirm dialog"
  status: failed
  reason: "User reported: JavaScript confirm dialog (Office add-in consent for mail.example.com) blocks the page. Treeitem click fails with 'Element not found'. Skill reports SESSION_INVALID but root cause is the unhandled dialog."
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Skill output is quiet by default — stderr logging is limited to start, errors, and result count"
  status: failed
  reason: "User reported: stderr logs every internal step (batch command counts, scroll attempts, snapshot sizes, ID extraction) even on successful runs. This is wasteful tokens-wise when consumed by a calling agent."
  severity: minor
  test: 0
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "digest --folder navigates to target folder; results come from that folder, not Inbox"
  status: failed
  reason: "User reported: results from --folder sent are identical to inbox results (same IDs, received emails not sent mail). Dialog blocks treeitem click, batch continues silently past failure, returns inbox data with no error."
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "digest --folder with missing value warns the user or shows usage guidance"
  status: failed
  reason: "digest --folder (no value) silently falls back to inbox with no warning. Digest also has no usage error path since all args are optional."
  severity: minor
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
