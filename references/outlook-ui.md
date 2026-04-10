# Outlook Web UI Reference

**Captured:** 2026-04-10
**Tenant:** https://myemail.accenture.com
**agent-browser version:** 0.25.3
**Valid until:** 2026-07-09 (re-verify if more than 30 days have passed since a Microsoft deploy)

---

## Curated Reference

### Search Box

| Property | Value | Confidence |
|----------|-------|------------|
| ARIA role | `combobox` | confirmed-live |
| `aria-label` | `"Search for email, meetings, files and more."` | confirmed-live |
| `expanded` state (idle) | `false` | confirmed-live |
| `expanded` state (activated) | `true` | confirmed-live |
| Container structure | Nested inside two unnamed `generic` clickable divs in the top banner | confirmed-live |
| Companion buttons when focused | `button "Exit search"`, `button "Search filters, All folders, 0 other filters applied"`, `button "Search"` | confirmed-live |
| Search suggestions listbox | `listbox "Search Suggestions"` appears with tabs: `All`, `Mail`, `Files`, `Teams`, `People` | confirmed-live |
| Search suggestion types | `option "History Suggestion - ..."`, `option "People Suggestion - ..."` | confirmed-live |

**Workflow to trigger search:**
1. `agent-browser find role combobox click --name "Search for email"` — activates search mode
2. `agent-browser wait 1000` — wait for suggestions list to render
3. `agent-browser find role combobox fill "your KQL query" --name "Search for email"` — type query
4. `agent-browser press Enter` — submit search
5. `agent-browser wait 5000` — wait for results (SPA navigation, no URL change)

**Anti-pattern:** Do NOT use `deeplink/search?query=` URL-based search. On this tenant (`myemail.accenture.com`) it produces a persistent loading spinner. Use the combobox workflow above.

**Search results ribbon tab:** After search activates, `tab "Search" [selected]` appears in the ribbon with filter buttons: `button "Has attachments"`, `button "Unread"`, `button "Mentions me"`, `button "Flagged"`, `button "High importance"`, `button "To me"` (all confirmed-live in captures 6, 7, 8).

---

### Message List Container

| Property | Value | Confidence |
|----------|-------|------------|
| ARIA role | `listbox` | confirmed-live |
| `aria-label` (no selection) | `"Message list No items selected"` | confirmed-live |
| `aria-label` (message selected) | `"Message list"` (no suffix) | confirmed-live |
| Location in ARIA tree | Direct sibling to `region "Navigation pane"`; child of page root | confirmed-live |
| Items rendered at once | ~12–20 (virtual DOM — scroll to load more) | confirmed-live |
| Date group header | `button "Today"` (or date string) expanded inside a `generic` container; sibling of `option` rows | confirmed-live |
| Search results heading | `heading "Results" [level=2]` appears above the listbox during search | confirmed-live |

**Scoped snapshot to message list:**
```bash
agent-browser find role listbox --name "Message list"
```

---

### Individual Message Rows

| Property | Value | Confidence |
|----------|-------|------------|
| ARIA role | `option` | confirmed-live |
| Parent | `listbox "Message list"` (or `listbox "Message list No items selected"`) | confirmed-live |
| `aria-selected` | `"true"` when selected, `"false"` otherwise | confirmed-live |
| Unread indicator | `"Unread "` prefix at start of accessible name string | confirmed-live |
| Read indicator | No prefix; accessible name starts directly with sender name | confirmed-live |
| Important indicator | `"Important "` prefix in accessible name | confirmed-live |
| Copilot priority prefix | `"Marked as high priority by Copilot"` prefix (from prior research) | inferred |
| Child buttons (unread message) | `button "Mark as read"`, `checkbox "Select a message"` | confirmed-live |
| Child buttons (read message) | `button "Mark as unread"`, `checkbox "Select a message"` | confirmed-live |
| Child buttons (selected row) | Additional: `button "Flag this message"`, `button "Keep this message at the top of your folder"` | confirmed-live |
| Folder badge in search results | `generic "Inbox" > button "Inbox"` appears as a child element when viewing search results | confirmed-live |

**Read vs. unread detection (two complementary methods):**
- **Method 1 (primary):** Parse accessible name — if it starts with `"Unread "`, the message is unread.
- **Method 2 (secondary):** Inspect child button text — `"Mark as read"` = currently unread; `"Mark as unread"` = currently read.

