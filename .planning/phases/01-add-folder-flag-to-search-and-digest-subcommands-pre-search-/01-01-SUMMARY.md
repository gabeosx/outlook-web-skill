---
phase: 01-add-folder-flag-to-search-and-digest-subcommands-pre-search-
plan: "01"
subsystem: search
tags: [folder-navigation, cli-flag, normalization, batch-injection]
dependency_graph:
  requires: []
  provides: [lib/folder.js, --folder flag in lib/search.js]
  affects: [lib/search.js, lib/digest.js (plan 02)]
tech_stack:
  added: []
  patterns: [treeitem click injection, CLI arg extension, alias normalization map]
key_files:
  created: [lib/folder.js]
  modified: [lib/search.js]
decisions:
  - normalizeFolderName returns passthrough for unknown names (not an error) so custom folder names work without alias registration
  - folderCommands injected after open/wait, before combobox click — matches research Pattern 1
  - folder value reflected in stderr log but not in JSON output envelope (not required by plan)
metrics:
  duration: ~5 min
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 01 Plan 01: Folder Navigation Module and Search --folder Flag Summary

**One-liner:** Folder name normalization module (`lib/folder.js`) with 9 alias mappings plus `--folder <name>` flag wired into `search` via treeitem click batch injection.

## What Was Built

### lib/folder.js (new)

A pure utility module with no lib/ dependencies:
- `FOLDER_ALIASES` — maps 9 lowercase aliases (`inbox`, `sent`, `drafts`, `trash`, `spam`, etc.) to exact Outlook ARIA treeitem name prefixes
- `normalizeFolderName(raw)` — returns null for falsy input, alias match if found, or raw passthrough for custom folder names
- Exports both `FOLDER_ALIASES` and `normalizeFolderName`

### lib/search.js (modified)

Four changes applied:
1. `require('./folder')` added after existing requires
2. `parseArgs` extended to recognize `--folder <name>` and return `{ query, limit, folder }` (folder is null when omitted); usage string updated
3. `executeComboboxSearch(query, folder)` — resolves folder via normalizeFolderName, builds `folderCommands` array (empty when folder is null), spreads into batch after `['wait', '5000']` and before `['find', 'role', 'combobox', 'click']`
4. `runSearch` destructures `folder` from parseArgs and passes it to executeComboboxSearch; log line updated

## Verification Results

All plan verification commands passed:

```
folder.js: all assertions passed
search.js parseArgs: all assertions passed
require('./folder'): 1 match
normalizeFolderName: 2 matches (definition + call site)
treeitem: 1 match
folderCommands: conditional array + spread both present
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `click` action used by `find role treeitem click` was already in the allow-list of `policy-search.json`. Threat register items T-01-01 through T-01-05 are addressed as documented in the plan.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create lib/folder.js | 70bf71e | lib/folder.js |
| 2 | Add --folder flag to search | 31faf44 | lib/search.js |

## Self-Check: PASSED
