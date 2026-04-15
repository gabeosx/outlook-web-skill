# Phase 5: Skill Packaging - Research

**Researched:** 2026-04-12
**Domain:** Skill documentation authoring — SKILL.md + reference files for a calling Claude Code agent
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** SKILL.md uses a hybrid format: full JSON schemas inline + instructions for calling agent to read each reference file.
- **D-02:** SKILL.md stays under 500 lines. If schemas push past this, schemas move to `references/schemas.md` and SKILL.md points to it.
- **D-03:** SKILL.md uses YAML frontmatter convention from agent-browser SKILL.md: `name`, `description`, `allowed-tools`.
- **D-04:** SKILL.md includes a Setup section covering the three required env vars, `scoring.json.example` copy step, and first-time auth command.
- **D-05:** SKILL.md states the read-only constraint explicitly and unconditionally.
- **D-06:** Schemas are annotated JSON examples (not TypeScript interfaces, not JSON Schema format) — one success example + one error example per subcommand.
- **D-07:** All four subcommands use standard envelope; document envelope once at the top, then per-subcommand `results` shape.
- **D-08:** `references/kql-syntax.md` documents exactly 7 tested operators from SRCH-01: `from:`, `subject:`, `has:attachment`, `is:unread`, `is:flagged`, `before:`, `after:`.
- **D-09:** Also document AND/OR/NOT combinations with examples.
- **D-10:** Any Outlook KQL beyond tested operators is labelled "Unverified — not tested against this deployment".
- **D-11:** Include free-text keyword search section (most common pattern).
- **D-12:** Include date format section for `before:`/`after:` (ISO 8601 `YYYY-MM-DD` confirmed working).
- **D-13:** Document all four error codes with decision-tree recovery steps.
- **D-14:** Write `error-recovery.md` as decision trees, not just descriptions.
- **D-15:** Note that `SESSION_INVALID` mid-operation means session expired after prior successful invocation; always run `auth` first, then retry.
- **D-16:** `references/digest-signals.md` documents scoring algorithm with default weights from `scoring.json.example`.
- **D-17:** Document all possible `importance_signals` string values.
- **D-18:** Include natural language explanation template.
- **D-19:** Document `bulk` suppression signal explicitly.
- **D-20:** Reference `scoring.json.example` and the `tune` subcommand for calibration.

### Claude's Discretion

- Exact wording/tone in SKILL.md prose (informative, not verbose)
- Whether to add a `tune` subcommand section in SKILL.md (include it briefly)
- Ordering of sections within SKILL.md
- Whether `references/schemas.md` is needed (only if inline schemas push SKILL.md over 500 lines)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-01 | SKILL.md documents invocation syntax, JSON schemas, error codes, read-only constraint, pointers to reference files | All schemas extracted from source — see Code Examples section |
| PKG-04 | `references/kql-syntax.md` — KQL operators with examples including combinations and free-text | KQL operators confirmed in REQUIREMENTS SRCH-01; date format confirmed ISO 8601 per D-12 |
| PKG-05 | `references/error-recovery.md` — recovery steps for all four error codes | All four codes confirmed in `lib/output.js` and usage in `session.js`, `read.js`, `digest.js` |
| PKG-06 | `references/digest-signals.md` — importance_score algorithm, all importance_signals values | All signal values and scoring logic extracted from `lib/digest.js`; weights from `scoring.json.example` |
</phase_requirements>

---

## Summary

Phase 5 is a pure documentation phase — no code changes. The deliverables are four new files: `SKILL.md` at the project root and three reference files under `references/`. All source-of-truth content already exists in the codebase; this research extracts and structures it so the planner has exact schemas, signal values, weights, and invocation syntax to write the documentation.

The calling agent model this skill targets is a Claude Code personal assistant that invokes `node outlook.js <subcommand>` via the Bash tool. The calling agent has no prior knowledge of Outlook's KQL dialect, the importance scoring algorithm, or the session/error recovery pattern — all of that domain knowledge must be taught in the reference files. SKILL.md is the entry point; it handles invocation mechanics and points to the refs for domain depth.

