# Phase 3: Read Operation - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the `read` subcommand in `outlook.js`: accept an Exchange ItemID from a prior search result, navigate directly to the email URL, extract full body text and metadata from the reading pane accessibility snapshot, and return structured JSON. Also includes a fix to Phase 2's `lib/search.js` so that search results return real Exchange ItemIDs (currently always null due to eval running after batch exit). No UI changes — output is JSON to stdout.

</domain>

<decisions>
## Implementation Decisions

### Search ID Fix (prerequisite to `read`)
- **D-01:** Fix `lib/search.js` to return real Exchange ItemIDs by adding an inline `eval` command inside the search batch, before the snapshot. The batch command is: `['eval', 'JSON.stringify(Array.from(document.querySelectorAll(\'[role=option]\')).map(el => el.id))']`. This runs while the search results page is still live — before the page resets to `about:blank` after batch exit.
- **D-02:** Batch stdout will contain both the eval result (JSON array of Exchange ItemIDs, one per `option` row) and the snapshot text (accessible names). Parse eval output first (the first JSON array in stdout), then the snapshot text. Correlate by array index — both are ordered by DOM position.
- **D-03:** The eval approach reads `el.id` (the base64-encoded Exchange ItemID on each `[role=option]` DOM element), confirmed-live from Phase 0. This is the same approach as Phase 2 D-06/D-07, just moved inside the batch to avoid the `about:blank` reset.
- **D-04:** If eval returns fewer IDs than snapshot rows (count mismatch), log a warning to stderr and set `id: null` for unmatched rows — do not crash. This preserves the existing null-fallback behavior and makes the fix backward-compatible.

### `read` Subcommand Interface
- **D-05:** `node outlook.js read <exchange-item-id>` — single required positional argument: the Exchange ItemID string from a search result's `id` field (URL-decoded base64 form). Argument parsing mirrors `lib/search.js` pattern: `process.argv.slice(3)`.
- **D-06:** Missing or empty ID argument returns: `{"operation":"read","status":"error","error":{"code":"INVALID_ARGS","message":"Usage: node outlook.js read <id>"}}`.

### Email Navigation
- **D-07:** Navigate directly to `OUTLOOK_BASE_URL + "/mail/id/" + encodeURIComponent(id)` — the confirmed-live URL pattern from Phase 0 (`/mail/id/` NOT `/mail/inbox/id/`). No search re-run needed.
- **D-08:** Full read workflow in one batch: `['open', emailUrl]` → `['wait', '3000']` → `['snapshot', '-s', "main[aria-label='Reading Pane']", '--json']`. Snapshot is the final batch command (page resets after batch exits). Use `policy-search.json` (already allows all needed actions including navigate).
- **D-09:** Check session state after navigation: if the page URL contains a Microsoft login domain after open, return `SESSION_INVALID` error (same pattern as `lib/session.js` assertSession). Detect by including `['get', 'url']` in the batch before the snapshot and checking the returned URL.

### Reading Pane Extraction
- **D-10:** Scope the snapshot to the reading pane: `snapshot -s "main[aria-label='Reading Pane']"`. This dramatically reduces token usage and eliminates nav pane / ribbon noise — confirmed pattern from Phase 0.
- **D-11:** Metadata extraction from reading pane ARIA headings (all confirmed-live from Phase 0):
  - `subject`: first `heading [level=3]` text (appears twice — take first)
  - `from`: text of `heading "From: ..." [level=3]`, strip "From: " prefix
  - `to`: text of `heading "To: ..." [level=3]`, strip "To: " prefix; null if absent
  - `cc`: text of `heading "Cc: ..." [level=3]`, strip "Cc: " prefix; null if absent
  - `date`: text of date heading (`heading "{weekday} {date} {time}" [level=3]`)
- **D-12:** `body_text`: concatenate all text content inside the `document "Message body"` subtree from the accessibility snapshot. This includes link labels, heading text, and any paragraph text nodes. Left to Claude's discretion on exact extraction approach (accessibility tree concatenation vs. eval innerText — eval requires a separate post-open call which conflicts with the batch reset rule).
- **D-13:** Result schema matches READ-03 exactly: `{ subject, from, to, cc, date, body_text, has_attachments, attachment_names }`.

### Attachment Detection
- **D-14:** File attachment ARIA structure in the reading pane is UNRESOLVED from Phase 0 (only inline-image messages were captured). Phase 3's human checkpoint (a separate plan) must include a live capture of a message with real file attachments (using `hasattachment:yes` KQL) to identify the attachment region's ARIA structure before implementing `attachment_names` extraction.
- **D-15:** For the initial implementation plan, Claude decides the best-effort approach (e.g., look for `link` or `button` elements in the reading pane body whose accessible name matches a filename pattern like `*.pdf`, `*.docx`, `*.xlsx`). If no matches, `attachment_names: []` and `has_attachments: false`.
- **D-16:** The human checkpoint plan must verify and potentially fix the attachment extraction before Phase 3 is marked complete.

