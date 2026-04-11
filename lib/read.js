'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputOk, outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // D-18: reuse existing policy

// D-15: File extension heuristic for best-effort attachment detection (fallback only)
// Primary detection uses region "Attachments" ARIA region (live-verified below)
const ATTACHMENT_EXTENSIONS = /\.(pdf|docx|xlsx|pptx|doc|xls|ppt|zip|csv|txt|msg|eml|png|jpg|jpeg|gif)$/i;

/**
 * Parse process.argv for read subcommand arguments.
 * Expects: node outlook.js read <data-convid> [--query <search-query>]
 * Per D-05: single required positional argument.
 *
 * --query is an optional hint that specifies what search was used to find this email.
 * If not provided, read uses a broad recent-mail search to load the email list.
 *
 * @param {string[]} argv - process.argv
 * @returns {{ id: string, query: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(3);  // skip node, outlook.js, read
  let id = null;
  let query = ' ';  // default: space triggers broad recent-mail search in Outlook

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' && i + 1 < args.length) {
      query = args[i + 1];
      i++;
    } else if (!id) {
      id = args[i];
    }
  }

  if (!id) {
    outputError('read', 'INVALID_ARGS', 'Usage: node outlook.js read <id> [--query <search-query>]');
    // outputError exits -- code below never runs
  }
  return { id, query };
}

/**
 * Build an eval script that safely clicks an option element by data-convid.
 *
 * The convid is a base64 string that may contain +, /, and = characters.
 * We embed it using btoa/atob to avoid quoting hazards in the eval string:
 * the encoded form has only URL-safe chars and is re-decoded in the browser.
 *
 * @param {string} convid - The data-convid value to match
 * @returns {string} Eval script that clicks the element and returns 'clicked' or 'not_found'
 */
function buildClickEval(convid) {
  // URL-encode the convid so it is safe to embed in a JS string literal.
  // The only characters needing escaping in a double-quoted JS string are: " and \
  // Base64 strings contain only [A-Za-z0-9+/=] — none need escaping.
  const safe = convid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return (
    '(function() {' +
    'var id = "' + safe + '";' +
    'var els = Array.from(document.querySelectorAll("[data-convid]"));' +
    'var t = els.find(function(e) { return e.getAttribute("data-convid") === id; });' +
    'if (!t) return "not_found:" + els.length;' +
    't.click();' +
    'return "clicked";' +
    '})()'
  );
}

/**
 * Parse the reading pane accessibility snapshot text to extract email metadata and body.
 *
 * ARIA structure (live-verified from Phase 3 batch snapshot):
 *
 *   - main "Reading Pane" [ref=e14]
 *     - generic
 *       - generic
 *         - heading "{subject}" [level=3, ref=e48]          ← first occurrence = subject
 *         - button "Summary by Copilot"
 *         - heading "{subject}" [level=3, ref=e77]          ← duplicate, skip
 *         - button "Opens card for ..."
 *         - heading "From: {sender}" [level=3, ref=e78]
 *         - toolbar (unnamed)                               ← Reply toolbar BEFORE body, skip
 *           - menuitem "Reply"
 *           ...
 *         - generic
 *           - heading "To: {recipients}" [level=3, ref=e82]
 *           - heading "Cc: {names}" [level=3, ref=e83]      ← present only if Cc exists
 *         - heading "{weekday} {date} {time}" [level=3, ref=e79]
 *         - generic
 *           - document "Message body" [ref=e105]
 *             - StaticText "body text..."
 *             - LineBreak
 *             - paragraph / generic / link / image elements
 *         - toolbar "Quick actions"                         ← body end marker
 *           - menuitem "Reply"
 *           - menuitem "Reply all"
 *           - menuitem "Forward"
 *
 * Notes:
 * - The unnamed `toolbar` before the body contains the first "Reply" menuitem — do NOT
 *   use menuitem "Reply" as body end marker. Use `toolbar "Quick actions"` instead.
 * - `document "Message body"` children include StaticText, LineBreak, paragraph, generic,
 *   link, and image elements — not just links/buttons.
 * - Subject appears twice (before and after "Summary by Copilot") — take only the first.
 * - To/Cc headings are inside an unnamed `generic` wrapper after the Reply toolbar.
 *
 * @param {string} text - Raw text from scoped snapshot of reading pane
 * @returns {{ subject, from, to, cc, date, body_text, has_attachments, attachment_names }}
 */
