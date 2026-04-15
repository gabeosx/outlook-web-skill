'use strict';

const { runBatch, stripContentBoundaries } = require('./run');
const { outputError, log } = require('./output');
const { isLoginUrl } = require('./session');

const POLICY = 'policy-copilot.json';

/**
 * Built-in prompt templates for Copilot summaries.
 * These are tuned for compact, parseable output that avoids Copilot truncation.
 */
const PROMPTS = {
  email: (since) =>
    `List emails I received${since ? ' since ' + since : ' in the last 24 hours'} that meet ANY of these criteria: ` +
    `(1) require action or response from me, (2) are from my direct leadership chain or external executives, ` +
    `(3) contain decisions, deadlines, or dollar amounts, (4) are about active projects or client work. ` +
    `Skip newsletters, digests, Viva Engage notifications, system notifications, training invitations, and bulk/marketing emails. ` +
    `For each email give me ONE LINE: sender name | subject | date | one-sentence summary | action needed (yes/no + what). Numbered list.`,

  teams: (since) =>
    `List all Teams messages where I was @mentioned${since ? ' since ' + since : ' in the last 24 hours'}, ` +
    `plus unread messages in my pinned/favorite chats. ` +
    `For each: who | chat/channel name | date | one-sentence summary | need to respond (yes/no). ` +
    `Numbered list, one line per item. Skip Viva Engage and bot notifications.`,

  both: (since) =>
    `Give me a combined summary of${since ? ' since ' + since : ' the last 24 hours'}:\n` +
    `EMAILS: List actionable emails (require response, from leadership/executives, contain deadlines/decisions). ` +
    `Skip newsletters, bulk, system notifications. One line each: sender | subject | action needed.\n` +
    `TEAMS: List @mentions and unread messages in pinned chats. One line each: who | channel | summary.\n` +
    `Numbered lists, compact format.`,
};

/**
 * Parse process.argv for copilot-summary subcommand arguments.
 * Expects: node outlook.js copilot-summary [--type email|teams|both] [--since "date"] [--prompt "custom"]
 *
 * @param {string[]} argv
 * @returns {{ type: string, since: string|null, customPrompt: string|null }}
 */
function parseArgs(argv) {
  const args = argv.slice(3);
  let type = 'both';
  let since = null;
  let customPrompt = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && i + 1 < args.length) {
      const t = args[i + 1].toLowerCase();
      if (['email', 'teams', 'both'].includes(t)) type = t;
      i++;
    } else if (args[i] === '--since' && i + 1 < args.length) {
      since = args[i + 1];
      i++;
    } else if (args[i] === '--prompt' && i + 1 < args.length) {
      customPrompt = args[i + 1];
      i++;
    }
  }

  return { type, since, customPrompt };
}

/**
 * Navigate to Copilot in Teams, send a prompt, and capture the response.
 *
 * Flow:
 * 1. Open Teams web
 * 2. Click Copilot in left sidebar
 * 3. Remove Researcher plugin if present (it crashes on long outputs)
 * 4. Type the prompt and send
 * 5. Wait for Copilot to finish generating (poll for completion)
 * 6. Snapshot the response
 *
 * @param {string} prompt - The prompt to send to Copilot
 * @returns {{ snapshotText: string } | null}
 */
