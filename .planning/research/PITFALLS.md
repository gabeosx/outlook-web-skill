# Domain Pitfalls: Outlook Web Browser Automation

**Domain:** Outlook web read-only automation via CDP (agent-browser)
**Researched:** 2026-04-10
**Confidence:** MEDIUM — training data through Aug 2025; no live verification available.
Microsoft's detection posture evolves continuously; treat all detection claims as requiring
runtime validation in Phase 1.

---

## Critical Pitfalls

Mistakes that cause rewrites, complete failures, or hard-to-diagnose silent breakage.

---

### Pitfall 1: CDP Automation Fingerprint (Top Concern)

**What goes wrong:** Chromium launched via CDP exposes several signals that Microsoft's
Azure AD / Outlook web front-end can detect. Detection results in either a silent redirect to
a CAPTCHA / "unusual sign-in activity" page, a forced re-authentication challenge, or a
silent error where the UI appears loaded but interactions fail inexplicably.

**Signals Microsoft (and underlying detection libraries like DataDome / Bot-Management) look for:**

| Signal | What it exposes | Severity |
|--------|----------------|----------|
| `navigator.webdriver === true` | Chrome sets this flag when launched via CDP with no overrides | HIGH |
| `window.cdc_*` properties | Chrome's internal `__cdc_asdjflasutopfhvcZLmcfl_` variable injected by ChromeDriver/CDP | HIGH |
| Missing or inconsistent `navigator.plugins` / `navigator.mimeTypes` | Headless Chrome has an empty plugins list | MEDIUM |
| `chrome.runtime` undefined in headless | Signals a headless environment | MEDIUM |
| `permissions.query({name:'notifications'})` returning "denied" without user prompt | Headless Chrome behaviour | MEDIUM |
| Uniform `screen` / `outerWidth` / `outerHeight` values | Common in automated environments | LOW |
| Missing hardware concurrency / device memory variation | Fixed values in headless | LOW |
| Mouse movement entropy | Zero or linear mouse paths before clicks | MEDIUM |
| Keystroke timing uniformity | `fill` commands type at machine speed | MEDIUM |
| TLS fingerprint (JA3/JA4) | Chrome CDP launches with distinctive TLS handshake | LOW–MEDIUM |
| HTTP request headers pattern | Missing `sec-ch-ua-*` headers or wrong order | LOW |

**Why it happens:** agent-browser uses Chrome/Chromium via CDP. By default CDP does not
suppress `navigator.webdriver`. Microsoft Outlook web is a high-value target; it likely uses
Azure AD's bot-detection infrastructure, which is regularly updated.

**Consequences:** Authentication page may refuse to proceed, or the inbox page loads but
search/email-open operations fail with 403s or redirects to login.

**Prevention:**

1. Use `--headed` mode (non-headless) for all automation — removes most headless-specific
   signals (`navigator.plugins` populated, `outerWidth` matches `innerWidth`, etc.).
   agent-browser supports `--headed` flag or `AGENT_BROWSER_HEADED=1`.

2. Use a **persistent Chrome profile** (`--profile ~/.outlook-skill-profile`) that has
   visited Outlook normally. Cookies, cached resources, and browser history reduce bot-score.

3. Use the **"import from running browser"** auth approach (`--auto-connect state save`)
   rather than a fresh CDP launch — the saved cookies came from a real browser session.

4. Set a realistic viewport: `agent-browser set viewport 1440 900` (not the default 1280x720
   which is an automation red flag).

5. Do NOT use the Lightpanda engine — it is a minimal headless browser with far more
   fingerprint gaps than Chrome.

6. Avoid triggering `wait --load networkidle` — Outlook has persistent WebSocket connections
   (SignalR for push notifications) that prevent networkidle from ever settling, and the
   unusual wait pattern itself may be detectable.

**Warning signs:**
- Redirect to `login.microsoftonline.com` immediately after `open https://outlook.live.com/mail`
- "Something went wrong" / "We can't sign you in" error page after auth state load
- The URL briefly shows inbox then redirects to login (session rejected server-side)
- CAPTCHA / "stay signed in?" loop that never resolves

**Detection:** After loading auth state, check `agent-browser get url` — if it contains
`login.microsoft` or `/error` the session was rejected. A snapshot returning an empty
accessibility tree or only a login form is also diagnostic.

**Phase:** Address in Phase 1 (auth skeleton). This must be solved before any feature work.

---

### Pitfall 2: Conditional Access / MFA Re-Challenge Mid-Session

