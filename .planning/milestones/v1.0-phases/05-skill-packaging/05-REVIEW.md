---
phase: 05-skill-packaging
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - SKILL.md
  - references/digest-signals.md
  - references/error-recovery.md
  - references/kql-syntax.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

These are LLM-facing documentation files that teach a calling agent how to invoke the `outlook.js` skill. The review cross-referenced all four files against the actual implementation (`outlook.js`, `lib/search.js`, `lib/read.js`, `lib/digest.js`, `lib/tune.js`, `lib/output.js`, `lib/session.js`, `scoring.json.example`).

The files are generally accurate and well-structured. Three issues require correction before the calling agent will behave reliably:

1. The exit-code table in `SKILL.md` incorrectly states that exit code 1 means no JSON was written to stdout — the implementation always writes JSON before exiting.
2. The score range table in `digest-signals.md` has an off-by-one boundary that contradicts the `tune` tier system.
3. `digest-signals.md` documents a score scale with six named ranges, but `tune.js` exposes a five-tier system — a calling agent reconciling both sections could be confused.

`kql-syntax.md` and `error-recovery.md` are accurate; no corrections needed there.

---

## Warnings

### WR-01: Exit code 1 description is incorrect — JSON is always on stdout

**File:** `SKILL.md:53-55`

**Issue:** The exit code table states:

> `1` — Fatal startup error before JSON could be written (e.g. missing env var); no JSON on stdout

This is inaccurate. In `lib/output.js`, `outputError()` always writes the JSON error envelope to stdout before calling `process.exit(1)`. Even for a missing env var (`INVALID_ARGS` emitted from `outlook.js:24`), the JSON is written first. There is no code path that exits with code 1 without first writing JSON to stdout.

A calling agent that trusts this description will skip parsing stdout when it gets exit code 1, silently dropping the structured error code and message. It may then retry or report a generic failure instead of taking the correct recovery action (e.g. checking `.env` for a missing variable).

**Fix:** Replace the exit code description:

```markdown
**Exit codes:**
- `0` — JSON written to stdout; always check the `status` field
- `1` — JSON written to stdout with `{"status":"error",...}`; always parse stdout regardless of exit code
```

If there is a genuine concern about a pre-JSON crash (e.g., a syntax error in `outlook.js` itself), add a separate note:

```markdown
Note: In the rare case of a Node.js crash before `outputError()` runs (e.g., a syntax error),
stdout may be empty. If stdout is empty and exit code is non-zero, surface the stderr output to the user.
```

---

### WR-02: Score range boundaries in `digest-signals.md` are off-by-one relative to `tune.js` tier boundaries

**File:** `references/digest-signals.md:9-18`

**Issue:** The score scale table documents:

| Range | Meaning |
|-------|---------|
| 41–60 | High — unread human email, no keywords |
| 61–80 | Very high — unread human + keywords, or unread human + high importance |
| 81–100 | Critical — high importance + unread + keywords |

But `tune.js` defines tiers as:

```js
{ label: 'Tier 3 — High',     min: 40, max: 59 },
{ label: 'Tier 4 — Critical', min: 60, max: Infinity },
```

Two discrepancies:
1. **Off-by-one at the bottom:** An unread human email with no keywords or importance flags scores exactly 40 (`unread_human` default weight). The docs say the "High" range starts at 41, but the code places 40 in Tier 3 (High). An agent using the score table to explain a score of 40 would describe it as "Medium" (21–40 range) when the tune system calls it "High".
2. **Missing tier boundary:** The docs describe six semantic ranges (0, 1-20, 21-40, 41-60, 61-80, 81-100) but `tune.js` has five tiers (0, 1-19, 20-39, 40-59, 60+). The "Very high" band (61-80) and "Critical" (81-100) collapse into a single Tier 4 in `tune`. A calling agent asked to reconcile tune output with score explanations will encounter a mismatch.

**Fix — option A (align the score table to the code):**

```markdown
| Range | Meaning |
|-------|---------|
| 0 | No signals fired — email is read AND sender is not a channel AND no urgency keywords |
| 1–19 | Low importance — keyword signal only, or channel email with keywords |
| 20–39 | Medium — unread channel email, or keyword-heavy read email |
| 40–59 | High — unread human email, no keywords |
| 60–100 | Critical — any combination reaching 60+ (unread human + keywords, or high importance, etc.) |
```