The existing agent-browser SKILL.md (at `.agents/skills/agent-browser/SKILL.md`) establishes the canonical format: YAML frontmatter with `name`, `description`, `allowed-tools`, then prose sections, code blocks, and a reference table. The outlook skill SKILL.md follows this exact structure.

**Primary recommendation:** Write all four files in a single plan wave. There are no dependencies between the four files — they can be authored in parallel or sequentially. The reference files are self-contained domain documents; SKILL.md is the index that points to them.

---

## Standard Stack

This phase requires no new libraries or tools. All content comes from reading and documenting existing source files.

| Source File | What to Extract |
|-------------|-----------------|
| `outlook.js` | Valid subcommands (auth, search, read, digest, tune), env vars, exit code semantics |
| `lib/output.js` | Exact JSON envelope field names and types |
| `lib/search.js` | search result field names, `--limit` flag, usage string |
| `lib/read.js` | read result field names, `--query` flag, usage string, `MESSAGE_NOT_FOUND` error code |
| `lib/digest.js` | digest result field names, scoring logic, all importance_signals string values |
| `lib/tune.js` | tune result shape, `--save` flag, grade tier boundaries |
| `lib/session.js` | SESSION_INVALID, AUTH_REQUIRED semantics; login URL detection domains |
| `scoring.json.example` | Default scoring weights, urgency keywords, bulk patterns, channel words |
| `.agents/skills/agent-browser/SKILL.md` | YAML frontmatter format, section structure to model |

---

## Architecture Patterns

### Recommended File Structure

```
(project root)/
├── SKILL.md                    # New — skill entry point for calling agent
└── references/
    ├── outlook-ui.md           # Exists (Phase 0) — ARIA selectors
    ├── kql-syntax.md           # New — KQL operators and examples
    ├── error-recovery.md       # New — decision trees per error code
    └── digest-signals.md       # New — scoring algorithm and signal values
```

### Pattern 1: SKILL.md Structure

**What:** YAML frontmatter + prose sections following agent-browser SKILL.md convention.
**When to use:** This is the required format for all skills in this project (confirmed from agent-browser SKILL.md and skills-lock.json).

**Mandatory SKILL.md sections (in order):**
1. YAML frontmatter (`name`, `description`, `allowed-tools`)
2. Brief intro (1 paragraph: what the skill does, what it will never do)
3. Safety constraint (read-only — explicit, unconditional)
4. Setup (env vars, scoring.json, first-time auth)
5. Subcommands (one subsection per command: syntax, args, example response)
6. Standard envelope (document once, reference from subcommand sections)
7. Error codes (list all codes, brief description, pointer to error-recovery.md)
8. Reference files table (point to all refs with purpose)

**`allowed-tools` value:** `Bash(node outlook.js:*)` — the calling agent invokes via Bash.

[VERIFIED: direct inspection of `.agents/skills/agent-browser/SKILL.md`]

### Pattern 2: Annotated JSON Example Schema Format

**What:** One success JSON example and one error JSON example per subcommand, with inline comments explaining each field.
**When to use:** Per D-06; this format is more readable for an LLM than TypeScript interfaces or formal JSON Schema.

**Example (from D-07 guidance):**
Document the envelope once at top level, then show per-subcommand `results` shape in a comment block.

### Pattern 3: Reference File as Decision Tree

**What:** `error-recovery.md` uses numbered decision steps, not prose descriptions.
**When to use:** Per D-14; the calling agent should be able to follow steps mechanically.

**Structure per error code:**
```
## SESSION_INVALID
When you see: {"status":"error","error":{"code":"SESSION_INVALID",...}}
Steps:
1. Run: node outlook.js auth
2. If browser opens: prompt user to complete login, then re-run auth
3. Retry the original operation
4. If still SESSION_INVALID: surface error to user
```

### Anti-Patterns to Avoid

