# Contributing

## Bug Reports

Use the **Bug Report** issue template. Please include:

- Your `node --version` and `agent-browser --version`
- The subcommand and exact arguments (e.g. `node outlook.js calendar --days 14`)
- The JSON output — redact any personal content (email subjects, sender names, meeting titles, tenant URLs)
- stderr output: run with `OUTLOOK_DEBUG=1 node outlook.js <subcommand>` to capture diagnostic logs

**Do not paste raw email body text, calendar event subjects, or anything that could identify you or your employer.**

## Pull Requests

- One logical change per PR
- New subcommands require: implementation in `lib/`, dispatch in `outlook.js`, a section in `SKILL.md`, a section in `README.md`, and tests in `test/`
- The sensitive-data CI scan will block merges that contain personal email patterns or tenant-specific URLs — see `.github/workflows/sensitive-data-scan.yml` for what is checked
- Never commit `.env`, `scoring.json`, `references/outlook-ui.md`, or `snapshot.txt` — all are in `.gitignore`

## Development Setup

```bash
git clone https://github.com/gabeosx/outlook-web-skill
cd outlook-web-skill
cp .env.example .env        # fill in your OUTLOOK_BASE_URL and OUTLOOK_BROWSER_PATH
node outlook.js auth        # opens a headed browser; log in; session saved automatically
node outlook.js search "test"   # verify the session works
```

Run the unit tests (no browser required):

```bash
node --test test/*.test.js
```

Tests cover the pure-JS parsing logic (calendar event names, email row parsing, folder normalization, etc.) and do not require a live Outlook session.

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **Patch** (`x.y.Z`) — bug fixes that don't change the JSON output schema
- **Minor** (`x.Y.0`) — new subcommands or new fields added to existing schemas (backwards-compatible)
- **Major** (`X.0.0`) — breaking changes to the JSON output schema or subcommand interface

Each release gets a git tag and a GitHub Release with release notes drawn from `CHANGELOG.md`.
