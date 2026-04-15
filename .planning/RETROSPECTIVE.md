# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-15
**Phases:** 7 (0–6) | **Plans:** 16 | **Timeline:** 5 days (Apr 10–15)

### What Was Built

- Live ARIA exploration of Outlook web → 77 confirmed-live selector annotations
- Auth scaffold passing Entra Conditional Access with managed Chrome + `--session-name` persistence
- `search` — KQL combobox automation, ConversationID extraction, scroll-accumulate
- `read` — reading pane body + attachment ARIA parsing
- `digest` — additive importance scoring (unread/sender/keyword), live-validated on 87-email inbox
- `tune` — externalised scoring.json with CLI calibration subcommand
- `calendar` / `calendar-read` / `calendar-search` — full calendar read access with popup card parser
- `calendar-read --full` — opt-in second browser pass for individual attendees + Teams join link
- Full reference library for calling agents (SKILL.md + 4 reference files)

### What Worked

- **Phase 0 first** — exploring live ARIA before writing a line of code prevented wrong-selector bugs in every downstream phase. Time investment paid off many times over.
- **Live human checkpoints at every phase** — catching bot detection (Phase 1), search ID issues (Phase 2/3), digest scoring distribution (Phase 4) in real sessions before moving on saved significant rework.
- **Coarse granularity + YOLO mode** — right call for a solo project. Minimal ceremony, fast iteration.
- **HANDOFF.json on pause** — structured handoff made resuming mid-UAT seamless; all context was instantly recoverable.
- **Composite key IDs for calendar events** — pragmatic solution to the no-stable-DOM-ID problem; worked well in practice.

### What Was Inefficient

- **Phase 2 scroll-accumulate loop** — implemented and then removed when Outlook's virtualised list cleared the accessibility tree during scroll. Could have predicted this from Phase 0 exploration if scroll behaviour had been explicitly tested.
- **Phase 3 double-encode discovery** — the eval double-encoding quirk wasn't discoverable without running live; cost a full debug session. Worth documenting earlier in Phase 0 exploration.
- **SUMMARY.md one-liner field not populated for Phases 5-01 and 5-02** — caused empty accomplishment entries in MILESTONES.md auto-extraction. Frontmatter discipline matters.
- **Calendar Teams meeting link investigation** — spent time implementing `fetchMeetingLinkViaFullEvent` auto-fetch before user confirmed it wasn't desired. Should have asked before implementing.

### Patterns Established

- **Snapshot must be last in batch** — page resets to about:blank after CLI exits; always confirmed by Phase 2 debugging. Now documented as D-16.
- **Eval double-encoding** — agent-browser wraps eval results in JSON string; require two-level JSON.parse. Documented in SKILL.md pitfalls.
- **`--full` for expensive operations** — opt-in flag pattern for operations that cost an extra browser round-trip. Avoids auto-querying every event for rarely-needed data.
- **`references/outlook-ui.md` gitignored** — live ARIA snapshots contain real names/email addresses. `outlook-ui.example.md` provides sanitised reference for the repo.
- **Action Policy JSON as read-only enforcement** — `default: deny` before every browser launch is the right pattern; makes safety mechanically enforced rather than trust-based.

### Key Lessons

1. **Explore first, code second** — Phase 0's live snapshot investment was the highest-ROI work in the project. Every subsequent phase benefited from having confirmed ARIA selectors.
2. **Ask before implementing options** — the Teams link auto-fetch was built before confirming the user wanted it. Saves a commit cycle to ask "would you like this?" first.
3. **Document Outlook quirks as discovered** — the double-encode, snapshot-last, and no-stable-ID quirks were all discovered live. Capturing them immediately in references/ prevented re-discovering them later.
4. **Live validation is non-negotiable for browser automation** — unit tests on captured ARIA strings are valuable, but they cannot catch session state, bot detection, or rendering timing issues. Plan for human checkpoints at every phase.