- **Documenting agent-browser internals:** The calling agent does not need to know about `--session-name outlook-skill`, policy files, or batch commands. Those are implementation details. SKILL.md documents `node outlook.js` invocations only.
- **Speculative KQL operators:** D-10 requires explicitly labelling any KQL beyond the 7 tested operators as "Unverified." Do not document `category:`, `kind:`, `size:` etc. without the unverified label.
- **Oversized SKILL.md:** If schemas push past 500 lines, move schemas to `references/schemas.md`. D-02 is a hard limit.
- **Mixing stdout and stderr documentation:** The calling agent only reads stdout. The skill writes diagnostic logs to stderr. Do not document stderr content in SKILL.md.

---

## Don't Hand-Roll

This is a documentation phase — no code. The "don't hand-roll" principle applies to content sourcing:

| Problem | Don't Invent | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schemas | Writing field names from memory | Read `lib/search.js`, `lib/read.js`, `lib/digest.js` directly | Field names in source are authoritative; `subject` vs `body` vs `body_text` matters |
| Scoring weights | Guessing weights | Read `scoring.json.example` | Weights are user-configurable; document defaults from file exactly |
| importance_signals values | Inferring from description | Read `lib/digest.js` scoring loop | Exact string values like `"unread"`, `"unread:channel"`, `"keyword:urgent"` must match code output |
| Error codes | Writing from memory | Read `lib/output.js` comments + usage sites | `MESSAGE_NOT_FOUND` exists in `lib/read.js` but is NOT in `lib/output.js` error code list — the discrepancy must be noted |
| Env var names | Guessing | Read `outlook.js` `REQUIRED_ENV` array | Exact names required; tilde expansion handled by outlook.js |

---

## Extracted Schemas (Authoritative)

These are extracted directly from source code. [VERIFIED: direct inspection of source files]

### JSON Envelope (all subcommands)

From `lib/output.js`:
```json
{
  "operation": "<subcommand name>",
  "status": "ok | error",
  "results": "<array or null>",
  "error": "null | { \"code\": \"...\", \"message\": \"...\" }"
}
```

Exit codes: `0` = JSON written to stdout (check `status` field); `1` = fatal error before JSON could be written (rare startup failure).

### search — results item shape

From `lib/search.js` `runSearch()` and `parseAccessibleName()`:
```json
{
  "operation": "search",
  "status": "ok",
  "results": [
    {
      "id": "AAQk...",
      "from": "Smith, Alice",
      "subject": "",
      "date": "Mon 4/7/2026",
      "preview": "Here is the document you requested...",
      "is_read": false,
      "is_flagged": null,
      "to": null
    }
  ],
  "count": 1,
  "error": null
}
```

**Important calling-agent notes:**
- `subject` is always empty string `""` — the accessible name combines sender and subject before the date, but there is no reliable delimiter. The pre-date text is returned in `from`. The calling agent may further parse `from` if needed.
- `is_flagged` is always `null` — not determinable from passive search snapshot.
- `to` is always `null` — only visible in reading pane.
- `id` is an Exchange ConversationId (`data-convid` attribute). Pass this value to `read` as the first positional argument.

### read — results shape

From `lib/read.js` `runRead()`:
```json
{
  "operation": "read",
  "status": "ok",
  "results": {
    "subject": "Q1 Budget Review",
    "from": "Smith, Alice <alice@example.com>",
    "to": "You; Bob Jones",
    "cc": "Manager, Jane",
    "date": "Mon 4/7/2026 9:15 AM",
    "body_text": "Hi team,\nPlease review the attached...",
    "has_attachments": true,
    "attachment_names": ["Q1_Budget.xlsx"]
  },
  "error": null
}
```

**Note:** `results` is a single object (not an array) for `read`. `cc` is `null` when no CC recipients.

**CLI syntax:** `node outlook.js read <id> [--query <search-query>]`
- `<id>` is required — the `data-convid` value from a prior `search` result
- `--query` is optional — if the email was found via a specific search, pass that query to help `read` locate it. Default is a broad space-search.

