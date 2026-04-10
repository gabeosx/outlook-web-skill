# Phase 2: Search Operation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-10
**Phase:** 02-search-operation
**Mode:** discuss
**Areas discussed:** Action Policy, CDN Domain Allowlist, Stable ID Extraction, Missing Fields

---

## Gray Areas Presented

| # | Area | Description |
|---|------|-------------|
| 1 | Action Policy for Search | policy-read.json lacks click/fill/press needed for combobox |
| 2 | CDN Domain Allowlist | ALLOWED_DOMAINS blocks Outlook CDN, causes olkerror.html |
| 3 | Stable ID Extraction | ARIA tree doesn't expose IDs; need eval or click-per-row |
| 4 | Missing Fields: to + is_flagged | Not in search result accessible names |

---

## Decisions Made

### Action Policy
- **Question:** policy-read.json doesn't allow click/fill/press — how to handle?
- **Options offered:** New policy-search.json | Expand policy-read.json | Rename to policy-data.json
- **User chose:** New policy-search.json (recommended)
- **Implication:** Each operation type gets its own policy; SAFE-01 in REQUIREMENTS.md needs a note

### CDN Domain Allowlist
- **Question:** ALLOWED_DOMAINS blocks Outlook CDN causing olkerror.html. How to fix?
- **Options offered:** Remove restriction for data ops | Expand allowlist with known CDNs | Use *.microsoft.com wildcard
- **User chose:** Don't restrict domains for data ops (recommended)
- **Implication:** Action policy (default: deny) is the safety boundary; domain restriction removed for search/read/digest

### Stable ID Extraction
- **Question:** ARIA tree confirmed to not expose IDs — use eval or click-per-row?
- **User asked:** "are we sure about this? how do screen readers work?"
- **Clarification given:** Screen readers use ARIA tree (roles, aria-label, accessible names); DOM id/data attributes are NOT in ARIA tree. Phase 0 capture 4 explicitly confirmed this via eval probe. Screen readers navigate email by interaction, not by reading IDs.
- **Options offered:** eval DOM batch call | Click each result + get URL | Skip ID (hash key)
- **User chose:** eval DOM in one batch call (recommended)
- **Implication:** `eval` added to policy-search.json allow list

### Missing Fields
- **Question:** `to` and `is_flagged` not in search result accessible names — what to return?
- **Options offered:** Return null (recommended) | Best-effort is_flagged from eval | Always null, revisit in Phase 5 docs
- **User chose:** Return null for unavailable fields (recommended)
- **Implication:** Both `to` and `is_flagged` return null in search results; document in result schema

---

## Corrections Made

None — all recommended options were accepted.

---

## Decisions Delegated to Claude

- Accessible name parsing regex heuristics (from/subject/date/preview split)
- Scroll loop implementation (max attempts, dedup logic)
- Exact Node.js argument parsing implementation
- Error message text
