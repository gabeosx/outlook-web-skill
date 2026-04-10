# Phase 3: Read Operation - Research

**Researched:** 2026-04-10
**Domain:** Outlook web ARIA extraction, Exchange ItemID navigation, agent-browser batch eval
**Confidence:** HIGH (all core findings verified from live captured data in `references/outlook-ui.md` and project codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Search ID Fix (prerequisite to `read`)**
- D-01: Fix `lib/search.js` to return real Exchange ItemIDs by adding an inline `eval` command inside the search batch, before the snapshot. Batch command: `['eval', 'JSON.stringify(Array.from(document.querySelectorAll(\'[role=option]\')).map(el => el.id))']`. Runs while search results page is still live — before page resets to `about:blank` after batch exit.
- D-02: Batch stdout will contain both the eval result (JSON array of Exchange ItemIDs, one per `option` row) and the snapshot text. Parse eval output first (the first JSON array in stdout), then snapshot text. Correlate by array index — both ordered by DOM position.
- D-03: `el.id` reads the base64-encoded Exchange ItemID on each `[role=option]` DOM element. Same approach as Phase 2 D-06/D-07, moved inside the batch to avoid `about:blank` reset.
- D-04: If eval returns fewer IDs than snapshot rows (count mismatch), log warning to stderr and set `id: null` for unmatched rows. Do not crash.

**`read` Subcommand Interface**
- D-05: `node outlook.js read <exchange-item-id>` — single required positional argument. `process.argv.slice(3)`.
- D-06: Missing/empty ID returns: `{"operation":"read","status":"error","error":{"code":"INVALID_ARGS","message":"Usage: node outlook.js read <id>"}}`.

**Email Navigation**
- D-07: Navigate to `OUTLOOK_BASE_URL + "/mail/id/" + encodeURIComponent(id)`. URL pattern is `/mail/id/` NOT `/mail/inbox/id/`.
- D-08: Full read workflow in one batch: `['open', emailUrl]` → `['wait', '3000']` → `['snapshot', '-s', "main[aria-label='Reading Pane']", '--json']`. Snapshot is the final batch command. Use `policy-search.json`.
- D-09: Check session state after navigation — include `['get', 'url']` in batch before snapshot. If URL contains Microsoft login domain, return `SESSION_INVALID`.

**Reading Pane Extraction**
- D-10: Scope snapshot to reading pane: `snapshot -s "main[aria-label='Reading Pane']"`. Reduces token usage dramatically.
- D-11: Metadata extraction from reading pane ARIA headings (all confirmed-live):
  - `subject`: first `heading [level=3]` text (appears twice — take first)
  - `from`: `heading "From: ..." [level=3]`, strip "From: " prefix
  - `to`: `heading "To: ..." [level=3]`, strip "To: " prefix; null if absent
  - `cc`: `heading "Cc: ..." [level=3]`, strip "Cc: " prefix; null if absent
  - `date`: date heading (`heading "{weekday} {date} {time}" [level=3]`)
- D-12: `body_text`: concatenate text content inside `document "Message body"` subtree. Exact approach (ARIA tree concatenation vs. eval innerText) is Claude's discretion.
- D-13: Result schema: `{ subject, from, to, cc, date, body_text, has_attachments, attachment_names }`.

**Attachment Detection**
- D-14: File attachment ARIA structure in reading pane is UNRESOLVED from Phase 0. Phase 3 must include a live capture using `hasattachment:yes` KQL before implementing `attachment_names`.
- D-15: Initial best-effort: look for `link` or `button` elements in the reading pane body whose accessible name matches a filename pattern (`*.pdf`, `*.docx`, `*.xlsx`). If no matches: `attachment_names: []`, `has_attachments: false`.
- D-16: Human checkpoint plan must verify and potentially fix attachment extraction before Phase 3 is marked complete.

**Module Structure**
- D-17: New `lib/read.js` file, following `lib/search.js` pattern. `outlook.js` requires `./lib/read` and calls `runRead()` in `case 'read':` branch.
- D-18: Reuse `policy-search.json` — already allows all needed actions.

### Claude's Discretion
- Body text extraction: accessibility tree concatenation vs. post-open eval innerText (eval requires separate non-batch call — evaluate based on what agent-browser supports)
- Exact wait duration for reading pane render after navigation (suggest 3000ms; adjust based on live test)
- Heading text parsing implementation (exact string stripping for "From: " / "To: " / "Cc: " prefixes)
- Best-effort attachment heuristic (filename extension patterns to match against link/button names)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-01 | Skill accepts an email identifier (from a prior search result) and opens that email using verified ARIA landmarks for the reading pane | D-05 through D-09: ID argument parsing, `/mail/id/` URL pattern, batch open+snapshot workflow |
| READ-02 | Skill extracts the full email body text via accessibility snapshot, scoped to the reading pane landmark to minimize token usage | D-10/D-12: `-s "main[aria-label='Reading Pane']"` scoping, `document "Message body"` subtree extraction |
| READ-03 | Read result returned as JSON containing: `subject`, `from`, `to`, `cc`, `date`, `body_text`, `has_attachments`, `attachment_names` | D-11/D-13: all 8 fields mapped to confirmed-live ARIA headings; D-14/D-15 for attachments |
</phase_requirements>

---

## Summary

Phase 3 has two separable implementation tasks: (1) fixing `lib/search.js` to return real Exchange ItemIDs by moving an `eval` command inside the search batch, and (2) implementing `lib/read.js` that navigates to a specific email by ID and extracts its full content from the reading pane accessibility snapshot.

Both tasks build on a solid foundation of confirmed-live Phase 0 ARIA data. The reading pane structure, URL pattern, eval-inside-batch behavior, and metadata heading patterns are all verified from live captures. The only genuinely unresolved area is the ARIA structure of file download attachments — all captured emails had only inline images, not real file attachments. Phase 3 must include a live capture step to resolve this before `attachment_names` extraction can be implemented correctly.

Body text extraction has one key decision point: ARIA tree concatenation (extracting all text nodes from the `document "Message body"` subtree in the text-format snapshot) vs. eval innerText (`document.querySelector('[aria-label="Message body"]').innerText`). The batch reset rule means eval for body text requires a second non-batch call, which has its own complexity. ARIA tree concatenation from the batch snapshot text is the simpler, lower-risk path.

**Primary recommendation:** Implement the search ID fix and `lib/read.js` in a single batch-based approach that mirrors `lib/search.js`. Use accessibility tree text extraction for body text. Schedule a live attachment capture as a mandatory plan step before finalizing `attachment_names`.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `agent-browser` CLI | 0.25.3 | Browser automation | Project-wide tool; no alternative |
| Node.js built-ins | n/a | Argument parsing, string ops, spawnSync | Already used throughout |

**No new npm dependencies required for Phase 3.** [VERIFIED: codebase inspection]

### Reusable Internal Modules

| Module | Path | Purpose | Phase 3 Use |
|--------|------|---------|-------------|
| `runBatch` | `lib/run.js` | Execute multi-command batch | Both search fix and read batch |
| `stripContentBoundaries` | `lib/run.js` | Remove AGENT_BROWSER_CONTENT_BOUNDARIES markers | Parse batch stdout |
| `outputOk` / `outputError` | `lib/output.js` | JSON envelope output + exit | All output paths |
| `log` | `lib/output.js` | Stderr-only diagnostics | Throughout |
| `isLoginUrl` | `lib/session.js` | Detect Microsoft login redirect | Inline session check in read batch |

---

## Architecture Patterns

### Recommended Project Structure (no change from Phase 2)

```
lib/
├── run.js          # runBatch, stripContentBoundaries, runEval (existing)
├── output.js       # outputOk, outputError, log (existing)
├── session.js      # runAuth, isLoginUrl (existing)
├── search.js       # runSearch — MODIFIED for ID fix
└── read.js         # runRead — NEW
policy-search.json  # Reused for read operation (existing)
outlook.js          # case 'read' stub replaced with require('./lib/read').runRead()
```

### Pattern 1: Eval Inside Batch for ID Extraction (Search Fix)

**What:** Insert an `['eval', 'JS']` command inside the search batch before the snapshot. Parse its output from batch stdout before correlating with snapshot rows.

**When to use:** Any time DOM attributes not exposed in the ARIA tree are needed and the page will reset to `about:blank` after the batch exits.

**Critical constraint:** `eval --stdin` (the heredoc form) CANNOT be used in a batch command array — it requires stdin piping that the batch JSON protocol does not support. Use positional arg form only: `['eval', 'JS_STRING']`. [VERIFIED: `batch-and-spa-patterns.md`]

**ARIA roles set by JS are invisible to CSS attribute selectors:**

```javascript
// WRONG — always returns [] (role="option" is set by React, not in HTML)
document.querySelectorAll('[role="option"]')

// CORRECT — query the actual DOM attribute that is present at render time
// The el.id attribute holds the base64 Exchange ItemID
JSON.stringify(Array.from(document.querySelectorAll('[role=option]')).map(el => el.id))
```

[VERIFIED: `references/outlook-ui.md` Capture 4; `batch-and-spa-patterns.md` "SPA-Specific Patterns"]

**Parsing batch stdout with both eval and snapshot:**

The batch stdout will contain the eval result (a JSON array string) followed by the snapshot text. Both appear in a single stdout stream. Parse strategy:

```javascript
// Source: batch-and-spa-patterns.md + existing lib/search.js patterns
const cleaned = stripContentBoundaries(result.stdout);

// Step 1: Find the first JSON array in stdout — that's the eval result
let ids = [];
const jsonArrayMatch = cleaned.match(/(\[.*?\])/s);
if (jsonArrayMatch) {
  try { ids = JSON.parse(jsonArrayMatch[1]); } catch {}
}

// Step 2: Find the snapshot text (everything after the JSON array line)
// Text snapshot lines look like: "  - option "name" [ref=eNN]"
const textAfterJson = cleaned.slice(jsonArrayMatch ? jsonArrayMatch.index + jsonArrayMatch[0].length : 0);
```

[ASSUMED: exact delimiter behavior between eval output and snapshot text in batch stdout — needs verification in live test]

### Pattern 2: Read Batch (Open + URL Check + Snapshot)

**What:** Single batch for the full read operation: navigate to email URL, wait for reading pane to render, get URL (for session check), take scoped snapshot.

**When to use:** Any operation that needs to navigate to a specific page and extract data in one atomic browser session.

**Batch command sequence:**

```javascript
// Source: 03-CONTEXT.md D-08/D-09; references/outlook-ui.md Reading Pane section
const emailUrl = process.env.OUTLOOK_BASE_URL + '/mail/id/' + encodeURIComponent(id);

const result = runBatch([
  ['open', emailUrl],
  ['wait', '3000'],                                              // D-08: reading pane render time
  ['get', 'url'],                                               // D-09: for session check
  ['snapshot', '-s', "main[aria-label='Reading Pane']"],        // D-10: scoped snapshot
], POLICY);
```

**Why snapshot is last:** Page resets to `about:blank` after batch exits. Snapshot must be the last command that produces needed output. [VERIFIED: `batch-and-spa-patterns.md` "Page resets to about:blank after batch exits"]

**Session check from batch stdout:**

```javascript
// The 'get url' command outputs the URL as a plain line before the snapshot text
// Check if that line contains a login domain
const lines = cleaned.split('\n');
const urlLine = lines.find(l => l.trim().startsWith('http'));
if (urlLine && isLoginUrl(urlLine.trim())) {
  outputError('read', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
  return;
}
```

[ASSUMED: exact stdout format of 'get url' inside batch — needs verification against live output]

### Pattern 3: Reading Pane Text Snapshot Parsing

**What:** Extract metadata fields and body text from the text-format snapshot scoped to the reading pane.

**ARIA structure confirmed from Capture 7:**

```
- main "Reading Pane" [ref=e14]
  - heading "{subject}" [level=3, ref=e55]        ← first occurrence = subject
  - button "Summary by Copilot" [ref=e56]
  - heading "{subject}" [level=3, ref=e84]        ← second occurrence, skip
  - heading "From: {sender}" [level=3, ref=e87]
  - heading "To: {recipients}" [level=3, ref=e88]
  - heading "{weekday} {date} {time}" [level=3, ref=e85]
  - document "Message body" [ref=e91]
    - link "{link text}" [ref=eN]
    - link "{link text}" [ref=eN]
    ...
  - menuitem "Reply" [ref=e92]
  - menuitem "Forward" [ref=e93]
```

[VERIFIED: `references/outlook-ui.md` Capture 7 raw snapshot]

**Metadata extraction from text snapshot:**

```javascript
// Source: references/outlook-ui.md Reading Pane section + 03-CONTEXT.md D-11
function parseReadingPaneSnapshot(text) {
  const lines = text.split('\n');
  let subject = null;
  let from = null;
  let to = null;
  let cc = null;
  let date = null;
  let inMessageBody = false;
  const bodyLines = [];

  // Date detection: "heading "{weekday} {date} {time}" [level=3]"
  const dateHeadingRe = /^\s*-\s+heading\s+"((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d+\/\d+\/\d{4}\s+\d+:\d+\s+[AP]M)"\s+\[level=3/;
  // Level-3 heading detection (generic)
  const headingRe = /^\s*-\s+heading\s+"(.+?)"\s+\[level=3/;
  // Document "Message body" start
  const bodyStartRe = /^\s*-\s+document\s+"Message body"/;
  // End of body: menuitem "Reply" signals body is over
  const bodyEndRe = /^\s*-\s+menuitem\s+"Reply"/;
  // Any child element with accessible text (link, button, heading, generic)
  const childTextRe = /^\s{4,}-\s+\w+\s+"(.+?)"\s*(?:\[.*)?$/;

  let headingCount = 0;
  for (const line of lines) {
    if (bodyEndRe.test(line)) { inMessageBody = false; continue; }
    if (inMessageBody) {
      const m = line.match(childTextRe);
      if (m && m[1].trim()) bodyLines.push(m[1].trim());
      continue;
    }
    if (bodyStartRe.test(line)) { inMessageBody = true; continue; }

    // Level-3 headings contain all metadata
    const hm = headingRe.exec(line);
    if (hm) {
      headingCount++;
      const text = hm[1];
      if (text.startsWith('From: ')) { from = text.slice('From: '.length); continue; }
      if (text.startsWith('To: ')) { to = text.slice('To: '.length); continue; }
      if (text.startsWith('Cc: ')) { cc = text.slice('Cc: '.length); continue; }
      if (dateHeadingRe.test(line)) { date = text; continue; }
      if (subject === null) { subject = text; } // first heading = subject (D-11)
    }
  }

  return { subject, from, to: to ?? null, cc: cc ?? null, date, body_text: bodyLines.join('\n') };
}
```

[VERIFIED: structure from `references/outlook-ui.md` Capture 7; parsing logic is [ASSUMED] — needs live test]

### Pattern 4: Attachment Best-Effort Heuristic

**Known issue:** File attachment ARIA structure is UNRESOLVED. All captured messages had only inline images (`button "Show original size"`). [VERIFIED: `references/outlook-ui.md` Attachment Indicators section]

**Best-effort approach (D-15):** Scan `document "Message body"` children for `link` or `button` elements whose accessible name ends with a common file extension:

```javascript
// Source: 03-CONTEXT.md D-15
const ATTACHMENT_EXTENSIONS = /\.(pdf|docx|xlsx|pptx|doc|xls|ppt|zip|csv|txt|msg|eml)$/i;

function detectAttachments(bodyLines) {
  const names = bodyLines.filter(text => ATTACHMENT_EXTENSIONS.test(text.trim()));
  return {
    has_attachments: names.length > 0,
    attachment_names: names,
  };
}
```

**Human checkpoint required (D-16):** Before Phase 3 is marked complete, run `hasattachment:yes` KQL search, open a result in headed mode, capture the reading pane snapshot, and verify/fix the attachment extraction. The plan must include this as a live test step.

[ASSUMED: extension heuristic is sufficient for best-effort; actual ARIA structure may differ]

### Anti-Patterns to Avoid

- **Calling `eval --stdin` inside a batch:** Not supported — use `['eval', 'JS_AS_STRING']` positional form. [VERIFIED: `batch-and-spa-patterns.md`]
- **Snapshot after batch exits:** Page resets to `about:blank`. Snapshot must be the last command inside the batch. [VERIFIED: `batch-and-spa-patterns.md`]
- **CSS attribute selector for `[role="option"]`:** Returns empty array — Outlook sets roles via JS. Use `[role=option]` (without quotes) or iterate all `option` elements by DOM API. Capture 4 used `querySelectorAll('[role="option"]')` — wait, confirmed this does work via eval because eval runs in the live DOM where the JS has already set the role. [VERIFIED: `references/outlook-ui.md` Capture 4 — eval returned data correctly]
- **Using `assertSession()` for read:** `assertSession` opens Outlook separately and checks URL. The read batch already navigates and can check URL inline — more efficient. [VERIFIED: `lib/session.js` + `03-CONTEXT.md` D-09]
- **URL pattern `/mail/inbox/id/`:** Wrong. Correct pattern is `/mail/id/`. [VERIFIED: `references/outlook-ui.md` URL Patterns + CORRECTION note]
- **Using `--json` on snapshot inside batch:** Ignored by agent-browser; always produces text format inside batch. [VERIFIED: `batch-and-spa-patterns.md`]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content boundary stripping | Custom marker regex | `stripContentBoundaries()` in `lib/run.js` | Already correct, handles both space and underscore variants |
| JSON output formatting | Manual JSON.stringify | `outputOk('read', result)` / `outputError('read', code, msg)` | Enforces envelope schema, calls `process.exit(1)` on error |
| URL login detection | Custom domain check | `isLoginUrl()` from `lib/session.js` | Already handles `about:blank`, all three login domains, null |
| Browser invocation | Direct `spawnSync('agent-browser')` | `runBatch()` in `lib/run.js` | Handles policy path resolution, `--session-name`, env var injection, `-q` flag |

---

## Common Pitfalls

### Pitfall 1: Eval Inside Batch — Output Ordering in Stdout

**What goes wrong:** The eval result and snapshot text both land in the same batch stdout string. Naively splitting on newlines may incorrectly parse the eval JSON array as part of the snapshot text.

**Why it happens:** The batch protocol does not delimit outputs between commands — all stdout is concatenated. The eval result is a JSON string (possibly the first line), and the snapshot text follows.

**How to avoid:** Search for the first `[` that starts a JSON array. Parse it, then treat the remainder as the snapshot text. Validate that `ids` is an array before correlating.

**Warning signs:** `ids` is null or the IDs array is shorter than expected. Log and fall back to `id: null` per D-04.

### Pitfall 2: Subject Heading Appears Twice in Reading Pane

**What goes wrong:** Taking the second occurrence of `heading "{subject}" [level=3]` returns the same subject but after the "Summary by Copilot" button — misidentified as a different field.

**Why it happens:** Outlook renders the subject heading twice — once before and once after the Copilot summary button.

**How to avoid:** Take the FIRST `heading [level=3]` whose text does not start with "From: ", "To: ", "Cc: " and does not match the date pattern. [VERIFIED: `references/outlook-ui.md` Capture 7]

### Pitfall 3: `get url` Inside Batch May Not Return a Clean URL Line

**What goes wrong:** The `get url` output inside a batch is mixed with other batch output. Parsing the URL from batch stdout is harder than parsing it from a standalone `runAgentBrowser(['get', 'url'])` call.

**Why it happens:** Batch stdout is a concatenation of all command outputs. `get url` may output the URL as a line, but there is no clean delimiter.

**How to avoid:** Parse the URL line by finding the first `http` line in cleaned stdout before the snapshot text starts. Alternatively, check if the URL is embedded in the snapshot's leading lines (the text snapshot begins with the page URL). [ASSUMED: exact format needs live verification]

**Warning signs:** `isLoginUrl()` incorrectly returns `false` because the URL line was not found in the batch output.

### Pitfall 4: Body Text Contains Button/Link Labels Not Actual Prose

**What goes wrong:** Extracting all accessible names from `document "Message body"` children gives a mix of link labels (`"Donate"`, `"Schedule an [Content Redacted]"`) and actual prose sentences — the result is not clean prose.

**Why it happens:** Outlook renders emails as HTML with links. The ARIA tree represents these as `link "label text"` nodes. Concatenating all accessible names produces a set of labels, not the full email body text.

**How to avoid:** Accept this limitation for v1. The ARIA tree is the only extraction method available inside a single batch (eval innerText would require a separate non-batch call). The calling LLM can interpret the body text as a set of visible strings. If richer extraction is needed, a follow-up eval step can be added in Phase 5. [ASSUMED: eval innerText alternative — not yet tested]

**Warning signs:** `body_text` consists entirely of short noun phrases without sentence structure.

### Pitfall 5: `wait '3000'` May Be Insufficient for Cold Start

**What goes wrong:** After a cold Chrome start, the reading pane may not have finished rendering within 3 seconds, producing an empty snapshot.

**Why it happens:** Outlook is a complex SPA. Fresh daemon starts require 5s+ for inbox, and individual message pages need at least 3s (warm) up to 5s (cold). [VERIFIED: `batch-and-spa-patterns.md` "Cold start requires longer waits"]

**How to avoid:** Use 3000ms as the initial value per D-08. If live tests show empty reading pane snapshots, increase to 5000ms. Log the snapshot length so cold-start failures are visible in diagnostics.

### Pitfall 6: Attachment Extraction False Positives from Link Labels

**What goes wrong:** The extension heuristic matches link labels like `"Download_Report_Q4.pdf"` that are not file attachments — they are body links to external files.

**Why it happens:** The heuristic cannot distinguish a body link to an external PDF from an actual email attachment without knowing the ARIA structure of the attachment region.

**How to avoid:** The human checkpoint (D-16) must confirm the actual ARIA structure. Until then, the heuristic is best-effort and the calling agent should treat `attachment_names` as indicative, not authoritative.

---

## Code Examples

### Search Batch with Inline Eval (ID fix for `lib/search.js`)

```javascript
// Source: 03-CONTEXT.md D-01/D-02/D-03; references/outlook-ui.md Capture 4
// Insert eval BEFORE the snapshot, INSIDE the batch
const result = runBatch([
  ['open', process.env.OUTLOOK_BASE_URL],
  ['wait', '5000'],
  ['find', 'role', 'combobox', 'click'],
  ['wait', '500'],
  ['find', 'role', 'combobox', 'fill', query],
  ['press', 'Enter'],
  ['wait', '4000'],
  // NEW: eval before snapshot — runs while search results page is live
  ['eval', "JSON.stringify(Array.from(document.querySelectorAll('[role=option]')).map(el => el.id))"],
  ['snapshot', '-i', '--json'],   // must remain last
], POLICY);
```

### Read Batch

```javascript
// Source: 03-CONTEXT.md D-07/D-08/D-09; references/outlook-ui.md URL Patterns + Reading Pane
const emailUrl = process.env.OUTLOOK_BASE_URL + '/mail/id/' + encodeURIComponent(id);
const result = runBatch([
  ['open', emailUrl],
  ['wait', '3000'],
  ['get', 'url'],                                                // for session check
  ['snapshot', '-s', "main[aria-label='Reading Pane']"],        // scoped snapshot, must be last
], POLICY);
```

### Output Schema (READ-03)

```javascript
// Source: REQUIREMENTS.md READ-03; 03-CONTEXT.md D-13
outputOk('read', {
  subject: string | null,
  from: string | null,
  to: string | null,
  cc: string | null,
  date: string | null,
  body_text: string,
  has_attachments: boolean,
  attachment_names: string[],   // empty array, never null
});
```

### Module Skeleton (`lib/read.js`)

```javascript
// Source: lib/search.js (template); 03-CONTEXT.md D-17
'use strict';
const { runBatch, stripContentBoundaries } = require('./run');
const { outputOk, outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // D-18: reuse existing policy

function parseArgs(argv) {
  const args = argv.slice(3);  // skip node, outlook.js, read
  const id = args[0] || null;
  if (!id) {
    outputError('read', 'INVALID_ARGS', 'Usage: node outlook.js read <id>');
  }
  return { id };
}

function runRead() {
  const { id } = parseArgs(process.argv);
  // ... batch, parse, output
}

module.exports = { runRead };
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| IDs always null in search results | Inline eval inside batch returns `el.id` per row | Phase 3 (this phase) | `read <id>` becomes usable |
| `case 'read':` → stub outputError | `require('./lib/read').runRead()` | Phase 3 (this phase) | Enables email body retrieval |

**Deprecated/outdated for Phase 3:**
- `assertSession()` call at start of operation: Phase 3 uses inline URL check from batch output instead (more efficient — no extra open call)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `get url` inside a batch outputs the URL as a plain line that can be detected by searching for `http` prefix in cleaned stdout | Architecture Patterns (Pattern 2) | Session check may fail silently — fall back to checking if snapshot is empty |
| A2 | The eval result (JSON array) appears before the snapshot text in batch stdout, enabling the "find first `[`" parsing strategy | Architecture Patterns (Pattern 1) + Pitfall 1 | If ordering differs, ID correlation will fail — fall back to null IDs per D-04 |
| A3 | File download attachment ARIA structure in the reading pane is distinct from inline images and uses link/button elements with filename extensions | Pitfall 6, Pattern 4 | Attachment detection may be entirely wrong — human checkpoint (D-16) is mandatory |
| A4 | 3000ms wait is sufficient for warm reading pane render after navigation | Pitfall 5 | Empty snapshots on cold start — increase to 5000ms if needed |
| A5 | ARIA tree text concatenation from the scoped snapshot produces usable `body_text` for the calling LLM | Pattern 3, Pitfall 4 | Body text may be list of link labels rather than prose — acceptable for v1 per CONTEXT.md D-12 |

---

## Open Questions

1. **Exact stdout format of `get url` inside a batch**
   - What we know: `get url` as a standalone command outputs a plain URL string to stdout. Inside a batch, all command outputs are concatenated.
   - What's unclear: Does `get url` emit just the URL with a newline, or does it include additional formatting (e.g., a checkmark prefix like `✓ Done`)? The text snapshot begins with the page URL as context — is the `get url` output redundant or distinct?
   - Recommendation: In Wave 1 live test, log the full cleaned batch stdout before parsing. Identify the `get url` line format and update the parser accordingly.

2. **eval output delimiter in batch stdout**
   - What we know: The batch protocol concatenates all command outputs. The eval result is a JSON array string.
   - What's unclear: Is the eval result followed by a newline before the snapshot text? Are there any header/footer lines (e.g., `✓ eval` progress markers)?
   - Recommendation: Run a minimal live test (`eval` + `snapshot`) and capture the raw stdout to understand the delimiter format before implementing the production parser.

3. **File attachment ARIA structure**
   - What we know: `has:attachment` KQL returns messages with inline images (not reliable). `hasattachment:yes` targets real file attachments but was not tested in Phase 0.
   - What's unclear: Whether attachments appear as `link "{filename}"`, `button "Download {filename}"`, or inside a distinct ARIA region (e.g., `region "Attachments"`).
   - Recommendation: Include a human checkpoint plan step that searches `hasattachment:yes`, opens a result, and captures the reading pane snapshot before implementing `attachment_names`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 uses only `agent-browser` (already confirmed installed at 0.25.3 in Phase 0) and Node.js built-ins. No new external dependencies.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Session check via URL pattern — no credentials handled |
| V3 Session Management | yes | `--session-name outlook-skill` auto-saves/restores; `isLoginUrl()` detects expiry |
| V4 Access Control | yes | `policy-search.json` `default: deny` — browser action allowlist enforces read-only |
| V5 Input Validation | yes | Exchange ItemID from `process.argv` — passed to `encodeURIComponent()` before URL construction |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection from email body content | Spoofing | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` wraps page content in nonce-marked markers; `stripContentBoundaries()` strips before output |
| Navigation outside Outlook domain via crafted ID | Tampering | `AGENT_BROWSER_ACTION_POLICY` limits to allowed actions; `encodeURIComponent(id)` prevents URL injection |
| Write operations via crafted ID | Tampering | `policy-search.json` `default: deny` does not allow form submit, click on destructive actions |
| Session token theft via large snapshot | Information Disclosure | `AGENT_BROWSER_MAX_OUTPUT` not set — consider adding for Phase 5; currently mitigated by scoped snapshot |

**Read-only enforcement note:** `policy-search.json` already includes `click`, `fill`, and `press` in its allow list (needed for Phase 2 search combobox). These are potentially destructive actions. The risk is mitigated by the fact that `lib/read.js` will not issue these commands — the batch contains only `open`, `wait`, `get url`, and `snapshot`. The policy is permissive-for-the-tool but the code only uses safe actions. [VERIFIED: `policy-search.json` content]

---

## Sources

### Primary (HIGH confidence)
- `references/outlook-ui.md` — confirmed-live ARIA structure for reading pane, message rows, URL patterns, attachment state (Phase 0 live captures)
- `.agents/skills/agent-browser/references/batch-and-spa-patterns.md` — eval-inside-batch syntax, page reset behavior, text snapshot format, `[role="option"]` DOM selector behavior
- `lib/search.js` — exact patterns for batch structure, text snapshot parsing, `outputError`/`log` usage
- `lib/run.js` — `runBatch` signature, `stripContentBoundaries`, policy path resolution
- `lib/session.js` — `isLoginUrl` implementation, `assertSession` pattern
- `lib/output.js` — `outputOk`, `outputError` signatures
- `outlook.js` — subcommand dispatch pattern, env var validation, `case 'read':` stub location
- `policy-search.json` — confirmed allow list covers all actions needed for read
- `.planning/REQUIREMENTS.md` — READ-01/02/03 exact text
- `03-CONTEXT.md` — all locked decisions D-01 through D-18

### Secondary (MEDIUM confidence)
- `.agents/skills/agent-browser/SKILL.md` — `eval` command syntax, batch stdin mode documentation

### Tertiary (LOW confidence)
- None — all findings are from direct codebase inspection or live captures

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all reuse from Phases 1/2
- Architecture: HIGH for batch structure and ARIA parsing; MEDIUM for eval/snapshot output ordering (A1/A2 — needs live test confirmation)
- Pitfalls: HIGH for documented agent-browser behaviors; MEDIUM for attachment detection (ARIA structure unresolved)

**Research date:** 2026-04-10
**Valid until:** 2026-07-09 (follows outlook-ui.md validity — re-verify if Microsoft deploys UI changes)