**What goes wrong:** Microsoft Entra ID (formerly Azure AD) conditional access policies
can revoke a session token at any time — not just on expiry. Triggers include: signing in
from a new IP address, a security policy change, admin-forced re-authentication, or a device
compliance check failure. When this happens mid-automation, Outlook silently redirects to the
login/MFA page. The automation sees what looks like a navigated page but can no longer
access mail.

**Why it happens:** Outlook web uses short-lived access tokens (typically 1-hour) backed by
longer-lived refresh tokens (typically 90 days for personal accounts, configurable for
org accounts). Conditional access can revoke refresh tokens. When a refresh fails, the SPA
redirects without any user-visible warning in the headless context.

**Consequences:** The skill returns empty results or JSON with an auth error. Worse, if not
detected, the skill may return stale data or an error that the calling agent misinterprets.

**Prevention:**

1. Detect the auth state on every invocation — check the URL after `open` and look for
   the presence of the mail folder tree in the snapshot before attempting any operation.

2. Implement a `SESSION_INVALID` error code in the JSON output schema so the calling agent
   can prompt the user for re-authentication.

3. For org accounts (Office 365), coordinate with the user on session lifetime settings —
   "Stay signed in" / "Keep me signed in" at login time extends the refresh token window.

4. Store the Chrome profile (`--profile`) rather than a state JSON file when possible —
   profile-based storage retains more session signals (service workers, IndexedDB tokens)
   that reduce re-auth frequency.

**Warning signs:**
- URL after `open` is `login.microsoftonline.com` or contains `?wa=wsignin`
- Snapshot returns a form with username/password fields instead of inbox elements
- `agent-browser get title` returns "Sign in to your account" or similar

**Phase:** Phase 1 (auth) must define the detection protocol. Phase 2 (operations) must
check auth state on every operation entry point.

---

### Pitfall 3: Dynamic CSS Classes / Unstable Selectors

**What goes wrong:** Outlook web (React + Fluent UI) generates CSS class names that are
either obfuscated hashes or auto-incremented identifiers. They change between deployments
and sometimes between page loads. Any automation that hardcodes CSS class selectors will
break silently after a Microsoft update.

**Examples of unstable patterns:**
- `.ms-List-cell` (Fluent UI component classes) — relatively stable
- `.z123abc` style hashed classes — deployment-sensitive
- `[data-unique-id="..."]` attributes — change per-session

**Prevention:**

1. Use agent-browser's accessibility tree snapshot (`snapshot -i`) as the primary
   interaction method — it exposes ARIA roles, labels, and semantic names that are stable
   across deployments. These are driven by accessibility requirements, not implementation.

2. When selectors are needed for scoping, prefer:
   - `[aria-label="Inbox"]` — tied to accessibility strings
   - `[data-convid="..."]` — conversation IDs from URL/state (stable per email)
   - `role="listitem"` + text content matching

3. Never hardcode a `.ms-*` or hashed class as the primary locator. Use them only as
   secondary scoping hints inside `snapshot -s`.

4. Build a selector-verification step into Phase 2: after each `open`, take a snapshot
   and confirm that key landmarks (folder list, message list, reading pane) are present
   by semantic role before proceeding.

**Warning signs:**
- Snapshot returns refs but clicks produce no visible effect
- `agent-browser find text "Inbox" click` works but `snapshot -s ".some-class"` returns empty

**Phase:** Phase 2 (read/search operations). Design selectors semantically from day one.

---

## Moderate Pitfalls

---

### Pitfall 4: SPA Navigation and DOM Settling

**What goes wrong:** Outlook is a React SPA. After clicking a folder or email, the URL
may not change (uses hash routing or pushState), and the DOM updates asynchronously.
If the next snapshot or interaction fires before the new content renders, the automation
reads stale or transitional DOM states — for example, reading a loading spinner's text
as the email body.

**Specific failure modes:**
- Clicking an email and immediately snapshotting captures "Loading..." placeholder
- Navigating to Search and snapshotting before results load captures the empty results state
- The reading pane renders in stages: subject first, then sender, then body

**Prevention:**

1. After clicking an email, wait for specific content: `agent-browser wait --text "From:"` or
   wait for the message body container to appear by ARIA role.

2. For search results, wait for either a result count element or the first result item to
   appear: `agent-browser wait --fn "document.querySelectorAll('[role=\"option\"]').length > 0"`

