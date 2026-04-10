# Phase 2: Search Operation — Research

**Researched:** 2026-04-10
**Domain:** Outlook web browser automation — search combobox, message list ARIA, Exchange ItemID extraction
**Confidence:** HIGH (all key facts are VERIFIED from live Phase 0 captures + existing Phase 1 code)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Action Policy**
- D-01: Create `policy-search.json` (separate from `policy-read.json`) for search, read, and digest operations. The combobox workflow requires `click`, `fill`, and `press` — added to `policy-search.json` alongside all existing read-policy actions. `policy-auth.json` remains unchanged.
- D-02: `policy-search.json` allow list: `launch`, `navigate`, `snapshot`, `get`, `url`, `wait`, `scroll`, `close`, `state`, `session`, `click`, `fill`, `press`, `eval`. `eval` is needed for batch ID extraction (D-06).
- D-03: REQUIREMENTS.md SAFE-01 must be updated to note that data operations (search, read, digest) use `policy-search.json`, not `policy-read.json`.

**CDN Domain Restriction**
- D-04: Do NOT set `AGENT_BROWSER_ALLOWED_DOMAINS` for search, read, or digest operations. The `policy-search.json` action policy (`default: deny`) is the real safety boundary.
- D-05: Update `lib/run.js`: the `restrictDomains` logic currently triggers only for `policy-read.json`. Phase 2 changes this so NO policy triggers domain restriction for data operations.

**Stable Message ID Extraction**
- D-06: Use a single `eval` call via `agent-browser eval --stdin` to read `el.id` (Exchange ItemID) from all visible `[role="option"]` DOM elements in one shot.
- D-07: The Exchange ItemID from `el.id` is the stable ID. It matches the `/mail/id/<URL-encoded-ItemID>` URL pattern. Used directly by Phase 3.
- D-08: Correlate eval result to snapshot rows by order (DOM position). If eval returns fewer IDs than snapshot rows, log a warning to stderr and omit IDs for unmatched rows rather than crashing.

**Search Argument Interface**
- D-09: `node outlook.js search "<KQL-query>" [--limit <N>]`. KQL query is a required positional argument. `--limit` is optional, defaults to 20. Argument parsing uses simple `process.argv` slice — no third-party arg parser.
- D-10: Missing KQL query argument returns: `{"operation":"search","status":"error","error":{"code":"INVALID_ARGS","message":"Usage: node outlook.js search \"<KQL query>\" [--limit N]"}}`.

**Search Workflow (Combobox Sequence)**
- D-11: Navigate to `OUTLOOK_BASE_URL` first, then run session check via `assertSession('search')`. If session expired, stop and return `SESSION_INVALID` error.
- D-12: Combobox workflow: click combobox → wait 500ms → fill KQL query → press Enter → wait 4000ms for SPA render. Use `--name "Search for email, meetings, files and more."` to target the combobox reliably.
- D-13: After results render, scope snapshot to `listbox` with name containing `"Message list"` to minimize token usage and avoid capturing nav pane/ribbon noise.

**Scroll-and-Accumulate**
- D-14: If visible rows < limit after initial render, scroll the message list listbox, wait 1500ms, re-snapshot, and accumulate new rows (dedup by ID). Repeat until limit is reached or two consecutive scrolls yield no new rows.
- D-15: Zero results: if the `listbox "Message list"` is empty or absent after search, return `{"operation":"search","status":"ok","results":[],"count":0}` — not an error.

**Result Schema and Field Availability**
- D-16: Each result: `{ id, subject, from, to, date, preview, is_read, is_flagged }`.
- D-17: Fields extracted from accessible name (format: `[Unread ][Important ]{sender} {subject} {date} {preview}`): `is_read` from `"Unread "` prefix, `from` from text before date pattern, `subject` best-effort between from and date, `date` matched by regex, `preview` text after date.
- D-18: `to` → always `null` in search results. Only visible in reading pane (Phase 3).
- D-19: `is_flagged` → always `null` in search results. Requires per-row focus/eval of additional DOM attribute not yet confirmed.
- D-20: `id` → Exchange ItemID from `eval` (D-06). If eval fails, set to `null` and log warning to stderr.

**Module Structure**
- D-21: Implement search in a new `lib/search.js` file. `outlook.js` requires `./lib/search` and calls `runSearch()` in the `case 'search':` branch.

### Claude's Discretion
- Exact Node.js argument parsing implementation (argv slice vs. manual loop)
- Accessible name splitting heuristics (exact regex patterns)
- Scroll attempt count limit before giving up (suggest 5 scroll attempts max)
- Error message text (stay within the established terse style from Phase 1)