### digest — results item shape

From `lib/digest.js` `runDigest()`:
```json
{
  "operation": "digest",
  "status": "ok",
  "results": [
    {
      "id": "AAQk...",
      "subject": "",
      "from": "Smith, Alice",
      "date": "4/12/2026",
      "preview": "Please review before EOD...",
      "is_read": false,
      "is_flagged": null,
      "importance_score": 85,
      "importance_signals": ["unread", "high_importance", "keyword:eod"]
    }
  ],
  "count": 1,
  "error": null
}
```

**Note:** Results are sorted descending by `importance_score`. `subject` has the same limitation as search (empty string — combined in `from` field).

### tune — results shape

From `lib/tune.js` `runTune()`:
```json
{
  "operation": "tune",
  "status": "ok",
  "query_count": 25,
  "message_count": 87,
  "tier_distribution": [
    {"tier": 0, "label": "Tier 0 — Low noise (automated/bulk)", "count": 12, "percent": 13.8},
    {"tier": 1, "label": "Tier 1 — Low", "count": 30, "percent": 34.5},
    {"tier": 2, "label": "Tier 2 — Medium", "count": 20, "percent": 23.0},
    {"tier": 3, "label": "Tier 3 — High", "count": 18, "percent": 20.7},
    {"tier": 4, "label": "Tier 4 — Critical", "count": 7, "percent": 8.0}
  ],
  "verdict": "PASS",
  "effective_scoring_config": {"scoring_weights": {"unread_human": 40}, "...": "..."},
  "results": ["<array of scored messages>"],
  "error": null
}
```

**Verdict values:** `"PASS"` (Tier 3+4 <= 25%), `"WARN"` (26-40%), `"FAIL"` (>40%).
**Grade report:** Written to stderr, not stdout.
**CLI syntax:** `node outlook.js tune [--save]`
- `--save` writes the effective config to `scoring.json`

### auth — results shape

From `lib/session.js` `runAuth()` via `outputOk('auth')`:
```json
{"operation": "auth", "status": "ok", "results": null, "error": null}
```

---

## Scoring Algorithm (Authoritative)

Extracted from `lib/digest.js` and `scoring.json.example`. [VERIFIED: direct inspection]

### Default Weights

| Signal | Points | Source |
|--------|--------|--------|
| `unread` (human sender, unread) | +40 | `scoring_weights.unread_human` |
| `unread:channel` (channel/group sender, unread) | +20 | `scoring_weights.unread_channel` |
| `high_importance` (had "Important " ARIA prefix) | +40 | `scoring_weights.high_importance_prefix` |
| `keyword:<term>` (urgency keyword match) | +5 per match | `scoring_weights.keyword_per_match` |
| Keyword cap | max +20 total | `scoring_weights.keyword_max` |
| `bulk` suppression | unread bonus suppressed | bulk_patterns match |

**Score range:** 0–100 (theoretical max: 40 unread + 40 high_importance + 20 keywords = 100)

### All importance_signals Values

From `lib/digest.js` scoring loop: [VERIFIED: direct inspection]

| Value | Meaning | When Added |
|-------|---------|-----------|
| `"unread"` | Email is unread, sender is a human (name contains comma OR 1-2 words without channel indicator) | `!parsed.is_read && !isBulk && isHumanSender` |
| `"unread:channel"` | Email is unread, sender is a channel/group | `!parsed.is_read && !isBulk && !isHumanSender` |
| `"high_importance"` | Email had "Important " ARIA prefix in Outlook | `hadImportantPrefix` |
| `"keyword:<term>"` | Urgency keyword matched in from+subject+preview; `<term>` is the matched keyword exactly | `haystack.includes(kw)` for each kw in urgency_keywords |
| `"bulk"` | Email is unread but unread bonus was suppressed — sender matches bulk/newsletter pattern | `!parsed.is_read && isBulk` |

