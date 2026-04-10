#!/usr/bin/env bash
# outlook-capture.sh — DISPOSABLE exploration script for Phase 0
#
# Purpose: Capture accessibility snapshots from a live Outlook web session
#          for annotating references/outlook-ui.md. Run once, annotate output,
#          then DELETE this script. It never ships with the skill.
#
# Usage:
#   bash outlook-capture.sh > /tmp/outlook-snapshots.txt 2>&1
#
# Prerequisite:
#   Chrome must be running with --remote-debugging-port=9222 and you must be
#   logged into Outlook in that Chrome window. Start Chrome like this:
#
#     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
#       --remote-debugging-port=9222 \
#       --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
#
#   (Adjust --user-data-dir if your Chrome profile is elsewhere.
#    Microsoft Edge works the same way.)
#
# Fallback (if --auto-connect fails):
#   Replace every --auto-connect flag in this script with:
#     --profile "$OUTLOOK_BROWSER_PROFILE"
#   and set the env var to your Chrome profile directory first:
#     export OUTLOOK_BROWSER_PROFILE="$HOME/Library/Application Support/Google/Chrome/Default"
#
# After completion:
#   Check /tmp/outlook-snapshots.txt for CAPTURE sections with snapshot output.
#   The output will contain real email content — treat as sensitive and delete after annotation.

set -euo pipefail

BASE_URL="${OUTLOOK_URL:-https://myemail.accenture.com}"

echo "=== CAPTURE 1: Inbox view ==="
agent-browser --auto-connect open "${BASE_URL}/mail/inbox" || echo "CAPTURE FAILED: inbox open"
agent-browser wait 3000 || echo "CAPTURE FAILED: inbox wait"
agent-browser snapshot -i || echo "CAPTURE FAILED: inbox snapshot"

echo ""
echo "=== CAPTURE 2: Current URL after inbox load ==="
agent-browser get url || echo "CAPTURE FAILED: get url (inbox)"

echo ""
echo "=== CAPTURE 3: Focused Inbox tab detection ==="
echo "INSTRUCTION: Look for 'button \"Focused\"' or 'button \"Other\"' in the snapshot output"
echo "above (CAPTURE 1). If neither appears, Focused Inbox is disabled on this account."
echo "These buttons typically appear between filter/sort controls and the listbox Message list."

echo ""
echo "=== CAPTURE 4: Data attribute probe on message rows ==="
# Resolves open question: does data-convid or any data-* attribute exist on option elements?
agent-browser eval --stdin <<'EVALEOF' || echo "CAPTURE FAILED: data attribute probe"
JSON.stringify(
  Array.from(document.querySelectorAll('[role="option"]'))
    .slice(0, 3)
    .map(el => ({
      dataset: Object.keys(el.dataset),
      id: el.id,
      ariaSelected: el.getAttribute('aria-selected')
    }))
)
EVALEOF

echo ""
echo "=== CAPTURE 5: Search box activation (click combobox, snapshot expanded state) ==="
# Use semantic locator — stable across sessions, no hardcoded @eN ref
agent-browser find role combobox click --name "Search for email" || echo "CAPTURE FAILED: search combobox click"
agent-browser wait 1000 || echo "CAPTURE FAILED: search wait"
agent-browser snapshot -i || echo "CAPTURE FAILED: search activated snapshot"

echo ""
echo "=== CAPTURE 6: Search results (from:test query) ==="
# Re-find combobox after snapshot (refs may have changed)
agent-browser find role combobox fill "from:test" --name "Search for email" || echo "CAPTURE FAILED: search fill"
agent-browser press Enter || echo "CAPTURE FAILED: search Enter"
agent-browser wait 5000 || echo "CAPTURE FAILED: search results wait"
agent-browser get url || echo "CAPTURE FAILED: get url (search results)"
agent-browser snapshot -i || echo "CAPTURE FAILED: search results snapshot"

echo ""
echo "=== CAPTURE 7: Open individual message from search results ==="
# NOTE: Read the ref from CAPTURE 6 snapshot output above.
# The first option in the listbox is the first search result.
# Replace @eXX below with the actual first option ref from the CAPTURE 6 snapshot.
# Alternatively, use semantic locator:
agent-browser find role option click || echo "CAPTURE FAILED: click first option"
agent-browser wait 2000 || echo "CAPTURE FAILED: message open wait"
agent-browser get url || echo "CAPTURE FAILED: get url (message — captures /mail/inbox/id/<ItemID>)"
agent-browser snapshot -i || echo "CAPTURE FAILED: message reading pane snapshot"

echo ""
echo "=== CAPTURE 8: Attachment search ==="
# Re-find search combobox after page navigation (refs invalidated)
agent-browser find role combobox click --name "Search for email" || echo "CAPTURE FAILED: attachment search combobox click"
agent-browser wait 500 || echo "CAPTURE FAILED: attachment search combobox wait"
agent-browser find role combobox fill "has:attachment" --name "Search for email" || echo "CAPTURE FAILED: attachment search fill"
agent-browser press Enter || echo "CAPTURE FAILED: attachment search Enter"
agent-browser wait 5000 || echo "CAPTURE FAILED: attachment search results wait"
agent-browser snapshot -i || echo "CAPTURE FAILED: attachment search results snapshot"
# Open first attachment result to inspect reading pane attachment structure
agent-browser find role option click || echo "CAPTURE FAILED: click first attachment option"
agent-browser wait 2000 || echo "CAPTURE FAILED: attachment message open wait"
agent-browser snapshot -i || echo "CAPTURE FAILED: attachment reading pane snapshot"

echo ""
echo "=== CAPTURE 9: Cleanup ==="
agent-browser close || echo "CAPTURE FAILED: close browser"

echo ""
echo "=== DONE ==="
echo "Output file: /tmp/outlook-snapshots.txt"
echo "Next step: annotate this output and populate references/outlook-ui.md"
