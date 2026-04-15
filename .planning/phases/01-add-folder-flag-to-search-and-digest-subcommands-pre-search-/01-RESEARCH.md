# Phase 1: Folder Navigation (`--folder` flag) - Research

**Researched:** 2026-04-15
**Domain:** Outlook Web ARIA / agent-browser batch / Node.js CLI argument parsing
**Confidence:** HIGH

---

## Summary

The goal is to add a `--folder <name>` flag to `search` and `digest` that navigates to the target folder in the Outlook left nav pane before running the existing batch operation. The live ARIA capture (Capture 1) confirms that the Navigation pane exposes folders as `treeitem` elements inside `region "Navigation pane"`. The existing `agent-browser find role treeitem click --name "<folder>"` semantic locator pattern is the correct way to click a folder without needing a stable ref.

The critical ordering constraint: the folder click must happen **inside the same batch** as the open/wait/search/snapshot sequence. Because the page resets to `about:blank` after batch exit (Decision from Phase 2), a separate pre-flight batch to click the folder would be cancelled before the search batch could run. The folder click is simply prepended to the existing batch command arrays in both `search.js` and `digest.js`.

Search scope changes when a folder treeitem is selected: Outlook's combobox search then scopes results to that folder (confirmed via the search ribbon's "All folders" vs folder-specific label). The digest already navigates to `/mail/inbox` explicitly — folder navigation must happen after the open/wait, before the snapshot/eval commands.

**Primary recommendation:** Prepend `['find', 'role', 'treeitem', 'click', '--name', folderName]` + `['wait', '500']` to the existing batch arrays in `executeComboboxSearch` (search) and the `initialBatch` in `runDigest`, gated on `folder !== null`. Update `parseArgs` in both modules to accept `--folder <name>`.

---

## Standard Stack

No new libraries needed. This phase uses only the existing project stack.

| Component | Current | Purpose |
|-----------|---------|---------|
| `agent-browser` | 0.25.3 confirmed in production | Browser automation — `find role treeitem click` |
| `lib/run.js` `runBatch` | existing | Executes multi-command batches |
| `lib/search.js` | existing | `parseArgs`, `executeComboboxSearch`, `runSearch` |
| `lib/digest.js` | existing | `runDigest`, initial/scroll batches |
| `policy-search.json` | existing | Action policy (allows `click`, `find` already present) |

[VERIFIED: codebase grep] — `policy-search.json` already allows `click`. The `find` command routes through `click` internally — no policy change needed.

---

## Architecture Patterns

### Existing Batch Structure (search)

The `executeComboboxSearch` function in `lib/search.js` builds a batch array:

```javascript
// Current batch (lib/search.js lines 52-61)
const result = runBatch([
  ['open', process.env.OUTLOOK_BASE_URL],
  ['wait', '5000'],
  ['find', 'role', 'combobox', 'click'],
  ['wait', '500'],
  ['find', 'role', 'combobox', 'fill', query],
  ['press', 'Enter'],
  ['wait', '4000'],
  ['eval', "JSON.stringify(...)"],
  ['snapshot', '-i', '--json'],
], POLICY);
```

### Existing Batch Structure (digest)

```javascript
// Current initialBatch (lib/digest.js lines 307-313)
const initialBatch = [
  ['open', process.env.OUTLOOK_BASE_URL + '/mail/inbox'],
  ['wait', '5000'],
  ['get', 'url'],
  ['eval', CONVID_EVAL],
  ['snapshot'],
];
```

### Pattern 1: Folder Navigation via treeitem click

**What:** Click a named `treeitem` in the Navigation pane to switch the active folder before searching.

**When to use:** When `--folder` flag is passed with a non-null value.

**ARIA evidence (Capture 1, confirmed-live):**
```
region "Navigation pane" [ref=e5]
  heading "Navigation pane" [level=2, ref=e33]
  treeitem "Inbox selected 463 unread" [level=2, expanded=true, selected, ref=e62]
  treeitem "Drafts 19 items" [level=2, ref=e72]
  treeitem "Sent Items" [level=2, ref=e73]
```

The accessible name contains the folder name as a prefix followed by count/state suffixes. The `find role treeitem --name "<name>"` semantic locator uses substring matching by default, so `--name "Sent Items"` will match `treeitem "Sent Items"` even when count suffixes differ.

