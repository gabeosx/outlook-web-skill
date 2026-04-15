---
phase: 05-skill-packaging
fixed_at: 2026-04-12T00:00:00Z
review_path: .planning/phases/05-skill-packaging/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-04-12
**Source review:** .planning/phases/05-skill-packaging/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — Info findings excluded per fix_scope: critical_warning)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Exit code 1 description is incorrect — JSON is always on stdout

**Files modified:** `SKILL.md`
**Commit:** 9db9365
**Applied fix:** Replaced the exit code 1 description from "Fatal startup error before JSON could be written... no JSON on stdout" to "JSON written to stdout with `{"status":"error",...}`; always parse stdout regardless of exit code". Added a follow-on note about the rare edge case of a Node.js crash before `outputError()` runs, directing the caller to check stderr in that scenario. Verified against `lib/output.js` which confirms `outputError()` always calls `process.stdout.write()` before `process.exit(1)`.

---

### WR-02: Score range boundaries in `digest-signals.md` are off-by-one relative to `tune.js` tier boundaries

**Files modified:** `references/digest-signals.md`
**Commit:** ef6ce54
**Applied fix:** Replaced the six-range score table (0, 1-20, 21-40, 41-60, 61-80, 81-100) with the five-range table aligned to tune.js tier boundaries (0, 1-19, 20-39, 40-59, 60-100). Added a sentence below the table explicitly mapping the ranges to the tune tier labels (Tier 1–4) so the calling agent can reconcile score values with tune output. Verified against `lib/tune.js` which confirms: Tier 1 min=1/max=19, Tier 2 min=20/max=39, Tier 3 min=40/max=59, Tier 4 min=60/max=Infinity.

---

### WR-03: `digest-signals.md` documents hardcoded fallback bulk patterns that are absent from `scoring.json.example`

**Files modified:** `references/digest-signals.md`
**Commit:** b791b81
**Applied fix:** Added a "Note on hardcoded fallback defaults" paragraph in the Bulk Sender section of the Sender Classification section. The note names the two additional patterns (`ezcater`, `company-newsletter`) active on fresh installs, explains when they apply (before `scoring.json` is created), and directs the user to `node outlook.js tune --save` to inspect the full active configuration. Verified against `lib/digest.js` lines 38-39 which confirm the two patterns are hardcoded in the `getScoringConfig()` fallback.

---

_Fixed: 2026-04-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
