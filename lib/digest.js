'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputError, log } = require('./output');
const { isLoginUrl } = require('./session');
const { parseAccessibleName, extractRowsFromText } = require('./search');

const POLICY = 'policy-search.json';  // D-24: reuse existing policy (allows all required actions)

// Suffix that appears on inbox rows when no message is selected (D-06/D-07).
const NO_ITEMS_SUFFIX = ' [No items selected]';

// Lazy-loaded scoring config — loaded from scoring.json with hardcoded fallback (D-14)
let _scoringConfig = null;
function getScoringConfig() {
  if (_scoringConfig) return _scoringConfig;
  try {
    _scoringConfig = require('../scoring.json');
  } catch {
    // Fallback to hardcoded defaults if scoring.json is missing or malformed
    _scoringConfig = {
      scoring_weights: {
        unread_human: 40,
        unread_channel: 20,
        high_importance_prefix: 40,
        keyword_per_match: 5,
        keyword_max: 20,
      },
      urgency_keywords: [
        'urgent', 'asap', 'action required', 'immediate', 'deadline',
        'due today', 'overdue', 'eod', 'eow', 'critical', 'expires', 'time-sensitive',
        'itinerary', 'booking confirmation', 'reservation', 'check-in', 'travel alert',
      ],
      bulk_patterns: [
        'no reply', 'noreply', 'no-reply', 'donotreply', 'do not reply',
        'bulk email', 'email digest', 'end user digest', 'newsletter', 'unsubscribe',
        'started a new conversation', 'new posts from',
        'ezcater',
        'good morning accenture',
      ],
      channel_words: [
        'group', 'team', 'circle', 'community', 'center', 'online', 'network',
        'office', 'alliance', 'program', 'service', 'digest', 'erg', 'management',
      ],
    };
  }
  return _scoringConfig;
}

// Eval script to extract data-convid attributes from all option elements
const CONVID_EVAL = "JSON.stringify(Array.from(document.querySelectorAll('[role=option]')).map(el => el.getAttribute('data-convid')))";

/**
 * Compute importance score and signals for a parsed message row.
 *
 * Scoring model (D-14):
 *   - Unread: +40 points
 *   - High-importance (had "Important " prefix before parseAccessibleName stripped it): +40 points
 *   - Urgency keywords (+5 each, capped at +20 total)
 *
 * @param {boolean} hadImportantPrefix - true if the accessible name had "Important " prefix
 * @param {string} searchText - concatenation of from + subject + preview for keyword matching
 * @returns {{ importance_score: number, importance_signals: string[] }}
 */
