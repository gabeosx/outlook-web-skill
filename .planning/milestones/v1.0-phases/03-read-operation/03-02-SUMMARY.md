---
phase: 03-read-operation
plan: 02
subsystem: read-operation
tags: [read, search, live-verification, exchange-convid, attachment-aria, batch]
dependency_graph:
  requires: [03-01]
  provides: [live-verified-read, live-verified-search-ids, attachment-detection]
  affects: [lib/search.js, lib/read.js]
tech_stack:
  added: []
  patterns: [eval-double-encoding, search-click-by-convid, scoped-snapshot, live-aria-discovery]
key_files:
  created: []
  modified:
    - lib/search.js
    - lib/read.js
decisions:
  - "eval returns are JSON-encoded by agent-browser — two-level JSON.parse required for eval array output"
  - "Exchange IDs use data-convid attribute (ConversationID), not el.id (a DOM GUID) — el.id assumption was wrong"
  - "/mail/id/ URL only accepts ItemId (AAkALg format), not ConversationId — navigation rewritten to search+click-by-convid"
  - "Reading pane is <div role=main>, not <main> — selector changed to [aria-label='Reading Pane'] attribute selector"
  - "Body end marker is toolbar 'Quick actions', not menuitem 'Reply' — Reply also appears in unnamed toolbar BEFORE the body"
  - "Attachment detection uses heading 'file attachments' [level=3] + listbox/option/StaticText ARIA pattern (live-verified, D-14 resolved)"
  - "--query optional argument added to read subcommand — search context hint for click-by-convid navigation"
metrics:
  duration: ~25 min
  completed_date: "2026-04-10T20:25:41Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 3 Plan 2: Live Verification of Search IDs and Read Subcommand — Summary

**One-liner:** Live testing against real Outlook exposed 6 wrong assumptions from Plan 01; all fixed — eval double-encoding, ConversationID extraction, read navigation rewritten to search+click-by-convid, reading pane CSS selector corrected, body end marker fixed, and attachment ARIA structure live-resolved.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Live verification and fixes for search IDs + read subcommand | 705a8dc | lib/search.js, lib/read.js |
| 2 | Human checkpoint — user visually confirmed output matches real Outlook email | — | — |

## What Was Built

### Task 1: Live Verification Fixes

Six wrong assumptions were discovered and fixed during live testing:

**Fix 1: Eval double-encoding (lib/search.js)**

agent-browser JSON-encodes the return value of `eval` commands. The Phase 01 implementation called `JSON.parse` once on the eval output, but the actual stdout was a JSON-encoded string *containing* a JSON array — requiring two levels of parse. Fixed by parsing the raw eval token, then parsing the inner string:

```js
const raw = JSON.parse(rawToken);          // outer: agent-browser encoding
const ids = JSON.parse(raw);               // inner: our JSON.stringify(Array(...))
```

**Fix 2: data-convid not el.id (lib/search.js)**

Plan 01 used `el.id` to retrieve Exchange ItemIDs, assuming the DOM `id` attribute held the Exchange identifier. Live testing showed `el.id` returns a short DOM GUID (not useful). The actual ConversationID is in `data-convid` attribute. Updated eval to `el.getAttribute('data-convid')` and updated comments to clarify these are ConversationIDs, not ItemIDs.

**Fix 3: Navigation rewritten — search+click-by-convid (lib/read.js)**

The `/mail/id/<id>` URL pattern (Plan 01 assumption) only accepts a message-level ItemId in `AAkALg...` format, not a ConversationID. Since search returns ConversationIDs, direct URL navigation fails. Navigation rewritten to:
1. Execute a search batch with the optional `--query` value (or a space for recent-mail fallback)
2. Use an inline eval to `querySelector("[data-convid='<id>']")` and `.click()` the matching list item
3. Wait for the reading pane to load, then snapshot