### Deferred Ideas (OUT OF SCOPE)
- Filtering by Outlook ribbon filter buttons (`Has attachments`, `Unread`, `Flagged`) as alternatives to KQL — deferred, KQL covers these
- Populating `to` field in search results — available in Phase 3
- Populating `is_flagged` field — deferred; needs per-row focus or eval of additional DOM attribute not yet confirmed
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | Skill accepts a KQL query string (from:, subject:, has:attachment, is:unread, is:flagged, before:, after:) | KQL is passed as-is to the combobox fill step; no parsing or transformation by the skill. Confirmed: combobox accepts raw KQL string [VERIFIED: outlook-ui.md Capture 6] |
| SRCH-02 | Skill locates and interacts with the Outlook search box using verified ARIA roles/attributes; submits query and waits for results | Combobox ARIA: role=combobox, aria-label="Search for email, meetings, files and more." — full workflow confirmed in Phase 0 [VERIFIED: outlook-ui.md Search Box section] |
| SRCH-03 | Skill scroll-accumulates the result list to handle Outlook's virtual DOM (~20 items rendered at a time) | `agent-browser scroll down 500 --selector` scopes scroll to message list container; re-snapshot + dedup loop [VERIFIED: SKILL.md scroll command + outlook-ui.md virtual DOM note] |
| SRCH-04 | Skill accepts optional result limit parameter (default: 20) | `--limit N` parsed from argv; scroll loop exits when accumulated count reaches limit [VERIFIED: D-09] |
| SRCH-05 | Search results are JSON array with: id, subject, from, to, date, preview, is_read, is_flagged | Schema fully specified in D-16 through D-20; id from eval, fields from accessible name parse [VERIFIED: outlook-ui.md Individual Message Rows + Stable Message ID sections] |
</phase_requirements>

---

## Summary

Phase 2 builds the `search` subcommand on top of the Phase 1 foundation. All architectural unknowns were resolved during Phase 0 interactive research — no new discovery is required. The ARIA selectors, combobox workflow, message list structure, and Exchange ItemID extraction method are all verified-live.

The work has three clear sub-problems: (1) invoke the search combobox sequence via agent-browser commands, (2) extract structured data from the accessible names of `[role="option"]` rows, and (3) extract stable Exchange ItemIDs via a single `eval --stdin` call without touching message read state.

The biggest implementation complexity is the accessible name parse (D-17). The format `[Unread ][Important ]{sender} {subject} {date} {preview}` has no hard delimiters between sender, subject, and date. The date segment is the anchoring regex — everything before it is sender+subject, everything after is preview. This is inherently heuristic. The plan must allocate space for testing the regex against the real accessible names captured in Phase 0.

**Primary recommendation:** Follow the decision log (D-01 through D-21) exactly. All decisions were made with live evidence. The implementation should be a straight translation of those decisions into code — no design work required during execution.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| agent-browser | 0.25.3 (confirmed in outlook-ui.md) | Browser automation CLI | Project requirement — all automation goes through this |
| Node.js built-ins | v25.9.0 (confirmed on machine) | `process.argv`, `child_process.spawnSync`, `JSON.parse/stringify` | No external dep needed for this phase |

[VERIFIED: `node --version` returns v25.9.0; agent-browser version from outlook-ui.md capture metadata]

### Supporting (existing, reused from Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/run.js` | Phase 1 | `runAgentBrowser()`, `parseAgentBrowserJson()` | All agent-browser subprocess calls |
| `lib/output.js` | Phase 1 | `outputOk()`, `outputError()`, `log()` | All JSON output and stderr logging |
| `lib/session.js` | Phase 1 | `assertSession()` | Session expiry check at start of search |

[VERIFIED: all files exist and read in context above]

### No New npm Dependencies

Phase 2 introduces no new npm packages. All primitives are in Node.js built-ins or existing project files.

---

## Architecture Patterns

### Recommended Project Structure (after Phase 2)

```
outlook.js               # Entry point — adds case 'search': require('./lib/search').runSearch()
lib/
├── output.js            # Unchanged — outputOk, outputError, log
├── run.js               # Modified — restrictDomains logic updated (D-05)
├── session.js           # Modified — assertSession() must accept policyFile param (see Integration Pitfall)
└── search.js            # NEW — runSearch(), parseAccessibleName(), extractIds()
policy-auth.json         # Unchanged
policy-read.json         # Unchanged (kept for auth session check compatibility)
policy-search.json       # NEW — allow list per D-02
```

