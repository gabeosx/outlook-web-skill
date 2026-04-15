# Phase 2: Search Operation - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the `search` subcommand in `outlook.js`: accept a KQL query string, drive the Outlook web combobox workflow, scroll-accumulate results from the virtual DOM, and return a structured JSON array with stable message IDs usable by Phase 3's `read` operation. No UI changes — output is JSON to stdout.

</domain>

<decisions>
## Implementation Decisions

### Action Policy
- **D-01:** Create a new `policy-search.json` (separate from `policy-read.json`) for the search, read, and digest data operations. The search combobox workflow requires `click`, `fill`, and `press` — these are added to `policy-search.json` alongside all existing read-policy actions. `policy-auth.json` remains unchanged.
- **D-02:** `policy-search.json` allow list: `launch`, `navigate`, `snapshot`, `get`, `url`, `wait`, `scroll`, `close`, `state`, `session`, `click`, `fill`, `press`, `eval`. `eval` is needed for batch ID extraction (D-06).
- **D-03:** REQUIREMENTS.md SAFE-01 must be updated to note that data operations (search, read, digest) use `policy-search.json`, not `policy-read.json`. The original SAFE-01 was written before Phase 0 confirmed that URL-based search is broken on this tenant.

### CDN Domain Restriction
- **D-04:** Do NOT set `AGENT_BROWSER_ALLOWED_DOMAINS` for search, read, or digest operations. The `policy-search.json` action policy (`default: deny`) is the real safety boundary — the skill cannot click Reply/Delete/Send because those actions aren't even reachable through the allowed verbs. Domain restriction is redundant here and breaks Outlook's SPA (CDN assets blocked, `olkerror.html`).
- **D-05:** Update `lib/run.js`: the `restrictDomains` logic currently triggers only for `policy-read.json`. Phase 2 changes this so NO policy triggers domain restriction for data operations. Auth remains unrestricted (as-is) to reach `login.microsoftonline.com`.

### Stable Message ID Extraction
- **D-06:** Use a single `eval` call via `agent-browser eval --stdin` to read `el.id` (Exchange ItemID) from all visible `[role="option"]` DOM elements in one shot. This is a batch read — no per-row navigation, no changes to message read state.
- **D-07:** The Exchange ItemID from `el.id` is the stable ID to include in search results. It matches the `/mail/id/<URL-encoded-ItemID>` URL pattern confirmed in Phase 0, and will be used directly by Phase 3's `read` operation.
- **D-08:** The eval result is correlated to snapshot rows by order (both ordered by DOM position). If `eval` returns fewer IDs than snapshot rows (e.g., a count mismatch), log a warning to stderr and omit IDs for unmatched rows rather than crashing.

### Search Argument Interface
- **D-09:** `node outlook.js search "<KQL-query>" [--limit <N>]`. KQL query is a required positional argument. `--limit` is optional, defaults to 20. Argument parsing uses simple `process.argv` slice — no third-party arg parser.
- **D-10:** Missing KQL query argument returns: `{"operation":"search","status":"error","error":{"code":"INVALID_ARGS","message":"Usage: node outlook.js search \"<KQL query>\" [--limit N]"}}`.

### Search Workflow (Combobox Sequence)
- **D-11:** Navigate to `OUTLOOK_BASE_URL` first, then run session check via `assertSession('search')`. If session expired, stop and return `SESSION_INVALID` error.
- **D-12:** Combobox workflow (confirmed in Phase 0): click combobox → wait 500ms → fill KQL query → press Enter → wait 4000ms for SPA render. Use `--name "Search for email, meetings, files and more."` to target the combobox reliably.
- **D-13:** After results render, scope snapshot to `listbox` with name containing `"Message list"` to minimize token usage and avoid capturing nav pane/ribbon noise.

### Scroll-and-Accumulate
- **D-14:** If visible rows < limit after initial render, scroll the message list listbox, wait 1500ms, re-snapshot, and accumulate new rows (dedup by ID). Repeat until limit is reached or two consecutive scrolls yield no new rows (end of results).
- **D-15:** Zero results: if the `listbox "Message list"` is empty or absent after search, return `{"operation":"search","status":"ok","results":[],"count":0}` — not an error.

### Result Schema and Field Availability
- **D-16:** Each result: `{ id, subject, from, to, date, preview, is_read, is_flagged }`. This is the SRCH-05 schema exactly.
- **D-17:** Fields extracted from accessible name (format: `[Unread ][Important ]{sender} {subject} {date} {preview}`):
  - `is_read`: presence of `"Unread "` prefix → `false`, otherwise `true`
  - `from`: text before the first date/time pattern (after stripping prefixes)
  - `subject`: text between `from` segment and date (best-effort — no hard delimiter)
  - `date`: matched by regex: `\d{1,2}/\d{1,2}/\d{4}` or `\d{1,2}:\d{2}\s*[AP]M` or day-of-week prefix
  - `preview`: text after date segment, trimmed