3. Use `wait 1500` as a conservative fallback when semantic waits are uncertain — Outlook's
   animations complete in under 500ms but data loading can take 1-2s on slow connections.

4. Never chain `click @e_email` directly to `snapshot -i` with `&&` — the DOM will be in
   transition. Use a wait between them.

5. Do not use `wait --load networkidle` — Outlook maintains persistent SignalR/WebSocket
   connections for push notifications, which means networkidle never fires.

**Warning signs:**
- Snapshot returns "Loading" or spinner elements
- Email body text is empty or contains only the subject line
- Search returns 0 results on a query that should return results

**Phase:** Phase 2 (read and search operations). Each operation needs its own settle strategy.

---

### Pitfall 5: Session Cookie Scope and Cross-Domain Auth

**What goes wrong:** Outlook operates across multiple domains. A `state save` or
`--session-name` persistence captures cookies for the domains visited. If the initial
login involved `login.microsoftonline.com` (Azure AD) and then redirected to
`outlook.live.com` or `outlook.office365.com`, the saved state needs cookies from all
visited origins.

**Risk:** Restoring a state file that only has `outlook.live.com` cookies but missing
the Azure AD tokens will fail silently — the UI may briefly appear authenticated but
API calls return 401.

**Prevention:**

1. Use the `--profile` approach (full Chrome user data directory) rather than `state save`
   — profiles retain cookies for ALL domains visited in that profile, including Azure AD.

2. If using `state save`, complete the full login flow including all redirects before saving,
   and verify the saved URL is the inbox (not a redirect page).

3. On restore, always verify auth state before proceeding: navigate to the inbox URL and
   check that the folder tree is visible.

**Warning signs:**
- State loads without error but `open https://outlook.live.com/mail/0/` redirects to login
- URL after open briefly shows inbox then redirects

**Phase:** Phase 1 (auth persistence design).

---

### Pitfall 6: Accidental Write Action Triggering

**What goes wrong:** Outlook web has many write actions accessible via keyboard shortcuts
and contextual menus that appear adjacent to read-only elements. The project requirement
is strictly read-only. Risks include:

- `Delete` key pressed while a message is focused → email moved to Deleted Items
- `R` key pressed while focused on message list → opens Reply compose window
- Right-click context menu near a message → click slightly off target hits "Delete" or "Move"
- Clicking an attachment that triggers a "Save to OneDrive" dialog with auto-confirm
- Clicking "Mark as read" (appears on hover, close to email subject)

**Prevention:**

1. Use agent-browser's **Action Policy** feature to explicitly allowlist safe actions:
   ```json
   { "default": "deny", "allow": ["navigate", "snapshot", "get", "wait", "scroll"] }
   ```
   Set `AGENT_BROWSER_ACTION_POLICY=./policy.json`. This prevents `click`, `fill`, `press`,
   `keyboard` from executing — but note this also blocks necessary read interactions.
   **Recommended approach:** Use a narrow allowlist that includes `click` only on verified
   read-only targets, not a global click allowlist.

2. Never use `agent-browser press Delete` or keyboard shortcuts while Outlook is the active
   page. Avoid `agent-browser keyboard type` entirely.

3. Use the **Domain Allowlist** to prevent accidental navigation to write endpoints:
   ```
   AGENT_BROWSER_ALLOWED_DOMAINS="outlook.live.com,outlook.office365.com,login.microsoftonline.com,*.microsoft.com"
   ```

4. Before any click interaction, verify the element's ARIA role and label from the snapshot
   and confirm it is a navigation/read element (link, listitem, tab) not a button with a
   write action name ("Delete", "Reply", "Forward", "Move").

5. Consider using `agent-browser get text @eN` instead of clicking to open emails — extract
   email content via the reading pane that auto-populates on keyboard focus, or use URL-based
   navigation directly to a message URL when available.

**Warning signs:**
- Snapshot after an operation shows a "Compose" or "Reply" pane
- Email count in folder decreases
- "Undo" toast appears in the UI

**Phase:** Phase 1 (define action policy). Phase 2 (enforce in operation implementation).
Phase 3 (add read-only assertion tests).

---

### Pitfall 7: Outlook Web Version Variability

**What goes wrong:** Microsoft runs multiple versions of Outlook web simultaneously:
- `outlook.live.com` — personal Microsoft accounts (MSA)
- `outlook.office365.com` / `outlook.office.com` — work/school accounts (Entra ID)
- `outlook.office.com/mail/new-outlook` — "New Outlook" React-based experience
- Legacy "Classic Outlook" (Polymer-based, being retired)