**keyword signal format:** The full string is `"keyword:urgent"`, `"keyword:asap"`, `"keyword:action required"` etc. — the term after the colon matches the exact entry in `urgency_keywords`.

### Default Urgency Keywords

From `scoring.json.example`:
`urgent`, `asap`, `action required`, `immediate`, `deadline`, `due today`, `overdue`, `eod`, `eow`, `critical`, `expires`, `time-sensitive`, `itinerary`, `booking confirmation`, `reservation`, `check-in`, `travel alert`

### Human Sender Detection Logic

From `lib/digest.js`:
- `"Lastname, Firstname"` pattern (contains comma in first 40 chars) → human
- 1-2 word name with no channel indicator word → human
- 3+ word name → channel/group
- Name contains channel indicator word (group, team, circle, community, center, online, network, office, alliance, program, service, digest, erg, management) → channel

---

## Error Codes (Authoritative)

From `lib/output.js` comments + usage across session.js, search.js, read.js, digest.js:

| Code | Meaning | Emitted By |
|------|---------|-----------|
| `INVALID_ARGS` | Missing or invalid CLI argument | `outlook.js` startup (missing subcommand, missing env var), `lib/search.js` (missing query), `lib/read.js` (missing id) |
| `SESSION_INVALID` | Browser session expired or never established | `lib/search.js`, `lib/read.js`, `lib/digest.js` (session check fails mid-operation) |
| `AUTH_REQUIRED` | Session check shows login page at startup | `lib/session.js` (via `runAuth` when checkSessionValid returns false) — NOTE: in practice the auth subcommand handles this flow and does not emit AUTH_REQUIRED as an error; SESSION_INVALID is the operational error code |
| `OPERATION_FAILED` | Browser error, timeout, empty snapshot, or element-not-found | `lib/read.js`, `lib/digest.js` (batch failed, empty reading pane, etc.) |
| `MESSAGE_NOT_FOUND` | `read` subcommand: email with given id not found in search results | `lib/read.js` only |

**Note on AUTH_REQUIRED vs SESSION_INVALID:** The REQUIREMENTS (OUT-03) lists both codes, but in practice `SESSION_INVALID` is the operational error for expired sessions during `search`, `read`, and `digest`. `AUTH_REQUIRED` does not appear in the production error paths in the current codebase — `runAuth()` uses `OPERATION_FAILED` if the headed browser fails to launch. The planner should document both per REQUIREMENTS, with `SESSION_INVALID` as the primary operational code.

**Note on MESSAGE_NOT_FOUND:** This code exists in `lib/read.js` but was not listed in REQUIREMENTS OUT-03. It should be documented in `error-recovery.md` as a fifth error code.

---

## KQL Operators (Authoritative for This Deployment)

From REQUIREMENTS SRCH-01 (tested operators) and D-08 through D-12:

| Operator | Example | Notes |
|----------|---------|-------|
| `from:` | `from:alice@example.com` | Matches sender address |
| `subject:` | `subject:budget` | Matches words in subject line |
| `has:attachment` | `has:attachment` | Boolean, no value needed |
| `is:unread` | `is:unread` | Boolean |
| `is:flagged` | `is:flagged` | Boolean |
| `before:` | `before:2024-01-01` | ISO 8601 date format confirmed working |
| `after:` | `after:2024-01-01` | ISO 8601 date format confirmed working |
| Free-text | `budget review` | No operator prefix; matches subject and body |

**Date format:** `YYYY-MM-DD` confirmed working for `before:` and `after:`. Other formats (MM/DD/YYYY, human date strings) are unverified against this deployment. [VERIFIED: D-12 decision in CONTEXT.md]

**Combinations (standard KQL, not deployment-verified):** `from:alice subject:budget`, `is:unread has:attachment`, `NOT from:noreply`. [ASSUMED — standard KQL logic, not live-tested against this deployment per D-09/D-10]

---

## Common Pitfalls