### Pattern 1: Search Combobox Sequence

**What:** A sequence of agent-browser commands to activate the Outlook search combobox, type the KQL query, and submit.

**When to use:** Every `runSearch()` call, after session validation.

**Confirmed workflow from Phase 0:**
```javascript
// Source: references/outlook-ui.md §Search Box — confirmed-live
// Step 1: Click combobox to activate
runAgentBrowser(['find', 'role', 'combobox', 'click', '--name', 'Search for email, meetings, files and more.'], 'policy-search.json');

// Step 2: Wait for suggestions list
runAgentBrowser(['wait', '500'], 'policy-search.json');

// Step 3: Fill with KQL query (query passed as separate argument — no shell interpolation)
runAgentBrowser(['find', 'role', 'combobox', 'fill', kqlQuery, '--name', 'Search for email, meetings, files and more.'], 'policy-search.json');

// Step 4: Submit
runAgentBrowser(['press', 'Enter'], 'policy-search.json');

// Step 5: Wait for SPA render
runAgentBrowser(['wait', '4000'], 'policy-search.json');
```

### Pattern 2: Scoped Snapshot for Message List

**What:** Snapshot scoped to the message list listbox to avoid capturing navigation pane noise.

**When to use:** After search results render; after each scroll iteration.

```javascript
// Source: references/outlook-ui.md §Message List Container — confirmed-live
// agent-browser find role listbox --name "Message list" gives a ref
// Use snapshot scoped via --selector to the listbox accessible name
runAgentBrowser(['snapshot', '-i', '--json'], 'policy-search.json');
// Then parse accessible names from option elements within the Message list listbox
```

**Note:** `agent-browser snapshot -s "selector"` scopes by CSS selector. The listbox has no useful CSS selector — use the full snapshot and filter option elements whose parent is the message list. Alternatively, `agent-browser find role listbox --name "Message list"` returns a ref, then snapshot the whole page and walk the tree. [ASSUMED: exact scoping method — may need to test whether `find role listbox` + snapshot is cleaner than full snapshot + JSON parse filter]

### Pattern 3: Batch Exchange ItemID Extraction via eval

**What:** Single `eval --stdin` call that reads `el.id` from all `[role="option"]` elements in the message list DOM — no page navigation, no read-state mutation.

**When to use:** After each snapshot pass, once the target rows are known.

```javascript
// Source: references/outlook-ui.md §Stable Message ID — confirmed-live
// eval script (passed via --stdin to avoid shell quoting issues):
const evalScript = `
JSON.stringify(
  Array.from(document.querySelectorAll('[role="option"]'))
    .map(el => el.id || null)
)
`;
// Invoke:
// echo '...' | agent-browser eval --stdin
// Returns: JSON array of id strings in DOM order
```

**Critical:** `el.id` contains the base64-encoded Exchange ItemID. It is NOT URL-encoded at rest. When Phase 3 constructs the navigation URL `/mail/id/<id>`, it must `encodeURIComponent(id)` the value.

**Confirmed from Phase 0 capture 4:**
```
[{"dataset":["convid","focusableRow"],"id":"AQAAAAAJuqMCAAAIQYb16wAAAAA=","ariaSelected":"false"},...]
```
[VERIFIED: outlook-ui.md §Stable Message ID, Capture 4]

### Pattern 4: Accessible Name Parser

**What:** Pure JS function that parses a single accessible name string into `{ is_read, is_flagged, from, subject, date, preview }`.

**Format (search results):**
```
[Unread ]{sender} {subject} {date} {preview}
```

**Parsing strategy:**

```javascript
// Source: D-17 decision + outlook-ui.md §Individual Message Rows — confirmed-live
function parseAccessibleName(name) {
  let rest = name.trim();
  const is_read = !rest.startsWith('Unread ');
  if (!is_read) rest = rest.slice('Unread '.length);
  // Strip 'Important ' prefix if present (D-17)
  if (rest.startsWith('Important ')) rest = rest.slice('Important '.length);

  // Anchor on date pattern — everything before it is sender+subject, after is preview
  // Known date formats in search results: "6/24/2024", "11/30/2023", "Tue 3/17"
  const dateRegex = /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}\/\d{1,2}|\d{1,2}:\d{2}\s*[AP]M)\b/;
  const dateMatch = dateRegex.exec(rest);

  let from = '', subject = '', date = null, preview = '';

  if (dateMatch) {
    const before = rest.slice(0, dateMatch.index).trim();
    date = dateMatch[0];
    preview = rest.slice(dateMatch.index + dateMatch[0].length).trim();
    // best-effort: first "word group" before the date segment is the sender
    // Outlook puts sender then subject with no delimiter
    // Heuristic: sender ends at first occurrence of known subject punctuation OR
    // treat up to ~40 chars as sender if no natural break
    // Claude's discretion: exact split algorithm
    from = before; // fallback: entire pre-date string as from
    subject = '';  // fallback: empty when no delimiter is detectable
  } else {
    // No date found — put everything in from, leave others empty
    from = rest;
  }

  return { is_read, is_flagged: null, from, subject, date, preview, to: null };
}
```