function sendCopilotPrompt(prompt) {
  const teamsUrl = process.env.TEAMS_BASE_URL || 'https://teams.microsoft.com';

  // Step 1-2: Open Teams and navigate to Copilot
  log('copilot: opening Teams and navigating to Copilot...');
  const navResult = runBatch([
    ['open', teamsUrl],
    ['wait', '6000'],
    ['get', 'url'],
  ], POLICY);

  if (navResult.status !== 0) {
    log(`copilot: Teams navigation failed (status ${navResult.status})`);
    return null;
  }

  // Check for login redirect
  const navCleaned = stripContentBoundaries(navResult.stdout);
  const navLines = navCleaned.split('\n');
  const urlLine = navLines.find(l => /^https?:\/\/\S+$/.test(l.trim()));
  if (urlLine && isLoginUrl(urlLine.trim())) {
    return { _loginRequired: true };
  }

  // Click on Copilot in Teams chat list (treeitem in left rail)
  log('copilot: clicking Copilot treeitem...');
  const copilotClickResult = runBatch([
    ['find', 'text', 'Copilot', 'click'],
    ['wait', '4000'],
  ], POLICY);

  if (copilotClickResult.status !== 0) {
    log('copilot: could not find Copilot in Teams UI');
    return { _copilotNotFound: true };
  }

  // Step 3: Check for Researcher plugin and snapshot current state
  log('copilot: checking Copilot state...');
  const pluginCheckResult = runBatch([
    ['snapshot'],
  ], POLICY);

  if (pluginCheckResult.status === 0) {
    const pluginText = stripContentBoundaries(pluginCheckResult.stdout);
    if (pluginText.includes('Researcher') || pluginText.includes('researcher')) {
      log('copilot: Researcher plugin detected — attempting removal');
      runBatch([
        ['find', 'text', 'Remove Researcher', 'click'],
        ['wait', '1000'],
      ], POLICY);
    }
  }

  // Step 4: Type the prompt into Copilot's compose box and send
  // The textbox is inside a cross-origin iframe "Copilot" — `find` cannot reach it.
  // Tab into the iframe from the Copilot treeitem, then use `keyboard type`.
  log('copilot: tabbing into Copilot iframe and typing prompt...');
  const typeResult = runBatch([
    ['press', 'Tab'],
    ['wait', '300'],
    ['press', 'Tab'],
    ['wait', '300'],
    ['press', 'Tab'],
    ['wait', '500'],
    ['keyboard', 'type', prompt],
    ['wait', '500'],
    ['press', 'Enter'],
    ['wait', '15000'],  // Initial wait — Copilot takes 10-30s to generate
  ], POLICY);

  if (typeResult.status !== 0) {
    log(`copilot: prompt send failed (status ${typeResult.status})`);
    return null;
  }

  // Step 5: Poll for Copilot completion
  // When generating, there's typically a "Stop" button visible.
  // When done, the compose box returns to normal state.
  // We poll by taking snapshots and checking for completion signals.
  log('copilot: waiting for Copilot response...');

  let responseSnapshot = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const pollResult = runBatch([
      ['wait', '5000'],
      ['snapshot'],
    ], POLICY);

    if (pollResult.status !== 0) {
      log(`copilot: poll attempt ${attempt + 1} failed`);
      continue;
    }

    const pollText = stripContentBoundaries(pollResult.stdout);

    // Check if Copilot is still generating (Stop button present)
    const isGenerating = pollText.includes('button "Stop"') ||
                          pollText.includes('Generating') ||
                          pollText.includes('Thinking');

    if (!isGenerating) {
      log(`copilot: response complete after ${attempt + 1} poll(s)`);
      responseSnapshot = pollText;
      break;
    }

    log(`copilot: still generating (poll ${attempt + 1}/6)...`);
  }

  if (!responseSnapshot) {
    // Take a final snapshot anyway — partial response is better than nothing
    log('copilot: polling timed out — taking final snapshot');
    const finalResult = runBatch([
      ['snapshot'],
    ], POLICY);
    if (finalResult.status === 0) {
      responseSnapshot = stripContentBoundaries(finalResult.stdout);
    }
  }

  if (!responseSnapshot) {
    log('copilot: no response captured');
    return null;
  }

  return { snapshotText: responseSnapshot };
}

/**
 * Extract Copilot's response text from a Teams chat snapshot.
 *
 * Copilot responses appear as message bubbles in the chat.
 * We look for the last substantial block of text that is NOT the user's prompt.
 *
 * @param {string} text - Raw snapshot text
 * @param {string} prompt - The prompt we sent (to exclude from results)
 * @returns {string} Extracted response text
 */
