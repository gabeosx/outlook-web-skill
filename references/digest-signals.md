# Digest Signals Reference

The `digest` subcommand scores each of today's inbox messages and returns results sorted by `importance_score` descending. This file documents the scoring algorithm, all signal values, and natural language templates for explaining results to users.

---

## Score Scale

| Range | Meaning |
|-------|---------|
| 0 | No signals fired — email is read AND sender is not a channel AND no urgency keywords |
| 1–19 | Low importance — keyword signal only, or channel email with keywords |
| 20–39 | Medium — unread channel email, or keyword-heavy read email |
| 40–59 | High — unread human email, no keywords |
| 60–100 | Critical — any combination reaching 60+ (unread human + keywords, or high importance, etc.) |

These ranges align with the `tune` subcommand's five-tier system: Tier 1 (1–19), Tier 2 (20–39), Tier 3 (40–59), Tier 4 (60+). Theoretical maximum is 100 (unread_human 40 + high_importance 40 + keyword_max 20).

---

## Default Scoring Weights

These are the defaults from `scoring.json.example`. If `scoring.json` exists at the project root, it overrides these defaults.

| Weight Key | Default Value | When Applied |
|------------|---------------|-------------|
| `unread_human` | 40 | Email is unread AND sender is detected as a human (name with comma, or 1–2 word non-channel name) AND sender does not match bulk patterns |
| `unread_channel` | 20 | Email is unread AND sender is detected as a channel/group AND not bulk |
| `high_importance_prefix` | 40 | Outlook marked the email with "Important " accessibility prefix (high importance flag) |
| `keyword_per_match` | 5 | Each urgency keyword matched in the combined from + subject + preview text |
| `keyword_max` | 20 | Maximum total points from keyword matches (capped even if many keywords match) |

The `bulk` suppression removes the unread bonus entirely — if a sender matches bulk patterns, neither `unread_human` nor `unread_channel` is added, regardless of whether the email is unread.

---

## importance_signals Values

The `importance_signals` array in each digest result tells you exactly which signals fired. Use this to explain results to the user.

| Signal Value | Plain-English Meaning | Points |
|-------------|----------------------|--------|
| `"unread"` | Email is unread from a human sender | +40 (default) |
| `"unread:channel"` | Email is unread from a channel, team, or group address | +20 (default) |
| `"high_importance"` | Outlook flagged this email as high importance (the "Important" exclamation mark) | +40 (default) |
| `"keyword:<term>"` | The word or phrase `<term>` appeared in the sender, subject, or preview | +5 per match, max +20 (default) |
| `"bulk"` | Email is unread but the unread bonus was suppressed — sender is a newsletter, digest, or no-reply address | 0 (suppression only) |

**On `keyword:<term>` format:** The full signal string includes the matched keyword after the colon. Examples: `"keyword:urgent"`, `"keyword:eod"`, `"keyword:action required"`. The term after the colon matches the exact entry in `urgency_keywords` from `scoring.json.example`.

**On `"bulk"`:** This signal is a suppression indicator, not an error. It appears when an email is unread but the unread bonus was not applied. See the Natural Language Explanation Templates section for how to communicate this to users.

---

## Default Urgency Keywords

These keywords are checked against the combined from + subject + preview text (case-insensitive). If any keyword appears, the `keyword:<term>` signal is added and 5 points are scored (capped at 20 total). From `scoring.json.example`:

```
urgent, asap, action required, immediate, deadline,
due today, overdue, eod, eow, critical, expires, time-sensitive,
itinerary, booking confirmation, reservation, check-in, travel alert
```

Add or remove keywords by copying `scoring.json.example` to `scoring.json` and editing the `urgency_keywords` array.

---

## Sender Classification

The skill classifies each sender to decide which unread weight applies. This logic runs against the `from` field (which contains the combined sender+subject text from the Outlook list view).

**Human sender** (gets `unread_human` weight, +40 default):
- The name contains a comma in the first 40 characters (e.g., "Smith, Alice" → human — Last, First format)
- OR the name is 1–2 words with no channel indicator word

**Channel/group sender** (gets `unread_channel` weight, +20 default):
- The name is 3 or more words
- OR the name contains any of these channel indicator words:
  `group`, `team`, `circle`, `community`, `center`, `online`, `network`, `office`, `alliance`, `program`, `service`, `digest`, `erg`, `management`

**Bulk sender** (unread bonus suppressed — neither weight applied):
- The combined from + subject + preview text matches any entry in `bulk_patterns` from `scoring.json.example`:
  `no reply`, `noreply`, `no-reply`, `donotreply`, `do not reply`, `bulk email`, `email digest`, `end user digest`, `newsletter`, `unsubscribe`, `started a new conversation`, `new posts from`

When the `"bulk"` signal appears in `importance_signals`, the email was unread but classified as automated/newsletter — the unread bonus was suppressed.

---

## Natural Language Explanation Templates

Use these templates when explaining a digest result to the user. Replace the bracketed values with actual data from the result object.

```
# Single signal — unread
"This email from [from] scored [importance_score] because it is unread."

# Single signal — high importance
"This email from [from] scored [importance_score] because it is marked high importance."

# Single signal — keyword
"This email from [from] scored [importance_score] — matched urgency keyword: [keyword term after colon]."

# Multiple signals — unread + high importance
"This email from [from] scored [importance_score] because it is unread (+40) and marked high importance (+40)."

# Multiple signals — unread + keywords
"This email from [from] scored [importance_score]: unread (+40), matched keywords [keyword signals joined by comma] (+[total keyword points])."

# Bulk suppression
"This email from [from] scored [importance_score]. It is unread, but the unread bonus was suppressed because this appears to be a newsletter or automated email."

# Channel email
"This email from [from] is from a team or group address. It scored [importance_score] as an unread channel email (+20)."

# Zero score
"This email from [from] scored 0 — it has been read and no urgency signals were detected."
```

**Building the explanation from `importance_signals`:**

1. For each signal in the array:
   - `"unread"` → "unread (+40)"
   - `"unread:channel"` → "unread channel email (+20)"
   - `"high_importance"` → "high importance (+40)"
   - `"keyword:urgent"` → "matched keyword: urgent (+5)"
   - `"bulk"` → "newsletter/automated email (unread bonus suppressed)"
2. Join signals with ", " — e.g., "unread (+40), matched keyword: eod (+5)"
3. Prefix with "This email from [from] scored [importance_score] because it is " for a natural sentence.

---

## Calibrating Scores

If the default scores do not reflect your inbox priorities:

1. Copy `scoring.json.example` to `scoring.json` in the project root:
   ```bash
   cp scoring.json.example scoring.json
   ```
2. Edit `scoring.json` to adjust weights, keywords, or bulk patterns for your inbox.
3. Run `node outlook.js tune` to evaluate the new configuration against a sample of your inbox:
   ```bash
   node outlook.js tune
   ```
4. Review the tier distribution and verdict in the output. Verdict values:
   - `"PASS"` — Tier 3+4 (high/critical) messages are ≤ 25% of the sample (healthy distribution)
   - `"WARN"` — Tier 3+4 are 26–40% (weights may be slightly aggressive)
   - `"FAIL"` — Tier 3+4 are > 40% (weights too aggressive or bulk patterns missing for common senders)
5. Run `node outlook.js tune --save` to persist the effective configuration back to `scoring.json`:
   ```bash
   node outlook.js tune --save
   ```

A `"FAIL"` verdict usually means the `unread_human` or `high_importance_prefix` weights are too high for your inbox volume, or you have frequent automated senders not yet in `bulk_patterns`.
