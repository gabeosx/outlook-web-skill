# Phase 4: Daily Digest Operation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the `digest` subcommand in `outlook.js`: navigate directly to the Outlook inbox, extract today's messages by filtering the "Today" date group, score each message by importance, and return a JSON array sorted by `importance_score` descending. Includes scroll-accumulate to handle inboxes with more than 20 messages. No email mutations — output is JSON to stdout.

</domain>

<decisions>
## Implementation Decisions

### Inbox Fetch Approach
- **D-01:** Navigate directly to `OUTLOOK_BASE_URL/mail/inbox` — do NOT use a KQL search query. Direct inbox navigation is preferred over KQL `after:YYYY-MM-DD` because: (a) it correctly scopes to the Inbox folder only (KQL search crosses folders including Sent/Drafts), (b) avoids KQL date syntax uncertainty (Outlook KQL does not have a reliable `today` keyword), (c) targets the natural inbox list where scroll behavior is different from (and more stable than) search results scroll.
- **D-02:** Batch structure: `open OUTLOOK_BASE_URL/mail/inbox` → `wait 5000` → check for Focused tabs → snapshot `listbox "Message list"` → extract "Today" group rows → scroll-accumulate if needed.

### Today Group Filtering
- **D-03:** From the inbox listbox snapshot, extract only rows that belong to the "Today" date group. The inbox listbox contains `button "Today"` (confirmed-live) as a date group header before today's message rows, followed by a separator/button for the next group (e.g., `button "Yesterday"` or a specific date button). Rows between the "Today" button and the next group button are today's messages.
- **D-04:** Parsing rule: walk snapshot rows in order. Start accumulating `option` rows after seeing a group header whose text is `"Today"`. Stop accumulating when the next group header is encountered (any `button` matching a day-of-week or date pattern, or `"Yesterday"`). Rows outside the Today group are discarded.
- **D-05:** If no "Today" group header is found in the snapshot, return an empty result with a diagnostic log: `"digest: no Today group found — inbox may be empty or all messages are older"`.

### Accessible Name Format (Inbox vs. Search)
- **D-06:** Inbox-format accessible names differ from search-format. Inbox format confirmed-live:
  ```
  [Unread ][Important ]{sender} {subject} {time} {preview} [No items selected]
  ```
  Key differences from search format: (a) date field is time-only for today (`1:47 PM`, `Thu 4:00 PM`), not full date; (b) accessible names may end with `" [No items selected]"` suffix — MUST strip this before parsing; (c) "Important " prefix is the high-importance signal.
- **D-07:** Reuse `parseAccessibleName` logic from `lib/search.js` as the starting point, but adapt for digest: strip `" [No items selected]"` suffix before parsing, and recognize time-only date formats (already in existing date regex: `h:mm AM/PM` and `Day h:mm AM/PM` patterns). The `date` field will contain the time string (e.g., `"1:47 PM"`) for today's messages.

### Focused Inbox Handling
- **D-08:** After the inbox loads, check if `button "Focused"` is present in the snapshot. If present, click `button "Other"` to switch to the full inbox view, then re-snapshot. If absent (confirmed-absent on this account), proceed directly. This ensures digest covers ALL inbox messages, not just the AI-filtered "Focused" subset. Satisfies success criterion 4.
- **D-09:** Detection is done from the initial snapshot — include `snapshot` as the first step to check for the Focused button before running the full digest batch. Alternative: do it in the same batch (`eval` for button presence check). Claude decides the most efficient approach based on agent-browser batch capabilities.