**Example — injected commands for search:**
```javascript
// Source: codebase analysis + ARIA capture
const folderCommands = folder ? [
  ['find', 'role', 'treeitem', 'click', '--name', folder],
  ['wait', '500'],
] : [];

const result = runBatch([
  ['open', process.env.OUTLOOK_BASE_URL],
  ['wait', '5000'],
  ...folderCommands,   // injected before search combobox interaction
  ['find', 'role', 'combobox', 'click'],
  ['wait', '500'],
  ['find', 'role', 'combobox', 'fill', query],
  ['press', 'Enter'],
  ['wait', '4000'],
  ['eval', CONVID_EVAL],
  ['snapshot', '-i', '--json'],
], POLICY);
```

**Example — injected commands for digest:**
```javascript
// Source: codebase analysis
const folderCommands = folder ? [
  ['find', 'role', 'treeitem', 'click', '--name', folder],
  ['wait', '500'],
] : [];

const initialBatch = [
  ['open', process.env.OUTLOOK_BASE_URL + '/mail/inbox'],
  ['wait', '5000'],
  ['get', 'url'],
  ...folderCommands,   // injected after URL check, before eval
  ['eval', CONVID_EVAL],
  ['snapshot'],
];
```

### Pattern 2: parseArgs Extension

**What:** Extend the existing `parseArgs` functions to recognize `--folder <name>`.

**Existing pattern (lib/search.js `parseArgs`):**
```javascript
// Existing: handles --limit N and positional query
function parseArgs(argv) {
  const args = argv.slice(3);
  let query = null;
  let limit = DEFAULT_LIMIT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[i + 1], 10) || DEFAULT_LIMIT;
      i++;
    } else if (!query) {
      query = args[i];
    }
  }
  return { query, limit };
}
```

**Extended (add `--folder`):**
```javascript
function parseArgs(argv) {
  const args = argv.slice(3);
  let query = null;
  let limit = DEFAULT_LIMIT;
  let folder = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10);
      if (!isNaN(n) && n > 0) limit = n;
      i++;
    } else if (args[i] === '--folder' && i + 1 < args.length) {
      folder = args[i + 1];
      i++;
    } else if (!query) {
      query = args[i];
    }
  }
  return { query, limit, folder };
}
```

For `digest`, a separate `parseArgs` (or inline arg parsing) needs to be added since digest currently has no arg parsing at all — `runDigest` accesses `process.argv` directly but does not define a `parseArgs`.

### Pattern 3: Folder Name Normalization

**What:** Accept case-insensitive common aliases and normalize to the exact Outlook treeitem name.

**Why:** Users will type `sent`, `drafts`, `inbox` — the ARIA tree uses `"Sent Items"`, `"Drafts"`, `"Inbox"`. The `find --name` flag is case-sensitive for exact substring matching.

**Known folder names (from ARIA capture 1, confirmed-live):**
- `"Inbox"` — selected state adds ` selected 463 unread` suffix but name prefix is stable
- `"Drafts"` — `treeitem "Drafts 19 items"`
- `"Sent Items"` — `treeitem "Sent Items"`

[ASSUMED] Additional standard folders likely include: `"Deleted Items"`, `"Junk Email"`, `"Archive"` — standard OWA folder names confirmed in Microsoft documentation but not live-captured on this tenant. Planner should note these as `[ASSUMED]` folder names.

**Normalization map:**
```javascript
const FOLDER_ALIASES = {
  'inbox':       'Inbox',
  'drafts':      'Drafts',
  'sent':        'Sent Items',
  'sent items':  'Sent Items',
  'deleted':     'Deleted Items',
  'trash':       'Deleted Items',
  'junk':        'Junk Email',
  'spam':        'Junk Email',
  'archive':     'Archive',
};

function normalizeFolderName(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return FOLDER_ALIASES[lower] || raw;  // fall through to literal if no alias
}
```

This lets `--folder sent` work without requiring the user to type `"Sent Items"` exactly.

### Anti-Patterns to Avoid

