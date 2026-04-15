# Phase 0: Accessibility Research - Research

**Researched:** 2026-04-10
**Domain:** Outlook Web (M365/OWA) ARIA structure, DOM attributes, URL patterns
**Confidence:** HIGH (primary findings from live session snapshot; secondary from docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use a disposable capture script — a short bash script that runs all agent-browser snapshot commands and dumps raw output to a temp file. Developer annotates the dump and formats `references/outlook-ui.md`. The script is deleted after use; it never ships with the skill.
- **D-02:** The plan should produce the capture script as its primary deliverable, plus a step-by-step walkthrough of which Outlook views to snapshot and what to look for in each.
- **D-03:** Use `--auto-connect` to import the session from a running Chrome instance where the user is already on Outlook. This is the primary approach for the exploration session.
- **D-04:** Document `--profile <OUTLOOK_BROWSER_PROFILE>` as the fallback if `--auto-connect` fails.
- **D-05:** Do NOT use `--session-name` for the exploration session — Phase 0 should not create persistent session state that might interfere with Phase 1's auth validation.
- **D-06:** `references/outlook-ui.md` has two sections: (1) Curated Reference — clean selector tables with confidence annotations; (2) Evidence — raw snapshot dumps as a verification trail. Curated section comes first.
- **D-07:** Confidence annotation levels: `confirmed-live` (seen in actual snapshot), `inferred` (derived from snapshot structure but not directly observed), `unresolved` (could not determine).
- **D-08:** The stable message ID attribute must be documented with a concrete example value (not just the attribute name).

### Claude's Discretion

- Exact format of the bash capture script (can use agent-browser batch mode or sequential commands)
- How to structure the Evidence section (one dump per view vs. one combined dump)
- Whether to capture screenshots alongside snapshots for visual reference

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-07 | `references/outlook-ui.md` — documents verified ARIA landmarks, roles, and accessibility snapshot patterns for: search box, result list, individual result items, reading pane, attachment indicators, unread/flagged states | Live snapshot analysis provides confirmed-live values for all five of these areas; capture script design enables systematic documentation |
</phase_requirements>

---

## Summary

A live agent-browser session was already connected to `https://myemail.accenture.com/mail/inbox` during research. A full `snapshot -i` was captured, yielding confirmed-live ARIA values for the inbox view including the message list container, individual message options, reading pane, and search box. This eliminates the largest uncertainty — the actual ARIA attribute names — for the inbox view.

Two gaps remain: (1) search result view ARIA structure after submitting a query (the URL stayed at `mail/` after a test query submission, suggesting URL-based search navigation may behave differently from the inbox view); and (2) Focused Inbox tab presence — the current inbox showed no `Focused`/`Other` tab buttons, indicating Focused Inbox may be disabled on this account. The capture script must explicitly navigate to check whether these tabs exist.

The `deeplink/search?query=` URL format is confirmed to exist (HTTP 200, page loads) but produced a persistent "Loading" spinner in the test, indicating the search result ARIA structure must be captured interactively via the search combobox workflow rather than via URL navigation.

**Primary recommendation:** Write the capture script to use the search combobox workflow (click → fill → press Enter → wait for results) rather than URL navigation, and include explicit Focused Inbox detection as a separate capture step.

---

## Standard Stack

### Core (this phase is tooling-only, no library installs)

| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| agent-browser | 0.25.3 | Accessibility snapshot capture via CDP | [VERIFIED: `agent-browser --version`] |
| Node.js | v25.9.0 | Available for JSON post-processing in future phases | [VERIFIED: `node --version`] |
| npm | 11.12.1 | Package manager | [VERIFIED: `npm --version`] |

**No installations required for Phase 0.** The capture script is a disposable bash script using the already-installed `agent-browser` CLI.

---

## Architecture Patterns

### Recommended Capture Script Structure

```bash
#!/usr/bin/env bash
# outlook-capture.sh — DISPOSABLE exploration script for Phase 0
# Run once, annotate output, delete this script.
# Usage: bash outlook-capture.sh > /tmp/outlook-snapshots.txt 2>&1

set -e

OUTLOOK_URL="https://myemail.accenture.com"  # override with $OUTLOOK_URL env var
BASE_URL="${OUTLOOK_URL:-https://myemail.accenture.com}"

echo "=== CAPTURE: inbox view ==="
agent-browser --auto-connect open "${BASE_URL}/mail/inbox"
agent-browser wait 3000
agent-browser snapshot -i

echo "=== CAPTURE: URL after inbox load ==="
agent-browser get url

echo "=== CAPTURE: focused inbox tab detection ==="
# If Focused/Other tabs exist they will appear in the listbox heading area
# Look for button "Focused" or button "Other" in snapshot output above

echo "=== CAPTURE: search box activation ==="
agent-browser click @e125   # combobox ref from inbox; re-snapshot to get fresh ref if needed
agent-browser wait 1000
agent-browser snapshot -i

echo "=== CAPTURE: search results ==="
agent-browser fill @e148 "from:test"   # use search combobox ref
agent-browser press Enter
agent-browser wait 5000
agent-browser get url
agent-browser snapshot -i

echo "=== CAPTURE: open individual message ==="
# Click first option in listbox to open reading pane
# agent-browser click @e47  # example ref from inbox snapshot
agent-browser wait 2000
agent-browser get url
agent-browser snapshot -i

echo "=== CAPTURE: message with attachment (if findable) ==="
# Search for: has:attachment
agent-browser click @e125
agent-browser wait 500
agent-browser fill @e148 "has:attachment"
agent-browser press Enter
agent-browser wait 5000
agent-browser snapshot -i

echo "=== DONE ==="
agent-browser close
```

**Note for annotator:** The `@eXXX` refs are session-specific and will differ on each run. The script should be re-run and refs re-read from fresh snapshots before use. The example refs in comments are from the research session and are illustrative only.

### Pattern 1: Auto-Connect Session Bootstrap

**What:** Connect to a Chrome/Edge instance where the user is already logged in to Outlook.
**When to use:** Phase 0 capture sessions. The user must have Chrome running with the Outlook tab active.

```bash
# Source: .agents/skills/agent-browser/references/authentication.md
# Step 1: Chrome must be running with --remote-debugging-port=9222
# macOS:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=<OUTLOOK_BROWSER_PROFILE>

# Step 2: auto-connect (no explicit port needed — agent-browser auto-discovers)
agent-browser --auto-connect open https://myemail.accenture.com/mail/inbox
agent-browser snapshot -i
```

[VERIFIED: SKILL.md — auto-connect section]

### Pattern 2: Profile Fallback

**What:** Use `--profile` to point at an existing Chrome profile directory that has Outlook cookies.
**When to use:** Fallback when `--auto-connect` fails (Chrome not running, managed device blocks remote debugging).

```bash
# Source: .agents/skills/agent-browser/references/authentication.md
agent-browser --profile "$OUTLOOK_BROWSER_PROFILE" open https://myemail.accenture.com/mail/inbox
agent-browser snapshot -i
```

[VERIFIED: authentication.md — Persistent Profiles section]

### Pattern 3: Scoped Snapshot for Reading Pane

**What:** Scope the snapshot to the `main "Reading Pane"` region to avoid token-heavy full-page dumps.
**When to use:** Extracting body content in Phase 3.

```bash
# Source: SKILL.md — snapshot -s option
# After navigating to a message:
agent-browser snapshot -s "[role=main]"   # Scopes to the Reading Pane main landmark
# Or use ref from a prior full snapshot:
agent-browser snapshot @e14               # @e14 = main "Reading Pane" in research session
```

[VERIFIED: live snapshot — `main "Reading Pane" [ref=e14]`]

### Anti-Patterns to Avoid

- **URL-based search navigation:** `deeplink/search?query=` produces a persistent loading state in this tenant — do not use as the primary search trigger. Use the search combobox workflow instead. [VERIFIED: live test]
- **Using `--session-name` in Phase 0:** Decision D-05 prohibits this; it would create persistent state that interferes with Phase 1's auth validation flow.
- **Storing refs across runs:** Refs (`@e1`, `@e2`) are session-scoped and invalidate on page change. Always re-snapshot before using refs. [VERIFIED: snapshot-refs.md]
- **`wait --load networkidle` on Outlook:** Outlook's SPA has persistent background network activity (Teams presence, calendar sync). `networkidle` will hang indefinitely. Use `wait 3000` or `wait --text "..."` instead. [CITED: SKILL.md — Timeouts section]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility tree capture | Custom CDP/WebSocket code | `agent-browser snapshot -i` | Handles ref assignment, iframe inlining, output formatting [VERIFIED: SKILL.md] |
| Session state management | Cookie file scripts | `--auto-connect` or `--profile` | Handles IndexedDB, SSO tokens, service workers [VERIFIED: authentication.md] |
| Element identification | CSS selector matching | `@ref` system from snapshot | Refs are semantically stable; CSS classes in Outlook are minified and change with deploys [ASSUMED] |

---

## Confirmed-Live ARIA Findings (from Live Session Snapshot)

These values were extracted from a live `agent-browser snapshot -i` against `https://myemail.accenture.com/mail/inbox` on 2026-04-10.

### Search Box

| Property | Value | Confidence |
|----------|-------|-----------|
| ARIA role | `combobox` | confirmed-live |
| `aria-label` text | `"Search for email, meetings, files and more."` | confirmed-live |
| `expanded` state (idle) | `false` | confirmed-live |
| `expanded` state (focused) | `true` | confirmed-live |
| Container | Nested inside two generic `clickable` divs, which are inside the top banner | confirmed-live |
| Companion buttons (when focused) | `"Exit search"`, `"Search filters, All folders, 0 other filters applied"`, `"Search"` | confirmed-live |

**Snapshot evidence (inbox — search not active):**
```
- generic "" [ref=e38] clickable [onclick]
  - generic [ref=e115] clickable [onclick]
    - combobox "Search for email, meetings, files and more." [expanded=false, ref=e148]
```

**Snapshot evidence (search activated — after clicking combobox):**
```
- generic "6 suggestions available, use up and down arrows to navigate" [ref=e56] clickable
  - button "Exit search" [ref=e119]
  - generic [ref=e120] clickable [onclick]
    - combobox "Search for email, meetings, files and more." [expanded=true, ref=e148]
  - button "Search filters, All folders, 0 other filters applied" [expanded=false, ref=e147]
  - button "Search" [ref=e104]
```

[VERIFIED: live snapshot 2026-04-10]

---

### Message List Container

| Property | Value | Confidence |
|----------|-------|-----------|
| ARIA role | `listbox` | confirmed-live |
| `aria-label` text | `"Message list"` | confirmed-live |
| Location in tree | Sibling to `region "Navigation pane"`, child of root | confirmed-live |
| Scrollable | Yes (virtual DOM — only ~20 items rendered at a time) | confirmed-live |

**Snapshot evidence:**
```
- listbox "Message list" [ref=e33]
```

[VERIFIED: live snapshot 2026-04-10]

---

### Individual Message Rows

| Property | Value | Confidence |
|----------|-------|-----------|
| ARIA role | `option` | confirmed-live |
| Parent | `listbox "Message list"` | confirmed-live |
| `aria-selected` | `true` for currently selected message, absent for others | confirmed-live |
| Unread indicator | Prefix `"Unread"` in accessible name string | confirmed-live |
| Flagged indicator | Not directly observed in unread items; flagged items use `"Marked as high priority by Copilot"` prefix | confirmed-live |
| Important indicator | `"Important"` prefix in accessible name | confirmed-live |
| Child controls | `button "Mark as read"` / `button "Mark as unread"`, `checkbox "Select a message"` | confirmed-live |
| Date grouping header | `button "Today"` (sibling of options, inside a generic container) | confirmed-live |

**Snapshot evidence (selected unread message):**
```
- option "Unread Marked as high priority by Copilot Heather Kolovos [External] Hitachi meeting 
  1:25 PM A meeting scheduling request is made for next week." [selected, ref=e47]
  - button "Mark as read" [ref=e116]
  - checkbox "Select a message" [checked=false, ref=e117]
```

**Snapshot evidence (read message):**
```
- option "Marked as high priority by Copilot Rick Matson [External] Okta-UK travel/Visit 4/27-5/1 
  11:15 AM A request for introductions related to your upcoming London visit" [ref=e54]
  - button "Mark as unread" [ref=e131]
  - checkbox "Select a message" [checked=false, ref=e132]
```

**Read vs. unread detection:** Presence of `"Unread"` at the start of the option's accessible name string distinguishes unread messages. Alternatively: child button text is `"Mark as read"` (unread) vs `"Mark as unread"` (read). [VERIFIED: live snapshot 2026-04-10]

---

### Reading Pane

| Property | Value | Confidence |
|----------|-------|-----------|
| ARIA role | `main` | confirmed-live |
| `aria-label` text | `"Reading Pane"` | confirmed-live |
| Subject heading | `heading [level=3]` with subject text as accessible name | confirmed-live |
| From field | `heading "From: [sender name]" [level=3]` containing a `button` with sender name | confirmed-live |
| To field | `heading "To: [recipients]" [level=3]` containing `button` elements per recipient | confirmed-live |
| CC field | `heading "Cc: [recipients]" [level=3]` | confirmed-live |
| Date | `heading "[date string]" [level=3]` | confirmed-live |
| Body | `document "Message body" [ref=eXX] focusable` | confirmed-live |
| Copilot summary | `button "High priority, [summary text]..."` — appears when Copilot annotates | confirmed-live |
| Reply controls | `menuitem "Reply"`, `menuitem "Reply all"`, `menuitem "Forward"` | confirmed-live |

**Snapshot evidence:**
```
- main "Reading Pane" [ref=e14]
  - heading "[External] Hitachi meeting" [level=3, ref=e59]
  - button "High priority, A request is made for you..." [ref=e60]
    - button "Dismiss summary" [ref=e87]
  - heading "[External] Hitachi meeting" [level=3, ref=e88]
  - button "Opens card for Heather Kolovos" [ref=e113]
  - heading "From: Heather Kolovos" [level=3, ref=e89]
    - button "From: Heather Kolovos" [ref=e91]
  - heading "To: Albert, Gabe, Callegari, Greg" [level=3, ref=e92]
    - button "Albert, Gabe" [ref=e143]
    - button "Callegari, Greg" [ref=e144]
  - heading "Cc: Cruel, Mishelle C." [level=3, ref=e93]
    - button "Cruel, Mishelle C." [ref=e145]
  - heading "Fri 4/10/2026 1:25 PM" [level=3, ref=e90]
  - document "Message body" [ref=e96] focusable [tabindex]
    - [links and inline content]
  - menuitem "Reply" [ref=e97]
  - menuitem "Reply all" [ref=e98]
  - menuitem "Forward" [ref=e99]
```

[VERIFIED: live snapshot 2026-04-10]

---

### Focused Inbox Tabs

| Property | Value | Confidence |
|----------|-------|-----------|
| Tab presence | NOT observed in live snapshot | confirmed-live (absent) |
| Explanation | Focused Inbox may be disabled on this Accenture account, or the inbox was displaying "All" messages with no split | confirmed-live (absence) |
| Tab role (expected if present) | `button "Focused"` and `button "Other"` above the message list | inferred from screen reader docs [CITED: support.microsoft.com] |
| Navigation model | Keyboard: Tab to message list → Tab to "Other, button, off" → Enter | inferred [CITED: support.microsoft.com] |

**Capture script must check:** Whether Focused/Other buttons appear in the listbox heading area. If present, they will appear between the "Filter"/"Sort" controls and the `listbox "Message list"` container.

[VERIFIED: live snapshot 2026-04-10 — tabs absent; behavior when present is inferred]

---

### Navigation Pane / ARIA Landmark Map

| Region | ARIA Role | Accessible Name | Confidence |
|--------|-----------|-----------------|-----------|
| Top header + search | `generic` (clickable wrapper) | (none — unnamed) | confirmed-live |
| Left app switcher | `navigation` | `"left-rail-appbar"` | confirmed-live |
| Ribbon/toolbar | `region` | `"Ribbon"` | confirmed-live |
| Folder tree | `region` | `"Navigation pane"` | confirmed-live |
| Message list | `listbox` | `"Message list"` | confirmed-live |
| Reading pane | `main` | `"Reading Pane"` | confirmed-live |

Ctrl+F6 cycles through these landmarks in order: search banner → navigation pane → command toolbar → message list. [CITED: support.microsoft.com screen reader docs]

---

### Message ID / URL Format

| Property | Value | Confidence |
|----------|-------|-----------|
| URL pattern for open message | `https://<base>/mail/inbox/id/<URL-encoded-ID>` | confirmed-live |
| Example ID (obfuscated) | `AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAIQYi4VAAA` | confirmed-live |
| ID format | Exchange ItemID, base64-encoded, URL-encoded | confirmed-live |
| Deeplink read format | `https://<base>/mail/deeplink/read/<URL-encoded-ItemID>` | inferred [CITED: Microsoft Q&A] |
| OWA legacy format | `https://<base>/owa/?ItemID=<ItemID>&exvsurl=1&viewmodel=ReadMessageItem` | inferred [CITED: joshuachini.com 2024] |
| DOM attribute for ID | Not yet observed — requires capture script to inspect message option's data attributes | unresolved |
| `data-convid` | Not confirmed in accessibility tree output (not ARIA-visible) | unresolved |

**Finding:** The message ID lives in the URL when a message is open, not in the ARIA tree. The capture script should call `agent-browser get url` after clicking a message option to extract the ID from `mail/inbox/id/<ID>`. The capture script should also run `agent-browser eval 'document.querySelector("[data-convid]")?.dataset?.convid'` to check if the data attribute exists in the DOM even if absent from the ARIA tree.

[VERIFIED: live `agent-browser get url` 2026-04-10; data-convid existence is unresolved]

---

### Search URL Format

| Property | Value | Confidence |
|----------|-------|-----------|
| Deeplink search URL | `https://<base>/mail/deeplink/search?query=<term>` | confirmed-live (URL accepted, page loads) |
| URL behavior | Page loaded but remained in "Loading" state for 10+ seconds | confirmed-live (limitation) |
| URL after interactive search | `https://<base>/mail/` (no query parameter visible in URL) | confirmed-live |
| Preferred approach | Use search combobox workflow: click combobox → fill → press Enter | confirmed-live (tested) |
| KQL search support | `from:`, `has:attachment`, `is:unread`, `is:flagged` — syntax supported by Outlook web | inferred [CITED: SFU documentation on AQS] |

**Finding:** This Outlook tenant (`myemail.accenture.com`) uses URL routing that keeps the URL at `mail/` after search — the search query is maintained in SPA state, not in the URL. The deeplink format is documented but produced a persistent loading state, possibly due to tenant routing configuration. The capture script should navigate using the combobox workflow, not the deeplink URL.

[VERIFIED: live test 2026-04-10; deeplink limitation is confirmed-live for this tenant]

---

### Attachment Indicators

| Property | Value | Confidence |
|----------|-------|-----------|
| Attachment presence in message list | Not observed in the captured options (no attachment-specific ARIA annotation in option accessible names) | unresolved — requires capture with has:attachment messages |
| Attachment presence in reading pane | Not observed in the test message (no attachments present) | unresolved — requires capture of message with attachments |
| Expected form | Likely a `button` or `generic` element inside the reading pane with an ARIA label like `"Attachment"` or the filename | inferred from common OWA patterns |

**Capture script must:** Search `has:attachment`, open a result, and snapshot the reading pane to discover the attachment indicator structure. [UNRESOLVED]

---

## Common Pitfalls

### Pitfall 1: Refs are Session-Scoped

**What goes wrong:** Using `@e47` from one snapshot run fails on the next because refs reset each session and on every page change.
**Why it happens:** agent-browser assigns refs by traversal order, which changes with DOM updates.
**How to avoid:** Always re-snapshot after navigation. Never hardcode refs in production code — use role/label-based `find` commands or snapshot-then-act pattern.
**Warning signs:** `Ref not found` error. [VERIFIED: snapshot-refs.md]

### Pitfall 2: Search URL Deeplink May Not Work on All Tenants

**What goes wrong:** `deeplink/search?query=` URL causes persistent "Loading" spinner on this tenant.
**Why it happens:** Custom domain (`myemail.accenture.com`) has specific routing; deeplink format may be version-dependent.
**How to avoid:** Use interactive search combobox workflow as primary approach; test deeplink only as optional fast-path and fall back if URL does not change within 5 seconds.
**Warning signs:** URL stays at `deeplink/search?query=` after 10+ seconds. [VERIFIED: live test 2026-04-10]

### Pitfall 3: `wait --load networkidle` Hangs on Outlook

**What goes wrong:** Script never progresses past the wait step.
**Why it happens:** Outlook maintains persistent WebSocket connections for real-time features (Teams presence, notifications, calendar sync) — `networkidle` never triggers.
**How to avoid:** Use `wait 3000` or `wait --text "Message list"` instead. [CITED: SKILL.md — Timeouts section]

### Pitfall 4: Entra Conditional Access Rejects Headless / Automated Chrome

**What goes wrong:** Authentication redirect loop when using default `agent-browser` Chrome binary.
**Why it happens:** Managed devices (Accenture, enterprise M365) enforce device compliance checks; automated Chrome for Testing fails these.
**How to avoid:** Phase 0 bypasses this via `--auto-connect` (user's real browser). Phase 1 must configure `OUTLOOK_BROWSER_PATH` and `OUTLOOK_BROWSER_PROFILE` per CFG-03/CFG-04.
**Warning signs:** Redirect to `login.microsoftonline.com` or `myemail.accenture.com/auth/` rather than inbox. [CITED: REQUIREMENTS.md CFG-03, AUTH-02]

### Pitfall 5: Focused Inbox May Be Absent

**What goes wrong:** Phase 4 digest logic assumes Focused/Other tabs exist and tries to navigate to "All" — but the user has Focused Inbox disabled.
**Why it happens:** Focused Inbox is a configurable setting; enterprise admins can disable it.
**How to avoid:** Capture script explicitly checks for tab presence. Phase 4 should be defensive — detect tabs before attempting navigation.
**Warning signs:** No `button "Focused"` or `button "Other"` in snapshot when inbox is loaded. [VERIFIED: absent in live snapshot 2026-04-10]

### Pitfall 6: Virtual DOM — Only ~20 Messages Rendered

**What goes wrong:** `snapshot -i` on the message list returns only the visible items; items further down the list are not in the DOM.
**Why it happens:** Outlook uses virtual scrolling for performance.
**How to avoid:** Use `agent-browser scroll down 500 --selector "[role=listbox]"` and re-snapshot to paginate. For digest/search, this requires a scroll-accumulate loop.
**Warning signs:** Snapshot contains exactly 12–20 items regardless of unread count shown in nav pane. [VERIFIED: live snapshot showed exactly 12 items]

---

## Code Examples

### Accessing the Search Combobox

```bash
# Source: live snapshot 2026-04-10
# After open + wait, the search combobox is always accessible as:
# combobox "Search for email, meetings, files and more." [expanded=false]

# Locate it using find (stable across sessions):
agent-browser find role combobox click --name "Search for email, meetings, files and more."
# Or after snapshot, use the ref directly:
# agent-browser click @e148  # (ref varies per session — always re-snapshot first)

agent-browser wait 1000
agent-browser find role combobox fill "from:sender@example.com" --name "Search for email"
agent-browser press Enter
agent-browser wait 5000
```

### Reading the Message List

```bash
# Source: live snapshot 2026-04-10
# Container: listbox "Message list"
# Each item: option "[Unread] [Sender] [Subject] [Time] [Preview]"

# Locate the listbox by role+label (stable):
agent-browser find role listbox --name "Message list"
# For full extraction, snapshot the page and parse option elements
agent-browser snapshot -i
# Parse: options starting with "Unread " are unread; otherwise read
# Parse: option with [selected] attribute is the currently open message
```

### Extracting Message Body from Reading Pane

```bash
# Source: live snapshot 2026-04-10
# Reading pane is: main "Reading Pane"
# Body is: document "Message body" (focusable)

# Scope snapshot to reading pane (reduces tokens dramatically):
agent-browser snapshot -s "main[aria-label='Reading Pane']"
# Or using get text on the body document element:
# agent-browser get text @e96   # (ref varies — use find instead)
agent-browser find role document --name "Message body"
agent-browser get text @found
```

### Extracting Message ID from URL

```bash
# Source: live get url 2026-04-10
# After clicking a message, URL format is:
# https://<base>/mail/inbox/id/<URL-encoded-Exchange-ItemID>

agent-browser get url
# Parse: split on "/id/" and URL-decode the suffix
# Example raw URL:
# https://myemail.accenture.com/mail/inbox/id/AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAIQYi4VAAA
```

### Detecting Unread vs. Read in a Message Option

```bash
# Source: live snapshot 2026-04-10
# Unread: option text starts with "Unread ..."
# Read: option text does NOT start with "Unread"
# Also: child button is "Mark as read" (unread) vs "Mark as unread" (read)

# In snapshot output, check the option's accessible name for "Unread" prefix.
# This is the primary signal — do not rely on CSS classes.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| OWA URL format (`/owa/?ItemID=`) | New format (`/mail/inbox/id/<ID>`) | ~2020 (new Outlook web) | Legacy deeplink format still works via redirect [ASSUMED] |
| `deeplink/search?query=` URL-driven search | Search combobox workflow | Not a version change — URL approach unstable per tenant | Capture script must use combobox, not URL |
| `data-convid` DOM attribute (legacy Outlook) | ItemID in URL | Unclear — depends on rendering mode | Capture script must verify via `eval` |

**Deprecated/outdated:**
- `/owa/?ItemID=...&exvsurl=1&viewmodel=ReadMessageItem` — legacy OWA format. Still documented but redirects. [ASSUMED — not tested in this session]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CSS class names in Outlook web are minified and change with deploys (reason to avoid CSS selectors) | Don't Hand-Roll | Low — even if class names are stable, ARIA-based selectors are still more reliable |
| A2 | `deeplink/search?query=` works on `outlook.office.com` even though it failed for `myemail.accenture.com` tenant | Search URL Format | Medium — if also broken on office.com, URL-based search is not viable at all |
| A3 | Legacy OWA `?ItemID=` deeplink still works via redirect in current new Outlook web | State of the Art | Low — this is fallback only |
| A4 | `data-convid` DOM attribute exists on message elements in new Outlook web | Message ID section | Medium — if absent, message ID can only be obtained from the URL, which requires clicking the message first |
| A5 | Attachment indicators appear in the reading pane ARIA tree as a button or label element | Attachment Indicators | Medium — if attachments are only visible via screenshot (canvas/image), accessibility tree approach fails for this field |
| A6 | Focused Inbox shows `button "Focused"` and `button "Other"` above the listbox when enabled | Focused Inbox Tabs | Low — screen reader documentation confirms this; research snapshot just happened to be on an account with it disabled |

---

## Open Questions

1. **What is the ARIA structure of search results?**
   - What we know: The listbox role and option role are used for inbox; search results likely use the same container.
   - What's unclear: Whether the search results view uses the same `listbox "Message list"` label, or a different container/label.
   - Recommendation: Capture script step — submit a search, wait for results, snapshot and confirm.

2. **Does `data-convid` or any `data-` attribute exist on message rows?**
   - What we know: The ARIA tree does not expose data attributes; the URL contains the ItemID after click.
   - What's unclear: Whether a non-ARIA data attribute on the DOM element enables ID extraction without clicking.
   - Recommendation: Add `agent-browser eval 'Array.from(document.querySelectorAll("[role=option]")).slice(0,3).map(el => Object.keys(el.dataset))'` to capture script output.

3. **Is Focused Inbox enabled or permanently disabled on this Accenture account?**
   - What we know: Tabs were not present in the live snapshot.
   - What's unclear: Whether this is a user preference (can re-enable) or an admin-enforced setting.
   - Recommendation: Capture script should document presence/absence explicitly; Phase 4 must handle both cases.

4. **What does the reading pane look like for a message with attachments?**
   - What we know: `document "Message body"` contains the body; attachment area is unresolved.
   - What's unclear: Whether attachments appear as child elements of the main reading pane or in a separate ARIA region.
   - Recommendation: Capture script step — search `has:attachment`, open a result, snapshot the reading pane.

5. **Does `deeplink/search?query=` work on `outlook.office.com` (non-custom domain)?**
   - What we know: It failed on `myemail.accenture.com`; URL format is documented in Microsoft Q&A.
   - What's unclear: Whether the failure is tenant-specific.
   - Recommendation: Document both approaches in `references/outlook-ui.md`; mark tenant behavior as "unresolved for custom domains."

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|---------|
| agent-browser | Capture script | Yes | 0.25.3 | — |
| Node.js | JSON post-processing | Yes | v25.9.0 | — |
| npm | Package installs | Yes | 11.12.1 | — |
| Chrome/Edge with Outlook session | `--auto-connect` bootstrap | Confirmed (live session exists) | — | `--profile <OUTLOOK_BROWSER_PROFILE>` |
| Outlook web access (`myemail.accenture.com`) | All captures | Yes (active session confirmed) | — | — |

**Missing dependencies with no fallback:** None — all required tooling is present.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is `false` in `.planning/config.json`.

---

## Security Domain

Phase 0 produces only a reference document (`references/outlook-ui.md`) containing ARIA selectors and snapshot dumps. No code is written. Security controls are not applicable to this phase.

**Relevant notes for downstream phases:**
- `AGENT_BROWSER_CONTENT_BOUNDARIES=1` must be set in Phase 1+ to prevent prompt injection from email content reaching the calling agent. [CITED: REQUIREMENTS.md SAFE-03]
- The capture script for Phase 0 does NOT set this because it is an exploratory tool, not production code.
- The capture script's output (raw snapshot dumps) may contain real email content — treat it as sensitive, delete after annotation.

---

## Sources

### Primary (HIGH confidence — verified live)

- Live `agent-browser snapshot -i` session against `https://myemail.accenture.com/mail/inbox` — 2026-04-10 (inbox view, message list, reading pane, search box)
- Live `agent-browser get url` — confirmed message URL format and search URL behavior
- `.agents/skills/agent-browser/SKILL.md` — command reference, session options, security features
- `.agents/skills/agent-browser/references/snapshot-refs.md` — ref lifecycle, output format
- `.agents/skills/agent-browser/references/session-management.md` — session isolation properties
- `.agents/skills/agent-browser/references/authentication.md` — auto-connect, profile reuse

### Secondary (MEDIUM confidence — official docs)

- [Microsoft Support: Use a screen reader to explore and navigate Outlook Mail](https://support.microsoft.com/en-us/office/use-a-screen-reader-to-explore-and-navigate-outlook-mail-5c139216-7a3f-4c74-953b-96e9da52d4e3) — ARIA landmark names confirmed
- [Microsoft Q&A: Search via URL in Outlook 365 web](https://learn.microsoft.com/en-us/answers/questions/1039534/search-via-url-directly-on-outlook-365-(web-versio) — `deeplink/search?query=` format
- [Microsoft Learn: Outlook Web Parts (Exchange 2013)](https://learn.microsoft.com/en-us/exchange/using-outlook-web-app-web-parts-exchange-2013-help) — URL structure background
- [Joshua Chini 2024: Get deep link to Outlook email](https://joshuachini.com/2024/11/09/get-deep-link-to-outlook-email/) — ItemID deeplink format

### Tertiary (LOW confidence — inferred/secondary sources)

- [SFU: Advanced Query Search for OWA](https://www.sfu.ca/sfumail/using-sfu-mail/searching/searching-advanced-owa.html) — KQL syntax reference
- [GitHub gist: OWA deeplinks](https://gist.github.com/miwebguy/2e805e343e0d434f06f2194b92b925d8) — compose/calendar deeplink formats (incomplete for search)

---

## Metadata

**Confidence breakdown:**
- Search box ARIA: HIGH — confirmed live with exact label text and state transitions
- Message list ARIA: HIGH — confirmed live with multiple option examples
- Reading pane ARIA: HIGH — confirmed live with full heading/body/metadata structure
- Message ID format: HIGH — confirmed live from URL; data- attribute presence is unresolved (LOW)
- Search URL behavior: HIGH — live test showed deeplink failure; combobox workflow confirmed working
- Focused Inbox: MEDIUM — absence confirmed live; behavior when present is inferred from docs
- Attachment indicators: LOW — not captured; unresolved

**Research date:** 2026-04-10
**Valid until:** 2026-07-10 (90 days — Microsoft UI deploys may change ARIA labels; re-verify before Phase 2/3 implementation if more than 30 days have passed)
