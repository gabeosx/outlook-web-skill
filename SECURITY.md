# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Current          |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private [Security Advisories](https://github.com/gabeosx/outlook-web-skill/security/advisories) instead:

1. Go to **Security → Advisories → Report a vulnerability**
2. Describe the issue with reproduction steps
3. I'll acknowledge within 72 hours and aim to publish a fix within 14 days for critical issues

## Security Design

This skill is read-only by design. The safety mechanisms are layered:

### 1. Action Policy (browser layer)

Every browser session runs with an action policy (`policy-*.json`) that sets `"default": "deny"` and explicitly allowlists only read operations. Write operations — clicking Send, filling compose fields, accepting/declining invitations — are blocked at the browser API level before any JavaScript reaches the page.

### 2. Prompt Length Cap

`copilot-summary --prompt` is capped at 2000 characters to limit the injection surface from crafted email or meeting content that a sender could use to influence the AI prompt.

### 3. Content Boundaries

All page-sourced output is wrapped in `AGENT_BROWSER_PAGE_CONTENT` markers via `AGENT_BROWSER_CONTENT_BOUNDARIES=1`. This helps downstream AI models distinguish tool output from untrusted page content.

### 4. No Credential Storage in Repo

Browser auth tokens (cookies, localStorage) live in `~/.agent-browser/sessions/` on the local machine. The `.env` file (containing your Outlook URL and browser path) is `.gitignore`'d and never committed.

### 5. CI Sensitive-Data Scan

A GitHub Actions workflow scans every push for personal email address patterns and tenant-specific URL patterns to prevent accidental exposure of private data in the public repo.

## Scope

**In scope for security reports:**
- Prompt injection via crafted email/meeting/Teams content reaching an AI prompt
- Action policy bypass that enables a write operation (send, delete, reply, accept)
- Session data exposure (cookies, auth tokens leaked to stdout or committed to repo)
- Dependency vulnerabilities in `agent-browser` or Node.js built-ins with a realistic attack path

**Out of scope:**
- Outlook web UI changes that break ARIA parsing (open a regular bug report)
- Rate limiting or throttling by Microsoft
- Security issues in `agent-browser` itself (report to that project)
