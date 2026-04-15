# Milestones

## v1.0 MVP (Shipped: 2026-04-15)

**Phases completed:** 7 phases (0–6), 16 plans
**Timeline:** 2026-04-10 → 2026-04-15 (5 days)
**Codebase:** ~3,355 lines JS (lib/ + outlook.js), 488 lines test, ~2,000 lines docs/references
**Commits:** 124

**Key accomplishments:**

- Live-captured ARIA selectors for all Outlook web UI areas — 77 confirmed-live annotations in references/outlook-ui.md
- Auth scaffold passes Entra Conditional Access (managed Chrome binary + `--session-name` persistence)
- `search` subcommand: KQL combobox automation with Exchange ConversationID extraction and scroll-accumulate
- `read` subcommand: reading pane body extraction with attachment ARIA parsing
- `digest` subcommand: inbox importance scoring (unread/sender/keyword signals), live-validated on 87-email inbox
- `tune` subcommand: externalised scoring weights to scoring.json with CLI calibration
- `calendar` subcommand: week-view event listing with D-07 schema, 56 unit tests on real ARIA strings
- `calendar-read` subcommand: popup card parser with `attendee_summary` + `--full` for individual attendees and reliable Teams join link
- `calendar-search` subcommand: combobox search workflow scoped to calendar view
- Full SKILL.md and reference library for calling agents (kql-syntax.md, error-recovery.md, digest-signals.md, calendar-events.md)

---