### Cost Observations

- Model: Claude Sonnet 4.6 (primary), with subagents for verification/review
- Notable: Calendar phase (06) was the largest single phase at 4 plans but ran smoothly due to reusing patterns from email phases

---

## Milestone: v1.1 — Folder Navigation

**Shipped:** 2026-04-15
**Phases:** 1 | **Plans:** 2 | **Timeline:** 1 day

### What Was Built

- `lib/folder.js` — folder normalization module with 9 ARIA alias mappings and custom-name passthrough
- `--folder <name>` flag for both `search` and `digest` via treeitem click batch injection
- `digest --folder` (no value) → INVALID_ARGS error instead of silent inbox fallback
- UAT-driven bug fixes: Office add-in DOM modal handling via eval, `Junk E-mail` alias corrected from live ARIA snapshot, `dialog` action added to policy allow list, stderr verbosity reduced

### What Worked

- **UAT caught real bugs immediately** — the dialog blocking issue, wrong alias, and silent fallback were all found in a single UAT session before any user was impacted. UAT before closing the milestone is worth the friction.
- **Debug agent isolation** — spawning gsd-debugger kept the main context clean while investigating the dialog issue. The 3-iteration loop (fix → test → still broken) would have consumed the conversation without subagent isolation.
- **Live ARIA snapshot for debugging** — when `Junk E-mail` kept failing, running a live snapshot to see the exact treeitem accessible name (`"Junk E-mail"` vs `"Junk Email"`) was faster than guessing.

### What Was Inefficient

- **Dialog fix took 3 iterations** — the root cause (DOM modal, not CDP dialog) required multiple subagent passes. Could have been caught faster by taking a snapshot immediately after the dialog warning appeared, before hypothesising.
- **SUMMARY.md one-liner field still not parsing** — the accomplishment extraction in gsd-tools still reads "One-liner:" as empty. Same issue noted in v1.0 retro — still not fixed. Needs a template-level fix.
- **Folder navigation reliability is partial** — treeitem click is susceptible to the modal re-appearing between batch commands. URL-based navigation would be more reliable; the fix shipped works for the common case but isn't bulletproof.

### Patterns Established

- **Double-dismiss eval pattern** — inject `DISMISS_ADDIN_DIALOG` eval both at batch start AND inside folderCommands (immediately before treeitem click) to handle re-appearing DOM modals.
- **Live ARIA snapshot for alias validation** — run a batch snapshot to confirm treeitem accessible names before hardcoding aliases. `references/outlook-ui.md` should capture these.
- **Policy allow-list must include all eval actions** — `dialog` action was blocked by default-deny policy even after being added to the batch. Check policy file whenever adding a new action type.

### Key Lessons

1. **UAT is a bug finder, not a rubber stamp** — this milestone had 5 issues found in UAT that weren't caught by code review or verification. Plan for UAT to find things.
2. **Snapshot first when something is blocking** — when a treeitem click fails with "Element not found," take a snapshot immediately to see the actual DOM state rather than guessing.
3. **DOM modals ≠ CDP dialogs** — `dialog dismiss` only handles native `window.confirm()` dialogs. React/DOM-level modals need eval-based dismissal. Worth documenting in agent-browser references.

### Cost Observations

- Model: Claude Sonnet 4.6 (primary), sonnet for debug subagents
- Notable: Small milestone (1 phase) but UAT + debug consumed more time than the original implementation — browser automation testing overhead is real

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Process Change |
|-----------|--------|-------|--------------------|
| v1.0 | 7 | 16 | Established: explore-first, live checkpoints, HANDOFF.json pattern |

### Top Lessons (To Verify Across Milestones)

1. Phase 0 exploration investment consistently pays off when working with opaque UIs
2. Live human checkpoints prevent compounding errors in browser automation
3. Opt-in flags (`--full`) for expensive operations are preferable to always-on behaviour