### Pitfall 1: subject field is always empty in search/digest results
**What goes wrong:** Calling agent tries to read `results[0].subject` and gets empty string, not the email subject.
**Why it happens:** Outlook's accessibility snapshot for message list items does not separate sender from subject — the entire pre-date text is returned in `from`.
**How to avoid:** Document explicitly in SKILL.md that `from` contains the combined sender+subject text from the list view. `subject` is only populated by the `read` subcommand (reading pane has separate heading for subject).
**Warning signs:** Empty subject strings in search results JSON.

### Pitfall 2: Passing wrong ID type to read
**What goes wrong:** Calling agent passes an Exchange ItemId (AAkALg... format) instead of a ConversationId (AAQk... format), and read returns `MESSAGE_NOT_FOUND`.
**Why it happens:** Outlook has two ID types. Search returns `data-convid` (ConversationId). The `/mail/id/` URL uses a different ItemId. The skill uses ConversationId throughout.
**How to avoid:** Document that `id` in search/digest results is a ConversationId that should be passed directly to `read` without modification.

### Pitfall 3: Calling read without --query when original search was specific
**What goes wrong:** `read` uses a broad space-search to load the email list, but the target email doesn't appear in the first ~20 results.
**Why it happens:** `read` performs a search to get the email list, then clicks by data-convid. Without `--query`, it uses `" "` (space) for broad recent-mail search. A specific email from a month ago may not appear.
**How to avoid:** Document the `--query` flag and recommend passing the original search query from the preceding `search` call.

### Pitfall 4: Expecting auth to open a browser when session is valid
**What goes wrong:** Calling agent prompts user to complete login, but no browser appears — `auth` returns ok immediately.
**Why it happens:** `auth` first checks if the session is already valid. If it is, it returns `{"status":"ok"}` without opening a browser.
**How to avoid:** Document in SKILL.md that `auth` is idempotent — it only opens a browser if the session is invalid. Safe to run before any operation.

### Pitfall 5: Assuming today's emails are not empty when digest returns []
**What goes wrong:** Calling agent reports "no emails today" when the inbox has recent mail.
**Why it happens:** `digest` extracts only the "Today" group from the inbox. If the inbox is sorted differently or on a non-default view, the Today group may not exist.
**How to avoid:** Document that empty digest results mean no "Today" group was found, which may indicate inbox sort order or view configuration. Suggest `search "is:unread"` as a fallback.

### Pitfall 6: Treating bulk signal as an error
**What goes wrong:** Calling agent surfaces "bulk" as a negative or confusing signal to users.
**Why it happens:** `"bulk"` in `importance_signals` is a suppression indicator, not an error code. It explains why an unread email scored 0.
**How to avoid:** Document `"bulk"` as "newsletter/automated email — unread bonus suppressed" in digest-signals.md so the calling agent can explain it in natural language.

---

## Code Examples

### Minimal invocation (calling agent Bash tool)

```bash
# Auth check (safe to run before any operation)
node outlook.js auth

# Search
node outlook.js search "from:alice@example.com is:unread" --limit 10

# Read a specific email (id from prior search result)
node outlook.js read "AAQk..." --query "from:alice@example.com is:unread"

# Daily digest
node outlook.js digest

# Tune scoring calibration
node outlook.js tune
node outlook.js tune --save
```

### Error handling pattern for calling agent

```bash
RESULT=$(node outlook.js search "is:unread")
STATUS=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.status)")
if [ "$STATUS" = "error" ]; then
  CODE=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.error.code)")
  # Handle by code: SESSION_INVALID → run auth; INVALID_ARGS → fix args; etc.
fi
```

---

## State of the Art

| Current Pattern | Notes |
|----------------|-------|
| YAML frontmatter for SKILL.md | Established by agent-browser convention in this project |
| Annotated JSON examples for schemas | D-06 decision; preferred over TypeScript or JSON Schema for LLM consumption |
| Reference files teach domain knowledge | Established pattern per MEMORY.md feedback: refs must educate the calling LLM, not just list APIs |
| `references/` directory at project root | Already exists with `outlook-ui.md`; new files go alongside it |

