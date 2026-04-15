# Phase 0: Accessibility Research - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Snapshot live Outlook web to capture verified ARIA selectors, data attribute names, and URL patterns. No production code is written. The only output is `references/outlook-ui.md`. All subsequent phases depend on this document for their selector decisions.

Scope is fixed to five things:
1. Search box — ARIA role and `aria-label` format
2. Message list container — landmark role and scrollable element
3. Individual message rows — ARIA attributes, stable message ID attribute (e.g., `data-convid`, `data-item-id`)
4. Reading pane — landmark and scoping boundary for body extraction
5. Focused Inbox — whether a tab navigation to "All" is required and how it works

Search URL format (`/mail/search?q=` or equivalent) must be confirmed or rejected with the actual working alternative documented.

</domain>

<decisions>
## Implementation Decisions

### Execution approach
- **D-01:** Use a disposable capture script — a short bash script that runs all agent-browser snapshot commands and dumps raw output to a temp file. Developer annotates the dump and formats `references/outlook-ui.md`. The script is deleted after use; it never ships with the skill.
- **D-02:** The plan should produce the capture script as its primary deliverable, plus a step-by-step walkthrough of which Outlook views to snapshot and what to look for in each.

### Session bootstrap
- **D-03:** Use `--auto-connect` to import the session from a running Chrome instance where the user is already on Outlook. This is the primary approach for the exploration session.
- **D-04:** Document `--profile <OUTLOOK_BROWSER_PROFILE>` as the fallback if `--auto-connect` fails (e.g., Chrome not running, or session not importable on managed device).
- **D-05:** Do NOT use `--session-name` for the exploration session — that's Phase 1's responsibility. Phase 0 should not create persistent session state that might interfere with Phase 1's auth validation.

### Output document format
- **D-06:** `references/outlook-ui.md` has two sections: (1) Curated Reference — clean selector tables with confidence annotations for downstream agents to read; (2) Evidence — raw snapshot dumps as a verification trail. Curated section comes first.
- **D-07:** Confidence annotation levels: `confirmed-live` (seen in actual snapshot), `inferred` (derived from snapshot structure but not directly observed), `unresolved` (could not determine — document explicitly).
- **D-08:** The stable message ID attribute must be documented with a concrete example value (not just the attribute name).

### Claude's Discretion
- Exact format of the bash capture script (can use agent-browser batch mode or sequential commands)
- How to structure the Evidence section (one dump per view vs. one combined dump)
- Whether to capture screenshots alongside snapshots for visual reference

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` §PKG-07 — Exact list of what `references/outlook-ui.md` must document (ARIA landmarks, roles, snapshot patterns, unread/flagged states)

### agent-browser CLI
- `.agents/skills/agent-browser/SKILL.md` — Core workflow, `--auto-connect` usage, snapshot command reference
- `.agents/skills/agent-browser/references/snapshot-refs.md` — How `@e` refs work, snapshot output format
- `.agents/skills/agent-browser/references/session-management.md` — `--auto-connect`, `--profile`, session isolation
- `.agents/skills/agent-browser/references/authentication.md` — Auth patterns including profile reuse

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — Phase 0 produces the first artifact (`references/outlook-ui.md`); no existing code to reuse

### Established Patterns
- agent-browser snapshot pattern: `agent-browser open <url> && agent-browser snapshot -i` — produces `@e` ref tree
- Batch mode available for chaining multiple snapshot commands without re-launching

### Integration Points
- `references/outlook-ui.md` is consumed by Phase 1 (URL access for auth validation), Phase 2 (search box ARIA), Phase 3 (reading pane ARIA), Phase 4 (Focused Inbox navigation)
- The document lives in `references/` — the same directory where `kql-syntax.md`, `error-recovery.md`, and `digest-signals.md` will live in Phase 5

</code_context>

<specifics>
## Specific Ideas

- No specific UI/interaction preferences stated — open to standard approaches for the capture script structure

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 00-accessibility-research*
*Context gathered: 2026-04-10*