`buildClickEval()` helper safely embeds the ConversationID into an eval string — base64 characters `[A-Za-z0-9+/=]` need no escaping beyond standard `"` and `\` escaping.

**Fix 4: Reading pane CSS selector (lib/read.js)**

Plan 01 used `main[aria-label='Reading Pane']` as the snapshot scope selector. Live testing showed the reading pane is a `<div role="main">`, not an HTML `<main>` element. CSS selector `main[aria-label=...]` doesn't match a div with `role="main"`. Fixed to `[aria-label="Reading Pane"]` (attribute-only selector, matches the div).

**Fix 5: Body end marker (lib/read.js)**

Plan 01 used `menuitem "Reply"` as the body end marker. Live testing showed a `toolbar` (unnamed) containing `menuitem "Reply"` appears **before** the message body — using this as the end marker caused body extraction to terminate immediately with 0 lines. Fixed to use `toolbar "Quick actions"` as the body end marker, which appears after the full body content.

A `bodyDone` guard was also added to prevent re-entry after the first body section ends (ARIA live region duplication in scoped snapshots can produce a second copy of the reading pane content).

**Fix 6: Attachment detection — live-verified ARIA pattern (lib/read.js)**

The D-14/D-15 stub from Plan 01 used a file extension heuristic on body text. Live testing on a message with real file attachments captured the actual ARIA structure:

```
- heading "file attachments" [level=3, ...]
  - listbox "file attachments" [...]
    - generic [...] clickable
      - option "<filename> Open <size KB>" [...]
        - StaticText "<filename>"     ← clean filename, no size suffix
```

The heuristic was replaced with a proper parser: detect the `heading "file attachments" [level=3]` marker, then collect `StaticText` content from children until the next heading. D-14 is resolved.

### Task 2: Human Checkpoint

User visually confirmed read output matched expected email content from their Outlook inbox. Search returned results with non-null `data-convid` values; read returned `status: "ok"` with all 8 READ-03 fields populated from a real email.

## Verification Results

All 6 live tests passed:

| Test | Command | Result |
|------|---------|--------|
| 1 — Search with ID extraction | `node outlook.js search "from:..." --limit 3` | Non-null `data-convid` IDs in all results |
| 2 — Read specific email by ID | `node outlook.js read "<convid>"` | `status: "ok"`, all 8 fields populated |
| 3 — Missing ID guard | `node outlook.js read` | `INVALID_ARGS` JSON, exit 1 |
| 4 — Zero results | `node outlook.js search "from:zzz-nonexistent@fake.example"` | `status: "ok"`, `results: []`, `count: 0` |
| 5 — Attachment ARIA capture | `node outlook.js read "<attachment-email-convid>"` | `has_attachments: true`, `attachment_names` populated |
| 6 — End-to-end pipeline | search → take ID → read | Full read result from first unread email |

## Deviations from Plan

All 6 deviations were wrong-assumption fixes, not scope changes:

| # | Assumption | Reality | Fix |
|---|-----------|---------|-----|
| 1 | `JSON.parse` once on eval output | agent-browser double-encodes — two-level parse needed | Two-level JSON.parse |
| 2 | `el.id` is Exchange ItemId | `el.id` is a DOM GUID; Exchange ConversationID is in `data-convid` | Updated eval to `getAttribute('data-convid')` |
| 3 | `/mail/id/<id>` accepts ConversationID | Only accepts message-level ItemId (AAkALg format) | Navigation rewritten to search+click-by-convid |
| 4 | `main[aria-label='Reading Pane']` matches | Reading pane is `<div role=main>`, not `<main>` tag | Changed to `[aria-label='Reading Pane']` |
| 5 | `menuitem "Reply"` = body end | Reply menuitem in unnamed toolbar appears BEFORE body | Changed end marker to `toolbar "Quick actions"` |
| 6 | Extension heuristic for attachments | Live ARIA uses `heading "file attachments" [level=3]` + listbox/StaticText | Replaced heuristic with live-verified pattern |

## Known Stubs

None — all stubs from Plan 01 resolved in this plan.

## Threat Surface Review

No new threat surface introduced. All Plan 02 threats accepted or mitigated as designed.

| Threat | Status | Note |
|--------|--------|------|
| T-03-07: Crafted ID in click eval | Mitigated | `buildClickEval()` escapes `"` and `\`; base64 convid chars need no further escaping |
| T-03-08: Test output files in /tmp | Accepted | Diagnostic files only, user-local, not committed |
| T-03-09: Attachment heuristic spoofing | Resolved | Live-verified ARIA pattern used instead of heuristic |

## Self-Check: PASSED

Files modified:
- FOUND: /Users/username/outlook-web-skill/lib/search.js
- FOUND: /Users/username/outlook-web-skill/lib/read.js

Commits:
- FOUND: 705a8dc (fix(03-02): live-verified search IDs and read subcommand)