---

## Environment Availability

Step 2.6: SKIPPED — this phase is documentation-only, no external dependencies.

---

## Validation Architecture

`nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is omitted.

---

## Security Domain

This phase writes documentation only — no code, no new attack surface. Security considerations that MUST appear in SKILL.md:

| Concern | What to Document |
|---------|-----------------|
| Prompt injection | `AGENT_BROWSER_CONTENT_BOUNDARIES=1` is set on all operations; email content cannot reach the calling agent via the skill's stdout |
| Read-only enforcement | Action Policy JSON (`default: deny`) is enforced before any browser launch; the skill will NEVER send, delete, move, reply to, or accept/decline anything |
| Env var sensitivity | `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE` point to the user's managed Chrome profile with Entra SSO tokens; these should be in `.env` (gitignored) not hardcoded |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | KQL `AND`/`OR`/`NOT` combinations follow standard KQL logic | KQL Operators | Combinations may not work as expected on this Outlook tenant; calling agent issues a compound query that returns wrong results |
| A2 | `AUTH_REQUIRED` is listed in REQUIREMENTS but does not appear as an emitted code in production paths | Error Codes | If a code path emits AUTH_REQUIRED that was missed in code reading, error-recovery.md would be incomplete |

---

## Open Questions

1. **MESSAGE_NOT_FOUND code inclusion**
   - What we know: `MESSAGE_NOT_FOUND` is emitted by `lib/read.js` but not listed in REQUIREMENTS OUT-03 or CONTEXT.md D-13
   - What's unclear: Should it be documented in `error-recovery.md` alongside the four REQUIREMENTS-specified codes?
   - Recommendation: Yes — document it as a fifth code. The calling agent will encounter it and needs a recovery path (pass `--query` flag with the original search query).

2. **`subject` field behavior**
   - What we know: `subject` is always `""` in search and digest results; `from` contains the combined sender+subject text
   - What's unclear: Should SKILL.md rename these fields in the schema examples to avoid confusion, or document the current behavior verbatim?
   - Recommendation: Document behavior verbatim with a clear note; renaming fields would diverge from actual output and break any code the calling agent writes.

---

## Sources

### Primary (HIGH confidence)
- `outlook.js` — direct inspection; env vars, valid subcommands, exit codes
- `lib/output.js` — direct inspection; JSON envelope structure
- `lib/search.js` — direct inspection; search result fields, --limit behavior
- `lib/read.js` — direct inspection; read result fields, --query flag, MESSAGE_NOT_FOUND
- `lib/digest.js` — direct inspection; digest result fields, all scoring logic, all importance_signals values
- `lib/tune.js` — direct inspection; tune result shape, --save flag, tier boundaries
- `lib/session.js` — direct inspection; SESSION_INVALID, isLoginUrl logic
- `scoring.json.example` — direct inspection; default weights, urgency keywords, bulk patterns, channel words
- `.agents/skills/agent-browser/SKILL.md` — direct inspection; YAML frontmatter convention, section structure
- `.planning/phases/05-skill-packaging/05-CONTEXT.md` — direct inspection; all locked decisions D-01 through D-20
- `.planning/REQUIREMENTS.md` — direct inspection; PKG-01, PKG-04, PKG-05, PKG-06

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — project decisions including scoring model decisions

---

## Metadata

**Confidence breakdown:**
- Schemas: HIGH — extracted directly from source files
- Scoring algorithm: HIGH — extracted directly from lib/digest.js and scoring.json.example
- KQL operators: HIGH for 7 tested operators (from REQUIREMENTS); ASSUMED for combinations
- Error codes: HIGH for four REQUIREMENTS codes; note on MESSAGE_NOT_FOUND discrepancy
- Format/convention: HIGH — confirmed from agent-browser SKILL.md

**Research date:** 2026-04-12
**Valid until:** Stable indefinitely — this phase documents the existing codebase; no external dependencies
