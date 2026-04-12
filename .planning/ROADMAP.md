# Roadmap: Outlook Web Skill

## Overview

This skill gives a personal assistant Claude Code instance read-only access to Outlook web via `agent-browser` browser automation. The work proceeds in six phases. Phase 0 is pure interactive exploration — no code, just live snapshots — to capture the verified ARIA selectors and URL patterns that all later phases depend on. Phase 1 validates the highest-risk unknown (bot detection + session persistence) before any feature investment. Phases 2-4 build the three read operations in dependency order. Phase 5 packages the skill for calling agents with all reference documentation.

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (1.1, 2.1, ...): Urgent insertions added after planning

- [ ] **Phase 0: Accessibility Research** - Snapshot live Outlook to capture verified selectors and URL patterns; produces `references/outlook-ui.md`
- [ ] **Phase 1: Auth Scaffold + CLI Skeleton** - Validate bot detection, build session persistence, enforce read-only safety, establish JSON output pipe
- [ ] **Phase 2: Search Operation** - Implement `search` subcommand using verified ARIA selectors from Phase 0
- [ ] **Phase 3: Read Operation** - Implement `read` subcommand to fetch full email body via reading pane
- [ ] **Phase 4: Daily Digest Operation** - Implement `digest` subcommand with scroll-and-accumulate and importance scoring
- [ ] **Phase 5: Skill Packaging** - Write SKILL.md and all reference documentation; skill is ready for calling agents

## Phase Details

### Phase 0: Accessibility Research
**Goal**: Verified ARIA selectors, URL patterns, and DOM attribute names for Outlook web are captured in `references/outlook-ui.md` — no code is written, only live snapshots of a real session
**Depends on**: Nothing (first phase)
**Requirements**: PKG-07
**Success Criteria** (what must be TRUE):
  1. `references/outlook-ui.md` exists and documents the exact ARIA roles, `aria-label` formats, and `data-` attribute names for: search box, message list container, individual message rows, reading pane, attachment indicators, unread/flagged state markers
  2. The stable message ID attribute (e.g., `data-convid`, `data-item-id`, or equivalent) is identified with a concrete example value
  3. The search URL format (`/mail/search?q=` or fallback) is confirmed as working or rejected with the actual working alternative documented
  4. Focused Inbox default behavior is documented — whether digest must navigate to an "All" tab and how
  5. All selector findings are annotated with confidence level (confirmed live vs. inferred)
**Plans:** 1 plan
Plans:
- [x] 00-01-PLAN.md — Capture live Outlook ARIA snapshots and produce references/outlook-ui.md

### Phase 1: Auth Scaffold + CLI Skeleton
**Goal**: The skill's `outlook.js` entry point exists, the read-only Action Policy is enforced before any browser launch, and a real Chrome/Edge session can authenticate, persist, and restore across separate CLI invocations — bot detection is validated or a fallback path is confirmed
**Depends on**: Phase 0 (selectors not yet used, but Outlook URL access is required for auth validation)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, SAFE-01, SAFE-02, SAFE-03, SAFE-04, OUT-01, OUT-02, OUT-03, PKG-02, PKG-03
**Success Criteria** (what must be TRUE):
  1. Running `node outlook.js auth` opens a visible Chrome/Edge window using the configured `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE`; after the user completes MFA/SSO login, the session is saved to `~/.agent-browser/sessions/` without any manual file management
  2. A subsequent `node outlook.js auth` (no browser window, no login prompt) returns `{"operation":"auth","status":"ok"}` — confirming the session was restored from disk
  3. Navigating to the configured Outlook URL with the persisted session lands in the inbox (not a login redirect) — confirming the session survives across separate Node.js processes
  4. Running `node outlook.js unknown-cmd` returns `{"operation":"unknown-cmd","status":"error","error":{"code":"INVALID_ARGS",...}}` on stdout with exit code 1 — no browser is launched
  5. The `policy.json` Action Policy (`default: deny`) is in place and the `AGENT_BROWSER_ACTION_POLICY` env var is set before any browser launch; `click` and `fill` are only allowed during `auth`
  6. All stdout from the skill is valid JSON; `stderr` is used for diagnostic logging; agent-browser is always invoked with `-q`
**Plans:** 3 plans
Plans:
- [x] 01-01-PLAN.md — CLI scaffold: outlook.js entry point, lib/output.js, lib/run.js, policy files
- [x] 01-02-PLAN.md — Auth implementation: lib/session.js with session detection, headed login, polling loop
- [x] 01-03-PLAN.md — Human checkpoint: live auth validation against real Outlook instance

### Phase 2: Search Operation
**Goal**: Users (via the calling agent) can search Outlook emails by KQL query and receive a structured JSON array of results with stable message IDs for downstream use
**Depends on**: Phase 1
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05
**Success Criteria** (what must be TRUE):
  1. `node outlook.js search "from:alice@example.com"` returns a JSON envelope with a `results` array where each item contains `id`, `subject`, `from`, `to`, `date`, `preview`, `is_read`, `is_flagged`
  2. The `id` field in each result is a stable, non-empty string value that can be passed to `read` in Phase 3
  3. Running with `--limit 5` returns no more than 5 results; running without `--limit` returns up to the 20-item default
  4. When Outlook renders more than 20 results, the skill scrolls the message list and accumulates additional rows until the limit is reached
  5. A query that returns zero results returns `{"status":"ok","results":[],"count":0}` — not an error
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md — Search implementation: policy-search.json, lib/run.js updates, lib/search.js with combobox workflow, accessible name parser, eval ID extraction, scroll-accumulate
- [ ] 02-02-PLAN.md — Human checkpoint: live search verification against real Outlook instance

