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

## Versioning and releases

Releases are fully automated via [Release Please](https://github.com/googleapis/release-please). You never need to run `git tag` or `gh release create` manually.

**How it works:**
1. Commits to `main` use [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `security:`, `chore:`, etc.
2. After each push to `main`, a "chore: release vX.Y.Z" PR is automatically opened or updated with a bumped `package.json` version and `CHANGELOG.md` entry.
3. Merging that PR creates the git tag and GitHub Release automatically.

**Semver impact by commit type:**

| Prefix | Version bump | In release notes |
|--------|-------------|-----------------|
| `feat:` | minor | yes |
| `fix:` | patch | yes |
| `security:` | patch | yes |
| `feat!:` or `BREAKING CHANGE:` footer | major | yes |
| `chore:`, `ci:`, `docs:`, `test:` | none | no |