The DOM structure, ARIA labels, and navigation patterns differ significantly across these.
An automation built for personal accounts will likely fail for org accounts and vice versa.

**Prevention:**

1. Phase 1 must determine and document which Outlook variant the user's account targets.

2. Build URL detection into the skill entry point — inspect the URL after auth to determine
   which variant is active and branch accordingly, or fail fast with a clear error.

3. Test against the specific variant in use. Do not assume personal account structure applies
   to org accounts.

**Warning signs:**
- Snapshot returns elements with unexpected labels
- Folder tree is missing or structured differently than expected
- Search bar is in a different location/ARIA role

**Phase:** Phase 1 (auth and environment detection).

---

### Pitfall 8: Content Security Policy Blocking eval/Script Injection

**What goes wrong:** Outlook web sets a strict Content Security Policy (CSP) that blocks
inline script execution from external origins. If agent-browser's `eval` command injects
JavaScript that the CSP rejects, it will silently fail or throw a console error that the
automation doesn't surface.

**Specific concern:** `agent-browser eval` runs code in the page context via CDP's
`Runtime.evaluate`. CDP bypasses CSP for `Runtime.evaluate` calls — CSP applies to the
page's own script tags and fetch calls, not to CDP-injected evaluation. So `eval` itself
is safe.

**However:** If the skill attempts to load external scripts via `eval` (e.g., injecting
a `<script>` tag), that WILL be blocked by CSP. Do not inject scripts — use CDP eval directly.

**What IS blocked:** Outlook's CSP may block certain `fetch()` calls from eval'd code to
external APIs (e.g., trying to export data to a third-party service from within the page).
This is intentional and should not be worked around.

**Prevention:**

1. Use CDP `eval` only for reading DOM state (no external fetches from within eval).
2. Do not inject `<script>` tags.
3. All data extraction should use `agent-browser get text`, `snapshot -i`, or `eval` with
   only DOM reads — no network calls from within the page context.

**Warning signs:**
- `eval` returns null or undefined unexpectedly
- Console errors visible in headed mode about CSP violations

**Phase:** Phase 2 (operations). Be aware when writing any `eval` calls.

---

## Minor Pitfalls

---

### Pitfall 9: Outlook's Virtualized Email List

**What goes wrong:** The Outlook message list uses virtual scrolling (only DOM nodes for
visible items exist). Attempting to snapshot the entire inbox returns only the first ~20
visible emails. Scrolling to load more then snapshot-ing gets the next batch but loses
refs to previous items.

**Prevention:**

1. For `digest` and `search` operations, implement a paginated scroll loop: snapshot visible
   emails, extract data, scroll down, re-snapshot, repeat until desired count reached or
   no new items appear.

2. Use `agent-browser scroll down 500 --selector "[role='list']"` to scroll within the
   message list container, not the whole page.

3. For `read` by ID, navigate directly to the email's URL (Outlook provides permalink URLs
   for emails in the format `/mail/0/id/...`) rather than scrolling to find it.

**Warning signs:**
- Snapshot shows only 15-20 emails even though inbox has hundreds
- After extraction, email count in JSON is suspiciously low

**Phase:** Phase 2 (digest and search operation implementation).

---

### Pitfall 10: Iframe Embedding in Email Body

**What goes wrong:** Some emails (newsletters, rich HTML) embed iframes in the reading pane.
The email body rendered in Outlook's reading pane may be sandboxed in an iframe with
`sandbox` attributes that restrict JavaScript. agent-browser handles iframe content by
inlining it in snapshots, but the sandboxing may limit what text is accessible.

**Prevention:**

1. Use `snapshot -i` on the reading pane — agent-browser inlines iframe content for
   accessibility tree purposes, which usually captures visible text even in sandboxed iframes.

2. If body text is incomplete, try `agent-browser get text @eN` on the reading pane element
   directly rather than relying on the full snapshot.

3. For richly formatted emails, accept that some formatting/layout detail will be lost —
   plain text extraction is the correct goal for a read-only skill.

**Warning signs:**
- Email body snapshot shows subject/sender but empty body area
- Snapshot returns an `[Iframe]` node with no children

**Phase:** Phase 2 (read operation). Handle gracefully with partial content return.

---

### Pitfall 11: Outlook Search Rate Limiting

**What goes wrong:** Outlook web search is backed by Microsoft Search / Exchange Online
search. Rapid successive searches may be throttled — Microsoft's Exchange Online throttling
policy applies search quotas per user per time window. For personal accounts, limits are
less documented but anecdotally hit when doing 10+ searches in quick succession.

