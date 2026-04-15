# Phase 0: Accessibility Research - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-10
**Phase:** 00-accessibility-research
**Mode:** discuss
**Areas analyzed:** Execution approach, Session bootstrap, Output document format

## Gray Areas Presented

### Execution approach
| Option | Description |
|--------|-------------|
| Disposable capture script | Bash script runs all snapshots, dumps output; deleted after use |
| Manual walkthrough | Checklist of commands run manually and recorded by hand |

### Session bootstrap
| Option | Description |
|--------|-------------|
| --auto-connect | Import from running Chrome — zero setup if Outlook already open |
| --profile \<path\> | Point at Chrome/Edge profile directory; works without Chrome running |
| --headed login | Fresh browser window, manual login, session saved |

### Output document format
| Option | Description |
|--------|-------------|
| Curated + evidence | Selector tables on top, raw snapshots at bottom as evidence trail |
| Curated only | Clean selector tables, no snapshot clutter |

## Decisions Made

### Execution approach
- **User chose:** Disposable script (recommended)
- Plan produces a capture script as its primary deliverable; script deleted after use

### Session bootstrap
- **User chose:** --auto-connect (recommended)
- Fallback: --profile documented in plan steps

### Output document format
- **User chose:** Curated + evidence (recommended)
- Curated section first, raw snapshot evidence section below

## Corrections Made

No corrections — all recommended options confirmed.

## Additional Analysis

**D-05 (added by Claude):** Explicitly decided NOT to use `--session-name` for exploration, to avoid creating persistent session state that interferes with Phase 1's auth validation. This is a downstream-protection decision not explicitly raised in discussion but important for plan quality.

**D-07/D-08 (added by Claude):** Confidence annotation levels and the requirement for a concrete example value for the message ID attribute — both derived from PKG-07 requirements and Phase 0 success criteria, not from discussion. Captured as locked decisions since they're directly stated in the roadmap.