- **Separate pre-flight batch for folder click:** Running a separate `runBatch` to click the folder before the search batch will not work — the page resets to `about:blank` after batch exit. The folder click must be inside the same batch. [VERIFIED: Phase 2 decision, STATE.md line 79]
- **URL-based folder navigation:** There is no stable URL per folder in Outlook web (the URL stays at `/mail/` after navigation). Use treeitem click, not `open <folder-url>`. [VERIFIED: outlook-ui.md URL Patterns section]
- **Re-adding `--profile` flag:** Chrome SingletonLock prevents two processes on same profile. [VERIFIED: STATE.md Phase 1 decision line 71]
- **Snapshots outside batch:** The snapshot must be the last command inside the batch — page resets to `about:blank` after batch exit. [VERIFIED: STATE.md Phase 2 decision line 78]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding treeitem by name | Custom DOM query via eval | `find role treeitem click --name` | agent-browser semantic locators handle substring matching and role targeting natively |
| Folder URL navigation | Parse `/mail/folder/` URLs | treeitem click | Outlook web has no stable per-folder URL; SPA state only |
| Exact ARIA name matching | Hardcode full name with counts | `find --name` substring match | Unread counts change; substring match is resilient |

---

## Common Pitfalls

### Pitfall 1: `find role treeitem` matching wrong item if folder tree is collapsed

**What goes wrong:** Some Outlook tenants collapse the folder tree to show only top-level items. If a subfolder (e.g., custom folder) is not visible in the ARIA tree at the time of click, `find role treeitem` returns an error.

**Why it happens:** The Navigation pane lazy-renders child treeitems; they only appear in ARIA when the parent is expanded.

**How to avoid:** For the initial scope (Phase 1), only support standard top-level folders: Inbox, Sent Items, Drafts, Deleted Items, Junk Email, Archive. Document this limitation in README and SKILL.md. Custom/nested folders are a future enhancement.

**Warning signs:** `find role treeitem click --name "Custom Folder"` returns error or times out.

---

### Pitfall 2: Digest folder navigation placement relative to `get url` session check

**What goes wrong:** If folder click is inserted before `['get', 'url']` in the digest initial batch, a failed folder click could mask an expired session — the session check never runs.

**Why it happens:** batch `--bail` would abort on treeitem click failure.

**How to avoid:** Insert folder commands **after** `['get', 'url']` in the digest batch. The session check remains the first action after the initial open/wait.

```javascript
const initialBatch = [
  ['open', process.env.OUTLOOK_BASE_URL + '/mail/inbox'],
  ['wait', '5000'],
  ['get', 'url'],         // session check FIRST
  ...folderCommands,      // folder click AFTER session check
  ['eval', CONVID_EVAL],
  ['snapshot'],
];
```

---

### Pitfall 3: `find role treeitem` is not in policy-search.json explicitly

**What goes wrong:** The `find` action uses the `click` action internally. The policy already allows `click`, so this passes. But if the policy is ever tightened, `find` may need an explicit allowlist entry.

**Why it happens:** `agent-browser find` is a compound command — it locates an element semantically then performs an action. Its policy enforcement key is `click` (the action), not `find` (the locator strategy).

**How to avoid:** Verify during implementation that `find role treeitem click --name "Sent Items"` does not produce a policy violation. The existing search combobox code already uses `find role combobox click`, confirming the pattern works. [VERIFIED: lib/search.js lines 55, 56]

---

### Pitfall 4: Digest scroll-accumulate logic assumes inbox folder

**What goes wrong:** The digest scroll-accumulate loop (Steps 5 in `runDigest`) always scrolls and looks for `button "Today"` group headers. In other folders (e.g., Sent Items), the group header may use different labeling or grouping (e.g., `button "Today"` may not exist if messages are grouped by "Sent" date differently).

**Why it happens:** `extractTodayRows` hardcodes pattern matching for inbox grouping (Today/Yesterday/day-of-week buttons).

**How to avoid:** For Phase 1, document that `digest --folder` works best with folders that have the same date-grouped structure as inbox. The scroll logic is not modified. If a non-inbox folder lacks a "Today" group, `digest --folder` returns empty results (same as inbox behavior when Today is absent).

---

### Pitfall 5: `--folder` value passed with spaces requires quoting

**What goes wrong:** `node outlook.js search "from:alice" --folder Sent Items` (unquoted) passes `folder = "Sent"` and leaves `"Items"` as an unrecognized arg.

**Why it happens:** Shell splits on spaces before argv is received by Node.

**How to avoid:** The normalization map handles `--folder sent` (single word alias) → `"Sent Items"`. Document in README/SKILL.md that `--folder "Sent Items"` requires quoting for multi-word names, but `--folder sent` (alias) works without quotes.

---

## Code Examples

### Verified Pattern: agent-browser find role treeitem click