- **D-18:** `to` → always `null` in search results. The recipient list is only visible in the reading pane (Phase 3). Document this in the result.
- **D-19:** `is_flagged` → always `null` in search results. The flagged state requires per-row focus/click to expose the flag button — not determinable from a passive snapshot. Document this in the result.
- **D-20:** `id` → Exchange ItemID from `eval` (D-06). If eval fails, set to `null` and log warning to stderr.

### Module Structure
- **D-21:** Implement search in a new `lib/search.js` file, following the established pattern from Phase 1 (`lib/session.js`, `lib/run.js`, `lib/output.js`). `outlook.js` requires `./lib/search` and calls `runSearch()` in the `case 'search':` branch.

### Claude's Discretion
- Exact Node.js argument parsing implementation (argv slice vs. manual loop)
- Accessible name splitting heuristics (exact regex patterns)
- Scroll attempt count limit before giving up (suggest 5 scroll attempts max)
- Error message text (stay within the established terse style from Phase 1)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 requirements and success criteria
- `.planning/REQUIREMENTS.md` — §SRCH-01 through §SRCH-05: KQL input, combobox workflow, scroll-accumulate, limit param, result schema
- `.planning/ROADMAP.md` — Phase 2 goal and all 5 success criteria

### Outlook web ARIA patterns (Phase 0 output)
- `references/outlook-ui.md` — §Search Box (combobox ARIA, confirmed workflow steps, anti-pattern: don't use deeplink search URL), §Message List Container (listbox ARIA, virtual DOM scroll notes), §Individual Message Rows (accessible name format, is_read detection), §Stable Message ID (eval batch pattern, Exchange ItemID format, URL pattern), §Attachment Indicators (KQL notes), §URL Patterns

### agent-browser CLI
- `.agents/skills/agent-browser/SKILL.md` — `eval --stdin` syntax, `find/click/fill/press` commands, `-q` flag behavior, policy env var

### Phase 1 established patterns
- `.planning/phases/01-auth-scaffold-cli-skeleton/01-CONTEXT.md` — `lib/run.js` runAgentBrowser() signature, policy file convention, JSON output envelope, `assertSession()` usage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/run.js` `runAgentBrowser(args, policyFile, opts)` — wraps all agent-browser subprocess calls, handles `-q` flag, sets safety env vars, returns `{ stdout, stderr, status }`. Phase 2 passes `'policy-search.json'` as the policyFile.
- `lib/run.js` `parseAgentBrowserJson(stdout)` — parses agent-browser `--json` output safely. Use for snapshot/find results.
- `lib/output.js` `outputOk(operation, results)` and `outputError(operation, code, message)` — the established JSON envelope helpers. Use these, don't write new ones.
- `lib/session.js` `assertSession(operation)` — call at start of `runSearch()` after navigating to Outlook. Returns false and emits `SESSION_INVALID` if session expired.

### Established Patterns
- All agent-browser calls go through `runAgentBrowser()` — never spawn agent-browser directly
- Diagnostic logging via `log()` from `lib/output.js` → stderr only
- `spawnSync` not `exec/execSync` (established in Phase 1)
- Policy files live at project root (`./policy-auth.json`, `./policy-read.json`). `policy-search.json` will also live at root.
- `lib/run.js` currently only removes `AGENT_BROWSER_ALLOWED_DOMAINS` for `policy-read.json`. This must be updated in Phase 2 (D-05) to also omit it for `policy-search.json`.

### Integration Points
- `outlook.js` line 44-46: `case 'search':` currently calls `outputError(...)` stub. Phase 2 replaces this with `require('./lib/search').runSearch()`.
- `outlook.js` exports `allowedDomain` — available but NOT used by search per D-04 (no domain restriction for data ops).
- Session management: `lib/session.js` exports `assertSession(operation)` which calls `getCurrentUrl('policy-read.json')`. Phase 2 will need this but should pass `'policy-search.json'` instead, since `policy-read.json` won't have the needed actions after this refactor.

</code_context>

<specifics>
## Specific Ideas

- No specific UX references — output is JSON, user never sees it directly.
- The calling agent (personal assistant) is the consumer of the JSON output.

</specifics>

<deferred>
## Deferred Ideas

- Filtering by Outlook ribbon filter buttons (`Has attachments`, `Unread`, `Flagged`) as alternatives to KQL — deferred, KQL covers these via `hasattachment:yes`, `is:unread`, `is:flagged`
- Populating `to` field in search results — will be available in Phase 3 (read operation uses reading pane, which shows `To:` heading)
- Populating `is_flagged` field — deferred; needs per-row focus or eval of additional DOM attribute not yet confirmed

</deferred>

---

*Phase: 02-search-operation*
*Context gathered: 2026-04-10*
