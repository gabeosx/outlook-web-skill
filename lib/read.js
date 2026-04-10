'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputOk, outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-search.json';  // D-18: reuse existing policy

// D-15: File extension heuristic for best-effort attachment detection
const ATTACHMENT_EXTENSIONS = /\.(pdf|docx|xlsx|pptx|doc|xls|ppt|zip|csv|txt|msg|eml|png|jpg|jpeg|gif)$/i;

/**
 * Parse process.argv for read subcommand arguments.
 * Expects: node outlook.js read <exchange-item-id>
 * Per D-05: single required positional argument.
 *
 * @param {string[]} argv - process.argv
 * @returns {{ id: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(3);  // skip node, outlook.js, read
  const id = args[0] || null;
  if (!id) {
    outputError('read', 'INVALID_ARGS', 'Usage: node outlook.js read <id>');
    // outputError exits -- code below never runs
  }
  return { id };
}

/**
 * Parse the reading pane accessibility snapshot text to extract email metadata and body.
 *
 * ARIA structure (confirmed-live from references/outlook-ui.md Capture 7):
 *   - main "Reading Pane" [ref=e14]
 *     - heading "{subject}" [level=3, ref=e55]         <-- first occurrence = subject
 *     - button "Summary by Copilot" [ref=e56]
 *     - heading "{subject}" [level=3, ref=e84]         <-- second occurrence, skip
 *     - heading "From: {sender}" [level=3, ref=e87]
 *     - heading "To: {recipients}" [level=3, ref=e88]
 *     - heading "Cc: {names}" [level=3, ref=...]       <-- present only if Cc exists
 *     - heading "{weekday} {date} {time}" [level=3, ref=e85]
 *     - document "Message body" [ref=e91]
 *       - link "{link text}" [ref=eN]
 *       - button "Show original size" [ref=eN]         <-- inline image
 *       ...
 *     - menuitem "Reply" [ref=e92]
 *     - menuitem "Forward" [ref=e93]
 *
 * @param {string} text - Raw text from scoped snapshot of reading pane
 * @returns {{ subject: string|null, from: string|null, to: string|null, cc: string|null, date: string|null, body_text: string, has_attachments: boolean, attachment_names: string[] }}
 */