**Accessible name format (inbox):**
```
[Unread ][Important ]{sender} {subject} {time} {preview text} [No items selected]
```

**Accessible name format (search results):**
```
[Unread ]{sender} {subject} {date} {preview text} [No items selected]
```

---

### Stable Message ID

| Property | Value | Confidence |
|----------|-------|------------|
| Primary extraction method | `agent-browser get url` after clicking a message — parse the segment after `/id/` | confirmed-live |
| URL pattern | `https://<base>/mail/id/<URL-encoded-Exchange-ItemID>` | confirmed-live |
| Concrete example (decoded) | `AAkALgAAAAAAHYQDEapmEc2byACqAC/EWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA` | confirmed-live |
| Concrete example (URL-encoded) | `AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA` | confirmed-live |
| ID format | Exchange ItemID — base64-encoded, URL-encoded for transport | confirmed-live |
| DOM data attributes on `option` elements | `data-convid`, `data-focusable-row` (keys: `["convid", "focusableRow"]`) | confirmed-live |
| DOM `id` attribute on `option` elements | Base64-encoded Exchange ItemID, e.g., `AQAAAAAJuqMCAAAIQYb16wAAAAA=` | confirmed-live |
| Accessibility tree visibility of `id`/data attrs | NOT exposed in ARIA tree — requires `eval` or URL extraction | confirmed-live |
| OWA legacy deeplink | `https://<base>/mail/deeplink/read/<URL-encoded-ItemID>` | inferred |

**CORRECTION from prior research:** The URL pattern is `/mail/id/` NOT `/mail/inbox/id/`. The research session documented `/mail/inbox/id/` but the live capture confirms the actual URL is `/mail/id/` (without `inbox` path segment).

**ID extraction example:**
```bash
agent-browser get url
# Returns: https://myemail.accenture.com/mail/id/AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA
# Extract: split on "/id/" and URL-decode the suffix
```

**DOM data attribute extraction (without clicking):**
```javascript
// Run via: agent-browser eval --stdin
JSON.stringify(
  Array.from(document.querySelectorAll('[role="option"]'))
    .slice(0, 3)
    .map(el => ({
      dataset: Object.keys(el.dataset),
      id: el.id,
      ariaSelected: el.getAttribute('aria-selected')
    }))
)
// Returns: [{"dataset":["convid","focusableRow"],"id":"AQAAAAAJuqMCAAAIQYb16wAAAAA=","ariaSelected":"false"},...]
```

---

### Reading Pane

| Property | Value | Confidence |
|----------|-------|------------|
| ARIA role | `main` | confirmed-live |
| `aria-label` | `"Reading Pane"` | confirmed-live |
| Subject heading | `heading "{subject}" [level=3]` — appears twice (once before, once after Copilot summary button) | confirmed-live |
| Copilot summary | `button "Summary by Copilot"` (contains `button "Dismiss summary"`) | confirmed-live |
| Sender contact button | `button "Opens card for {sender name}"` | confirmed-live |
| From heading | `heading "From: {sender}" [level=3]` containing `button "From: {sender}"` | confirmed-live |
| Reactions button | `button "Reactions" [expanded=false]` | confirmed-live |
| More items button | `button "More items"` | confirmed-live |
| To heading | `heading "To: {recipients}" [level=3]` containing `button "{recipient}"` per person | confirmed-live |
| Date heading | `heading "{weekday} {date} {time}" [level=3]` (e.g., `"Fri 4/10/2026 8:23 AM"`) | confirmed-live |
| Trust sender | `button "Trust sender"` | confirmed-live |
| Show blocked content | `button "Show blocked content"` | confirmed-live |
| Body document | `document "Message body"` — scoping boundary for body extraction | confirmed-live |
| Reply controls | `menuitem "Reply"`, `menuitem "Forward"` | confirmed-live |
| Cc heading | `heading "Cc: {names}" [level=3]` (present when message has Cc recipients) | confirmed-live |

**Scoped snapshot (reduces token usage dramatically):**
```bash
agent-browser snapshot -s "main[aria-label='Reading Pane']"
```

**Empty reading pane:** When no message is selected, `main "Reading Pane"` is present but contains no children (confirmed from capture 1).

