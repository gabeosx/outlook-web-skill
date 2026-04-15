# Phase 3: Read Operation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-10
**Phase:** 03-read-operation
**Mode:** discuss

## Gray Areas Presented

| Area | Description |
|------|-------------|
| Email identifier strategy | What does `read <id>` accept and how does it find/open the email? Critical because Phase 2 search returns `id: null`. |
| Body text extraction | Accessibility tree concatenation vs. eval innerText for `body_text`. |
| Attachment detection | File attachment ARIA is unresolved from Phase 0 — how to implement `attachment_names`. |

**User selected for discussion:** Email identifier strategy only.
Body text and attachment detection left to Claude's discretion.

---

## Discussion: Email Identifier Strategy

### Question 1: What does `read <id>` accept?

Options presented:
- KQL query → open first result
- Accessible name passthrough (from `result.from`)
- Fix search to return IDs first

**User chose:** Fix search to return IDs first

**Rationale:** Clean architecture — `read` should take a stable ID, not re-search or match on unstable accessible name strings.

### Question 2: How should search extract Exchange ItemIDs without clicking?

Context: Clicking would mark emails as read (mutation). Phase 0 confirmed `el.id` on `[role=option]` DOM elements contains the Exchange ItemID but is not exposed in the accessibility tree.

Options presented:
- eval inside the batch (recommended)
- eval after batch (Phase 2 tried this — lands on about:blank)
- URL-per-click (marks emails as read)

**User chose:** eval inside the batch

**User clarifying question:** "how are we going to get the IDs? can the accessibility info get us the message in the DOM, then we extract it?"

**Resolution:** Accessibility tree does NOT expose `el.id` (confirmed Phase 0). But `['eval', 'JS_SCRIPT_HERE']` as a positional argument works inside a batch command array — confirmed by `batch-and-spa-patterns.md`. The eval result appears in batch stdout alongside the snapshot output. Parse in order: eval JSON array (IDs) first, then snapshot text (accessible names). Correlate by index.

### Question 3: Once `read` has the Exchange ItemID, how does it open the email?

Options presented:
- Direct URL → batch snapshot (recommended)
- Search first, then click by accessible name

**User chose:** Direct URL → batch snapshot

**Flow:** Navigate to `OUTLOOK_BASE_URL/mail/id/<url-encoded-id>` → wait → snapshot reading pane (`-s "main[aria-label='Reading Pane']"`) — all in one batch.

---

## Corrections Applied

None — user confirmed all recommended approaches.

---

## Areas Left to Claude's Discretion

User opted out of discussing these areas:
- **Body text extraction** — left to Claude: accessibility tree concatenation vs. eval innerText
- **Attachment detection** — left to Claude: best-effort heuristic for Phase 3 implementation; Phase 3 human checkpoint to capture real attachment ARIA
