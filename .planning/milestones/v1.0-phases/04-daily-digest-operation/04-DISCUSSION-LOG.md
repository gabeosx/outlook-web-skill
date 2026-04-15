# Phase 4: Daily Digest Operation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-11
**Phase:** 04-daily-digest-operation
**Mode:** discuss (gray-area identification with one user question)
**Areas analyzed:** Inbox Fetch Strategy, is_flagged Detection, Scroll-Accumulate, Importance Scoring Model

---

## Gray Areas Identified

### Inbox Fetch Strategy
| Gray Area | Claude's Analysis | Decision |
|-----------|-------------------|----------|
| KQL vs. inbox navigation | KQL `after:today` has uncertain syntax; KQL search crosses folder boundaries; inbox direct navigation correctly scopes to Inbox and uses the "Today" group header as a natural date filter | Direct inbox navigation (`/mail/inbox`) |
| KQL date construction | `after:YYYY-MM-DD` dynamic construction is technically feasible | Decided against — inbox nav is simpler and more accurate |

### Scroll-Accumulate
| Gray Area | Claude's Analysis | Decision |
|-----------|-------------------|----------|
| Phase 2 removed scroll from search | Inbox scroll behavior may differ from search-results scroll; implement optimistically | Implement scroll-accumulate for inbox; live test will validate |
| Stop criteria | Two consecutive empty scrolls OR non-Today group header appears | Decided |

### is_flagged Detection
| Gray Area | Claude's Analysis | Decision Made by User |
|-----------|-------------------|-----------------------|
| Second KQL batch vs. null | Running `is:flagged` search adds one browser batch to cross-reference flagged status; useful scoring signal | **User chose: null (simpler)** |

### Importance Scoring Model
| Gray Area | Claude's Analysis | Decision |
|-----------|-------------------|----------|
| Weights with 3 signals (flagged dropped) | Rescale to 0-100: unread +40, high-importance +40, urgency keywords +5 each capped at +20 | Decided by Claude |
| Urgency keywords list | 12 keywords covering common urgency language | Decided by Claude |

---

## User Interactions

**Question asked:** "DIGT-03 requires `is_flagged` in each result, and DIGT-02 uses it as a scoring signal. But search snapshots can't detect flag state passively — accept null everywhere, or run a second KQL batch (`is:flagged`) to cross-reference?"

**User response:** "Accept null — simpler"

**All other decisions:** Determined by codebase analysis without additional user questions.

---

## Corrections Made

**is_flagged model**: Simplified scoring model from 4 signals to 3 (dropped flagged). Rescaled weights:
- Original (with flagged): unread +20, flagged +30, high-importance +25, keywords +25
- Final (flagged dropped): unread +40, high-importance +40, keywords +5 each capped at +20

---

## No External Research Performed

Codebase analysis (prior CONTEXT.md files, references/outlook-ui.md, lib/search.js, lib/read.js) provided sufficient evidence for all decisions.