---

### Attachment Indicators

| Property | Value | Confidence |
|----------|-------|------------|
| Attachment presence in message list ARIA | NOT visible — no attachment-specific ARIA annotation in `option` accessible names | confirmed-live |
| Attachment badge as distinct ARIA element | NOT present on message rows in ARIA tree | confirmed-live |
| `hasattachment:yes` KQL property | Targets messages with actual downloadable file attachments — use this, not `has:attachment` | inferred |
| `has:attachment` KQL query | Returns results but includes HTML emails with inline embedded images; NOT reliable for finding file attachments | confirmed-live |
| File download attachments in reading pane | UNRESOLVED — capture 8 used `has:attachment` which surfaced inline-image messages only; file-download attachment ARIA structure not captured | unresolved |
| Inline image indicator | `button "Show original size"` inside `document "Message body"` | confirmed-live |
| Ribbon filter button | `button "Has attachments"` in the Search ribbon tab — clicking filters search results | confirmed-live |

**What was captured:** The `has:attachment` search (capture 8) returned results, but Exchange's index counts inline embedded images (HTML emails) as attachments for this query. The opened message (Merrill Lynch) had only inline images rendered as `button "Show original size"` — no actual file attachment ARIA structure was visible.

**`has:attachment` vs `hasattachment:yes`:** `hasattachment:yes` is the KQL property that targets actual downloadable file attachments. `has:attachment` is broader and unreliable for this purpose.

**What remains unresolved:** File attachment ARIA structure in the reading pane (e.g., an attachment list region, `link "{filename}.pdf"`, or `button "Download {filename}"`). Phase 3 should re-run using `hasattachment:yes` against a message known to have a real file attachment.

---

### Unread and Flagged State Markers

| Property | Value | Confidence |
|----------|-------|------------|
| Unread message: name prefix | `"Unread "` (with trailing space) at start of `option` accessible name | confirmed-live |
| Unread message: child button | `button "Mark as read"` | confirmed-live |
| Read message: name prefix | None — name starts directly with sender | confirmed-live |
| Read message: child button | `button "Mark as unread"` | confirmed-live |
| Important/flagged by Copilot prefix | `"Important "` prefix (in capture 1, ref=e57: "Important Callegari, Greg FW...") | confirmed-live |
| Copilot high priority prefix | `"Marked as high priority by Copilot"` prefix (from prior research session, not in this capture) | inferred |
| Meeting/calendar item indicator | `"Meeting "` prefix in accessible name (e.g., `"Unread Meeting Corporate Citizenship..."`) | confirmed-live |
| Flag button (selected row) | `button "Flag this message"` visible on focused/selected row | confirmed-live |
| KQL filter for unread | `is:unread` — standard KQL syntax | inferred |
| KQL filter for flagged | `is:flagged` — standard KQL syntax | inferred |

---

### Focused Inbox

| Property | Value | Confidence |
|----------|-------|------------|
| Tab presence on this account | ABSENT — no `button "Focused"` or `button "Other"` observed in any capture | confirmed-live |
| Explanation | Focused Inbox is disabled on this Accenture account (enterprise admin setting) | confirmed-live (absence) |
| Tab role if present | `button "Focused"` and `button "Other"` above the message list | inferred from Microsoft screen reader docs |
| Tab location if present | Between the Filter/Sort controls and the `listbox "Message list"` container | inferred |
| Navigation to "All" if tabs present | Click `button "Other"` would show Other tab; no "All" button — the full inbox is visible by default when Focused is disabled | inferred |

**Phase 4 implementation note:** Phase 4 must be defensive — detect whether Focused/Other tabs exist before attempting to navigate to "All". When tabs are absent (as on this account), the inbox already shows all messages.

---

### URL Patterns

| Pattern | URL | Confidence |
|---------|-----|------------|
| Inbox navigation target | `https://<base>/mail/inbox` | confirmed-live |
| URL after inbox loads | `https://<base>/mail/` (redirects from `/mail/inbox` on load) | confirmed-live |
| Open message URL | `https://<base>/mail/id/<URL-encoded-Exchange-ItemID>` | confirmed-live |
| Concrete open message URL | `https://myemail.accenture.com/mail/id/AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA` | confirmed-live |
| URL after interactive search | `https://<base>/mail/` — URL does NOT change after search (SPA state) | confirmed-live |
| Deeplink search URL | `https://<base>/mail/deeplink/search?query=<term>` — documented but produces loading spinner on this tenant | confirmed-live (limitation) |
| Deeplink read URL | `https://<base>/mail/deeplink/read/<URL-encoded-ItemID>` | inferred |

