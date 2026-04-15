# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## dialog-blocks-folder-navigation — DOM modal blocks treeitem clicks after every page load
- **Date:** 2026-04-15
- **Error patterns:** JavaScript confirm dialog, treeitem, Element not found, folder, dialog blocking, dialog dismiss, No dialog is showing, SESSION_INVALID, Office add-in
- **Root cause:** The Outlook Office add-in trust prompt is a DOM-level React overlay rendered inside the page, not a native window.confirm() dialog. Agent-browser emits a "JavaScript confirm dialog" warning (a detection heuristic), but CDP's Page.handleJavaScriptDialog can only handle native browser dialogs — so dialog dismiss always returns "No dialog is showing". The DOM modal remained visible and blocked all subsequent treeitem/combobox/find commands.
- **Fix:** Replace ['dialog', 'dismiss'] with ['eval', DISMISS_ADDIN_DIALOG] in any batch that opens Outlook. The eval uses querySelector to find a button with text "OK" and clicks it; returns null without error when the modal is absent. Also add ['wait', '500'] after the eval for dismiss animation. Ensure the action ("eval") is in the policy allow list.
- **Files changed:** lib/search.js, lib/digest.js, policy-search.json, outlook.js
---

