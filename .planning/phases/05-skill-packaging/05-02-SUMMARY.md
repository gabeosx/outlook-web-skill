---
phase: 05-skill-packaging
plan: 02
subsystem: documentation
tags: [reference-files, error-recovery, digest-scoring, calling-agent]
dependency_graph:
  requires: []
  provides:
    - references/error-recovery.md
    - references/digest-signals.md
  affects:
    - SKILL.md (plan 05-01) — these refs are linked from SKILL.md's reference table
tech_stack:
  added: []
  patterns:
    - Decision-tree format for error recovery (numbered steps, no prose without steps)
    - Signal value table for LLM-consumable documentation
key_files:
  created:
    - references/error-recovery.md
    - references/digest-signals.md
  modified: []
decisions:
  - "Documented MESSAGE_NOT_FOUND as a fifth error code alongside the four REQUIREMENTS-specified codes — calling agent will encounter it in practice"
  - "Noted AUTH_REQUIRED as rarely emitted in production; SESSION_INVALID is the operational code — both documented with identical recovery steps"
  - "Bulk suppression documented as newsletter/automated email indicator, not an error code"
metrics:
  duration: ~10 min
  completed: "2026-04-12T18:02:09Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 05 Plan 02: Error Recovery and Digest Signals Reference Files Summary

Two reference files for the outlook skill's calling agent: mechanical decision trees for all error codes, and a complete digest scoring algorithm reference with natural language explanation templates.

## What Was Built

**references/error-recovery.md** (108 lines, min 40): Decision trees for all 5 error codes. Each code has a "When you see" JSON example, a plain-English meaning, and numbered recovery steps. Includes a code extraction bash snippet at the top so the calling agent can parse `error.code` from stdout. Covers SESSION_INVALID (run auth, prompt user, retry), AUTH_REQUIRED (same steps, noted as rarely emitted), INVALID_ARGS (do NOT retry — fix config/args), OPERATION_FAILED (retry once; surface error.message if recurs), and MESSAGE_NOT_FOUND (retry with --query; advise re-search if still missing). Closes with a note that `auth` is idempotent.

**references/digest-signals.md** (156 lines, min 50): Full scoring algorithm reference sourced from `scoring.json.example` and `lib/digest.js`. Contains: score scale table (0–100 ranges with plain-English labels), default weights table (all 5 keys with exact values from scoring.json.example: 40, 20, 40, 5, 20), all 5 importance_signals values with point values and meanings, default urgency keyword list (17 keywords verbatim from scoring.json.example), sender classification logic (human/channel/bulk heuristics), natural language explanation templates for all signal combinations including bulk suppression, and calibration path via `tune` and `tune --save`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write references/error-recovery.md | c0aa969 | references/error-recovery.md |
| 2 | Write references/digest-signals.md | 8e119e3 | references/digest-signals.md |

## Deviations from Plan

None — plan executed exactly as written. All content sourced from authoritative files (scoring.json.example, lib/digest.js, lib/output.js, lib/session.js, lib/read.js) per the plan's read_first directives and threat mitigations T-05-06 through T-05-10.

## Known Stubs

None. Both files contain authoritative content sourced directly from the codebase.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Both files are static documentation.

## Self-Check: PASSED

Files exist check:
- references/error-recovery.md: FOUND
- references/digest-signals.md: FOUND

Commits exist check:
- c0aa969: FOUND (feat(05-02): write references/error-recovery.md...)
- 8e119e3: FOUND (feat(05-02): write references/digest-signals.md...)

Content checks:
- All 5 error codes present: PASSED
- 20 numbered steps (>= 10 required): PASSED
- All 5 weight keys with exact values 40/20/40/5/20: PASSED
- All 5 importance_signals values: PASSED
- bulk suppression documented: PASSED
- scoring.json reference: PASSED
- tune subcommand with --save: PASSED
- Natural language templates: PASSED
- No real user data: PASSED