function extractCopilotResponse(text, prompt) {
  const lines = text.split('\n');
  const responseLines = [];
  const promptPrefix = prompt.slice(0, 40).toLowerCase();

  for (const line of lines) {
    // Look for StaticText and paragraph content in the chat
    const textMatch = line.match(/^\s+-\s+(?:StaticText|paragraph|generic|listitem)\s+"(.+?)"\s*(?:\[.*)?$/);
    if (!textMatch) continue;

    const content = textMatch[1].trim();
    if (!content || content.length < 3) continue;

    // Skip the user's own prompt text
    if (content.toLowerCase().startsWith(promptPrefix)) continue;

    // Skip UI chrome text
    if (/^(Copilot|Type a message|Send|Copy|Share|Like|Dislike|Edit|Retry)/i.test(content)) continue;
    if (/^(Researcher|Web|Work|References|Source)/i.test(content)) continue;

    responseLines.push(content);
  }

  return responseLines.join('\n');
}

/**
 * Parse Copilot's pipe-delimited response into structured items.
 *
 * Expected format (one line per item):
 *   "1. Sender Name | Subject | Date | Summary | Action needed (yes/no)"
 *
 * @param {string} responseText
 * @returns {Array<{ sender: string, subject: string, date: string, summary: string, action: string }>}
 */
function parsePipeDelimitedResponse(responseText) {
  const items = [];
  const lines = responseText.split('\n');

  for (const line of lines) {
    // Strip leading number + dot/parenthesis
    const stripped = line.replace(/^\s*\d+[\.)]\s*/, '').trim();
    if (!stripped) continue;

    const parts = stripped.split('|').map(p => p.trim());
    if (parts.length < 3) continue;  // need at least sender | subject | something

    items.push({
      sender: parts[0] || '',
      subject: parts[1] || '',
      date: parts[2] || '',
      summary: parts[3] || '',
      action: parts[4] || '',
    });
  }

  return items;
}

/**
 * Main copilot-summary subcommand handler.
 */
function runCopilotSummary() {
  const { type, since, customPrompt } = parseArgs(process.argv);
  log(`copilot-summary: type="${type}" since="${since || 'last 24h'}" custom=${!!customPrompt}`);

  // Build the prompt
  const prompt = customPrompt || PROMPTS[type](since);
  log(`copilot-summary: prompt length=${prompt.length}`);

  // Send to Copilot
  const result = sendCopilotPrompt(prompt);

  if (!result) {
    outputError('copilot-summary', 'OPERATION_FAILED',
      'Copilot interaction failed — browser error or timeout');
    return;
  }
  if (result._loginRequired) {
    outputError('copilot-summary', 'SESSION_INVALID',
      'Teams session expired — run: node outlook.js auth');
    return;
  }
  if (result._copilotNotFound) {
    outputError('copilot-summary', 'OPERATION_FAILED',
      'Could not find Copilot in Teams UI — ensure Copilot is enabled for your tenant');
    return;
  }

  // Extract response text
  const responseText = extractCopilotResponse(result.snapshotText, prompt);
  log(`copilot-summary: extracted ${responseText.length} chars of response`);

  if (!responseText.trim()) {
    process.stdout.write(JSON.stringify({
      operation: 'copilot-summary',
      status: 'ok',
      type,
      raw_response: '',
      items: [],
      count: 0,
      error: null,
    }) + '\n');
    log('copilot-summary: empty response from Copilot');
    return;
  }

  // Parse structured items from pipe-delimited format
  const items = parsePipeDelimitedResponse(responseText);

  process.stdout.write(JSON.stringify({
    operation: 'copilot-summary',
    status: 'ok',
    type,
    raw_response: responseText,
    items,
    count: items.length,
    error: null,
  }) + '\n');
  log(`copilot-summary: returning ${items.length} parsed items + raw response`);
}

module.exports = { runCopilotSummary, parseArgs, extractCopilotResponse, parsePipeDelimitedResponse, PROMPTS };