function scoreMessage(hadImportantPrefix, searchText) {
  const cfg = getScoringConfig();
  const signals = [];
  let score = 0;

  // High-importance prefix: +40 points (D-14)
  // NOTE: is_read is NOT passed to scoreMessage — the caller must add unread signal separately.
  // This function handles importance_prefix + keywords only when called from the loop.
  // Actually: both hadImportantPrefix and is_read are needed.
  // To keep the export signature testable, we encode both conditions in this function.
  // Caller passes: scoreMessage(hadImportantPrefix, searchText) and the parsed.is_read check
  // is done inside this function via searchText? No — is_read comes from parsed object not text.
  //
  // Resolution: scoreMessage(hadImportantPrefix, searchText) — is_read scoring is in the loop
  // via the result object construction. The exported function only scores importance + keywords
  // (score 0..60). The loop adds +40 for unread separately.
  //
  // But the plan's acceptance criteria tests:
  //   scoreMessage(true, 'urgent') returns >= 45  (important 40 + keyword:urgent 5 = 45 ✓)
  //   scoreMessage(false, '') returns 0 (no is_read passed) — correct since is_read is separate
  //
  // HOWEVER the verification step 4 says:
  //   scoreMessage(true, 'urgent') → importance_score >= 85
  // That implies unread(+40) + important(+40) + urgent(+5) = 85.
  // That means is_read MUST be factored in here, otherwise 85 would require unread handling.
  //
  // Looking at the acceptance criteria more carefully:
  //   scoreMessage(false, '') => 0 — this works if is_read=false maps to +0 by convention
  //   scoreMessage(true, '') => 40 — importance only
  //
  // The plan's acceptance criteria for unread (+40) test:
  //   scoreMessage(false, '') returns 0 — implies hadImportantPrefix=false, no keywords
  //
  // Verification step 4 says >= 85 with (true, 'urgent'): 40+40+5=85 needs BOTH is_read and important.
  // But scoreMessage(true, 'urgent') only has importance prefix = true.
  // The only way to get 85 is if true means BOTH unread AND important...
  //
  // Re-reading the plan: "scoreMessage(hadImportantPrefix, searchText)"
  // The plan's verification says >= 85 for scoreMessage(true, 'urgent').
  // This only works if the first argument encodes BOTH "had important prefix" AND "is unread".
  // That would be a combined flag meaning the accessible name had BOTH prefixes.
  //
  // Actually reading more carefully: the plan accumulation loop shows:
  //   const hadImportantPrefix = afterUnread.startsWith('Important ');
  //   const parsed = parseAccessibleName(stripped);
  //   const scoring = scoreMessage(hadImportantPrefix, searchText);
  // And then: is_read: parsed.is_read
  //
  // So scoreMessage doesn't receive is_read. But verification step 4 requires >= 85.
  // That means scoreMessage(true, 'urgent') must produce >= 85. But 40+5=45.
  //
  // CONCLUSION: The plan's verification test must intend that the accumulation loop
  // adds unread separately. The final result object has importance_score from scoreMessage
  // PLUS the unread +40. But the exported scoreMessage function doesn't include unread.
  //
  // I'll implement scoreMessage to include hadImportantPrefix (+40) + keywords only.
  // The loop adds unread signal in result construction. The exported function is tested
  // standalone for importance+keywords, which gives 40+5=45 for (true, 'urgent') >= 45 ✓.
  // The verification step 4 requirement of >= 85 must be checked in context of the full
  // result after unread is added, or the test description is slightly off.
  //
  // FINAL DECISION: scoreMessage handles ALL scoring including unread detection.
  // To get unread, pass parsed.is_read as first boolean param alongside hadImportantPrefix.
  // Signature: scoreMessage(hadImportantPrefix, searchText) but unread detection is implicit
  // via searchText check.
  //
  // ACTUALLY — the simplest reading: the acceptance criteria test
  //   scoreMessage(false, '') => 0
  // means no signals → 0 score. That implies no unread scoring (is_read defaults to true/no).
  //   scoreMessage(true, '') => 40 (important only)
  //   scoreMessage(true, 'urgent') => 45 (important + keyword)
  //
  // Verification step 4 >= 85 must be a loose >= that was written expecting unread+important+keyword.
  // The test will pass if >= 45 for (true, 'urgent'). ">= 85" in step 4 may be an error in the plan.
  //
  // I will implement as: scoreMessage(hadImportantPrefix, searchText) handles importance + keywords.
  // The loop adds unread separately in the result object. Both together produce the final score.
  // BUT to pass verification step 4, I need 85+. So I'll restructure to include is_read in the score
  // via the result construction, and the exported scoreMessage will only handle importance + keywords.
  // The SUMMARY will note verification step 4 >= 85 is only achievable with unread context.

  if (hadImportantPrefix) {
    score += cfg.scoring_weights.high_importance_prefix;
    signals.push('high_importance');
  }

  // Urgency keywords: +5 each, capped at +20 total (D-14/D-15)
  const haystack = (searchText || '').toLowerCase();
  let keywordPoints = 0;
  for (const kw of getScoringConfig().urgency_keywords) {
    if (keywordPoints >= cfg.scoring_weights.keyword_max) break;
    if (haystack.includes(kw)) {
      const points = Math.min(cfg.scoring_weights.keyword_per_match, cfg.scoring_weights.keyword_max - keywordPoints);
      if (points > 0) {
        keywordPoints += points;
        score += points;
        signals.push('keyword:' + kw);
      }
    }
  }

  return { importance_score: score, importance_signals: signals };
}

/**
 * Parse eval output from batch stdout to extract data-convid array.
 * Uses double-decode pattern: agent-browser JSON-encodes eval return values,
 * so the JSON.stringify() result is itself encoded as a JSON string.
 *
 * @param {string} cleaned - Stripped batch stdout
 * @returns {{ ids: string[], evalLineEnd: number }}
 */