**Specific behavior:** The search results area shows a spinner that never resolves, or
returns an error message "Search is not available right now."

**Prevention:**

1. Add a 2-3 second delay between successive search operations.
2. For the `digest` operation, prefer navigating to the Inbox folder and scrolling to
   extract today's emails rather than issuing a search query.
3. Implement retry with exponential backoff when search returns no results unexpectedly.

**Warning signs:**
- Search spinner persists beyond 5 seconds
- "Search is not available" message in snapshot
- Empty results for a query that previously returned results

**Phase:** Phase 2 (search operation). Phase 3 (add retry logic).

---

### Pitfall 12: stdout Contamination from agent-browser Logs

**What goes wrong:** The project requires clean JSON on stdout. agent-browser may emit
progress output, warning lines, or diagnostic text to stdout (not just stderr) in some
command configurations. If this contaminates stdout, the calling Claude Code agent's JSON
parsing will fail.

**Prevention:**

1. Always use `agent-browser -q` (quiet flag) in production paths to suppress non-essential
   output.
2. Redirect agent-browser stderr explicitly: `agent-browser -q snapshot -i 2>/dev/null`
3. Use `--json` output mode where available (`snapshot -i --json`) to get machine-readable
   output that is easier to parse.
4. The skill's wrapper script is responsible for composing the final JSON — agent-browser
   output should be captured into variables, not passed through directly.

**Warning signs:**
- JSON parsing in the calling agent fails intermittently
- Extra lines appear before or after the JSON object in stdout

**Phase:** Phase 1 (CLI wrapper design). Build quiet-mode discipline from the start.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Auth first-run (Phase 1) | CDP fingerprint causes auth page to block or loop | Use `--headed`, `--profile`, and realistic viewport from day one |
| Auth persistence (Phase 1) | State file missing cross-domain Azure AD cookies | Use `--profile` over `state save`; verify inbox URL post-restore |
| Session detection (Phase 1) | Bot detection triggers after restore, not during initial auth | Test full session restore cycle before declaring auth complete |
| Read-only enforcement (Phase 1/2) | Accidental write via keyboard focus + keypress | Set Action Policy allowlist; never use keyboard commands on Outlook pages |
| Search operation (Phase 2) | Selector-based targeting breaks on Outlook update | Use ARIA role/label locators exclusively |
| Email open (Phase 2) | Virtualized list means target email may not be in DOM | Navigate by email permalink URL, not by scrolling to find |
| Search operation (Phase 2) | DOM not settled when snapshotting search results | Wait for result list element or use timed wait before snapshot |
| Digest operation (Phase 2) | Virtual scroll means only first ~20 emails visible | Implement scroll-and-accumulate loop |
| stdout output (Phase 1) | agent-browser status text on stdout breaks JSON | Use `-q` flag and `--json` output mode throughout |
| MFA re-challenge (Phase 2+) | Mid-session forced re-auth makes operations fail silently | Check URL on every operation entry; return `SESSION_INVALID` JSON error |

---

## Summary of Top Risks (Prioritized)

1. **CDP fingerprint / bot detection** — The hardest problem. Use `--headed` + `--profile`
   as the primary mitigation. No guarantee this fully prevents detection; validate in
   Phase 1 before building any features.

2. **MFA / conditional access mid-session** — Design the JSON error schema to handle this
   gracefully from Phase 1. Do not assume a once-valid session stays valid.

3. **Dynamic DOM and SPA settling** — Design all operation implementations with explicit
   settle strategies. Never snapshot immediately after a click.

4. **Accidental write actions** — Enforce Action Policy from day one. The read-only
   constraint is a hard safety boundary.

5. **Outlook variant mismatch** — Detect the variant at startup. Personal vs. org accounts
   have different DOM structures.

---

## Sources

- agent-browser SKILL.md and references (local, HIGH confidence)
- Microsoft Exchange Online throttling documentation (training data, MEDIUM confidence)
- Chrome DevTools Protocol automation detection signals — widely documented (MEDIUM confidence)
- Outlook web SPA architecture — based on known React + Fluent UI patterns (MEDIUM confidence)
- Microsoft Entra ID conditional access token lifetime policies (training data, MEDIUM confidence)
- Note: No live web verification was possible (WebSearch/WebFetch not available). All
  Microsoft-specific detection/throttling claims should be validated with a live test run
  in Phase 1.
