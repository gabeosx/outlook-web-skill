# Phase 6: Add Outlook Calendar Capabilities - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-14
**Phase:** 06-add-outlook-calendar-capabilities-similar-to-the-current-mai
**Mode:** discuss (user-delegated)
**Areas analyzed:** ARIA exploration strategy, subcommand design, event data fields, time range, policy/safety, reference documentation

## Assumptions Presented

### ARIA Exploration
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Calendar ARIA was not explored in Phase 0 | Confident | `references/outlook-ui.md` is email-only |
| `button "Calendar"` exists in nav | Confident | Confirmed in `outlook-ui.md` snapshot — `button "Calendar" [ref=e18]` |
| Live exploration is required before coding | Confident | Phase 0 established this as mandatory; without verified ARIA, implementation stalls on selector guessing |

### Subcommand Design
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Three subcommands mirror email (calendar/calendar-read/calendar-search) | Confident | User confirmed "similar to mailbox capabilities"; search was reinstated after user challenge |
| `lib/calendar.js` module pattern matches `lib/digest.js` / `lib/search.js` | Confident | Established project pattern |
| Reuse `policy-search.json` | Confident | Phase 4 already reused it for digest; same action set required |

### Event Data Fields
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| JSON schema mirrors email envelope | Confident | OUT-01/02/03 requirements apply uniformly |
| `attendees` array only in calendar-read, not listing | Likely | Attendee list is expensive to extract from the list view; detail view makes more sense |
| `body_text` only in calendar-read | Likely | Same rationale as email: body not visible in list view |
| `meeting_link` extractable from body text | Likely | Teams invites embed the URL in the event body — confirmed from personal experience |

### Calendar Search
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Same combobox workflow as email search | Likely | Combobox aria-label: "Search for email, meetings, files and more." explicitly includes meetings |
| Calendar tab filter in suggestions listbox | Confirmed from snapshots | `button "Calendar"` appears as a tab in the search suggestions area |
| KQL operators overlap with email KQL | Likely | Outlook uses the same KQL engine for mail and calendar; date operators confirmed standard |

## Corrections Made

### calendar-search deferred → included
- **Original assumption:** `calendar-search` was deferred to a future phase (unknown ARIA risk)
- **User correction:** User challenged the deferral — "why would we skip search?"
- **Resolution:** Reinstated `calendar-search` using the same combobox workflow already implemented; the combobox explicitly mentions "meetings" and has a Calendar tab. The ARIA exploration pass (D-01) will verify the Calendar tab interaction pattern before implementation.

## External Research

No external research performed — codebase evidence was sufficient for all decisions.