**Claude's discretion note:** The exact regex for sender vs. subject split is left to implementation. The critical anchors (date regex, `Unread ` prefix) are verified. The sender/subject boundary is heuristic — Phase 0 captures show no delimiter between them in the accessible name.

### Pattern 5: Scroll-and-Accumulate Loop

**What:** Scroll the message list container, re-snapshot, dedup by ID, repeat until limit reached or no new rows.

**When to use:** After initial search render, when `results.length < limit`.

```javascript
// Source: D-14 decision + SKILL.md scroll command — [VERIFIED: SKILL.md scroll with --selector]
let scrollAttempts = 0;
const MAX_SCROLL_ATTEMPTS = 5; // Claude's discretion per CONTEXT.md
let lastCount = 0;
let staleScrolls = 0;

while (results.length < limit && staleScrolls < 2 && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
  // Scroll message list container
  runAgentBrowser(['scroll', 'down', '500', '--selector', '[role="listbox"]'], 'policy-search.json');
  runAgentBrowser(['wait', '1500'], 'policy-search.json');

  const newRows = extractRowsFromSnapshot(); // re-snapshot and extract
  const prevLength = results.length;
  deduplicateAndAppend(results, newRows, limit);

  if (results.length === prevLength) {
    staleScrolls++;
  } else {
    staleScrolls = 0;
  }
  scrollAttempts++;
}
```

**Scroll selector note:** `--selector '[role="listbox"]'` targets the message list container for scoped scroll. The document-level scroll does not work for Outlook's virtual DOM — the listbox has its own scroll viewport. [ASSUMED: that `--selector '[role="listbox"]'` uniquely identifies the message list — may need `[aria-label*="Message list"]` if two listboxes are present, e.g., search suggestions still visible]

### Anti-Patterns to Avoid

- **URL-based search (deeplink/search?query=):** Confirmed broken on this tenant — produces persistent loading spinner. Use combobox workflow only. [VERIFIED: outlook-ui.md §URL Patterns anti-pattern note]
- **Per-row click to get ID:** Clicking each row changes its read state (marks as read). Use batch `eval --stdin` instead. [VERIFIED: outlook-ui.md §Stable Message ID]
- **Setting `AGENT_BROWSER_ALLOWED_DOMAINS` for data operations:** Blocks Outlook CDN assets, produces `olkerror.html`. Do not set for `policy-search.json` operations. [VERIFIED: D-04 decision based on Phase 1 SC-3 finding in STATE.md]
- **Passing KQL query via shell string interpolation:** Special characters in KQL (`:`, `@`, `/`) corrupt the command. Always pass query as a discrete `args` array element in `spawnSync` — never template it into a shell command string. [VERIFIED: existing runAgentBrowser() uses spawnSync which passes args as array, no shell interpolation]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shell argument quoting | Manual escaping of KQL query for shell | `spawnSync` argv array (already established in `runAgentBrowser`) | `spawnSync` passes each element as a discrete argv entry — no shell interpretation at all |
| Eval JS quoting | Manual base64 encode/decode | `eval --stdin` with heredoc (or pipe from Node) | `--stdin` bypasses all shell quoting; no escaping needed |
| Accessible name field detection | Complex NLP parser | Simple prefix/regex extraction (D-17) | The format is structured enough for regex; full NLP is massive over-engineering |
| Scroll implementation | Custom CDP scroll injection | `agent-browser scroll down 500 --selector` | Already implemented in agent-browser with proper CDP plumbing |
| JSON output envelope | Custom serializer | `outputOk()`/`outputError()` from `lib/output.js` | Already established in Phase 1; consistency is the point |

**Key insight:** The existing `runAgentBrowser()` + `spawnSync` architecture already solves the hard problem of KQL injection. The query string is passed as a discrete argv element. No shell ever sees it. This is a critical safety property for the content boundaries requirement.

---

## Integration Specifics (Critical for Planner)