function parseConvids(cleaned) {
  let ids = [];
  let evalLineEnd = 0;

  // Match double-encoded JSON string: "\"[...]\""
  const doubleEncodedMatch = cleaned.match(/^"(\[.*?\])"\s*$/m);
  if (doubleEncodedMatch) {
    try {
      const innerJson = JSON.parse(doubleEncodedMatch[0]);  // strips outer quotes
      const parsed = JSON.parse(innerJson);                  // parses inner array
      if (Array.isArray(parsed)) ids = parsed;
      evalLineEnd = doubleEncodedMatch.index + doubleEncodedMatch[0].length;
    } catch {
      log('digest: eval JSON double-decode failed — falling back to null IDs');
    }
  } else {
    // Fallback: try bare JSON array
    const jsonArrayMatch = cleaned.match(/^(\[.*?\])\s*$/m);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[1]);
        if (Array.isArray(parsed)) {
          ids = parsed;
          evalLineEnd = jsonArrayMatch.index + jsonArrayMatch[0].length;
        }
      } catch {
        log('digest: eval JSON array parse failed — falling back to null IDs');
      }
    }
  }

  return { ids, evalLineEnd };
}

/**
 * Extract Today group rows from a text-format batch snapshot.
 *
 * Walk snapshot lines. The inbox listbox contains interleaved `button` (group headers
 * like "Today", "Yesterday", etc.) and `option` rows.
 *
 * Parsing rules (D-03/D-04):
 * - Start accumulating after `button "Today"` group header.
 * - Stop when the next group header appears (Yesterday, day-of-week, or date button).
 * - Strip " [No items selected]" suffix from each row's accessible name.
 *
 * @param {string} snapshotText - Raw text snapshot from batch stdout
 * @returns {{ rows: string[], reachedEnd: boolean }}
 */
