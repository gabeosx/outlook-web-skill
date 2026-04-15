---
status: testing
phase: 05-skill-packaging
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: SKILL.md — Subcommand Coverage
expected: |
  Open SKILL.md at the project root. It should document all 5 subcommands: auth, search, read, digest, and tune. Each subcommand should have a JSON request/response example and at least one critical pitfall note. The response envelope format should be described once near the top.
awaiting: user response

## Tests

### 1. SKILL.md — Subcommand Coverage
expected: Open SKILL.md at the project root. It should document all 5 subcommands: auth, search, read, digest, and tune. Each subcommand should have a JSON request/response example and at least one critical pitfall note. The response envelope format should be described once near the top.
result: [pending]

### 2. SKILL.md — Setup and Safety
expected: SKILL.md should list the 3 required environment variables needed for setup (ANTHROPIC_API_KEY or similar, session-related vars). It should also state explicitly that the skill is read-only and performs zero write operations.
result: [pending]

### 3. SKILL.md — Error Codes and Reference Pointers
expected: SKILL.md should list all 5 error codes (SESSION_INVALID, AUTH_REQUIRED, INVALID_ARGS, OPERATION_FAILED, MESSAGE_NOT_FOUND) and point to the 3 reference files (kql-syntax.md, error-recovery.md, digest-signals.md) via a reference table.
result: [pending]

### 4. references/kql-syntax.md — Operator Coverage
expected: Open references/kql-syntax.md. It should show a table of all 7 KQL operators (FROM, SUBJECT, HASATTACHMENT, IS:READ, IS:FLAGGED, RECEIVED, TO/CC/BCC), date format as YYYY-MM-DD, AND/OR/NOT combination examples (labeled Unverified), and a practical query examples section.
result: [pending]

### 5. references/error-recovery.md — Decision Trees
expected: Open references/error-recovery.md. It should contain decision trees for all 5 error codes, each with a "When you see" JSON snippet, a plain-English explanation, and numbered recovery steps. There should be a note that `auth` is idempotent and a bash snippet for parsing error.code from stdout.
result: [pending]

### 6. references/digest-signals.md — Scoring Algorithm
expected: Open references/digest-signals.md. It should show: score 0–100 ranges with plain-English labels, all 5 scoring weights with exact numeric values (40/20/40/5/20), all 5 importance_signals values with point values, the urgency keyword list, sender classification heuristics (human/channel/bulk), natural language explanation templates including bulk suppression, and the tune calibration path.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]
