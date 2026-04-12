# Outlook Web UI Reference

**Captured:** (fill in your capture date)
**Tenant:** https://mail.example.com  (replace with your OUTLOOK_BASE_URL)
**agent-browser version:** (fill in)
**Valid until:** (re-verify if more than 30 days have passed since a Microsoft deploy)

> **Note:** This is the template. Copy to `references/outlook-ui.md` and run your own
> capture session to populate the Evidence section with your tenant's live snapshots.
> `references/outlook-ui.md` is gitignored — your captures (which may contain personal
> data) stay local.

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

**Anti-pattern:** Do NOT use `deeplink/search?query=` URL-based search. On some tenants it produces a persistent loading spinner. Use the combobox workflow above.

**Search results ribbon tab:** After search activates, `tab "Search" [selected]` appears in the ribbon with filter buttons: `button "Has attachments"`, `button "Unread"`, `button "Mentions me"`, `button "Flagged"`, `button "High importance"`, `button "To me"` (all confirmed-live).

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
| Example (decoded) | `AAkALg...<base64-encoded-Exchange-ItemID>...AAA` | confirmed-live |
| ID format | Exchange ItemID — base64-encoded, URL-encoded for transport | confirmed-live |
| DOM data attributes on `option` elements | `data-convid`, `data-focusable-row` (keys: `["convid", "focusableRow"]`) | confirmed-live |
| DOM `id` attribute on `option` elements | Base64-encoded Exchange ItemID, e.g., `AQAAAAAJuqM...` | confirmed-live |
| Accessibility tree visibility of `id`/data attrs | NOT exposed in ARIA tree — requires `eval` or URL extraction | confirmed-live |
| OWA legacy deeplink | `https://<base>/mail/deeplink/read/<URL-encoded-ItemID>` | inferred |

**CORRECTION from prior research:** The URL pattern is `/mail/id/` NOT `/mail/inbox/id/`. The research session documented `/mail/inbox/id/` but live captures confirm the actual URL is `/mail/id/` (without `inbox` path segment).

**ID extraction example:**
```bash
agent-browser get url
# Returns: https://mail.example.com/mail/id/<URL-encoded-Exchange-ItemID>
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
// Returns: [{"dataset":["convid","focusableRow"],"id":"AQAAAAAJuqM...","ariaSelected":"false"},...]
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

**Empty reading pane:** When no message is selected, `main "Reading Pane"` is present but contains no children.

---

### Attachment Indicators

| Property | Value | Confidence |
|----------|-------|------------|
| Attachment presence in message list ARIA | NOT visible — no attachment-specific ARIA annotation in `option` accessible names | confirmed-live |
| Attachment badge as distinct ARIA element | NOT present on message rows in ARIA tree | confirmed-live |
| `hasattachment:yes` KQL property | Targets messages with actual downloadable file attachments — use this, not `has:attachment` | inferred |
| `has:attachment` KQL query | Returns results but includes HTML emails with inline embedded images; NOT reliable for finding file attachments | confirmed-live |
| File download attachments in reading pane | UNRESOLVED — `has:attachment` surfaces inline-image messages only; file-download attachment ARIA structure not captured | unresolved |
| Inline image indicator | `button "Show original size"` inside `document "Message body"` | confirmed-live |
| Ribbon filter button | `button "Has attachments"` in the Search ribbon tab — clicking filters search results | confirmed-live |

**`has:attachment` vs `hasattachment:yes`:** `hasattachment:yes` is the KQL property that targets actual downloadable file attachments. `has:attachment` is broader and unreliable for this purpose.

**What remains unresolved:** File attachment ARIA structure in the reading pane (e.g., an attachment list region, `link "{filename}.pdf"`, or `button "Download {filename}"`).

---

### Unread and Flagged State Markers

| Property | Value | Confidence |
|----------|-------|------------|
| Unread message: name prefix | `"Unread "` (with trailing space) at start of `option` accessible name | confirmed-live |
| Unread message: child button | `button "Mark as read"` | confirmed-live |
| Read message: name prefix | None — name starts directly with sender | confirmed-live |
| Read message: child button | `button "Mark as unread"` | confirmed-live |
| Important/flagged by Copilot prefix | `"Important "` prefix | confirmed-live |
| Copilot high priority prefix | `"Marked as high priority by Copilot"` prefix (from prior research session, not captured live) | inferred |
| Meeting/calendar item indicator | `"Meeting "` prefix in accessible name (e.g., `"Unread Meeting Corporate Citizenship..."`) | confirmed-live |
| Flag button (selected row) | `button "Flag this message"` visible on focused/selected row | confirmed-live |
| KQL filter for unread | `is:unread` — standard KQL syntax | inferred |
| KQL filter for flagged | `is:flagged` — standard KQL syntax | inferred |

---

### Focused Inbox

| Property | Value | Confidence |
|----------|-------|------------|
| Tab presence | Varies by tenant — check for `button "Focused"` in snapshot | confirmed-live |
| Tab role if present | `button "Focused"` and `button "Other"` above the message list | inferred from Microsoft screen reader docs |
| Tab location if present | Between the Filter/Sort controls and the `listbox "Message list"` container | inferred |
| Navigation when tabs present | Click `button "Other"` to see Other tab; full inbox visible when Focused is disabled | inferred |

**Implementation note:** Code must be defensive — detect whether Focused/Other tabs exist before attempting to navigate. When tabs are absent, the inbox already shows all messages.

---

### URL Patterns

| Pattern | URL | Confidence |
|---------|-----|------------|
| Inbox navigation target | `https://<base>/mail/inbox` | confirmed-live |
| URL after inbox loads | `https://<base>/mail/` (redirects from `/mail/inbox` on load) | confirmed-live |
| Open message URL | `https://<base>/mail/id/<URL-encoded-Exchange-ItemID>` | confirmed-live |
| URL after interactive search | `https://<base>/mail/` — URL does NOT change after search (SPA state) | confirmed-live |
| Deeplink search URL | `https://<base>/mail/deeplink/search?query=<term>` — documented but may produce loading spinner on some tenants | confirmed-live (limitation) |
| Deeplink read URL | `https://<base>/mail/deeplink/read/<URL-encoded-ItemID>` | inferred |

**CORRECTION:** Prior research documented the open message URL as `/mail/inbox/id/`. Live captures confirm it is `/mail/id/` (without `inbox` in the path).

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

*Evidence section omitted from this template. When you run capture sessions against your
own Outlook tenant, the raw snapshot output will contain personal data (email addresses,
colleague names, message subjects, message IDs) and must not be committed to source control.*

*Populate `references/outlook-ui.md` (gitignored) with your own live captures.*
