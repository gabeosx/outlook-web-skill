---
status: resolved
trigger: "A persistent JavaScript confirm dialog blocks treeitem clicks in agent-browser batches, causing --folder navigation to fail silently or error. Fix all affected code paths."
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — DOM eval fix works. User confirmed search --folder sent returns correct results from Sent Items; digest --folder sent returns completely different emails from inbox run (different senders, IDs). Dialog warning still appears on stderr (cosmetic, from agent-browser heuristic) but no longer blocks execution.
test: Live run verification by user.
expecting: N/A — resolved.
next_action: DONE — session archived.

## Symptoms

expected: Running `node outlook.js search "test" --folder sent` navigates to Sent Items treeitem in the sidebar before running the search. Running `node outlook.js digest --folder sent` navigates to Sent Items before collecting today's emails.
actual: - search --folder <known-alias>: treeitem click silently blocked → search runs against inbox instead of target folder. - search --folder <custom-name>: treeitem click blocked → SESSION_INVALID error reported (batch fails hard). - digest --folder <any>: treeitem click blocked → digest continues past failure, returns inbox data silently.
errors: "⚠ A JavaScript confirm dialog is blocking the page: 'The domain myemail.accenture.com is acting as Microsoft Office and can run Office add-ins, which may access your personal data. If you trust the domain to run be OK to continue.' — use `dialog accept` or `dialog dismiss` to resolve it". Then: "✗ Element not found. Verify the selector is correct and the element exists in the DOM."
reproduction: 1. Ensure active Outlook session. 2. Run: node outlook.js search "test" --folder sent. 3. See dialog warning on stderr, observe results come from inbox not sent.
started: Discovered during Phase 01 UAT. Dialog appears on every invocation — persistent, not a one-time prompt.

## Eliminated

- hypothesis: Dialog is a one-time prompt that can be cleared by accepting it once
  evidence: "timeline: it is persistent, not a one-time prompt" — stated explicitly in symptoms
  timestamp: 2026-04-15T00:00:00Z

- hypothesis: ['dialog', 'dismiss'] CDP call can dismiss the Office add-in trust prompt
  evidence: After policy fix, dialog dismiss executes but CDP reports "No dialog is showing" on every attempt. The prompt is a DOM-level React overlay, not a native window.confirm() — Page.handleJavaScriptDialog cannot see it.
  timestamp: 2026-04-15T02:00:00Z

## Evidence

- timestamp: 2026-04-15T00:00:00Z
  checked: lib/search.js executeComboboxSearch() batch construction
  found: folderCommands (treeitem click + wait) are injected BEFORE the combobox click, after the initial open+wait(5000). No dialog handling anywhere in the batch.
  implication: The dialog fires during page load and blocks the first interaction command. Injecting ['dialog', 'dismiss'] after wait(5000) and before folderCommands will clear it in time.

- timestamp: 2026-04-15T00:00:00Z
  checked: lib/digest.js runDigest() initialBatch construction
  found: folderCommands injected after ['get', 'url'] and before ['eval', CONVID_EVAL]. No dialog handling. Same issue.
  implication: Same fix location: inject ['dialog', 'dismiss'] after wait(5000) and before folderCommands (or make it unconditional — always dismiss).

- timestamp: 2026-04-15T00:00:00Z
  checked: lib/digest.js parseDigestArgs()
  found: --folder with no following arg is silently ignored (folder remains null) because the condition is `args[i] === '--folder' && i + 1 < args.length`. If --folder is last arg, condition is false, folder stays null, no warning emitted.
  implication: Need to detect --folder as last arg and emit a warning or error.

- timestamp: 2026-04-15T00:00:00Z
  checked: lib/run.js runBatch() and stderr logging
  found: Every agent-browser invocation is logged via log() with full command args. Each batch stderr is also logged in full. In digest, scroll loop logs per-attempt counts. In search, extractRowsFromText logs count.
  implication: Verbose stderr is coming from multiple log() calls throughout search.js, digest.js, and run.js. To reduce verbosity: remove mid-operation log() calls, keep only operation start, error, and final result count.

- timestamp: 2026-04-15T01:00:00Z
  checked: policy-search.json allow list vs ['dialog', 'dismiss'] batch command
  found: 'dialog' was missing from the allow list. The action policy has default:deny, so any action not explicitly listed is denied. The batch command ['dialog', 'dismiss'] was correctly placed in both search.js and digest.js (from prior fix) but was rejected at runtime with "Action 'dialog' denied by policy".
  implication: Adding "dialog" to policy-search.json allow list is the complete fix. All affected modules (search.js, digest.js, read.js, calendar.js) share this policy file.

- timestamp: 2026-04-15T02:00:00Z
  checked: human verify result after policy fix + dialog dismiss
  found: dialog dismiss now executes (policy no longer blocks it), but CDP returns "No dialog is showing" every time it runs. Warning repeats 7+ times. This means agent-browser's dialog command uses CDP Page.handleJavaScriptDialog which only handles native browser dialogs (window.alert/confirm/prompt). The Outlook Office add-in trust prompt is a DOM-level React overlay rendered inside the page — it appears in the accessibility tree as a visible element but is not a native browser dialog. Agent-browser emits the dialog warning as a detection heuristic, but Page.handleJavaScriptDialog cannot dismiss it.
  implication: dialog dismiss cannot work here. Must use eval to find and click the DOM button directly. The eval must be safe to run even when the modal is absent (no-op if not found).

## Resolution

root_cause: The Outlook Office add-in trust prompt is a DOM-level React overlay rendered inside the page, NOT a native window.confirm() dialog. Agent-browser emits a "JavaScript confirm dialog" warning (a detection heuristic), but CDP's Page.handleJavaScriptDialog can only handle native browser dialogs — so dialog dismiss always returns "No dialog is showing". The DOM modal remains visible and blocks treeitem clicks.
fix: (1) Added "dialog" to policy-search.json allow list (was missing, caused policy denial). (2) Replaced ['dialog', 'dismiss'] with ['eval', DISMISS_ADDIN_DIALOG] in both search.js and digest.js — the eval uses querySelector to find the OK button in the DOM and click it; returns null without error when modal is absent. (3) Added ['wait', '500'] after the eval for dismiss animation. (4) Removed noisy operational log lines from outlook.js, lib/search.js, and lib/digest.js that fired on every successful invocation.
verification: User confirmed live run: `node outlook.js search "test" --folder sent` → exit 0, returns results from Sent Items. `node outlook.js digest --folder sent` → exit 0, returns different emails from inbox run (different senders, IDs — Sent Items navigation confirmed). Remaining stderr output is only from agent-browser's heuristic warning (cosmetic, not functional).
files_changed: [lib/search.js, lib/digest.js, policy-search.json, outlook.js]
