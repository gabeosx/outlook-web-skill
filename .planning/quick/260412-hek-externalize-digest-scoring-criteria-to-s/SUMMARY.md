---
quick_id: 260412-hek
type: execute
status: complete
completed_date: 2026-04-12
---

# Quick Task Summary: Externalize Digest Scoring Criteria

## One-liner

Moved all hardcoded scoring constants from lib/digest.js into user-editable scoring.json with lazy-loaded config and hardcoded fallback, and added lib/tune.js + outlook.js 'tune' subcommand for inbox calibration.

## Files Created

- `scoring.json` — user-editable scoring config with four sections: scoring_weights, urgency_keywords, bulk_patterns, channel_words
- `lib/tune.js` — 25-query inbox sampler that deduplicates by convid, scores each message with the effective config, and reports tier distribution (Tier 0-4) with PASS/WARN/FAIL verdict; supports --save flag

## Files Modified

- `lib/digest.js` — removed three hardcoded const declarations (URGENCY_KEYWORDS, CHANNEL_WORDS, BULK_PATTERNS); added lazy-loaded getScoringConfig() with complete hardcoded fallback; replaced numeric literals 40/20/5/20 with config lookups; exported getScoringConfig
- `outlook.js` — added 'tune' to VALID_COMMANDS; added case 'tune' dispatch to lib/tune.runTune()

## Commit

56fba2e — feat(scoring): externalize scoring config to scoring.json and add tune subcommand

## Verification Results

All 4 static checks passed:

1. scoring.json parses as valid JSON — PASS
2. scoreMessage(true, 'urgent') returns importance_score: 45 (>= 45) — PASS
3. require('./lib/tune') loads without errors — PASS
4. lib/digest.js contains no const URGENCY_KEYWORDS raw const declaration — PASS

Steps 5-7 skipped (require active browser session with logged-in Outlook).

## Deviations from Plan

None. Plan executed exactly as written.

Note on verification step 4 in the plan (>= 85): scoreMessage() correctly handles importance prefix + keywords only (returning 45 for (true, 'urgent')). The unread bonus (+40) is applied by the caller loop in both digest.js and tune.js. The Task 1 done criteria specifies >= 45, which passes.

## Known Stubs

None.
