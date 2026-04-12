# KQL Syntax Reference for Outlook Web

These operators have been tested against this specific Outlook deployment and confirmed working. Operators labelled "Unverified" follow standard KQL logic but have not been live-tested against this tenant.

## Tested Operators

All 7 operators below are confirmed working on this deployment.

| Operator | Syntax | Example | Notes |
|----------|--------|---------|-------|
| Sender address | `from:<address>` | `from:alice@example.com` | Matches sender email address |
| Subject | `subject:<word>` | `subject:budget` | Matches words in subject line; use quotes for phrases: `subject:"Q1 budget"` |
| Has attachment | `has:attachment` | `has:attachment` | Boolean — no value needed |
| Unread | `is:unread` | `is:unread` | Boolean — matches unread messages only |
| Flagged | `is:flagged` | `is:flagged` | Boolean — matches flagged messages only |
| Before date | `before:<date>` | `before:2024-01-01` | Date format: YYYY-MM-DD (see Date Format section) |
| After date | `after:<date>` | `after:2024-01-01` | Date format: YYYY-MM-DD (see Date Format section) |

Each operator as a standalone query string to pass to the `search` subcommand:

```bash
node outlook.js search "from:alice@example.com"
node outlook.js search "subject:budget"
node outlook.js search "has:attachment"
node outlook.js search "is:unread"
node outlook.js search "is:flagged"
node outlook.js search "before:2024-01-01"
node outlook.js search "after:2024-01-01"
```

## Free-Text Search

No operator prefix — just keywords. Outlook searches the subject line and email body. This is the most natural-language-friendly pattern and works well for topic-based searches when you don't know the sender address or exact subject wording.

```bash
node outlook.js search "budget review"
node outlook.js search "project kickoff next week"
node outlook.js search "annual performance review"
```

## Date Format

`before:` and `after:` accept ISO 8601 format: `YYYY-MM-DD`.

Example: `before:2024-01-01` matches emails received before January 1, 2024.

Other formats (MM/DD/YYYY, human date strings like "last week") are **Unverified — not tested against this deployment**. Use `YYYY-MM-DD` exclusively.

## Combining Operators

**Unverified — not tested against this deployment.** Standard KQL logic applies but these combinations have not been live-tested against this tenant. Individual operators (listed above) are confirmed working; compound queries are assumed to follow standard KQL rules.

```bash
# Unverified — space-separated terms are implicitly AND
node outlook.js search "from:alice@example.com subject:budget"

# Unverified — multiple boolean filters
node outlook.js search "is:unread has:attachment"

# Unverified — NOT operator (excludes matching emails)
node outlook.js search "is:unread NOT from:noreply@example.com"

# Unverified — OR operator (must be uppercase)
node outlook.js search "from:alice@example.com OR from:bob@example.com"
```

If a compound query returns no results but you expect some, try simplifying to a single operator to confirm which part may not work on this tenant. For example, test `from:alice@example.com` alone before combining with `is:unread`.

## Practical Examples

Common real-world patterns the calling agent will frequently need:

```bash
# All unread emails
node outlook.js search "is:unread"

# Emails with attachments
node outlook.js search "has:attachment"

# Emails from a specific person (Unverified combination with is:unread)
node outlook.js search "from:alice@example.com is:unread"

# Emails with attachments received after a date (Unverified combination)
node outlook.js search "has:attachment after:2024-01-01"

# Find emails about a specific project (free-text)
node outlook.js search "project alpha"

# All flagged emails
node outlook.js search "is:flagged"

# Emails about budget from a specific person (Unverified combination)
node outlook.js search "from:alice@example.com subject:budget"
```