### assertSession() Needs Policy Parameter

`lib/session.js` `assertSession()` currently hardcodes `'policy-read.json'` when calling `getCurrentUrl()`. Once Phase 2 removes domain restriction for `policy-read.json`, this still works — but the function should accept a `policyFile` parameter to be correct.

**Current code (line 205 of session.js):**
```javascript
function assertSession(operation) {
  const url = getCurrentUrl('policy-read.json');  // hardcoded
```

**Required change:** `assertSession(operation, policyFile = 'policy-read.json')` and pass `policyFile` through to `getCurrentUrl()`. Phase 2's `runSearch()` calls `assertSession('search', 'policy-search.json')`.

[VERIFIED: read lib/session.js directly]

### run.js Domain Restriction Update (D-05)

**Current code (line 28 of run.js):**
```javascript
const restrictDomains = policyFile === 'policy-read.json' && outlookDomain;
```

**Required change:** Remove domain restriction entirely for all data operations. Two options:
1. Change condition to `false` / remove the restrictDomains branch entirely
2. Change to only restrict for `policy-auth.json` (which currently never restricts anyway — that's by design)

The simplest fix: remove the `restrictDomains` block entirely. Auth doesn't restrict (correct). Search/read/digest must not restrict (D-04). The `AGENT_BROWSER_ALLOWED_DOMAINS` env var should never be set by this skill.

[VERIFIED: read lib/run.js directly]

### eval --stdin Invocation from Node.js

`agent-browser eval --stdin` reads JavaScript from stdin. In Node.js `spawnSync`, stdin is passed via the `input` option:

```javascript
// Use stdio: ['pipe', 'pipe', 'pipe'] and pass input: evalScript
const result = spawnSync('agent-browser', ['-q', '--session-name', 'outlook-skill', 'eval', '--stdin'], {
  input: evalScript,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: childEnv,
});
```

This is different from the existing `runAgentBrowser()` which uses `stdio: ['ignore', 'pipe', 'pipe']`. The eval invocation needs `stdio: ['pipe', 'pipe', 'pipe']` so the `input` option works.

**Plan must include:** A dedicated `runEval(script)` helper in `lib/search.js` (or in `lib/run.js`) that sets `input` on the spawnSync call. Do not try to force this through the existing `runAgentBrowser()` without modifying it.

[VERIFIED: SKILL.md §eval --stdin + Node.js spawnSync API — [ASSUMED: that `input` + `stdio: ['pipe',...]` is the correct pattern for stdin passthrough via spawnSync; standard Node.js behavior]]

### policy-search.json `press` Action

`policy-auth.json` only allows `click` and `fill`. The search combobox needs `press Enter`. The `press` action must be in `policy-search.json` allow list (D-02 already specifies this). Confirm the action name is `"press"` not `"keyboard"` — the SKILL.md shows `agent-browser press Enter` as a top-level command.

[VERIFIED: SKILL.md §Essential Commands — `agent-browser press Enter`]

### Content Boundaries Wrapping

`AGENT_BROWSER_CONTENT_BOUNDARIES=1` is always set in `runAgentBrowser()`. This means snapshot output and eval output will be wrapped in `--- AGENT_BROWSER_PAGE_CONTENT nonce=<hex> origin=... ---` markers. The `parseAgentBrowserJson()` function currently assumes raw JSON. For `snapshot --json` output, the JSON may be inside the content boundary markers.

**Plan must verify:** Does `snapshot --json` with `AGENT_BROWSER_CONTENT_BOUNDARIES=1` wrap the JSON in markers, or does the `--json` flag bypass content boundaries? If wrapped, a stripper is needed before JSON.parse.

[ASSUMED: behavior of `--json` flag with `AGENT_BROWSER_CONTENT_BOUNDARIES=1` — Phase 1 uses `get url` (plain text, not JSON) so this combination was not tested; this is the primary unknown for Phase 2]

---

## Common Pitfalls

### Pitfall 1: eval Result Correlation Mismatch

**What goes wrong:** `eval` returns N IDs, but the snapshot has M rows (N ≠ M). This happens when the DOM changes between the snapshot call and the eval call (e.g., Outlook re-renders the virtual list).

**Why it happens:** The accessibility snapshot and the eval are two separate agent-browser calls. In a live SPA, the DOM can update between them.

**How to avoid:** Call eval immediately after snapshot with no intervening waits. Implement the mismatch handler from D-08: log warning to stderr, set `id: null` for unmatched rows. Never crash on mismatch.

**Warning signs:** `id: null` appearing in results when you expect IDs; stderr warning `"eval ID count X != snapshot row count Y"`.

### Pitfall 2: KQL Query Injection via Accessible Name

**What goes wrong:** If the KQL query contains characters that Outlook interprets as part of the accessible name parser (not a real risk for the browser), or if the query is interpolated into a shell string, it can corrupt the agent-browser command.

**Why it happens:** Any template literal or string concatenation that passes the query through a shell.

**How to avoid:** Always pass the KQL query as a discrete element in the `args` array of `spawnSync`. Never construct a shell command string with the query embedded. The existing `runAgentBrowser()` pattern is correct — do not deviate from it.

**Warning signs:** `agent-browser` exits with parse error; combobox receives truncated query.

### Pitfall 3: Content Boundaries JSON Wrapping

**What goes wrong:** `parseAgentBrowserJson(stdout)` fails because `stdout` contains `--- AGENT_BROWSER_PAGE_CONTENT ... ---` markers wrapping the JSON.

**Why it happens:** `AGENT_BROWSER_CONTENT_BOUNDARIES=1` is always set. The `--json` flag behavior with content boundaries is untested in Phase 1.

**How to avoid:** After calling `snapshot --json`, check if stdout contains the content boundary prefix. If so, strip markers before calling `JSON.parse`. Implement a `stripContentBoundaries(stdout)` utility. Consider making this a robust step in `parseAgentBrowserJson()`.

**Warning signs:** `parseAgentBrowserJson()` returns null for every snapshot call; stdout starts with `--- AGENT_BROWSER_PAGE_CONTENT`.

### Pitfall 4: Search Results Listbox vs. Suggestions Listbox

**What goes wrong:** Snapshot captures `listbox "Search Suggestions"` (the autocomplete dropdown) instead of `listbox "Message list"` (the actual results).

**Why it happens:** After pressing Enter, there's a 4000ms wait. If the wait is insufficient, the suggestions listbox may still be the active element in the snapshot.

**How to avoid:** Scope the snapshot or result extraction specifically to `[aria-label*="Message list"]`. Check that the `heading "Results"` element is present in the snapshot before extracting rows. If not present, wait longer and re-snapshot.

**Warning signs:** Zero results extracted when you expect results; snapshot contains `option "History Suggestion -..."` items.

### Pitfall 5: scroll --selector Ambiguity

**What goes wrong:** `scroll down 500 --selector '[role="listbox"]'` matches the wrong listbox (search suggestions vs. message list), or fails because the selector is ambiguous.

**Why it happens:** During search results view, there may be multiple `[role="listbox"]` elements (message list + potentially residual suggestions container).

**How to avoid:** Use `--selector '[aria-label*="Message list"]'` as the scroll selector. This is more specific and targets only the message list container.

**Warning signs:** Scroll appears to do nothing (stale scroll count increments immediately); no new rows appear after scroll.

### Pitfall 6: Accessible Name Date Regex Misses

**What goes wrong:** The date regex doesn't match, leaving the entire accessible name in the `from` field and empty `subject`, `date`, `preview`.

**Why it happens:** Outlook uses relative dates for recent emails (`"Today"`, `"Yesterday"`, `"Mon"`, `"1:47 PM"`) that don't match a `MM/DD/YYYY` pattern.

**How to avoid:** The date regex must cover all observed formats:
- `M/D/YYYY` — e.g., `6/24/2024`, `11/30/2023` (confirmed in search results)
- `M/D` — e.g., `3/17` (seen as `Tue 3/17` in capture 8 subject line area)
- `h:mm AM/PM` — e.g., `1:47 PM` (seen in inbox view, may appear in today's search results)
- Day+date — e.g., `Mon 6/24/2024` or `Fri 4/10/2026` (seen in reading pane, may appear in accessible names)

The regex must be ordered by specificity (full date first, then time, then relative).

[VERIFIED: date format examples from outlook-ui.md captures 1, 6, 7, 8]

---

## Code Examples

### policy-search.json

```json
{
  "default": "deny",
  "allow": [
    "launch",
    "navigate",
    "snapshot",
    "get",
    "url",
    "wait",
    "scroll",
    "close",
    "state",
    "session",
    "click",
    "fill",
    "press",
    "eval"
  ]
}
```
[VERIFIED: D-02 decision; action names confirmed against SKILL.md command list]

### runEval() helper (stdin passthrough)

```javascript
// Source: Node.js spawnSync API + SKILL.md §eval --stdin
const { spawnSync } = require('child_process');
const path = require('path');

function runEval(script) {
  const PROJECT_ROOT = path.resolve(__dirname, '..');
  const policyPath = path.join(PROJECT_ROOT, 'policy-search.json');
  const childEnv = {
    ...process.env,
    AGENT_BROWSER_ACTION_POLICY: policyPath,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_EXECUTABLE_PATH: process.env.OUTLOOK_BROWSER_PATH,
  };
  const result = spawnSync(
    'agent-browser',
    ['-q', '--session-name', 'outlook-skill', 'eval', '--stdin'],
    {
      input: script,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
      cwd: PROJECT_ROOT,
    }
  );
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status ?? 1 };
}
```

### Exchange ItemID eval script (Phase 0 verified)

```javascript
// Source: references/outlook-ui.md §Stable Message ID — confirmed-live (Capture 4)
const EVAL_EXTRACT_IDS = `
JSON.stringify(
  Array.from(document.querySelectorAll('[role="option"]'))
    .map(el => el.id || null)
)
`;
```

### Zero results guard

```javascript
// Source: D-15 decision
// After search, if no message list rows found:
const { outputOk } = require('./output');
outputOk('search', { results: [], count: 0 });
// Note: outputOk wraps in the envelope; but search needs a custom count field.
// Use process.stdout.write directly or extend outputOk to accept extra fields.
// Simplest: emit manually:
process.stdout.write(JSON.stringify({
  operation: 'search',
  status: 'ok',
  results: [],
  count: 0,
  error: null
}) + '\n');
```

**Note:** `outputOk(operation, results)` sets `results` as-is. For search, the caller should pass `{ results: [], count: 0 }` or the function should be called with the array and count derived. The plan should specify the exact envelope for the search success response to ensure `count` is a top-level field. [ASSUMED: that `count` is intended as a top-level field in the envelope, not nested under `results`]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/mail/deeplink/search?query=` URL-based search | Combobox `find role combobox fill` + `press Enter` workflow | Phase 0 (April 2026) — deeplink broken on this tenant | Cannot use URL navigation to trigger search; must drive combobox |
| `/mail/inbox/id/<id>` URL pattern | `/mail/id/<id>` URL pattern | Phase 0 correction | Phase 3 must use `/mail/id/` not `/mail/inbox/id/` |
| Domain restriction for all policies | No domain restriction for data operations | Phase 1 SC-3 finding + D-04 | CDN assets load correctly; action policy is the safety boundary |
| Per-row click to extract ID | Batch `eval --stdin` for all IDs | D-06 decision (Phase 2) | No read-state mutation; single eval is faster |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `snapshot --json` with `AGENT_BROWSER_CONTENT_BOUNDARIES=1` wraps the JSON output in boundary markers | Pitfall 3 / Integration Specifics | If boundaries don't wrap JSON output, the stripper step is unnecessary (low risk); if they do wrap and we don't strip, all snapshot parsing fails (high risk) |
| A2 | `eval --stdin` output is NOT wrapped in content boundary markers (since it's executing code, not receiving page content) | Integration Specifics §runEval | If eval output IS wrapped, the ID array parse fails unless we strip markers there too |
| A3 | `agent-browser scroll down 500 --selector '[aria-label*="Message list"]'` successfully scrolls the message list virtual DOM | Pattern 5 / Pitfall 5 | If the selector doesn't match or the scroll doesn't trigger virtual DOM re-render, accumulation never loads more rows |
| A4 | `"count"` is intended as a top-level field in the search success envelope (alongside `"results"`) | Code Examples §Zero results | If count is nested inside results, the envelope contract differs; calling agents expect specific field locations |
| A5 | The `press` action in agent-browser action policy maps to `agent-browser press Enter` — same verb | Architecture Patterns §policy-search.json | If the action policy uses a different verb for `press` (e.g., `"keyboard"`), the press step will be denied |

---

## Open Questions

1. **Content boundaries + `--json` flag interaction**
   - What we know: `AGENT_BROWSER_CONTENT_BOUNDARIES=1` wraps text snapshots in markers. `--json` flag changes output format.
   - What's unclear: Does `--json` output also get wrapped in markers, or does `--json` bypass content boundaries?
   - Recommendation: First task in Wave 1 should be a quick test: run `agent-browser -q snapshot --json` with content boundaries set and inspect stdout. If markers present, implement `stripContentBoundaries()` in `lib/run.js`.

2. **eval output format**
   - What we know: `eval --stdin` returns the JS expression result as a string. Our script returns `JSON.stringify(...)` so the result is a JSON string.
   - What's unclear: Is it wrapped in an outer JSON envelope (like `{"success":true,"result":"[...]"}`) or is it the raw return value? Does `-q` suppress the envelope?
   - Recommendation: Test `agent-browser -q eval --stdin` with `echo '"hello"'` piped in and inspect stdout. Design the ID extractor to handle both raw and enveloped output.

3. **Sender/subject boundary in accessible name**
   - What we know: The accessible name format is `{sender} {subject} {date} {preview}`. No delimiter between sender and subject.
   - What's unclear: Is there a reliable way to identify where sender ends and subject begins? (Comma before subject? Capital letter? Punctuation pattern?)
   - Recommendation: Accept imprecision for Phase 2. Set `subject = ''` and `from = <full pre-date text>` as the safe default. Phase 5 skill packaging can document the limitation. The calling agent can parse the `from` field further if needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| agent-browser | All browser commands | Confirmed (used in Phase 1) | 0.25.3 | None — required |
| Node.js | `lib/search.js` execution | Confirmed | v25.9.0 | None — required |
| Outlook session (cookie) | All search operations | Confirmed persisted via `--session-name outlook-skill` | — | Run `node outlook.js auth` |

[VERIFIED: `node --version` = v25.9.0; agent-browser confirmed working in Phase 1; session persistence confirmed via Phase 1 SC-1, SC-2, SC-3]

---

## Security Domain

`security_enforcement` is not explicitly set to false in config.json — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 1 handles auth; Phase 2 checks session state only |
| V3 Session Management | no | `--session-name` handled by agent-browser; Phase 2 reads session, does not manage it |
| V4 Access Control | yes | Action policy `policy-search.json` with `default: deny` — only listed verbs allowed |
| V5 Input Validation | yes | KQL query passed as argv element (not shell-interpolated); no sanitization needed at skill level — Outlook parses KQL |
| V6 Cryptography | no | No cryptographic operations in this phase |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| KQL prompt injection (malicious email subject becomes part of query) | Tampering | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` wraps accessible name text in markers — calling agent sees markers and can identify page-sourced content |
| KQL shell injection (attacker-controlled query mutates browser command) | Tampering | `spawnSync` argv array — no shell expansion; characters like `;`, `&&`, `|` are literal in the KQL string |
| Unauthorized write operation via allowed action | Tampering | Action policy `default: deny`; `click`/`fill`/`press` only reach the search combobox — no Reply, Forward, Delete, Send buttons are accessible via these actions in the search flow |
| Session token exfiltration | Information Disclosure | No domain restriction (D-04 decision); mitigated by action policy blocking `navigate` to non-Outlook URLs [ASSUMED: that action policy `navigate` verb blocks cross-origin navigation attempts by the agent-browser task; may not block eval-initiated navigation] |

[VERIFIED: action policy structure from SKILL.md §Action Policy; SAFE-02 concern resolved by D-04]

---

## Sources

### Primary (HIGH confidence)
- `references/outlook-ui.md` — live Phase 0 captures; ARIA roles, combobox workflow, accessible name format, Exchange ItemID extraction, URL patterns, all confirmed-live
- `lib/run.js`, `lib/session.js`, `lib/output.js` — Phase 1 implementation; all integration points read directly
- `outlook.js` — entry point stub; `case 'search':` integration point confirmed
- `.agents/skills/agent-browser/SKILL.md` — eval --stdin syntax, scroll --selector, find role, press, action policy format
- `.planning/phases/02-search-operation/02-CONTEXT.md` — all implementation decisions (D-01 through D-21)
- `policy-auth.json`, `policy-read.json` — existing policy structure confirmed

### Secondary (MEDIUM confidence)
- `.agents/skills/agent-browser/references/session-management.md` — session persistence patterns; consistent with SKILL.md

### Tertiary (LOW confidence / Assumed)
- A1-A5 in Assumptions Log above — untested combinations that must be validated in Wave 0/1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed present and working in Phase 1
- Architecture patterns: HIGH — combobox workflow, ARIA selectors, eval pattern all VERIFIED-live from Phase 0
- Pitfalls: HIGH for known issues (CDN restriction, URL-based search, click-to-read mutation); MEDIUM for content-boundaries+JSON interaction (A1, A2 — untested combination)
- Integration specifics: HIGH — code read directly; assertSession() hardcode confirmed

**Research date:** 2026-04-10
**Valid until:** 2026-07-09 (Microsoft Outlook SPA deploys can change ARIA structure; re-verify if more than 30 days have passed)