**Fix — option B (add a note explaining the relationship):**

Add below the table:

> Note: The `tune` subcommand uses a five-tier system (Tier 0–4) that does not exactly map to this six-range scale. Tier 3 covers scores 40–59 and Tier 4 covers 60+. The ranges above describe the typical score composition for a single email; a score of exactly 40 falls in Tier 3 (High) in the tune output.

---

### WR-03: `digest-signals.md` documents hardcoded fallback bulk patterns that are absent from `scoring.json.example`

**File:** `references/digest-signals.md:83-87`

**Issue:** The `digest-signals.md` bulk patterns list matches `scoring.json.example` exactly. However, the `getScoringConfig()` fallback in `lib/digest.js` (lines 37-47) adds two extra entries to `bulk_patterns` that do not appear in `scoring.json.example` and are therefore not documented:

```js
'ezcater',
'company-newsletter',
```

These entries are active when `scoring.json` does not exist (fresh install, before the user runs `cp scoring.json.example scoring.json`). A calling agent explaining why a `"bulk"` signal appeared on an email from EzCater (or similar) would have no documentation to point to.

This is a documentation gap, not a safety risk. However, it can cause confusion during troubleshooting.

**Fix:** Add a note in the Sender Classification section:

```markdown
**Note on hardcoded fallback defaults:** When `scoring.json` has not been created yet
(before running `cp scoring.json.example scoring.json`), the skill uses built-in default
bulk patterns that may include additional entries beyond those in `scoring.json.example`.
Run `node outlook.js tune --save` to write the effective configuration to `scoring.json`
and see the complete active set.
```

---

## Info

### IN-01: `SKILL.md` response envelope example is missing the `count` field for consistency

**File:** `SKILL.md:42-49`

**Issue:** The generic response envelope example omits the `count` field:

```json
{
  "operation": "search",
  "status": "ok",
  "results": [...],
  "error": null
}
```

But the actual `search` and `digest` outputs include `"count": N`. The `read` output does not (single object result). A calling agent learning the envelope from this section may not expect `count` to be present. This is a minor completeness gap — `count` is shown in the per-subcommand examples, so it is discoverable.

**Fix:** Either add `count` to the envelope example with a note that it is present for array results only, or add a sentence: "Array results (`search`, `digest`) also include a top-level `count` field with the result length."

---

### IN-02: `SKILL.md` error code table entry for `AUTH_REQUIRED` states it is "rarely emitted in production" but gives no guidance on when it would actually appear

**File:** `SKILL.md:218`

**Issue:** The error code table lists `AUTH_REQUIRED` with the note:

> in practice `SESSION_INVALID` is the operational code

This is accurate (confirmed: `AUTH_REQUIRED` appears in comments in `lib/output.js` but is not emitted by any code path). However, listing it in the table without a clear note that it is **currently not emitted** may cause an agent to write handling code for a code that never fires, or to wonder whether it received a different code by mistake.

**Fix:** Either remove `AUTH_REQUIRED` from the error code table entirely, or change the "When emitted" column to "Never emitted — listed for completeness" and update the description to direct the agent to handle it identically to `SESSION_INVALID`.

---

### IN-03: `digest` empty results note in `SKILL.md` suggests a fallback but the fallback is not always equivalent

**File:** `SKILL.md:174`

**Issue:** The note reads:

> Empty results (`[]`) means no "Today" group was found in the current inbox view — not necessarily an empty inbox. Try `node outlook.js search "is:unread"` as a fallback.

The fallback suggestion is reasonable but can mislead: `search "is:unread"` returns unread emails from all time, not just today. If the user asked for "today's inbox" and `digest` returned empty, the fallback `search` will include older unread emails, which the calling agent might present as today's messages.

**Fix:** Clarify the fallback scope:

```markdown
Note: Empty results (`[]`) means no "Today" group was found in the current inbox view — this
can happen if the inbox is empty today or if the view is showing a filtered subset. As a
fallback, `node outlook.js search "is:unread"` returns all unread emails (not limited to today)
— inform the user if presenting these results as a substitute for today's digest.
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
