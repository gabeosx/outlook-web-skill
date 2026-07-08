# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-07-08

### Added
- `teams` subcommand — read Teams activity feed, @mentions, and unread chats from the Teams web UI
- `copilot-summary` subcommand — get AI-generated summaries of emails and Teams messages via Copilot in Teams

### Fixed
- `calendar-search` incorrectly returned mini-calendar date picker buttons (e.g. "28, June, 2026") as search results; results are now filtered to entries with a parseable `start_time`
- `calendar --days N` only returned today's events because Outlook opens in Day view; skill now navigates to Week view (`/calendar/view/week`) so all 7 days render in the ARIA tree, and advances week-by-week for `--days > 7`
- Spawn failure detection was silently swallowed in two of three `agent-browser` invocation paths, causing empty results when the binary was unavailable; all three paths now surface the error
- `teams` navigation and action policy failures encountered during production testing

### Security
- `copilot-summary --prompt` is now capped at 2000 characters to limit the injection surface from crafted email or meeting content reaching the AI prompt
- Added CI workflow (`sensitive-data-scan.yml`) that blocks pushes containing personal email addresses or tenant-specific URL patterns

## [1.1.0] - 2026-04-15

### Added
- `--folder` flag for `search` — navigate to a named folder (Inbox, Sent Items, Drafts, Junk, Archive, etc.) before executing a search
- `--folder` flag for `digest` — same folder navigation for prioritized digest
- Junk E-mail folder alias support (accepts "Junk", "Junk Email", and "Junk E-mail")
- `lib/folder.js` — shared folder name normalization and treeitem click logic

### Fixed
- Folder navigation blocked by an Office add-in dialog that Outlook shows on cold start; replaced `click`-based dismiss with a DOM `eval` for reliable dismissal across Outlook versions

## [1.0.0] - 2026-04-15

### Added
- Initial release — read-only Outlook web access via a managed Chrome session (no Microsoft Graph API, no app registration)
- `auth` — first-time browser authentication; persists Entra SSO session to `~/.agent-browser/sessions/`
- `search` — KQL keyword search across inbox and folders (sender, subject, date range, `hasattachment:yes`, `is:unread`, `is:flagged`)
- `read` — read full email body, recipients, CC, date, and metadata by message ID
- `digest` — prioritized inbox digest sorted by configurable importance score
- `tune` — recalibrate digest scoring from AI feedback without restarting
- `calendar` — list upcoming events with `--days` window (default: 7 days), full D-07 schema
- `calendar-read` — fetch event detail including attendees and Teams/Zoom join links; `--full` flag for reliable meeting link extraction
- `calendar-search` — search calendar events by keyword or date range
- Action policy enforcement (`default: deny`) at the browser layer — write operations are blocked at the browser level, not just by convention
- Full `SKILL.md` reference and `references/` documentation library for calling agents

[Unreleased]: https://github.com/gabeosx/outlook-web-skill/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/gabeosx/outlook-web-skill/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gabeosx/outlook-web-skill/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gabeosx/outlook-web-skill/releases/tag/v1.0.0