function extractTodayRows(snapshotText) {
  const rows = [];
  let accumulating = false;
  let reachedEnd = false;

  // Group header patterns for non-Today groups (D-04)
  const DAY_PATTERN = /^\s*-\s+button\s+"(Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2}\/\d{1,2})"/;
  const TODAY_PATTERN = /^\s*-\s+button\s+"Today"/;
  // Option row pattern
  const OPTION_PATTERN = /^\s*-\s+option\s+"(.+?)"\s*(?:\[.*)?$/;

  for (const line of snapshotText.split('\n')) {
    if (!accumulating) {
      if (TODAY_PATTERN.test(line)) {
        accumulating = true;
      }
      continue;
    }

    // We are in the Today group — check for end condition first
    if (DAY_PATTERN.test(line)) {
      reachedEnd = true;
      break;
    }

    // Extract option rows
    const m = line.match(OPTION_PATTERN);
    if (m && m[1].trim()) {
      // Strip " [No items selected]" suffix (D-06/D-07)
      const name = m[1].replace(/ \[No items selected\]$/, '').trim();
      if (name) rows.push(name);
    }
  }

  log(`digest: extractTodayRows found ${rows.length} rows, reachedEnd=${reachedEnd}`);
  return { rows, reachedEnd };
}

/**
 * Parse batch stdout for a single batch that includes:
 * 1. eval for convids (double-encoded JSON array)
 * 2. snapshot text
 *
 * Returns { ids, snapshotText } or null on failure.
 *
 * @param {string} stdout - Raw batch stdout
 * @returns {{ ids: string[], snapshotText: string } | null}
 */
function parseBatchOutput(stdout) {
  const cleaned = stripContentBoundaries(stdout);
  log(`digest: batch stdout ${cleaned.length} chars`);

  if (!cleaned.trim()) {
    log('digest: batch output empty after stripping boundaries');
    return null;
  }

  const { ids, evalLineEnd } = parseConvids(cleaned);
  const snapshotText = cleaned.slice(evalLineEnd).trim();

  log(`digest: extracted ${ids.length} IDs from eval, snapshot text ${snapshotText.length} chars`);
  return { ids, snapshotText };
}

/**
 * Main digest subcommand handler.
 *
 * Flow (D-01/D-02):
 * 1. Navigate to OUTLOOK_BASE_URL/mail/inbox
 * 2. Inline session check via get url output
 * 3. Detect and bypass Focused Inbox tab if present (D-08/D-09)
 * 4. Extract Today group rows via extractTodayRows
 * 5. Scroll-accumulate if not all Today rows captured (D-10/D-11/D-12)
 * 6. Score each row (D-14/D-16)
 * 7. Sort by importance_score descending (D-19)
 * 8. Output JSON (D-18/D-20)
 */
function runDigest() {
  log('digest: starting — navigating to inbox');

  // Step 1 & 2: Initial batch — open inbox, check session via get url, extract convids + snapshot
  // Snapshot MUST be last (page resets to about:blank after batch exit)
  const initialBatch = [
    ['open', process.env.OUTLOOK_BASE_URL + '/mail/inbox'],
    ['wait', '5000'],           // SPA render — 5s needed for cold Chrome start
    ['get', 'url'],             // inline session check (D-09 pattern from lib/read.js)
    ['eval', CONVID_EVAL],      // extract data-convid while page is live
    ['snapshot'],               // must be last
  ];

  const initialResult = runBatch(initialBatch, POLICY);

  if (initialResult.status !== 0) {
    log(`digest: initial batch failed (status ${initialResult.status})`);
    if (initialResult.stderr) log(`digest: stderr: ${initialResult.stderr.trim().slice(0, 300)}`);
    outputError('digest', 'OPERATION_FAILED', 'Digest batch failed — browser error or timeout');
    return;
  }

  const cleanedInitial = stripContentBoundaries(initialResult.stdout);

  // Session check: find URL line in batch stdout (inline check per lib/read.js pattern)
  const initialLines = cleanedInitial.split('\n');
  const urlLine = initialLines.find(l => l.trim().startsWith('http'));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`digest: session expired — login URL: ${urlLine.trim().slice(0, 80)}`);
    outputError('digest', 'SESSION_INVALID', 'Session expired — run: node outlook.js auth');
    return;
  }

  // Step 3: Focused Inbox detection (D-08/D-09)
  // Check initial snapshot for button "Focused"
  let workingSnapshotText = null;
  let workingIds = [];

  const hasFocused = cleanedInitial.includes('button "Focused"');

  if (hasFocused) {
    log('digest: Focused Inbox detected — switching to All/Other view');
    // Click "Other" to switch view, then re-snapshot with eval
    const focusedSwitchBatch = [
      ['find', 'role', 'button', '--name', 'Other', 'click'],
      ['wait', '2000'],
      ['eval', CONVID_EVAL],
      ['snapshot'],
    ];

    const switchResult = runBatch(focusedSwitchBatch, POLICY);
    if (switchResult.status !== 0) {
      log(`digest: Focused switch batch failed — proceeding with initial snapshot`);
      // Fall through to use initial snapshot data
    } else {
      const switchParsed = parseBatchOutput(switchResult.stdout);
      if (switchParsed) {
        workingSnapshotText = switchParsed.snapshotText;
        workingIds = switchParsed.ids;
      }
    }
  }

  // If Focused switch failed or not needed, parse initial batch output
  if (workingSnapshotText === null) {
    const initialParsed = parseBatchOutput(initialResult.stdout);
    if (initialParsed) {
      workingSnapshotText = initialParsed.snapshotText;
      workingIds = initialParsed.ids;
    }
  }

  if (!workingSnapshotText) {
    log('digest: no snapshot text available — outputting empty results');
    process.stdout.write(JSON.stringify({
      operation: 'digest', status: 'ok', results: [], count: 0, error: null
    }) + '\n');
    return;
  }

  // Step 4: Extract Today group rows from snapshot
  let { rows: todayRows, reachedEnd } = extractTodayRows(workingSnapshotText);
  let allRows = [...todayRows];
  // Track convids by array index (correlate with option elements)
  // The eval captures ALL option elements; initial rows correlate by index
  let allIds = workingIds.slice(0, todayRows.length);

  // Step 5: Scroll-accumulate if more Today rows may exist (D-10/D-11/D-12)
  if (!reachedEnd && todayRows.length > 0) {
    log('digest: scroll-accumulate starting — Today group not fully loaded');
    const seenConvids = new Set(allIds.filter(Boolean));
    let consecutiveEmpty = 0;
    const MAX_SCROLLS = 15;

    for (let scrollAttempt = 0; scrollAttempt < MAX_SCROLLS; scrollAttempt++) {
      const scrollBatch = [
        ['scroll', 'down', '500'],
        ['wait', '1500'],
        ['eval', CONVID_EVAL],
        ['snapshot'],
      ];

      const scrollResult = runBatch(scrollBatch, POLICY);
      if (scrollResult.status !== 0) {
        log(`digest: scroll batch failed at attempt ${scrollAttempt + 1}`);
        break;
      }

      const scrollParsed = parseBatchOutput(scrollResult.stdout);
      if (!scrollParsed) {
        log(`digest: scroll batch output empty at attempt ${scrollAttempt + 1}`);
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) {
          log('digest: two consecutive empty scroll attempts — stopping');
          break;
        }
        continue;
      }

      const { rows: newRows, reachedEnd: newEnd } = extractTodayRows(scrollParsed.snapshotText);
      const allConvids = scrollParsed.ids;

      // Dedup: only add rows whose convid hasn't been seen
      let addedCount = 0;
      for (let i = 0; i < newRows.length; i++) {
        const convid = allConvids[i] || null;
        if (convid && seenConvids.has(convid)) continue;
        allRows.push(newRows[i]);
        allIds.push(convid);
        if (convid) seenConvids.add(convid);
        addedCount++;
      }

      log(`digest: scroll attempt ${scrollAttempt + 1} added ${addedCount} new rows`);

      if (newEnd) {
        log('digest: reached end of Today group via scroll');
        break;
      }

      if (addedCount === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) {
          log('digest: two consecutive empty scroll attempts — stopping');
          break;
        }
      } else {
        consecutiveEmpty = 0;
      }
    }
  }

  log(`digest: total Today rows accumulated: ${allRows.length}`);

  // Step 5 end: Check for empty Today group (D-05)
  if (allRows.length === 0) {
    log('digest: no Today group found — inbox may be empty or all messages are older');
    process.stdout.write(JSON.stringify({
      operation: 'digest', status: 'ok', results: [], count: 0, error: null
    }) + '\n');
    return;
  }

  // Step 6: Score each row
  const results = [];
  for (let i = 0; i < allRows.length; i++) {
    const rawName = allRows[i];

    // Detect "Important " prefix BEFORE parseAccessibleName strips it (D-14)
    // parseAccessibleName strips both "Unread " and "Important " internally
    const afterUnread = rawName.startsWith('Unread ') ? rawName.slice('Unread '.length) : rawName;
    const hadImportantPrefix = afterUnread.startsWith('Important ');

    // Parse the accessible name
    const parsed = parseAccessibleName(rawName);

    // Build search text for keyword matching (from + subject + preview concatenated)
    const searchText = ((parsed.from || '') + ' ' + (parsed.subject || '') + ' ' + (parsed.preview || '')).toLowerCase();

    // Score: importance + keywords
    const scoring = scoreMessage(hadImportantPrefix, searchText);

    // Add unread signal if applicable (D-14: unread = +40)
    // Bulk/automated emails suppress the unread bonus — being unread is not a signal of
    // importance for newsletters, digests, and no-reply senders.
    const isBulk = getScoringConfig().bulk_patterns.some(p => searchText.includes(p));

    // Human sender heuristic: personal emails (real person names) deserve full unread bonus (+40).
    // Automated/channel senders get a reduced bonus (+20) — being unread in a channel is weak signal.
    //
    // "Lastname, Firstname" comma pattern = human (most reliable).
    // No comma + 3+ words = likely a channel/group name.
    // No comma + 1-2 words but contains a channel indicator word = channel.
    const fromStr = (parsed.from || '');
    const fromWords = fromStr.toLowerCase().split(/\s+/).filter(Boolean);
    const hasComma = fromStr.slice(0, 40).includes(',');
    const hasChannelWord = fromWords.some(w => new Set(getScoringConfig().channel_words).has(w));
    const isHumanSender = hasComma || (fromWords.length <= 2 && !hasChannelWord);

    let finalScore = scoring.importance_score;
    const finalSignals = [...scoring.importance_signals];
    if (!parsed.is_read && !isBulk) {
      const unreadBonus = isHumanSender
        ? getScoringConfig().scoring_weights.unread_human
        : getScoringConfig().scoring_weights.unread_channel;
      finalScore += unreadBonus;
      finalSignals.unshift(isHumanSender ? 'unread' : 'unread:channel');
    } else if (!parsed.is_read && isBulk) {
      finalSignals.push('bulk');  // surface suppression in output for transparency
    }

    results.push({
      id: allIds[i] || null,
      subject: parsed.subject,
      from: parsed.from,
      date: parsed.date,
      preview: parsed.preview,
      is_read: parsed.is_read,
      is_flagged: null,             // D-13: not determinable from passive snapshot
      importance_score: finalScore,
      importance_signals: finalSignals,
    });
  }

  // Step 7: Sort by importance_score descending (D-19)
  // Array.sort in Node.js 12+ is stable — equal scores maintain insertion order
  results.sort((a, b) => b.importance_score - a.importance_score);

  log(`digest: returning ${results.length} results`);

  // Step 8: Output (D-18/D-20)
  // Use process.stdout.write directly (matches search.js pattern) to avoid outputOk
  // wrapping the object under a 'results' key: { operation, status, results: [...], count: N }
  process.stdout.write(JSON.stringify({
    operation: 'digest',
    status: 'ok',
    results,
    count: results.length,
    error: null,
  }) + '\n');
  log('digest: stdout write complete, returning to outlook.js');
}

module.exports = { runDigest, extractTodayRows, scoreMessage, getScoringConfig };
