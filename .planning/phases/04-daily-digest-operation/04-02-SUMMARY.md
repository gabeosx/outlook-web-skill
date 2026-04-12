---
phase: 04-daily-digest-operation
plan: 02
subsystem: data-extraction
tags: [outlook, agent-browser, digest, importance-scoring, live-verification, bulk-suppression]

# Dependency graph
requires:
  - phase: 04-daily-digest-operation/04-01
    provides: lib/digest.js runDigest, extractTodayRows, scoreMessage — initial implementation to verify
  - phase: 03-read-operation/03-02
    provides: live-verification pattern (test scripts, stderr inspection approach)

provides:
  - "lib/digest.js: live-verified scoring model with bulk suppression, channel sender heuristic, travel urgency keywords"
  - "04-02 human sign-off: digest output quality confirmed against real inbox (87 emails, 25 search queries)"

affects: [phase-05-skill-packaging, references/digest-signals.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "outputOk stdout pattern: direct process.stdout.write(JSON.stringify({...})) avoids double-nesting from helper wrapper"
    - "Bulk email suppression: regex set of known automated sender patterns suppresses unread+40 bonus"
    - "Channel sender heuristic: comma presence = human (+40); 3+ word channel name without comma = +20 (unread:channel signal)"
    - "Travel urgency keywords: itinerary, booking confirmation, reservation, check-in, travel alert added to keyword set"
    - "Pressure test methodology: 87 emails from 25 search queries validates scoring tier distribution"

key-files:
  created: []
  modified:
    - lib/digest.js

key-decisions:
  - "Bulk suppression via regex is preferable to excluding senders entirely — preserves structured email data while eliminating false unread urgency"
  - "Channel sender heuristic uses comma presence as human proxy — Outlook channel/group senders never include commas; personal names often do (Last, First)"
  - "Scoring tier target: 0-19 (low), 20-39 (medium), 40-59 (high), 60+ (critical) — 21% at ≥40 is correct distribution for a typical mixed inbox"
  - "Human sign-off on digest quality accepted with 'keep going' after reviewing ranked output against live inbox"

patterns-established:
  - "Live verification pressure test: run digest against full inbox (not just N=5 sample) to validate scoring distribution before declaring complete"

requirements-completed: [DIGT-01, DIGT-02, DIGT-03]

# Metrics
duration: ~90min (including live testing and iterative scoring fixes)
completed: 2026-04-11
---

# Phase 04 Plan 02: Digest Live Verification Summary

**Live-verified digest against real Outlook inbox (87 emails): outputOk bug fixed, bulk suppression and channel sender heuristic added, scoring distribution validated to 21% high-priority with human sign-off**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-04-11T16:00:00Z
- **Completed:** 2026-04-11T17:30:00Z
- **Tasks:** 2 (Task 1: automated verification + fixes; Task 2: human checkpoint)
- **Files modified:** 1

## Accomplishments

- Fixed critical outputOk double-nesting bug that was wrapping `{ operation, status, results }` inside an outer `{ status }` envelope, breaking all downstream JSON parsing
- Validated all 7 acceptance criteria (exit 0, valid JSON, operation field, status ok, results array, all 9 DIGT-03 fields, sorted descending)
- Ran pressure test against 87 emails from 25 search queries — confirmed correct 4-tier scoring distribution after fixes
- Added bulk/automated email suppression: 19 unread bulk emails correctly had their +40 unread bonus suppressed
- Added channel sender heuristic improving human-vs-automated discrimination without requiring sender email inspection
- Added travel urgency keywords (itinerary, booking confirmation, reservation, check-in, travel alert)
- Human sign-off obtained: user confirmed digest output quality and ranking is sensible for their inbox

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix outputOk nesting** - `22d3e76` (fix)
2. **Task 1 (deviation): Suppress unread for bulk/automated emails, travel keywords** - `084572d` (fix)
3. **Task 1 (deviation): Viva Engage suppression, channel sender heuristic** - `ebe19d3` (fix)
4. **Task 2: Human checkpoint approved** - (no additional code commit; sign-off via conversation)

## Files Created/Modified

- `lib/digest.js` — Fixed outputOk nesting; added bulk suppression regex set; added channel sender heuristic; added travel urgency keywords

## Decisions Made

- Direct `process.stdout.write(JSON.stringify({...}))` replaces `outputOk(operation, payload)` wrapper in digest — the wrapper was adding an extra nesting layer that the plan's key_links pattern (`status.*ok.*results`) expected at the top level
- Bulk suppression targets sender patterns not message content — avoids prompt injection risk from email body
- Channel sender heuristic: comma in from field = human proxy (+40 preserved); 3+ consecutive capitalized words without comma = channel name (+20 cap instead of +40) — heuristic sufficient for v1 without needing email address inspection
- Scoring tier validated as correct: 21% at ≥40 score is appropriate for a mixed real-world inbox (down from 49% before fixes, which indicated false positives)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed outputOk double-nesting producing malformed JSON envelope**
- **Found during:** Task 1 (basic digest test)
- **Issue:** `outputOk('digest', results, count)` wrapped the payload in `{ status: 'ok', operation: 'digest', data: { results, count } }` instead of the expected flat `{ operation: 'digest', status: 'ok', results, count }` structure. Downstream verification scripts and the calling agent both expect the flat schema from DIGT-03.
- **Fix:** Replaced `outputOk(...)` call with direct `process.stdout.write(JSON.stringify({ operation: 'digest', status: 'ok', results: scored, count: scored.length }) + '\n')`
- **Files modified:** `lib/digest.js`
- **Verification:** Test 1 re-run — exit 0, status ok, all 9 fields present on all results
- **Committed in:** `22d3e76`

**2. [Rule 1 - Bug] Bulk/automated email unread bonus producing false high-priority results**
- **Found during:** Task 1 (pressure test, 87 emails)
- **Issue:** Before fixes, 49% of emails scored ≥40 — essentially flat distribution with no discrimination. Primary cause: high-volume automated senders (Viva Engage, EZCater, notification mailers) were all marking as "unread" and receiving +40 bonus, flooding the high tier.
- **Fix:** Added `BULK_PATTERNS` regex set. Emails matching bulk patterns do not receive the unread +40 bonus. Individual urgency keyword bonus still applies to bulk emails.
- **Files modified:** `lib/digest.js`
- **Verification:** After fix: 21% scored ≥40, 19 bulk unread emails correctly suppressed
- **Committed in:** `084572d`

**3. [Rule 2 - Missing Critical] Added channel sender heuristic to distinguish human from automated senders**
- **Found during:** Task 1 (pressure test analysis — some channel/group senders still scored high)
- **Issue:** Channel and group notification senders (e.g., "Accenture Learning Hub", "Good Morning Accenture") were not caught by the bulk regex but also should not trigger full +40 unread bonus
- **Fix:** Added `CHANNEL_WORDS` set and heuristic: if from field contains a comma → human name format, preserve +40; if from field has 3+ consecutive title-case words → channel name, apply +20 cap
- **Files modified:** `lib/digest.js`
- **Verification:** Channel senders moved from 40-tier to 20-tier in pressure test output
- **Committed in:** `ebe19d3`

---

**Total deviations:** 3 auto-fixed (1 bug fix for outputOk nesting, 1 bug fix for scoring distribution, 1 missing critical for channel discrimination)
**Impact on plan:** All fixes were necessary for the plan's stated goal (ranked output that "makes intuitive sense against the user's actual inbox"). No scope creep — all changes are within lib/digest.js scoring logic.

## Issues Encountered

- Pressure test approach (87 emails via 25 search queries) was not in the original plan but was the right methodology to validate scoring quality at scale. The plan's N=5 live test sample would have passed all acceptance criteria without catching the bulk suppression problem.

## Known Stubs

- `is_flagged: null` for all results — explicit v1 scope decision D-13, carried forward from Plan 01. Phase 5 `references/digest-signals.md` should document this so calling agents do not treat `is_flagged` as a real boolean.

## Next Phase Readiness

- `node outlook.js digest` is fully operational against a live Outlook session
- Scoring model validated against real inbox data (87 emails, correct tier distribution)
- Human sign-off obtained — output quality confirmed
- Phase 5 (skill packaging) can proceed: digest is ready to be wrapped as a callable skill with `digest-signals.md` documentation

---
*Phase: 04-daily-digest-operation*
*Completed: 2026-04-11*
