---
phase: 00-accessibility-research
reviewed: 2026-04-10T18:16:50Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - references/outlook-ui.md
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 00: Code Review Report

**Reviewed:** 2026-04-10T18:16:50Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

`references/outlook-ui.md` is a live-capture ARIA reference document for Outlook Web on the `myemail.accenture.com` tenant. The documentation structure is strong — curated tables with explicit confidence annotations, raw evidence captures, and correction notices. The principal concern is that the raw evidence sections contain real personal data (colleague names, email addresses, subject lines, search history, financial account activity notifications, and a live URL to a specific message). This data should not be committed to a git repository.

Beyond the security concern, there are four warning-level issues affecting implementation correctness: an incomplete accessible name format template (missing the `[Meeting ]` prefix), an ambiguous `--name` selector for the message list, overstatement of evidence coverage in the Search ribbon section, and a missing trailing-space annotation on the Copilot high-priority prefix. Four info-level gaps round out the review.

---

## Critical Issues

### CR-01: Personal data and real inbox content in committed reference file

**File:** `references/outlook-ui.md:255-453`

**Issue:** The raw evidence captures contain real personal data that should not live in a committed git repository:

- **Colleague names and email addresses** (lines 325-328): `Heather Kolovos heather.kolovos@okta.com`, `Shukla, Sanjeev sanjeev.shukla@accenture.com` — third-party individuals who did not consent to having their contact details committed to a repository.
- **Search history** (lines 323-328): `cigna`, `duke energy`, `Okta & Scylos` — reveals business relationships and vendor communications.
- **Email subjects with business context** (lines 263-288): `"RE: [External] Hitachi meeting"`, `"FW: Tech Capabilities - Cybersecurity Alliances"` — internal business communications.
- **Financial account activity** (lines 424, 434-448): `"Merrill Lynch Benefits Online A new confirmation has been posted to your account"` — reveals a financial services relationship and account activity.
- **Health-related communication** (lines 383-408): The GMHC HIV/AIDS fundraising email (sender name, job title, subject) is sensitive health-adjacent correspondence.
- **Internal access control disclosure** (lines 427-429): `"Gabe Albert has requested access to Power BI App ACC Security Business Metrics"` — reveals the account owner's full name and an internal security monitoring system.
- **Live direct-link URL to a specific email** (lines 108, 214, 372): `https://myemail.accenture.com/mail/id/AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA` — a valid reference to a real message in the user's live inbox.
- **Real Exchange ItemIDs** (lines 95-96, 298): The base64 item IDs (`AAkALgAAAAAAHYQD...`, `AQAAAAAJuqMCAAAIQYb16wAAAAA=`) are real identifiers for messages in the live mailbox.

**Fix:** Replace all raw captures containing real personal data with sanitized equivalents. Use placeholder values for names, email addresses, subjects, and IDs:

```markdown
- option "People Suggestion - Jane Doe jane.doe@example.com" [ref=e30]
- option "People Suggestion - Smith, John john.smith@example.com" [ref=e31]
```

For Exchange ItemIDs and URLs, replace with obviously synthetic examples:
```markdown
| Concrete example (decoded) | `AAkALgAAAAAAHYQDEXAMPLE_ITEM_ID_PLACEHOLDER` | confirmed-live |
```

For the raw captures in the Evidence section, either:
1. Remove the Evidence section entirely (the curated tables above are the authoritative reference), or
2. Scrub all names, email addresses, subject lines, search terms, and IDs before committing.

The curated reference tables already capture all structural patterns needed for skill implementation. The raw captures are supplementary context but not required for correctness.

---

## Warnings

### WR-01: Accessible name format template missing `[Meeting ]` prefix

**File:** `references/outlook-ui.md:77-85`

**Issue:** The inbox accessible name format template (line 78-79) is:
```
[Unread ][Important ]{sender} {subject} {time} {preview text} [No items selected]
```
The Unread and Flagged State Markers section (line 186) documents a `"Meeting "` prefix as `confirmed-live` for meeting/calendar items. The raw Capture 1 (line 277) shows an example:
```
"Unread Meeting Corporate Citizenship..."
```
This means a meeting invite can be both unread and a meeting: `"Unread Meeting ..."`. The template omits `[Meeting ]`, making it an incomplete parsing specification. Any skill parsing the accessible name to extract the sender will misparse meeting rows if it does not account for this prefix.

**Fix:** Update the inbox template to include the meeting prefix:
```
[Unread ][Important ][Meeting ]{sender} {subject} {time} {preview text} [No items selected]
```
Also verify whether `[Important ]` and `[Meeting ]` can co-occur (e.g., `"Unread Important Meeting ..."`) and whether the ordering is always `Unread > Important > Meeting > sender` or variable.

---

### WR-02: `--name "Message list"` selector is ambiguous — may not match no-selection state

**File:** `references/outlook-ui.md:51-53`

**Issue:** The scoped snapshot command documented is:
```bash
agent-browser find role listbox --name "Message list"
```
The accessible name of the message list alternates between `"Message list No items selected"` (when nothing is selected) and `"Message list"` (when a message is selected). The `--name` flag behavior in `agent-browser` is not documented in this file as exact-match or prefix/substring. If it requires an exact match, this command would fail in the no-selection state (which is the state when a skill first opens the inbox). This would cause intermittent failures in skill implementations that rely on this scoped snapshot before selecting any message.

