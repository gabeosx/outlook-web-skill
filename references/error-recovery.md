# Error Recovery Reference

When any `node outlook.js` invocation returns `{"status":"error"}`, read `error.code` and follow the matching decision tree below.

```bash
RESULT=$(node outlook.js search "is:unread")
CODE=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.error ? d.error.code : '')")
```

---

## SESSION_INVALID

When you see: `{"status":"error","error":{"code":"SESSION_INVALID","message":"..."}}`

**Meaning:** The session expired during operation. The skill successfully started but the session became invalid mid-run (e.g., session cookie expired or was invalidated between invocations).

**Steps:**

1. Run: `node outlook.js auth`
2. If a browser window opens: Prompt the user to complete the login (including MFA if required). Wait for the user to confirm they have logged in.
3. Re-run: `node outlook.js auth` (headless check — should return `{"status":"ok"}` immediately if login succeeded)
4. Retry the original operation with the exact same arguments.
5. If SESSION_INVALID recurs: Surface the raw `error.message` to the user and ask them to check their session manually.

---

## AUTH_REQUIRED

When you see: `{"status":"error","error":{"code":"AUTH_REQUIRED","message":"..."}}`

**Meaning:** The session was absent or invalid at startup. Treat identically to SESSION_INVALID.

**Steps:**

1. Run: `node outlook.js auth`
2. If a browser window opens: Prompt the user to complete the login (including MFA if required). Wait for the user to confirm they have logged in.
3. Retry the original operation with the exact same arguments.
4. If AUTH_REQUIRED recurs: Surface the raw `error.message` to the user and ask them to check their session manually.

**Note:** In the current codebase, SESSION_INVALID is the primary operational code for expired sessions during `search`, `read`, and `digest`. AUTH_REQUIRED is listed in requirements but is rarely emitted in production paths — the recovery steps are identical.

---

## INVALID_ARGS

When you see: `{"status":"error","error":{"code":"INVALID_ARGS","message":"..."}}`

**Meaning:** A required argument or environment variable is missing or malformed. This is a programming error or configuration problem — do NOT retry.

**Steps:**

1. Read `error.message` — it names the specific missing argument or environment variable.
2. If message contains `"Missing required env var"`: Check the `.env` file at the project root. Ensure all three required variables are set:
   - `OUTLOOK_BASE_URL` — your Outlook web URL (e.g., `https://outlook.office.com`)
   - `OUTLOOK_BROWSER_PATH` — path to your managed Chrome or Edge binary
   - `OUTLOOK_BROWSER_PROFILE` — path to your Chrome/Edge profile directory
   Do NOT retry until the missing variable is configured.
3. If message contains `"Unknown subcommand"` or `"Missing"` (argument): Fix the command syntax. Valid subcommands: `auth`, `search`, `read`, `digest`, `tune`. The `search` subcommand requires a query string. The `read` subcommand requires an `<id>` argument.
4. Do NOT surface "please retry" to the user — INVALID_ARGS is always a fixable configuration or argument error, never a transient failure.

---

## OPERATION_FAILED

When you see: `{"status":"error","error":{"code":"OPERATION_FAILED","message":"..."}}`

**Meaning:** The browser operation failed — timeout, empty snapshot, element not found, or batch command error. This can be transient.

**Steps:**

1. Retry the exact same operation once. Transient browser failures (startup timing, snapshot timing) are common.
2. If the retry succeeds: Proceed normally.
3. If OPERATION_FAILED recurs:
   a. Surface the raw `error.message` to the user.
   b. Suggest the user check if Outlook is accessible in their browser manually (open the URL from `OUTLOOK_BASE_URL` in a regular browser tab).
   c. If the operation was `auth` and OPERATION_FAILED: The browser may have failed to launch. Check that `OUTLOOK_BROWSER_PATH` points to a valid managed Chrome or Edge binary.
4. Do NOT retry more than once automatically — persistent OPERATION_FAILED usually indicates a UI change, network problem, or environment issue that requires human investigation.

---

## MESSAGE_NOT_FOUND

When you see: `{"status":"error","error":{"code":"MESSAGE_NOT_FOUND","message":"..."}}`

**Meaning:** The `read` subcommand searched for the email by its ConversationId (`data-convid`) but did not find it in the result list. This happens when the email does not appear in the search results that `read` uses internally to load the email list.

**Steps:**

1. Retry `read` with the `--query` flag from the original `search` that produced the id:
   ```bash
   node outlook.js read <id> --query "<original search query>"
   ```
   Example: if the id came from `node outlook.js search "from:alice@example.com is:unread"`, then:
   ```bash
   node outlook.js read AAQk... --query "from:alice@example.com is:unread"
   ```
2. If read succeeds: Proceed normally.
3. If MESSAGE_NOT_FOUND recurs even with `--query`:
   a. Confirm the `id` value is from a recent `search` or `digest` result. ConversationIds begin with `AAQ` — if the value looks different, it may be the wrong ID type.
   b. The email may have been deleted, archived, or moved since the search was performed.
   c. Inform the user and suggest running a new `search` to get a fresh id.

---

## Notes

`auth` is idempotent and safe to run at any time. If uncertain about session state before a series of operations, run `node outlook.js auth` first — it returns immediately if the session is already valid, and only opens a browser if login is required.