function parseReadingPaneSnapshot(text) {
  const lines = text.split('\n');
  let subject = null;
  let from = null;
  let to = null;
  let cc = null;
  let date = null;
  let inMessageBody = false;
  let bodyDone = false;  // after first body ends, don't re-enter (prevents duplicate capture)
  const bodyLines = [];

  // Date heading pattern: "heading "{weekday} {date} {time}" [level=3]"
  // Examples: "Mon 6/24/2024 6:25 PM", "Fri 4/10/2026 8:23 AM", "Thu 4/9/2026 4:00 PM"
  const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const dateHeadingRe = new RegExp(
    `^\\s*-\\s+heading\\s+"(${DAY}\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{1,2}:\\d{2}\\s+[AP]M)"\\s+\\[level=3`
  );

  // Generic level-3 heading (captures heading text before [level=3] attribute)
  const headingRe = /^\s*-\s+heading\s+"(.+?)"\s+\[level=3/;

  // Document "Message body" start marker
  const bodyStartRe = /^\s*-\s+document\s+"Message body"/;

  // End of body: toolbar "Quick actions" signals end of message body region.
  // NOTE: do NOT use `menuitem "Reply"` — that also appears in the unnamed toolbar
  // BEFORE the body content, which would prematurely end body extraction.
  const bodyEndRe = /^\s*-\s+toolbar\s+"Quick actions"/;

  // Attachment section: heading "file attachments" [level=3] appears between date and body.
  // Live-verified ARIA structure (D-14 resolved):
  //   - heading "file attachments" [level=3, ...]
  //     - listbox "file attachments" [...]
  //       - generic [...] clickable
  //         - option "<filename> Open <size KB>" [...]
  //           - StaticText "<filename>"     ← use StaticText for clean filename
  const attachHeadingRe = /^\s*-\s+heading\s+"file attachments"\s+\[level=3/;
  // StaticText inside attachment listbox that looks like a filename (has extension)
  const attachFileRe = /^\s+-\s+StaticText\s+"([^"]+\.[a-zA-Z]{2,5})"\s*(?:\[.*)?$/;

  // Content lines inside Message body — extract visible text from StaticText and other elements
  // Match: "- <role> "<text>" [optional attrs]" — captures any text inside quotes after role
  // Excludes LineBreak (no text content) and elements with aria-hidden semantics
  const contentRe = /^\s+-\s+\w+\s+"(.+?)"\s*(?:\[.*)?$/;

  // Elements to skip when extracting body text (structural/navigation elements)
  const SKIP_BODY_ROLES = new Set(['image', 'separator', 'link-list']);

  let inAttachmentSection = false;
  const attachmentNames = [];

  for (const line of lines) {
    // Check for body end before processing body lines
    if (bodyEndRe.test(line)) {
      inMessageBody = false;
      bodyDone = true;
      continue;
    }

    if (inMessageBody) {
      // Skip LineBreak elements (they have no visible text)
      if (line.includes('LineBreak')) continue;
      // Extract text from content elements
      const m = line.match(contentRe);
      if (m && m[1].trim()) {
        // Skip image alt text, separator labels, and other non-prose elements
        const roleMatch = line.match(/^\s+-\s+(\w+)\s+/);
        const role = roleMatch ? roleMatch[1] : '';
        if (!SKIP_BODY_ROLES.has(role)) {
          bodyLines.push(m[1].trim());
        }
      }
      continue;
    }

    // Check for body start (only enter body once — skip duplicate section)
    if (bodyStartRe.test(line)) {
      if (!bodyDone) {
        inMessageBody = true;
        inAttachmentSection = false;  // body starts after attachment section
      }
      continue;
    }

    // Detect attachment section heading: "heading "file attachments" [level=3]"
    // This appears after the date heading and before document "Message body"
    if (attachHeadingRe.test(line)) {
      inAttachmentSection = true;
      continue;
    }

    // Extract attachment filenames from attachment section
    if (inAttachmentSection) {
      const am = line.match(attachFileRe);
      if (am && am[1].trim()) {
        attachmentNames.push(am[1].trim());
      }
      continue;
    }

    // Level-3 headings contain all metadata (D-11)
    const hm = headingRe.exec(line);
    if (hm) {
      const headingText = hm[1];

      // Skip "file attachments" heading (handled above)
      if (headingText === 'file attachments') continue;

      // From: heading
      if (headingText.startsWith('From: ')) {
        from = headingText.slice('From: '.length);
        continue;
      }

      // To: heading (may be inside a generic wrapper but still appears at level=3)
      if (headingText.startsWith('To: ')) {
        to = headingText.slice('To: '.length);
        continue;
      }

      // Cc: heading
      if (headingText.startsWith('Cc: ')) {
        cc = headingText.slice('Cc: '.length);
        continue;
      }

      // Date heading (Day M/D/YYYY H:MM AM/PM)
      if (dateHeadingRe.test(line)) {
        date = headingText;
        continue;
      }

      // First non-prefixed heading = subject (D-11: take first, skip duplicates)
      if (subject === null) {
        subject = headingText;
      }
    }
  }

  // D-15: Fallback to file extension heuristic if attachment section not found
  // (handles edge cases where attachment ARIA structure differs)
  if (attachmentNames.length === 0) {
    const fallback = bodyLines.filter(t => ATTACHMENT_EXTENSIONS.test(t.trim()));
    attachmentNames.push(...fallback);
  }

  // Deduplicate attachment names (snapshot may contain duplicates from ARIA live regions)
  const uniqueAttachmentNames = [...new Set(attachmentNames)];

  return {
    subject,
    from,
    to: to ?? null,
    cc: cc ?? null,
    date,
    body_text: bodyLines.join('\n'),
    has_attachments: uniqueAttachmentNames.length > 0,
    attachment_names: uniqueAttachmentNames,
  };
}

/**
 * Main read subcommand handler.
 *
 * Navigation approach: data-convid based search+click.
 *
 * The `id` from search results is the `data-convid` attribute (Exchange ConversationId).
 * This does NOT directly work as a URL path component — the `/mail/id/` URL requires
 * the message-level Exchange ItemId which is only accessible after clicking the email.
 *
 * Instead, `read` navigates to Outlook, performs a search to load the email list
 * (using --query if provided, or a broad space-search that returns recent mail),
 * then uses eval to click the specific [data-convid="<id>"] element and capture
 * the reading pane snapshot.
 *
 * Architecture decisions:
 * - D-07: navigate via search+click, NOT /mail/id/ URL (URL pattern uses different ID type)
 * - D-08: full workflow in one batch
 * - D-09: session check via get url inside batch
 * - D-10: snapshot scoped to [aria-label="Reading Pane"] (CSS selector for <div role="main">)
 * - D-11: metadata from level-3 headings
 * - D-12: body_text from document "Message body" subtree
 */
function runRead() {
  const { id, query } = parseArgs(process.argv);

  log(`read: id="${id.slice(0, 30)}..." query="${query}"`);

  // Build a safe eval script to click the target element
  const clickEval = buildClickEval(id);

  // D-08: Full read workflow in one batch
  const result = runBatch([
    ['open', process.env.OUTLOOK_BASE_URL],
    ['wait', '5000'],                          // cold start: 5s needed for SPA render
    ['find', 'role', 'combobox', 'click'],    // activate search combobox
    ['wait', '500'],
    ['find', 'role', 'combobox', 'fill', query],  // search to load email list
    ['press', 'Enter'],
    ['wait', '4000'],                          // wait for search results to render
    ['eval', clickEval],                       // click specific email by data-convid
    ['wait', '3000'],                          // wait for reading pane to render
    ['get', 'url'],                            // D-09: for session check
    ['snapshot', '-s', '[aria-label="Reading Pane"]'],  // D-10: scoped snapshot (CSS attr selector)
  ], POLICY);

  if (result.status !== 0) {
    log(`read: batch failed (status ${result.status})`);
    if (result.stderr) log(`read: stderr: ${result.stderr.trim().slice(0, 300)}`);
    outputError('read', 'OPERATION_FAILED', 'Read batch failed -- browser error or timeout');
    return;
  }
  log('read: batch complete (open + search + click + get url + snapshot)');

  const cleaned = stripContentBoundaries(result.stdout);
  log(`read: batch stdout ${cleaned.length} chars`);

  if (!cleaned.trim()) {
    log('read: batch output empty after stripping boundaries');
    outputError('read', 'OPERATION_FAILED', 'Reading pane snapshot was empty -- email may not have loaded');
    return;
  }

  // D-09: Session check -- find URL line in batch stdout
  const outputLines = cleaned.split('\n');
  const urlLine = outputLines.find(l => l.trim().startsWith('http'));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`read: session expired -- detected login URL: ${urlLine.trim().slice(0, 80)}`);
    outputError('read', 'SESSION_INVALID', 'Session expired -- run: node outlook.js auth');
    return;
  }

  // Check if the click eval found the email
  const evalResultLine = outputLines.find(l => l.trim().startsWith('"not_found') || l.trim() === '"clicked"');
  if (evalResultLine && evalResultLine.trim().startsWith('"not_found')) {
    const count = evalResultLine.trim().match(/not_found:(\d+)/)?.[1] || '0';
    log(`read: email not found in search results (${count} emails loaded)`);
    outputError('read', 'MESSAGE_NOT_FOUND',
      `Email with id "${id.slice(0, 30)}..." not found in search results. ` +
      `Pass --query to specify the original search query (e.g., --query "from:sender@example.com"). ` +
      `Loaded ${count} emails with query "${query}".`);
    return;
  }

  // Check for empty reading pane (no message loaded)
  const hasHeading = outputLines.some(l => /^\s+-\s+heading\s+".+"\s+\[level=3/.test(l));
  if (!hasHeading) {
    log('read: reading pane appears empty (no level-3 headings found)');
    outputError('read', 'OPERATION_FAILED', 'Reading pane was empty -- email may not have loaded. Try increasing wait time or check the --query argument.');
    return;
  }

  // Parse the reading pane snapshot (D-11, D-12, D-13)
  const parsed = parseReadingPaneSnapshot(cleaned);
  log(`read: parsed -- subject="${(parsed.subject || '').slice(0, 50)}" from="${(parsed.from || '').slice(0, 40)}" body=${parsed.body_text.length} chars`);

  // D-13: Output with exact READ-03 schema
  outputOk('read', {
    subject: parsed.subject,
    from: parsed.from,
    to: parsed.to,
    cc: parsed.cc,
    date: parsed.date,
    body_text: parsed.body_text,
    has_attachments: parsed.has_attachments,
    attachment_names: parsed.attachment_names,
  });
  log('read: stdout write complete, returning to outlook.js');
}

module.exports = { runRead, parseReadingPaneSnapshot, parseArgs };
