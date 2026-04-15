'use strict';

/**
 * Folder name normalization module.
 *
 * Provides a mapping from common lowercase aliases to the exact Outlook
 * ARIA treeitem name prefixes used in the Navigation pane. Consumed by
 * both the `search` and `digest` subcommands to resolve `--folder` values.
 *
 * The `find role treeitem click --name` locator in agent-browser uses
 * substring matching, so these names only need to be stable prefixes.
 *
 * Confirmed live (ARIA Capture 1): Inbox, Drafts, Sent Items.
 * Assumed standard OWA names: Deleted Items, Junk Email, Archive.
 */
const FOLDER_ALIASES = {
  'inbox':       'Inbox',
  'drafts':      'Drafts',
  'sent':        'Sent Items',
  'sent items':  'Sent Items',
  'deleted':     'Deleted Items',
  'trash':       'Deleted Items',
  'junk':        'Junk Email',
  'spam':        'Junk Email',
  'archive':     'Archive',
};

/**
 * Normalize a raw folder name (from `--folder` CLI flag) to the exact
 * Outlook ARIA treeitem name prefix.
 *
 * @param {string|null|undefined} raw - Raw folder name from CLI
 * @returns {string|null} Normalized Outlook folder name, or null if raw is falsy
 */
function normalizeFolderName(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return FOLDER_ALIASES[lower] || raw;
}

module.exports = { FOLDER_ALIASES, normalizeFolderName };
