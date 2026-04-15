---
phase: 01-add-folder-flag-to-search-and-digest-subcommands-pre-search-
plan: "02"
subsystem: digest
tags: [folder-navigation, cli-flag, documentation, batch-injection]
dependency_graph:
  requires: [lib/folder.js, --folder flag in lib/search.js]
  provides: [--folder flag in lib/digest.js, updated README.md, updated SKILL.md]
  affects: [lib/digest.js, README.md, SKILL.md]
tech_stack:
  added: []
  patterns: [treeitem click injection, CLI arg extension, alias normalization map]
key_files:
  created: []
  modified: [lib/digest.js, README.md, SKILL.md]
decisions:
  - folderCommands injected into initialBatch AFTER get url (session check) and BEFORE eval/snapshot, per Pitfall 2 from research
  - parseDigestArgs is a separate exported function (not inlined) for testability
  - digest --folder returns empty results when target folder has no Today group (documented, not an error)
  - Folder scope limitation documented in both README Limitations section and SKILL.md Critical notes
metrics:
  duration: ~2 min
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 3
---

# Phase 01 Plan 02: Digest --folder Flag and Documentation Update Summary

**One-liner:** `--folder` flag wired into `digest` via `parseDigestArgs` and treeitem click batch injection, with full README.md and SKILL.md documentation for both `search` and `digest` folder flag.

## What Was Built

### lib/digest.js (modified)

Four changes applied:
1. `require('./folder')` added after existing requires — imports `normalizeFolderName`
2. `parseDigestArgs(argv)` function added before `runDigest` — extracts `--folder <name>` from `process.argv`, returns `{ folder: string|null }`
3. `folderCommands` array built in `runDigest` — empty when folder is null, contains `['find', 'role', 'treeitem', 'click', '--name', resolvedFolder]` + `['wait', '500']` when folder is provided; spread into `initialBatch` after `['get', 'url']` and before `['eval', CONVID_EVAL]`
4. `module.exports` updated to include `parseDigestArgs`

Critical ordering: `...folderCommands` is placed BETWEEN `['get', 'url']` (session check) and `['eval', CONVID_EVAL]`. This prevents a failed folder click from masking an expired session (Pitfall 2 from research).

### README.md (modified)

- Search section usage line updated: `[--limit <n>] [--folder <name>]`
- Three `--folder` search examples added (sent, drafts, exact name with shell quoting)
- Folder aliases note added with all 8 alias mappings
- Digest section usage line updated: `[--folder <name>]`
- Digest `--folder` example added (`--folder sent`)
- Digest empty-results note clarifying this is not an error
- Folder scope limitation added to Limitations section

### SKILL.md (modified)

- Search section usage line updated: `[--limit <n>] [--folder <name>]`
- `--folder <name>` argument documented in search section with all aliases listed
- Digest section usage line updated: `[--folder <name>]`
- `--folder <name>` argument documented in digest section with same-aliases note
- Critical note added to digest section about top-level folder limitation

## Verification Results

All plan verification commands passed:

```
parseDigestArgs: all assertions passed
require('./folder'): 1 match
normalizeFolderName: 2 matches (definition + call site)
treeitem: 1 match
folderCommands: conditional array + spread both present
README.md --folder count: 8 (>= 6 required)
SKILL.md --folder count: 5 (>= 4 required)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The `--folder` flag in digest is fully wired: parseDigestArgs extracts the value, normalizeFolderName resolves it, and folderCommands injects the treeitem click. No placeholder values or TODO stubs introduced.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `--folder` value flows through `normalizeFolderName` and into the `runBatch` command array as a positional element (not shell-interpolated). Threat register items T-01-06 through T-01-08 addressed as documented in the plan.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add --folder flag to digest subcommand | 1fee584 | lib/digest.js |
| 2 | Update README.md and SKILL.md for --folder flag | 947ffc9 | README.md, SKILL.md |

## Self-Check: PASSED