### Phase 3: Read Operation
**Goal**: Users can retrieve the full text content, metadata, and attachment names of a specific email identified by an ID from a prior search result
**Depends on**: Phase 2
**Requirements**: READ-01, READ-02, READ-03
**Success Criteria** (what must be TRUE):
  1. `node outlook.js read <id>` navigates to the correct email and returns a JSON envelope containing `subject`, `from`, `to`, `cc`, `date`, `body_text`, `has_attachments`, `attachment_names`
  2. The `body_text` field contains the full email body as plain text (not HTML tags) extracted via the accessibility snapshot scoped to the reading pane landmark
  3. `attachment_names` is a non-null array — empty if no attachments, populated with filenames if attachments are present
  4. If the session has expired mid-operation (Outlook redirects to login), the operation returns `{"status":"error","error":{"code":"SESSION_INVALID",...}}` rather than crashing or returning partial data
**Plans:** 2 plans
Plans:
- [x] 03-01-PLAN.md — Search ID fix (inline eval) + lib/read.js implementation + outlook.js wiring
- [ ] 03-02-PLAN.md — Live verification: 6 tests (search IDs, read email, missing ID, zero results, attachment ARIA capture, end-to-end pipeline) + human checkpoint

### Phase 4: Daily Digest Operation
**Goal**: Users can get a scored and ranked view of today's inbox that surfaces the most important messages first, without any additional query construction
**Depends on**: Phase 3
**Requirements**: DIGT-01, DIGT-02, DIGT-03
**Success Criteria** (what must be TRUE):
  1. `node outlook.js digest` fetches today's inbox messages and returns a JSON array sorted by `importance_score` descending
  2. Each result includes `id`, `subject`, `from`, `date`, `preview`, `is_read`, `is_flagged`, `importance_score`, `importance_signals` — the calling agent can describe why each message was ranked where it was
  3. The scroll-and-accumulate loop handles inboxes with more than 20 messages — results are not silently capped at the first DOM render
  4. Messages in the "Focused" inbox view and the "All" view are handled correctly — digest always operates on the complete inbox, not just the AI-filtered Focused tab
**Plans:** 2 plans
Plans:
- [x] 04-01-PLAN.md — lib/digest.js implementation: inbox navigation, Today group extraction, scroll-accumulate, importance scoring, outlook.js wiring
- [x] 04-02-PLAN.md — Live verification: 3 tests (schema completeness, sort order, today-only filter) + human checkpoint

### Phase 5: Skill Packaging
**Goal**: The skill is fully documented for consumption by a calling Claude Code agent — all reference files exist, SKILL.md teaches the calling LLM what it cannot be assumed to know, and the skill directory is self-contained
**Depends on**: Phase 4
**Requirements**: PKG-01, PKG-04, PKG-05, PKG-06
**Success Criteria** (what must be TRUE):
  1. `SKILL.md` exists at the skill root and documents: exact CLI invocation syntax for all subcommands, full JSON schemas for all response envelopes, all error codes and their meanings, the read-only constraint with a clear statement of what the skill will never do, and explicit pointers to all reference files
  2. `references/kql-syntax.md` exists and covers all supported KQL operators (`from:`, `subject:`, `has:attachment`, `is:unread`, `is:flagged`, `before:`, `after:`, free-text) with at least one working example each
  3. `references/error-recovery.md` exists and documents the correct calling-agent response for each error code: `SESSION_INVALID`, `AUTH_REQUIRED`, `OPERATION_FAILED`, `INVALID_ARGS`
  4. `references/digest-signals.md` exists and documents the `importance_score` scale (0-100), the weight of each scoring signal, and all possible `importance_signals` string values so the calling agent can explain a digest result in natural language
  5. A calling Claude Code agent reading only `SKILL.md` has enough information to invoke all four subcommands correctly without referring to the skill's source code
**Plans:** 2 plans
Plans:
- [x] 05-01-PLAN.md — Write SKILL.md and references/kql-syntax.md
- [x] 05-02-PLAN.md — Write references/error-recovery.md and references/digest-signals.md

## Progress

**Execution Order:**
Phases execute in numeric order: 0 -> 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Accessibility Research | 1/1 | Complete | 2026-04-10 |
| 1. Auth Scaffold + CLI Skeleton | 3/3 | Complete | 2026-04-10 |
| 2. Search Operation | 2/2 | Complete | 2026-04-10 |
| 3. Read Operation | 2/2 | Complete | 2026-04-11 |
| 4. Daily Digest Operation | 2/2 | Complete | 2026-04-12 |
| 5. Skill Packaging | 0/? | Not started | - |