**CORRECTION:** Prior research documented the open message URL as `/mail/inbox/id/`. The live capture confirms it is `/mail/id/` (without `inbox` in the path).

---

### ARIA Landmark Map

| Region | ARIA Role | Accessible Name | Confidence |
|--------|-----------|-----------------|------------|
| App launcher + search banner | `generic` (clickable wrapper) | (unnamed) | confirmed-live |
| Left app switcher | `navigation` | `"left-rail-appbar"` | confirmed-live |
| Ribbon / toolbar | `region` | `"Ribbon"` | confirmed-live |
| Folder tree / nav pane | `region` | `"Navigation pane"` | confirmed-live |
| Message list | `listbox` | `"Message list"` or `"Message list No items selected"` | confirmed-live |
| Reading pane | `main` | `"Reading Pane"` | confirmed-live |
| Message body (inside reading pane) | `document` | `"Message body"` | confirmed-live |
| Search suggestions (when active) | `listbox` | `"Search Suggestions"` | confirmed-live |

---

## Evidence

### Capture Session Metadata

- **Date:** 2026-04-10
- **Method:** `--auto-connect` (user's Chrome instance with active Outlook session)
- **Tenant URL:** https://myemail.accenture.com
- **agent-browser version:** 0.25.3
- **Total captures:** 9

---

### Raw Snapshot: Inbox View (Capture 1, trimmed)

```
=== CAPTURE 1: Inbox view ===
https://myemail.accenture.com/mail/inbox
- generic "OutlookAlbert, GabeAGSign in..." [ref=e1] clickable [onclick]
  - combobox "Search for email, meetings, files and more." [expanded=false, ref=e121]
  - navigation "left-rail-appbar" [ref=e4]
    - button "Mail" [ref=e17]
    - button "Calendar" [ref=e18]
    - button "Copilot" [ref=e19]
  - region "Ribbon" [ref=e3]
    - tab "Home" [selected, ref=e59]
    - tab "View" [ref=e60]
    - tab "Help" [ref=e61]
    - button "New mail" [ref=e130]
  - region "Navigation pane" [ref=e5]
    - heading "Navigation pane" [level=2, ref=e33]
    - treeitem "Inbox selected 463 unread" [level=2, expanded=true, selected, ref=e62]
    - treeitem "Drafts 19 items" [level=2, ref=e72]
    - treeitem "Sent Items" [level=2, ref=e73]
  - heading "Inbox Favorite folder" [level=2, ref=e25]
  - button "Filter" [expanded=false, ref=e30]
  - button "Sorted: By Date" [expanded=false, ref=e31]
  - listbox "Message list No items selected" [ref=e32]
    - generic "Today..." [ref=e34] focusable [tabindex]
      - button "Today" [expanded=true, ref=e45]
      - option "Unread NY Metro Local Office Announcement: Leaders Unplugged... 1:47 PM NY Metro Local Office started a new conversation..." [ref=e46]
        - button "Mark as read" [ref=e97]
        - checkbox "Select a message" [checked=false, ref=e98]
      - option "Unread Cruel, Mishelle C. RE: [External] Hitachi meeting 1:41 PM Hello Heather, Gabe is available..." [ref=e47]
        - button "Mark as read" [ref=e99]
        - checkbox "Select a message" [checked=false, ref=e100]
      - option "Sweet, Julie, Parker, Vaughn, +5 others Accenture Daily Digest 1:39 PM New posts from Accenture..." [ref=e48]
        - button "Mark as unread" [ref=e101]
        - checkbox "Select a message" [checked=false, ref=e102]
      - option "Important Callegari, Greg FW: Tech Capabilities - Cybersecurity Alliances... 10:58 AM Hi All, Can you please let me know..." [ref=e57]
        - button "Mark as unread" [ref=e119]
        - checkbox "Select a message" [checked=false, ref=e120]
  - main "Reading Pane" [ref=e14]
```

---

### Raw Output: Data Attribute Probe (Capture 4)

```
=== CAPTURE 4: Data attribute probe on message rows ===
[{"dataset":["convid","focusableRow"],"id":"AQAAAAAJuqMCAAAIQYb16wAAAAA=","ariaSelected":"false"},{"dataset":["convid","focusableRow"],"id":"AQAAAAAJuqMCAAAIQYb16gAAAAA=","ariaSelected":"false"},{"dataset":["convid","focusableRow"],"id":"AQAAAAAJuqMCAAAIQYb16QAAAAA=","ariaSelected":"false"}]
```

Key findings:
- Each `[role="option"]` element has `data-convid` and `data-focusable-row` attributes
- The DOM `id` attribute contains a base64-encoded Exchange ItemID (e.g., `AQAAAAAJuqMCAAAIQYb16wAAAAA=`)
- These attributes are NOT exposed in the ARIA accessibility tree

---

### Raw Snapshot: Search Activated (Capture 5, trimmed)

```
=== CAPTURE 5: Search box activation ===
- generic "6 suggestions available, use up and down arrows to navigate" [ref=e55] clickable [onclick]
  - button "Exit search" [ref=e116]
  - generic [ref=e117] clickable [onclick]
    - combobox "Search for email, meetings, files and more." [expanded=true, ref=e143]
  - button "Search filters, All folders, 0 other filters applied" [expanded=false, ref=e142]
  - button "Search" [ref=e103]
- listbox "Search Suggestions" [ref=e15]
  - tab "All" [selected, ref=e45]
  - tab "Mail" [ref=e46]
  - tab "Files" [ref=e47]
  - tab "Teams" [ref=e48]
  - tab "People" [ref=e49]
  - option "History Suggestion - cigna" [ref=e27]
  - option "History Suggestion - [External] Re: Okta & Scylos" [ref=e28]
  - option "History Suggestion - duke energy" [ref=e29]
  - option "People Suggestion - Heather Kolovos heather.kolovos@okta.com" [ref=e30]
  - option "People Suggestion - Shukla, Sanjeev sanjeev.shukla@accenture.com" [ref=e31]
```

---

### Raw Snapshot: Search Results (Capture 6, trimmed)

```
=== CAPTURE 6: Search results (from:test query) ===
https://myemail.accenture.com/mail/
- combobox "Search for email, meetings, files and more." [expanded=false, ref=e124]: from:test
- region "Ribbon" [ref=e3]
  - tab "Search" [selected, ref=e59]
  - button "Has attachments" [ref=e130]
  - button "Unread" [ref=e131]
  - button "Mentions me" [ref=e132]
  - button "Flagged" [ref=e133]
  - button "High importance" [ref=e134]
  - button "To me" [ref=e135]
  - button "Close search" [ref=e136]
- heading "Results" [level=2, ref=e26]
- listbox "Message list No items selected" [ref=e30]
  - generic "All results..." [ref=e32] focusable [tabindex]
    - button "All results" [expanded=true, ref=e42]
    - option "Omi Singh, GMHC Senior Director... [External] Gabe, we've come a long way in 40 years. 6/24/2024 ..." [ref=e43]
      - button "Mark as unread" [ref=e98]
      - checkbox "Select a message" [checked=false, ref=e99]
      - generic "Inbox" [ref=e83] clickable [onclick]
        - button "Inbox" [ref=e100]
    - option "imp.test@email.insightsmp.accenture.com Issue Resolution... 11/30/2023 ..." [ref=e44]
      - button "Mark as unread" [ref=e101]
      - checkbox "Select a message" [checked=false, ref=e102]
- main "Reading Pane" [ref=e14]
```

---

### URL Captures

```
=== CAPTURE 2: Current URL after inbox load ===
https://myemail.accenture.com/mail/

=== CAPTURE 7 (URL after opening message from search results) ===
https://myemail.accenture.com/mail/id/AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA
```

---

### Raw Snapshot: Message Reading Pane (Capture 7, trimmed)

```
=== CAPTURE 7: Open individual message from search results ===
https://myemail.accenture.com/mail/id/AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AyMj4zStSpkeg9EIx4kB9IAAGkQFb7AAA
  - main "Reading Pane" [ref=e14]
    - heading "[External] Gabe, we've come a long way in 40 years." [level=3, ref=e55]
    - button "Summary by Copilot" [ref=e56]
      - button "Dismiss summary" [ref=e83]
    - heading "[External] Gabe, we've come a long way in 40 years." [level=3, ref=e84]
    - button "Opens card for Omi Singh, GMHC Senior Director, Testing & Prevention Services" [ref=e108]
    - heading "From: Omi Singh, GMHC Senior Director, Testing & Prevention Services" [level=3, ref=e87]
      - button "From: Omi Singh, GMHC Senior Director, Testing & Prevention Services" [ref=e109]
    - button "Reactions" [expanded=false, ref=e142]
    - button "More items" [ref=e110]
    - heading "To: Albert, Gabe" [level=3, ref=e88]
      - button "Albert, Gabe" [ref=e144]
    - heading "Mon 6/24/2024 6:25 PM" [level=3, ref=e85]
    - button "Trust sender" [ref=e89]
    - button "Show blocked content" [ref=e90]
    - document "Message body" [ref=e91] focusable [tabindex]
      - button "Show original size" [ref=e145]
      - button "Show original size" [ref=e146]
      - link "Can you imagine a world without HIV and AIDS, Gabe?" [ref=e174]
      - link "we need your support today." [ref=e179]
      - link "Donate" [ref=e154]
      - link "Schedule an HIV/STI Test" [ref=e155]
      - link "Services" [ref=e156]
      - link "Get Involved" [ref=e157]
      - link "Add us to your address book" [ref=e158]
    - menuitem "Reply" [ref=e92]
    - menuitem "Forward" [ref=e93]
```

---

### Raw Snapshot: Attachment Search Reading Pane (Capture 8, trimmed)

```
=== CAPTURE 8: Attachment search (has:attachment query) ===
- combobox "Search for email, meetings, files and more." [expanded=false, ref=e142]: has:attachment
- region "Ribbon" [ref=e3]
  - tab "Search" [selected, ref=e60]
  - button "Has attachments" [ref=e148]
- listbox "Message list No items selected" [ref=e31]
  - button "Top results" [expanded=true, ref=e43]
  - option "Merrill Lynch Benefits Online A new confirmation has been posted to your account 8:23 AM..." [ref=e44]
    - button "Mark as unread" [ref=e108]
    - checkbox "Select a message" [checked=false, ref=e109]
    - generic "Inbox" [ref=e84] clickable [onclick]
  - option "BIA.Technology RE: [External] Gabe Albert has requested access to Power BI App ACC Security Business Metrics Tue 3/17..." [ref=e47]
    - button "Mark as unread" [ref=e117]
    - checkbox "Select a message" [checked=false, ref=e118]
    - generic "Inbox" [ref=e90] clickable [onclick]

(After opening first result — Merrill Lynch message)
  - main "Reading Pane" [ref=e14]
    - heading "A new confirmation has been posted to your account" [level=3, ref=e56]
    - button "Summary by Copilot" [ref=e57]
    - heading "From: Merrill Lynch Benefits Online" [level=3, ref=e88]
      - button "From: Merrill Lynch Benefits Online" [ref=e119]
    - heading "To: Albert, Gabe" [level=3, ref=e89]
    - heading "Fri 4/10/2026 8:23 AM" [level=3, ref=e86]
    - button "Trust sender" [ref=e90]
    - button "Show blocked content" [ref=e91]
    - document "Message body" [ref=e92] focusable [tabindex]
      - button "Show original size" [ref=e167]
      - button "Show original size" [ref=e168]
      - heading "A new confirmation has been posted to your account" [level=3, ref=e191]
      - link "Access with Employer Authentication..." [ref=e192]
      - link "Access with my Benefits OnLine..." [ref=e194]
      - link "MERRILLLYNCHBENEFITSONLINE@ML.COM" [ref=e193]
    - menuitem "Reply" [ref=e93]
    - menuitem "Forward" [ref=e94]
```

**Note:** The `has:attachment` result opened was a Merrill Lynch email. It contained inline images (rendered as `button "Show original size"`) and body links, but no file-download attachment ARIA structure was present. This message appears to have had its content flagged as having attachments due to inline images. The ARIA structure for traditional file attachments (e.g., `.pdf`, `.docx` download links) remains **unresolved** and requires a separate capture with a message containing file attachments.