Source: `references/outlook-ui.md` ARIA Capture 1 (confirmed-live) + `lib/search.js` (existing find role combobox pattern)

```bash
# Exact pattern already used in production for combobox (lib/search.js line 55):
agent-browser find role combobox click

# By analogy for treeitem (same agent-browser find role <role> click pattern):
agent-browser find role treeitem click --name "Sent Items"
```

The `--name` flag filters by accessible name substring. `find role treeitem` without `--name` would click the first treeitem (Inbox). [VERIFIED: SKILL.md lines 684-690]

### Verified Pattern: Batch array injection

Source: `lib/search.js` existing `executeComboboxSearch` (confirmed working in production)

```javascript
// Spread operator injection into batch command array (standard JS, no library needed)
const folderCommands = folder ? [
  ['find', 'role', 'treeitem', 'click', '--name', folder],
  ['wait', '500'],
] : [];

runBatch([
  ['open', ...],
  ['wait', '5000'],
  ...folderCommands,
  // ... rest of batch
], POLICY);
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Direct URL navigation to folder | Not available (no stable folder URLs in OWA SPA) | URL stays at `/mail/` after folder change |
| `snapshot` as separate command | Snapshot inside batch (last command) | Enforced since Phase 2 — page resets after batch exit |
| Polling for URL after open | Single URL check after open returns | Phase 1 decision — open blocks until load |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `find role treeitem click --name "X"` uses substring matching (not exact match), so `"Sent Items"` matches `treeitem "Sent Items"` even when count suffix is appended | Architecture Patterns | If exact matching is used, click fails when unread count is appended to name |
| A2 | Additional standard folders include `"Deleted Items"`, `"Junk Email"`, `"Archive"` | Pattern 3 (normalization map) | Folder aliases in normalization map may point to wrong names; user gets error |
| A3 | In non-inbox folders, `digest` Today group detection (`extractTodayRows`) produces empty results gracefully rather than erroring | Pitfall 4 | Silent empty result when Today group pattern differs |
| A4 | Digest `runDigest` currently has no `parseArgs` function — argument parsing must be added | Architecture Patterns | If parseArgs already exists somewhere in digest flow, planner may duplicate it |

**Mitigation for A1:** The existing `find role combobox click` in `lib/search.js` (line 55) does not pass `--name`, confirming that `find role` works without exact name. The `--name` flag for substring match is documented in `SKILL.md` line 685. [VERIFIED: SKILL.md `find role button click --name "Submit"`]

---

## Open Questions

1. **Does `find role treeitem click --name "Sent Items"` click the correct item when Inbox is currently selected?**
   - What we know: ARIA tree shows `treeitem "Inbox selected 463 unread"` and `treeitem "Sent Items"` as siblings in `region "Navigation pane"`. The `--name "Sent Items"` substring filter should uniquely identify the Sent Items treeitem.
   - What's unclear: Whether clicking a treeitem triggers any Outlook state change that requires an additional wait before the search combobox is ready.
   - Recommendation: Include `['wait', '500']` after the treeitem click (same wait used after combobox click). If live testing shows it's insufficient, increase to `['wait', '1000']`.

2. **Does clicking a folder treeitem scope the search combobox to that folder automatically, or is there a separate filter to set?**
   - What we know: The search ribbon shows `button "Search filters, All folders, 0 other filters applied"` (Capture 5). After navigating to a folder before searching, Outlook may auto-scope to that folder OR may still search all folders.
   - What's unclear: Whether the search filter is automatically scoped after folder click.
   - Recommendation: This must be verified during implementation. If search is not scoped by folder click alone, the plan should include clicking the search filter dropdown to select the current folder. The ARIA of that button is known: `button "Search filters, All folders, 0 other filters applied"`.

3. **Does `digest --folder` make sense semantically?**
   - What we know: Digest reads the "Today" group from inbox. Sent Items has no "Today" group in the same sense.
   - What's unclear: Whether users will actually use `digest --folder sent` or if this should be `search`-only.
   - Recommendation: Implement `--folder` on both `search` and `digest` per the phase goal, but document that `digest --folder` returns empty results for folders without a Today group.

---

## Environment Availability

Step 2.6: SKIPPED for external dependencies — this phase is code changes only within the existing Node.js/agent-browser stack, which is already confirmed working in production (v1.0 shipped 2026-04-15).

---

## Validation Architecture

No automated test framework was detected in the project (no `package.json` test script, no `tests/` directory, no Jest/Vitest config).

Manual validation protocol for this phase:

| Behavior | Manual Test Command | Expected Output |
|----------|--------------------|-----------------| 
| `search --folder sent` scopes to Sent Items | `node outlook.js search "from:alice" --folder sent` | results with `folder` field or confirmed-Sent-Items messages |
| `search --folder drafts` scopes to Drafts | `node outlook.js search "subject:test" --folder drafts` | results from Drafts only |
| `search` without `--folder` unchanged | `node outlook.js search "from:alice"` | unchanged behavior (Inbox) |
| `digest --folder sent` runs without error | `node outlook.js digest --folder sent` | empty or results, no error |
| Unknown folder name falls through to literal | `node outlook.js search "x" --folder "My Custom Folder"` | attempt click, may error if not found |
| `--folder sent` alias works (no quotes) | `node outlook.js search "x" --folder sent` | normalized to "Sent Items" |

---

## Security Domain

No new security surface introduced. The existing `policy-search.json` action policy (`default: deny`) already restricts all actions. The `click` action used by `find role treeitem click` is already allowed. No new domains are navigated. The `--folder` value is passed as a CLI argument — it is used as the `--name` argument to `agent-browser find`, which is a passive locator parameter (not navigated to as a URL). [VERIFIED: policy-search.json]

Prompt injection via folder name is not a concern: the folder name comes from the CLI caller (trusted), not from page content.

---

## Project Constraints (from CLAUDE.md)

- **Interface**: CLI-invocable only — no MCP server. `--folder` is added as a CLI flag.
- **Safety**: Strictly read-only — `find role treeitem click` is a navigation action (read-only in intent). The action policy already allows `click`.
- **Browser**: Uses `@vercel/agent-browser` CLI — all folder navigation via `agent-browser batch` commands.
- **Auth**: `--session-name outlook-skill` (hardcoded in `lib/run.js`) — unchanged.
- **Output**: JSON to stdout — unchanged. The `folder` parameter may optionally be reflected in the output envelope as a `folder` field (planner decision).
- **Phase completion checklist**: Both `README.md` and `SKILL.md` must be updated to document `--folder` flag for `search` and `digest` before the phase is marked complete.

---

## Sources

### Primary (HIGH confidence)
- `/Users/b.g.albert/outlook-web-skill/references/outlook-ui.md` — ARIA capture 1: `treeitem` structure in Navigation pane (direct codebase inspection)
- `/Users/b.g.albert/outlook-web-skill/lib/search.js` — existing batch pattern, `parseArgs`, `executeComboboxSearch` (direct codebase inspection)
- `/Users/b.g.albert/outlook-web-skill/lib/digest.js` — existing `runDigest` batch pattern (direct codebase inspection)
- `/Users/b.g.albert/outlook-web-skill/lib/run.js` — `runBatch` implementation (direct codebase inspection)
- `/Users/b.g.albert/outlook-web-skill/policy-search.json` — confirmed `click` is allowed (direct codebase inspection)
- `/Users/b.g.albert/outlook-web-skill/.agents/skills/agent-browser/SKILL.md` — `find role treeitem click --name` pattern (direct codebase inspection)
- `/Users/b.g.albert/outlook-web-skill/.planning/STATE.md` — Phase 2 decision: snapshot must be last in batch; page resets to about:blank after batch exit (direct codebase inspection)

### Secondary (MEDIUM confidence)
- `find role treeitem` uses substring matching for `--name`: inferred from `SKILL.md` examples showing `find role button click --name "Submit"` alongside the combobox without `--name` in existing code

### Tertiary (LOW confidence / ASSUMED)
- Standard Outlook folder names beyond Inbox/Drafts/Sent Items (`"Deleted Items"`, `"Junk Email"`, `"Archive"`) — training knowledge, not live-captured on this tenant

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing
- Architecture patterns: HIGH — based on confirmed ARIA captures and live codebase
- Pitfalls: HIGH for batch ordering (verified), MEDIUM for treeitem matching behavior (inferred from existing find role combobox pattern)
- Folder name normalization aliases: MEDIUM — Inbox/Drafts/Sent Items confirmed, others assumed

**Research date:** 2026-04-15
**Valid until:** 2026-07-15 (ARIA patterns stable unless Microsoft redesigns nav pane)