function parseReadingPaneSnapshot(text) {
  const lines = text.split('\n');
  let subject = null;
  let from = null;
  let to = null;
  let cc = null;
  let date = null;
  let inMessageBody = false;
  const bodyLines = [];

  // Date heading pattern: "heading "{weekday} {date} {time}" [level=3]"
  // Examples: "Mon 6/24/2024 6:25 PM", "Fri 4/10/2026 8:23 AM"
  const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const dateHeadingRe = new RegExp(
    `^\\s*-\\s+heading\\s+"(${DAY}\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{1,2}:\\d{2}\\s+[AP]M)"\\s+\\[level=3`
  );

  // Generic level-3 heading
  const headingRe = /^\s*-\s+heading\s+"(.+?)"\s+\[level=3/;

  // Document "Message body" start marker
  const bodyStartRe = /^\s*-\s+document\s+"Message body"/;

  // End of body: menuitem "Reply" signals body is over
  const bodyEndRe = /^\s*-\s+menuitem\s+"Reply"/;

  // Any child element with accessible text (link, button, heading, generic, text, paragraph)
  // Matches lines like: "      - link "some text" [ref=eN]"
  const childTextRe = /^\s+-\s+\w+\s+"(.+?)"\s*(?:\[.*)?$/;

  for (const line of lines) {
    // Check for body end before processing body lines
    if (bodyEndRe.test(line)) {
      inMessageBody = false;
      continue;
    }

    if (inMessageBody) {
      const m = line.match(childTextRe);
      if (m && m[1].trim()) {
        bodyLines.push(m[1].trim());
      }
      continue;
    }

    // Check for body start
    if (bodyStartRe.test(line)) {
      inMessageBody = true;
      continue;
    }

    // Level-3 headings contain all metadata (D-11)
    const hm = headingRe.exec(line);
    if (hm) {
      const headingText = hm[1];

      // From: heading
      if (headingText.startsWith('From: ')) {
        from = headingText.slice('From: '.length);
        continue;
      }

      // To: heading
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

  // D-15: Best-effort attachment detection from body element names
  const attachmentNames = bodyLines.filter(text => ATTACHMENT_EXTENSIONS.test(text.trim()));

  return {
    subject,
    from,
    to: to ?? null,
    cc: cc ?? null,
    date,
    body_text: bodyLines.join('\n'),
    has_attachments: attachmentNames.length > 0,
    attachment_names: attachmentNames,
  };
}

/**
 * Main read subcommand handler.
 * Orchestrates: arg parsing -> batch(open+wait+get url+snapshot) -> parse -> output.
 *
 * Per D-07: Navigates directly to OUTLOOK_BASE_URL + "/mail/id/" + encodeURIComponent(id).
 * Per D-08: Full workflow in one batch. Snapshot is the final command.
 * Per D-09: Session check via get url inside batch -- if login redirect, return SESSION_INVALID.
 * Per D-10: Snapshot scoped to reading pane: -s "main[aria-label='Reading Pane']".
 */
function runRead() {
  const { id } = parseArgs(process.argv);

  log(`read: id="${id.slice(0, 30)}..."`);

  // D-07: Direct URL navigation -- /mail/id/ pattern (NOT /mail/inbox/id/)
  const emailUrl = process.env.OUTLOOK_BASE_URL + '/mail/id/' + encodeURIComponent(id);
  log(`read: navigating to ${emailUrl.slice(0, 80)}...`);

  // D-08: Full read workflow in one batch
  const result = runBatch([
    ['open', emailUrl],
    ['wait', '3000'],                                           // D-08: reading pane render time
    ['get', 'url'],                                             // D-09: for session check
    ['snapshot', '-s', "main[aria-label='Reading Pane']"],      // D-10: scoped snapshot, must be last
  ], POLICY);

  if (result.status !== 0) {
    log(`read: batch failed (status ${result.status})`);
    if (result.stderr) log(`read: stderr: ${result.stderr.trim().slice(0, 300)}`);
    outputError('read', 'OPERATION_FAILED', 'Read batch failed -- browser error or timeout');
    return;
  }
  log('read: batch complete (open + wait + get url + snapshot)');

  const cleaned = stripContentBoundaries(result.stdout);
  log(`read: batch stdout ${cleaned.length} chars`);

  if (!cleaned.trim()) {
    log('read: batch output empty after stripping boundaries');
    outputError('read', 'OPERATION_FAILED', 'Reading pane snapshot was empty -- email may not have loaded');
    return;
  }

  // D-09: Session check -- find URL line in batch stdout
  // The 'get url' output appears as a line starting with http before the snapshot text
  const outputLines = cleaned.split('\n');
  const urlLine = outputLines.find(l => l.trim().startsWith('http'));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    log(`read: session expired — detected login URL: ${urlLine.trim().slice(0, 80)}`);
    outputError('read', 'SESSION_INVALID', 'Session expired -- run: node outlook.js auth');
    return;
  }

  // Check for empty reading pane (no message loaded)
  // If snapshot only contains the main landmark with no children, it means no email was rendered
  const hasContent = outputLines.some(l => /^\s+-\s+heading\s+".+"\s+\[level=3/.test(l));
  if (!hasContent) {
    log('read: reading pane appears empty (no headings found)');
    outputError('read', 'OPERATION_FAILED', 'Reading pane was empty -- email may not exist or may not have loaded. Try increasing wait time.');
    return;
  }

  // Parse the reading pane snapshot (D-11, D-12, D-13)
  const parsed = parseReadingPaneSnapshot(cleaned);
  log(`read: parsed — subject="${(parsed.subject || '').slice(0, 50)}" from="${(parsed.from || '').slice(0, 40)}" body=${parsed.body_text.length} chars`);

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