### Scroll-Accumulate
- **D-10:** Implement scroll-accumulate targeting the inbox `listbox "Message list"`. Phase 2 removed scroll-accumulate from *search result* lists due to virtual DOM thrash during scroll. Inbox scroll is different (no active search render), so it may be stable. Implement optimistically.
- **D-11:** Scroll-accumulate loop: after initial snapshot, if Today rows were found and no "end of Today group" was reached, scroll the listbox → wait 1500ms → re-snapshot → extract new Today rows → dedup by convid. Stop criteria: (a) a non-Today group header appears in new rows (end of today's messages reached), (b) two consecutive scrolls yield no new Today rows (end of list), or (c) 15 scroll attempts reached.
- **D-12:** If scroll causes the accessibility tree to clear (same as Phase 2 search result behavior), the loop will yield zero new rows on every attempt. The two-consecutive-empty-scroll stop condition will end the loop gracefully without crashing. Document in log output.

### `is_flagged` Determination
- **D-13:** `is_flagged: null` for all digest results. Flag detection requires per-row interaction (flag button only appears on hover/select) and is not determinable from a passive inbox snapshot. Accepted scope simplification for v1. The flagged scoring signal is excluded from the importance model. Document in `references/digest-signals.md` (Phase 5).

### Importance Scoring Model
- **D-14:** Simple additive 0–100 scale. Three signals, dropped `is_flagged` (D-13):
  - **Unread** (`is_read: false`): **+40 points**
  - **High-importance** (`"Important "` prefix in accessible name): **+40 points**
  - **Urgency keywords** in subject/preview: **+5 points each, capped at +20 points total**
  - Maximum possible score: 100
- **D-15:** Urgency keyword list (case-insensitive, matched against `from + subject + preview` concatenated):
  `urgent`, `asap`, `action required`, `immediate`, `deadline`, `due today`, `overdue`, `eod`, `eow`, `critical`, `expires`, `time-sensitive`
- **D-16:** `importance_signals` array contains string tokens documenting why each score was assigned. Values:
  - `"unread"` — message is unread
  - `"high_importance"` — accessible name had `"Important "` prefix
  - `"keyword:urgent"`, `"keyword:asap"`, etc. — one entry per matched keyword
  - Empty array `[]` if no signals triggered (message is read, not important, no keywords)
- **D-17:** Scoring is purely client-side (JavaScript) — no additional browser interactions needed after snapshot extraction.

### Result Schema and Sorting
- **D-18:** Each result: `{ id, subject, from, date, preview, is_read, is_flagged, importance_score, importance_signals }` — matches DIGT-03 exactly. `id` = data-convid from eval (same eval pattern as search subcommand). `is_flagged: null` (D-13). `date` = time string from accessible name.
- **D-19:** Results sorted by `importance_score` descending before output. Equal-score messages maintain their original inbox order (stable sort).
- **D-20:** No `--limit` flag needed — digest returns all of today's messages. If the inbox is very large, scroll-accumulate naturally caps at reaching the end of the "Today" group.

### Module and Argument Interface
- **D-21:** `node outlook.js digest` — no required positional arguments. No KQL query parameter (date is constructed internally). No `--limit` flag needed (Today group acts as the natural limit).
- **D-22:** Missing session returns `SESSION_INVALID` error using existing `assertSession('digest')` pattern.
- **D-23:** Implement in new `lib/digest.js` file. Follow `lib/search.js` / `lib/read.js` module pattern: `parseArgs()`, main `runDigest()` function, `module.exports`. `outlook.js` replaces the stub in `case 'digest':` with `require('./lib/digest').runDigest()`.
- **D-24:** Reuse `policy-search.json` (already allows all required actions: `launch`, `navigate`, `snapshot`, `get`, `url`, `wait`, `scroll`, `close`, `state`, `session`, `click`, `eval`).

### Claude's Discretion
- Exact batch command sequence for Focused tab detection (snapshot-first vs. eval-in-batch)
- Exact scroll command targeting (`scroll` on the listbox element — may need `find` first to get a ref)
- Best-effort subject extraction from inbox accessible names (same challenge as search — no hard delimiter between sender and subject)
- Whether to include a human-readable `count_today` field in the output envelope alongside `results`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 4 requirements and success criteria
- `.planning/REQUIREMENTS.md` — §DIGT-01 through §DIGT-03: fetch approach, scoring signals, result schema
- `.planning/ROADMAP.md` — Phase 4 goal and all 4 success criteria (especially #3 scroll-accumulate and #4 Focused/All)

### Outlook web ARIA patterns (Phase 0 output)
- `references/outlook-ui.md` — §Message List Container (listbox ARIA, `"Message list"` aria-label, virtual DOM notes, ~12–20 items rendered), §Individual Message Rows (option role, accessible name formats for inbox vs search, `"Important "` prefix, child buttons for selected rows), §Focused Inbox (ABSENT on this account; `button "Focused"` / `button "Other"` ARIA if present; defensive handling required), §URL Patterns (`/mail/inbox` navigation target)

### agent-browser CLI and batch patterns
- `.agents/skills/agent-browser/SKILL.md` — `eval` inline syntax in batch, scroll command syntax, `-q` flag
- `.agents/skills/agent-browser/references/session-management.md` — `--session-name` usage

### Established patterns from prior phases
- `.planning/phases/02-search-operation/02-CONTEXT.md` — D-14 (scroll-accumulate removed from search — inbox may differ), D-06/D-07 (eval batch for convid extraction, double-decode pattern), D-04 (CDN domain restriction OFF for data operations)
- `.planning/phases/03-read-operation/03-CONTEXT.md` — D-18 (policy-search.json reuse for all data operations)
- `lib/search.js` — Module pattern to follow for `lib/digest.js`; `parseAccessibleName()`, `extractRowsFromText()`, `runBatch()` usage, eval double-decode pattern for convid extraction

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/run.js` `runBatch(commandArrays, policyFile, opts)` — primary tool for all browser interaction. Phase 4 uses this for the inbox navigation + snapshot + eval batch.
- `lib/run.js` `stripContentBoundaries(stdout)` — strip before parsing batch stdout.
- `lib/output.js` `outputOk('digest', results)` and `outputError('digest', code, message)` — use these, no new output helpers.
- `lib/session.js` `assertSession('digest')` — call at start of `runDigest()`. Returns false and emits `SESSION_INVALID` if session expired.
- `lib/search.js` `parseAccessibleName(name)` — starting point for inbox accessible name parsing; needs adaptation for digest (strip `" [No items selected]"` suffix, same date regex already handles time-only format).
- `lib/search.js` `extractRowsFromText(text)` — reusable for extracting `option` rows from text-format batch snapshot.

### Established Patterns
- All browser interaction via `runBatch()` — never spawn agent-browser directly
- `policy-search.json` is the policy for all data operations (search, read, digest)
- Diagnostic logging → stderr only via `log()` from `lib/output.js`
- `spawnSync` not `exec/execSync`
- Snapshot is ALWAYS the final command in a batch (page resets to `about:blank` after batch exit)
- Eval output is double-encoded by agent-browser — requires two-level `JSON.parse` (see `lib/search.js` lines for the double-encoded match pattern)
- Convid extraction: `document.querySelectorAll('[role=option]')` → `el.getAttribute('data-convid')` (NOT `el.id`)

### Integration Points
- `outlook.js` line ~63: `case 'digest':` currently calls `outputError(..., 'digest not yet implemented')`. Phase 4 replaces this stub with `require('./lib/digest').runDigest()`.
- `lib/search.js` `parseAccessibleName()` — Phase 4 should reuse or import this function, extending it for the inbox format (suffix stripping). Do NOT copy-paste; keep shared logic in one place or import directly.

</code_context>

<specifics>
## Specific Ideas

- `is_flagged: null` is the explicit v1 decision — Phase 5's `references/digest-signals.md` must document this limitation and explain that calling agents should not rely on `is_flagged` being a real boolean in the digest result.
- Inbox direct navigation is preferred over KQL to avoid cross-folder contamination (KQL search returns Sent/Drafts/etc).
- Today group filtering is the date mechanism — no date string construction needed in code.

</specifics>

<deferred>
## Deferred Ideas

- `is_flagged` real detection (second `is:flagged` KQL batch + cross-reference) — complexity not justified for v1; candidate for v2 enhancement.
- `--limit N` flag for digest — not needed since Today group acts as natural limit; add to backlog if users report needing it.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 4 scope.

</deferred>

---

*Phase: 04-daily-digest-operation*
*Context gathered: 2026-04-11*