### Module Structure
- **D-17:** Implement `read` in a new `lib/read.js` file, following the established pattern from `lib/search.js`. `outlook.js` requires `./lib/read` and calls `runRead()` in the `case 'read':` branch.
- **D-18:** Reuse `policy-search.json` — it already allows all actions needed for read (`launch`, `navigate`, `snapshot`, `get`, `url`, `wait`, `close`, `state`, `session`, `click`, `fill`, `press`, `eval`). No new policy file needed.

### Claude's Discretion
- Body text extraction: accessibility tree concatenation vs. post-open eval innerText (eval requires separate non-batch call — evaluate based on what agent-browser supports for the open+snapshot batch pattern)
- Exact wait duration for reading pane render after navigation (suggest 3000ms; adjust based on live test)
- Heading text parsing implementation (exact string stripping for "From: " / "To: " / "Cc: " prefixes)
- Best-effort attachment heuristic (filename extension patterns to match against link/button names)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 requirements and success criteria
- `.planning/REQUIREMENTS.md` — §READ-01 through §READ-03: identifier input, reading pane extraction, result schema
- `.planning/ROADMAP.md` — Phase 3 goal and all 4 success criteria

### Outlook web ARIA patterns (Phase 0 output)
- `references/outlook-ui.md` — §Reading Pane (confirmed ARIA: subject/from/to/cc/date headings, `document "Message body"`, scoped snapshot CSS selector), §Stable Message ID (URL pattern `/mail/id/<url-encoded-id>`, `el.id` DOM attribute, eval extraction), §Attachment Indicators (UNRESOLVED for file attachments — captures only inline-image emails)

### agent-browser CLI and batch patterns
- `.agents/skills/agent-browser/SKILL.md` — `eval` inline syntax (`['eval', 'JS']` in batch), snapshot `-s` CSS selector flag, `-q` flag
- `.agents/skills/agent-browser/references/batch-and-spa-patterns.md` — `eval` inside batch (positional arg, NOT `--stdin`), page resets to `about:blank` after batch exits (critical constraint), snapshot text format in batch

### Phase 2 established patterns
- `.planning/phases/02-search-operation/02-CONTEXT.md` — `lib/run.js` runBatch() signature, policy-search.json allow list, JSON envelope pattern, assertSession() usage, D-06/D-07 (original eval design that Phase 3 fixes)
- `lib/search.js` — Exact module pattern to follow for `lib/read.js`; the batch structure that needs the eval fix

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/run.js` `runBatch(commandArrays, policyFile, opts)` — primary tool for all browser interaction. Phase 3 uses this for both the patched search batch and the read batch.
- `lib/run.js` `stripContentBoundaries(stdout)` — strip content boundary markers before parsing. Must be applied to batch stdout.
- `lib/output.js` `outputOk('read', results)` and `outputError('read', code, message)` — use these, no new output helpers.
- `lib/session.js` `assertSession(operation)` — session check pattern; Phase 3 should check URL after navigation instead (assertSession opens Outlook and checks URL, but read already navigates to the email URL — inline URL check is more efficient).
- `lib/search.js` — Template for `lib/read.js` module structure: `parseArgs()`, main function, module.exports pattern.

### Established Patterns
- All browser interaction via `runBatch()` — never `runAgentBrowser` for main flows
- `policy-search.json` is the policy for all data operations (search, read, digest)
- Diagnostic logging → stderr only via `log()` from `lib/output.js`
- `spawnSync` not `exec/execSync`
- Snapshot is ALWAYS the final command in a batch

### Integration Points
- `outlook.js` line ~58: `case 'read':` currently calls `outputError(...)` stub. Phase 3 replaces this with `require('./lib/read').runRead()`.
- `lib/search.js` `executeComboboxSearch()`: The batch command array needs the eval command inserted before the snapshot. The return parsing in `executeComboboxSearch()` must be updated to extract both eval IDs and snapshot accessible names from batch stdout.
- `lib/search.js` `runSearch()`: The result-building loop at Step 4 currently sets `parsed.id = null`. After the fix, it sets `parsed.id = ids[i] || null`.

</code_context>

<specifics>
## Specific Ideas

- Eval inside batch (not `eval --stdin`) — confirmed by `batch-and-spa-patterns.md`: `['eval', 'JS_SCRIPT_HERE']` syntax. The JavaScript result appears in batch stdout alongside snapshot output.
- URL pattern is `/mail/id/` (not `/mail/inbox/id/`) — Phase 0 correction is important; planner must use the confirmed pattern.
- Reading pane snapshot uses CSS selector `-s "main[aria-label='Reading Pane']"` — reduces token usage dramatically compared to full page snapshot.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 3 scope.

</deferred>

---

*Phase: 03-read-operation*
*Context gathered: 2026-04-10*
