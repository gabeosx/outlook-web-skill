'use strict';

const { executeComboboxSearch, extractMessageRows, parseAccessibleName } = require('./search');
const { scoreMessage, getScoringConfig } = require('./digest');
const { log } = require('./output');
const fs = require('fs');
const path = require('path');

const SCORING_JSON_PATH = path.join(__dirname, '..', 'scoring.json');

// 25 queries covering a broad cross-section of inbox content
const SAMPLE_QUERIES = [
  'from:me', 'meeting', 'action required', 'urgent', 'deadline',
  'please', 'question', 'fyi', 'update', 'review',
  'confirmed', 'invitation', 'hi', 'thanks', 'project',
  'report', 'follow up', 'reminder', 'new', 'important',
  'request', 'help', 'team', 'next steps', 'attached',
];

const RESULTS_PER_QUERY = 5;

// Grade tier boundaries
const TIERS = [
  { label: 'Tier 0 — Low noise (automated/bulk)', min: 0,  max: 0   },
  { label: 'Tier 1 — Low',                        min: 1,  max: 19  },
  { label: 'Tier 2 — Medium',                     min: 20, max: 39  },
  { label: 'Tier 3 — High',                       min: 40, max: 59  },
  { label: 'Tier 4 — Critical',                   min: 60, max: Infinity },
];

function scoreTier(score) {
  for (const t of TIERS) {
    if (score >= t.min && score <= t.max) return t;
  }
  return TIERS[TIERS.length - 1];
}

/**
 * Run multi-query inbox sampling and scoring evaluation.
 *
 * stderr: grade report table (tier distribution, verdict)
 * stdout: JSON with scored results + effective scoring config
 *
 * --save flag: writes effective config back to scoring.json
 */
function runTune() {
  const doSave = process.argv.includes('--save');
  const cfg = getScoringConfig();

  log('tune: starting — sampling inbox with 25 queries');

  const seenIds = new Set();
  const allScored = [];

  for (const query of SAMPLE_QUERIES) {
    log(`tune: querying "${query}"`);
    try {
      const snapshot = executeComboboxSearch(query);
      if (!snapshot) {
        log(`tune: query "${query}" returned null snapshot — skipping`);
        continue;
      }

      const rows = extractMessageRows(snapshot);
      const ids = snapshot._ids || [];
      const limit = Math.min(rows.length, RESULTS_PER_QUERY);

      for (let i = 0; i < limit; i++) {
        const id = ids[i] || null;
        // Dedup by convid when available
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);

        const rawName = rows[i];
        const afterUnread = rawName.startsWith('Unread ') ? rawName.slice('Unread '.length) : rawName;
        const hadImportantPrefix = afterUnread.startsWith('Important ');
        const parsed = parseAccessibleName(rawName);
        const searchText = ((parsed.from || '') + ' ' + (parsed.subject || '') + ' ' + (parsed.preview || '')).toLowerCase();

        const scoring = scoreMessage(hadImportantPrefix, searchText);

        // Apply unread bonus (same logic as digest.js)
        const bulkPatterns = cfg.bulk_patterns;
        const isBulk = bulkPatterns.some(p => searchText.includes(p));
        const fromStr = parsed.from || '';
        const fromWords = fromStr.toLowerCase().split(/\s+/).filter(Boolean);
        const hasComma = fromStr.slice(0, 40).includes(',');
        const channelWordSet = new Set(cfg.channel_words);
        const hasChannelWord = fromWords.some(w => channelWordSet.has(w));
        const isHumanSender = hasComma || (fromWords.length <= 2 && !hasChannelWord);

        let finalScore = scoring.importance_score;
        const finalSignals = [...scoring.importance_signals];
        if (!parsed.is_read && !isBulk) {
          const unreadBonus = isHumanSender
            ? cfg.scoring_weights.unread_human
            : cfg.scoring_weights.unread_channel;
          finalScore += unreadBonus;
          finalSignals.unshift(isHumanSender ? 'unread' : 'unread:channel');
        } else if (!parsed.is_read && isBulk) {
          finalSignals.push('bulk');
        }

        allScored.push({
          id,
          from: parsed.from,
          subject: parsed.subject,
          preview: parsed.preview,
          is_read: parsed.is_read,
          importance_score: finalScore,
          importance_signals: finalSignals,
          query,
        });
      }
    } catch (err) {
      log(`tune: query "${query}" threw: ${err.message}`);
    }
  }

  log(`tune: collected ${allScored.length} unique scored messages`);

  // Build tier distribution
  const tierCounts = TIERS.map(() => 0);
  for (const msg of allScored) {
    const t = scoreTier(msg.importance_score);
    const idx = TIERS.indexOf(t);
    if (idx >= 0) tierCounts[idx]++;
  }

  const total = allScored.length || 1; // avoid div-by-zero

  // Grade report to stderr
  process.stderr.write('\n=== TUNE GRADE REPORT ===\n');
  process.stderr.write(`Sampled ${allScored.length} unique messages across ${SAMPLE_QUERIES.length} queries\n\n`);
  for (let i = 0; i < TIERS.length; i++) {
    const pct = ((tierCounts[i] / total) * 100).toFixed(1);
    process.stderr.write(`  ${TIERS[i].label}: ${tierCounts[i]} (${pct}%)\n`);
  }

  const tier34Pct = (((tierCounts[3] + tierCounts[4]) / total) * 100);
  const verdict = tier34Pct <= 25 ? 'PASS' : tier34Pct <= 40 ? 'WARN' : 'FAIL';
  process.stderr.write(`\nTier 3+4 combined: ${tier34Pct.toFixed(1)}%\n`);
  process.stderr.write(`Verdict: ${verdict} (threshold: <=25% = PASS, 26-40% = WARN, >40% = FAIL)\n`);
  process.stderr.write('\nEdit scoring.json to adjust weights/keywords, then re-run to validate.\n');
  process.stderr.write('=========================\n\n');

  // --save: write effective config to scoring.json
  if (doSave) {
    try {
      fs.writeFileSync(SCORING_JSON_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      process.stderr.write(`[tune] Saved effective config to ${SCORING_JSON_PATH}\n`);
    } catch (err) {
      process.stderr.write(`[tune] Failed to save scoring.json: ${err.message}\n`);
    }
  }

  // JSON summary to stdout
  process.stdout.write(JSON.stringify({
    operation: 'tune',
    status: 'ok',
    query_count: SAMPLE_QUERIES.length,
    message_count: allScored.length,
    tier_distribution: TIERS.map((t, i) => ({
      tier: i,
      label: t.label,
      count: tierCounts[i],
      percent: parseFloat(((tierCounts[i] / total) * 100).toFixed(1)),
    })),
    verdict,
    effective_scoring_config: cfg,
    results: allScored,
    error: null,
  }) + '\n');

  log('tune: complete');
}

module.exports = { runTune };