**Fix:** Confirm the `--name` matching behavior from the agent-browser skill documentation. If it is exact-match, use the more robust form and document both variants:
```bash
# When no message is selected (default inbox state):
agent-browser find role listbox --name "Message list No items selected"

# When a message is selected:
agent-browser find role listbox --name "Message list"
```
If agent-browser supports partial/prefix matching, document that explicitly so implementers know `"Message list"` is a safe prefix.

---

### WR-03: Search ribbon evidence overclaims capture 8 coverage

**File:** `references/outlook-ui.md:34`

**Issue:** The Search ribbon tab section states the six filter buttons (`"Has attachments"`, `"Unread"`, `"Mentions me"`, `"Flagged"`, `"High importance"`, `"To me"`) are "confirmed-live in captures 6, 7, 8". The raw output of Capture 8 (lines 419-421) only shows:
```
- tab "Search" [selected, ref=e60]
- button "Has attachments" [ref=e148]
```
No other filter buttons appear in the Capture 8 raw excerpt. The other five buttons are confirmed by Capture 6 (lines 341-347, all six listed) but Capture 8's trimmed output does not show them. Citing Capture 8 as evidence for all six buttons is an overstatement based on the available raw evidence.

**Fix:** Correct the evidence citation to reference only Capture 6 (and 7 if applicable) for the full button set:
```
(all confirmed-live in capture 6)
```
Or add a note that Capture 8 was trimmed and the full ribbon was not included in the raw output.

---

### WR-04: Copilot high-priority prefix trailing space not annotated

**File:** `references/outlook-ui.md:67,185`

**Issue:** The `"Marked as high priority by Copilot"` prefix is documented in two places (lines 67 and 185) but neither entry notes whether this prefix includes a trailing space separator before the sender name — unlike `"Unread "` (line 64) and `"Important "` (line 66) which explicitly include trailing spaces in their documented values. Parsing code that strips known prefixes from the accessible name will produce incorrect sender extraction if the trailing space assumption is wrong for this prefix.

**Fix:** Add a trailing-space annotation to the Copilot prefix entry, or add an explicit note:
```markdown
| Copilot high priority prefix | `"Marked as high priority by Copilot "` (with trailing space — unverified, inferred from pattern) | inferred |
```
This is especially important because this prefix is longer than the others and a missing space would be harder to detect visually during code review.

---

## Info

### IN-01: No section for authentication state detection

**File:** `references/outlook-ui.md` (missing section)

**Issue:** The reference documents the authenticated inbox UI extensively but contains no section describing how to detect the unauthenticated state — i.e., what ARIA elements or URL patterns indicate that the session has expired or the browser has been redirected to a login page. The CLAUDE.md constraint explicitly requires auth session survival across invocations. Any skill that cannot detect auth failure will produce confusing errors (trying to interact with a login form as if it were the inbox).

**Fix:** Add an Authentication State section documenting:
- The URL pattern for the Microsoft/Entra login redirect (e.g., `login.microsoftonline.com` or `login.windows.net`)
- Any ARIA landmark that signals the login page vs. the inbox (e.g., presence/absence of `listbox "Message list"`)
- The recommended detection check at skill startup: verify current URL or presence of the combobox before proceeding

---

### IN-02: No documentation for scroll/pagination to load additional messages

**File:** `references/outlook-ui.md:47`

**Issue:** Line 47 documents that only ~12-20 messages are rendered at a time due to virtual DOM scrolling, but there is no workflow documented for loading additional messages. Any skill that needs to list or search more than ~20 messages will need to scroll the message list, and the ARIA interaction pattern for this (e.g., `agent-browser scroll`, `agent-browser press ArrowDown`) has not been captured.

**Fix:** Add a "Loading More Messages" subsection under the Message List Container section documenting the scroll interaction pattern, or add an unresolved annotation noting this requires a separate capture.

---

### IN-03: No documentation for zero-results or empty-folder ARIA states

**File:** `references/outlook-ui.md` (missing coverage)

**Issue:** The reference documents the normal message list state and search results state, but does not document what the ARIA tree looks like when a search returns zero results or when the inbox is empty. Skill code that parses the message list will need to handle the empty state without throwing an error.

**Fix:** Add an "Empty States" subsection (or unresolved annotation) covering:
- What appears in `listbox "Message list"` when a search finds no matches
- Whether a "No results" heading or similar element appears
- Whether the `listbox` is absent entirely or present but empty

---

### IN-04: Folder navigation patterns absent despite treeitem data being available

**File:** `references/outlook-ui.md:268-270`

**Issue:** The raw Capture 1 shows treeitem ARIA structure for Inbox, Drafts, and Sent Items (lines 268-270) but no curated section documents how to navigate to a specific folder. The `treeitem "Inbox selected 463 unread"` pattern shows the accessible name format includes unread counts and selection state, but there is no workflow for clicking a folder treeitem or verifying navigation succeeded.

**Fix:** Add a "Folder Navigation" section (or an unresolved annotation) documenting:
- The treeitem accessible name format: `"{folder name}[ selected][ N unread][ N items]"`
- The command to navigate: `agent-browser find role treeitem click --name "Sent Items"`
- How to verify navigation succeeded (URL change, or heading change to `heading "Sent Items Favorite folder"`)

---

_Reviewed: 2026-04-10T18:16:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
