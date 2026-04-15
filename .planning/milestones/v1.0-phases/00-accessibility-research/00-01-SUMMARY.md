---
phase: 00-accessibility-research
plan: "01"
subsystem: research
tags: [agent-browser, aria, accessibility, outlook, kql, snapshot]

requires: []
provides:
  - references/outlook-ui.md — verified ARIA selectors, data attributes, URL patterns for Outlook web
  - Confirmed-live: search combobox, message listbox, reading pane main landmark, message body document
  - Stable message ID pattern: /mail/id/{Exchange-ItemID}
  - Data attribute discovery: data-convid, data-focusableRow on option elements
  - Focused Inbox: confirmed absent on this account
affects:
  - phase-01-auth (URL navigation target: /mail/inbox)
  - phase-02-search (search combobox ARIA: combobox "Search for email, meetings, files and more.")
  - phase-03-read (reading pane: main "Reading Pane", document "Message body")
  - phase-04-digest (Focused Inbox handling: absent on this account)

tech-stack:
  added: []
  patterns:
    - "Capture-then-annotate: disposable bash capture script produces raw snapshot output; Claude annotates into permanent reference document"
    - "Semantic locators over refs: agent-browser find role combobox --name avoids ref invalidation"
    - "Scoped snapshots: agent-browser snapshot -s main[aria-label='Reading Pane'] for token efficiency"

key-files:
  created:
    - references/outlook-ui.md
  modified: []

key-decisions:
  - "URL correction: open message URL is /mail/id/{ItemID} not /mail/inbox/id/{ItemID} (research doc had wrong path)"
  - "Attachment ARIA unresolved: has:attachment query works but opened message had only inline images; file download attachment structure needs a separate capture"
  - "DOM id attribute on option elements contains base64 Exchange ItemID — enables ID extraction without clicking (alternative to URL method)"
  - "has:attachment KQL query confirmed working; hasattachment:yes documented as inferred equivalent"
  - "Focused Inbox confirmed absent on this account — Phase 4 must be defensive and detect tab presence before navigation"

patterns-established:
  - "Confidence annotation: confirmed-live / inferred / unresolved on every ARIA finding"
  - "Two-section reference format: Curated Reference (clean tables) + Evidence (raw snapshot dumps)"
  - "Anti-pattern documented: deeplink/search?query= causes loading spinner on custom tenant; use combobox workflow"

requirements-completed:
  - PKG-07

duration: 35min
completed: 2026-04-10
---

# Phase 00 Plan 01: Accessibility Research Summary

**Captured and annotated verified ARIA selectors for all five Outlook web UI areas (search combobox, message listbox, reading pane, attachment indicators, Focused Inbox) from a live session snapshot, producing references/outlook-ui.md with 77 confirmed-live annotations**

## Performance

- **Duration:** ~35 min (Task 3 + cleanup)
- **Started:** 2026-04-10T~14:00Z
- **Completed:** 2026-04-10
- **Tasks:** 3 (Tasks 1 and 2 completed in prior session; Task 3 in this session)
- **Files modified:** 2 (references/outlook-ui.md created; outlook-capture.sh deleted)

## Accomplishments

- Created `references/outlook-ui.md` — a confidence-annotated reference for all five required UI areas, with 77 `confirmed-live` annotations from a live session capture
- Corrected a factual error from prior research: the open message URL pattern is `/mail/id/{ItemID}` (not `/mail/inbox/id/{ItemID}`)
- Resolved the data-attribute open question from research: `option` elements carry `data-convid` and `data-focusableRow`, and the DOM `id` attribute contains the base64 Exchange ItemID
- Confirmed `has:attachment` KQL query works on this tenant
- Confirmed Focused Inbox is absent on this account; Phase 4 must detect tab presence defensively
- Deleted `outlook-capture.sh` per plan (disposable script, never ships)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create disposable capture script** - `3bf4b53` (feat)
2. **Task 2: Run capture script** - (human action, no commit)
3. **Task 3: Process snapshot into references/outlook-ui.md** - `af7d5c8` (feat)

**Cleanup:** `8bf38b0` (chore: delete disposable capture script)

## Files Created/Modified

- `references/outlook-ui.md` — Permanent reference document: ARIA roles/labels, URL patterns, data attributes, confidence annotations, raw snapshot evidence
- `outlook-capture.sh` — Deleted (disposable; served its purpose)

## Decisions Made

- **URL correction:** Research document had documented `/mail/inbox/id/` but live capture (capture 7) confirmed it is `/mail/id/`. Updated reference document with correction note.
- **Attachment ARIA documented as unresolved:** The `has:attachment` search opened a Merrill Lynch email that had only inline images (`Show original size` buttons), not file-download attachments. The ARIA structure for traditional `.pdf`/`.docx` attachment links remains unresolved. Documented explicitly with recommendation for Phase 3 to re-capture.
- **DOM id attribute as secondary ID method:** Capture 4 revealed the `id` attribute on `option` elements contains base64 Exchange ItemIDs (`AQAAAAAJuqMCAAAIQYb16wAAAAA=`). This enables ID extraction without clicking a message. Documented alongside the URL method.

## Deviations from Plan

None — plan executed exactly as written. The URL correction and unresolved attachment structure are findings documented in the reference document, not deviations from the plan process.

## Issues Encountered

- The `has:attachment` message opened for capture 8 (Merrill Lynch Benefits Online) contained only inline images, not file-download attachments. The attachment reading pane ARIA structure remains unresolved. This is documented in the reference document as `unresolved` with a recommendation for Phase 3.

## User Setup Required

None — no external service configuration required for this research phase.

## Next Phase Readiness

`references/outlook-ui.md` is complete and ready for consumption by all downstream phases:

- **Phase 1 (auth):** Use `https://myemail.accenture.com/mail/inbox` as navigation target; check for redirect to `login.microsoftonline.com` to detect auth state
- **Phase 2 (search):** Use `combobox "Search for email, meetings, files and more."` with the documented combobox workflow; avoid `deeplink/search?query=`
- **Phase 3 (read):** Use `main "Reading Pane"` → `document "Message body"` for scoped body extraction; resolve attachment file ARIA structure with a targeted capture
- **Phase 4 (digest):** Handle Focused Inbox absence gracefully; detect `button "Focused"` presence before attempting tab navigation

**Concern:** File-download attachment ARIA structure is unresolved. Phase 3's `has_attachments` and `attachment_names` fields in the read output will require a supplementary capture targeting a message with actual file attachments (not inline images).

---
*Phase: 00-accessibility-research*
*Completed: 2026-04-10*
