# Batch and SPA Automation Patterns

Discovered behaviors when using agent-browser against Microsoft Outlook web (a complex React SPA).
These are not in the official docs but are critical for reliable automation.

**Related**: [session-management.md](session-management.md), [snapshot-refs.md](snapshot-refs.md)

---

## Batch Command Behavior

### `--json` flag is ignored inside `batch`

When you include `snapshot --json` as a batch command, agent-browser ignores `--json` and always
outputs the accessibility tree in **text format**:

```
✓ Outlook
  https://example.com/mail/

✓ Done

- generic "Page Title" [ref=e1] clickable [onclick]
  - button "Submit" [ref=e2]
  - option "Row 1 content here" [ref=e3]
  - option "Row 2 content here" [ref=e4]
```

Parse option elements from text format with a regex that strips `[ref=eNN]` suffixes:

```js
for (const line of stdout.split('\n')) {
  // Lines: "  - option "name content" [ref=e41]"
  const m = line.match(/^\s*-\s+option\s+"(.+?)"\s*(?:\[.*)?$/);
  if (m) rows.push(m[1]);
}
```

`--json` only works for standalone `runAgentBrowser(['snapshot', '-i', '--json'])` calls.

### Page resets to `about:blank` after batch exits

After a `batch` CLI process exits, the daemon resets the active page to `about:blank`. Any
subsequent command (snapshot, eval, get url) will see an empty page.

**Rule: snapshot and eval must be inside the batch, not after it.**

```js
// WRONG — snapshot sees about:blank
runBatch([
  ['open', url], ['wait', '3000'], ['find', 'role', 'combobox', 'click'],
  ['fill', ...], ['press', 'Enter'], ['wait', '4000'],
], policy);
runAgentBrowser(['snapshot', '-i', '--json'], policy); // ← sees about:blank

// CORRECT — snapshot is the last batch command, runs while page is live
runBatch([
  ['open', url], ['wait', '3000'], ['find', 'role', 'combobox', 'click'],
  ['fill', ...], ['press', 'Enter'], ['wait', '4000'],
  ['snapshot', '-i', '--json'],  // ← runs before page resets
], policy);
// parse snapshot from batch stdout
```

### eval inside batch

`eval --stdin` requires stdin piping and cannot be used in a batch command array.
Pass the script as a positional argument instead: `['eval', 'JS_SCRIPT_HERE']`.

The eval result appears in the batch stdout alongside other command outputs.

---

## Snapshot JSON Structure (standalone calls)

When snapshot is called standalone with `--json`, the output structure is:

```json
{
  "success": true,
  "data": {
    "origin": "https://example.com",
    "refs": {
      "e1": { "role": "button", "name": "Submit" },
      "e2": { "role": "option", "name": "Row content here" },
      "e3": { "role": "combobox", "name": "Search..." }
    },
    "snapshot": "..."
  }
}
```

**`refs` is a FLAT dict keyed by element ID — NOT a nested tree.**

```js
// WRONG — walking children/nodes finds nothing
function walk(node) { for (const child of node.children || []) walk(child); }

// CORRECT — flat iteration
const options = Object.values(snapshot.data.refs)
  .filter(v => v && v.role === 'option' && v.name);
```

Each ref has only `role` and `name` fields. There are no child refs, no IDs, no attributes.

---

## Daemon and Session Behavior

### `--session-name` is file persistence, NOT process reuse

`--session-name outlook-skill` saves and restores cookies/localStorage to
`~/.agent-browser/sessions/outlook-skill/`. It does NOT guarantee that the same
Chrome process is reused between invocations.

- First invocation: starts Chrome daemon, loads session files
- Subsequent invocations: **may** reconnect to running daemon (if still alive)
- After `close`: daemon is killed; next invocation starts fresh Chrome

### `--headed` is a daemon-startup flag only

`--headed` is only meaningful when starting a new Chrome instance. If the daemon is
already running, `--headed` is silently ignored with a warning:

```
⚠ --headed ignored: daemon already running. Use 'agent-browser close' first to restart with new options.
```

Only pass `--headed` to the command that starts the daemon (typically the first `open`
inside a batch, or the first standalone command after a `close`).

### Cold start requires longer waits

On a fresh Chrome start (after `close`), SPAs need more time to load than warm reloads:

| Scenario | Minimum wait after `open` |
|----------|--------------------------|
| Warm daemon, SPA already loaded | 3s |
| Fresh Chrome start, full SPA load | 5s+ |
| Complex SPA with many assets (Outlook) | 5–7s |

---

## SPA-Specific Patterns

### Virtualized lists break scroll-and-accumulate

Some SPAs (notably Outlook) virtualize their list during scroll: as you scroll,
items are removed from and re-added to the accessibility tree. A snapshot taken
immediately after `scroll down` may show **zero items** even though items are visible.

Do not try to collect more results by scrolling — you will get empty snapshots.
Only the first viewport of results is reliably accessible.

### ARIA roles set by JS are invisible to CSS attribute selectors

Outlook sets `role="option"` on list rows via JavaScript, not as HTML attributes.

```js
// WRONG — always returns []
document.querySelectorAll('[role="option"]')

// CORRECT — use data attributes set at render time
document.querySelectorAll('[data-convid],[data-app-id]')
```

### Content boundary markers use underscore

When `AGENT_BROWSER_CONTENT_BOUNDARIES=1` is set, page-sourced output is wrapped:

```
--- AGENT_BROWSER_PAGE_CONTENT nonce=abc origin=https://... ---
<content>
--- END_AGENT_BROWSER_PAGE_CONTENT nonce=abc ---
```

The END marker uses an **underscore** (`END_AGENT_BROWSER_PAGE_CONTENT`), not a space.
Regex to strip both markers:

```js
const startPattern = /---\s*AGENT_BROWSER_PAGE_CONTENT\s+[^\n]*---\n?/g;
const endPattern = /\n?---\s*END[_ ]AGENT_BROWSER_PAGE_CONTENT[^\n]*---/g;
return stdout.replace(startPattern, '').replace(endPattern, '').trim();
```

### Policy action names differ from CLI commands

The action policy `allow` list uses **internal** action names, not CLI command names:

| CLI command | Internal action name (for policy) |
|-------------|----------------------------------|
| `eval` | `evaluate` |
| `find role ...` | `getbyrole` |
| `snapshot` | `snapshot` |
| `get url` | `get`, `url` |

Missing an internal name causes `Action 'X' denied by policy` errors even if the
CLI command name is in the allow list.
