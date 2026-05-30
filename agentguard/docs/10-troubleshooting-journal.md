# Troubleshooting Journal

This file turns real development issues from the project into interview stories. These are useful because interviewers often like hearing what went wrong and how you debugged it.

## Issue 1: npm Registry Was Blocked

Problem:

```text
npm install failed because registry.npmjs.org returned 403 through the network gateway.
```

Symptoms:

```text
E401 from stale local npm credentials
403 registrynpmjsblockpage from the network
long install with no useful output
```

Fix:

```text
Used an isolated npm config so personal credentials were not touched.
Used a reachable registry mirror for dependency install.
Added a no-install standalone prototype so the project can still be demoed if npm is blocked.
```

Interview lesson:

```text
I made the project demo-resilient. Even if dependency installation fails on another machine, the standalone prototype still demonstrates the same workflow safely.
```

## Issue 2: Prisma Needed DATABASE_URL

Problem:

```text
prisma db push failed because DATABASE_URL was missing.
```

Fix:

```text
Added .env with DATABASE_URL="file:./dev.db".
Added .env.example for documentation.
```

Interview lesson:

```text
Local developer setup needs clear environment defaults. I documented the env variables and kept the database local and synthetic.
```

## Issue 3: Path Traversal Detector Missed JSON Arguments

Problem:

The first path traversal regex did not catch this inside a JSON string:

```json
{
  "path": "../private.txt"
}
```

Why:

```text
The pattern expected ../ to appear at a path boundary, but the inspected value was JSON text containing quotes and braces.
```

Fix:

```text
Changed detection to catch ../ and ..\\ anywhere in the serialized argument text.
```

Interview lesson:

```text
Security checks should be tested against the actual serialized shape of tool arguments, not only ideal input strings.
```

## Issue 4: Email Recipient Detection Created A False Positive

Problem:

The first version scanned the entire email argument object for email addresses. This confused content emails with recipient emails.

Example:

```json
{
  "to": "support-manager@agentguard.local",
  "body": "Customer email: ada.lovelace@demo.customer"
}
```

The body had a fake customer email, so the system treated it as an external recipient.

Fix:

```text
Only fields named to, cc, bcc, recipient, or recipients are used for external-recipient detection.
The body is still scanned for PII separately.
```

Interview lesson:

```text
Destination risk and content risk are different. A good policy engine should separate them.
```

## Issue 5: Redaction Removed The Internal Recipient

Problem:

The first redaction pass redacted every email address, including the internal `to` field. That made the mock email less realistic because the tool no longer had a valid recipient.

Fix:

```text
Preserve recipient fields during Redact & Approve.
Redact sensitive contact details in the body.
```

Interview lesson:

```text
Redaction must be context-aware. You usually want to redact sensitive content, not destroy required routing fields.
```

## Issue 6: Browser Verification Timed Out

Problem:

The in-app browser automation timed out during one reload while checking the dashboard.

Fix:

```text
Verified the same behavior through API calls and curl.
Kept the dev server running and confirmed frontend assets were served by Vite.
```

Interview lesson:

```text
When UI automation is flaky, verify the system through another layer: API, logs, build output, or unit tests.
```

## Issue 7: Prompt UI Jumped And Results Felt Delayed

Problem:

While typing or running the agent repeatedly, the console UI could feel like it was "waving" or shifting. Sometimes it also felt like the result needed another run or refresh to settle.

Root causes:

```text
1. The console output panel did not have a stable minimum height, so the layout shifted when a timeline appeared.
2. The dashboard refresh function depended on activeSession, so changing the selected session recreated the refresh callback.
3. The socket listener also depended on that callback, so it could reconnect more than necessary.
4. A single agent run emits multiple backend events: tool call created, approval requested, session finished. Each event could trigger a dashboard refresh.
```

Fix:

```text
1. Added stable min-height and min-width rules to the console input/output panels.
2. Changed loadAll to use a functional activeSession update instead of depending on activeSession.
3. Debounced socket-triggered refreshes so one agent run does not cause rapid repeated dashboard reloads.
4. Changed runSession to fetch the created session directly and then refresh the dashboard data.
```

Interview lesson:

```text
Agent dashboards receive many small state updates during one workflow. Without stable layout and controlled refreshes, the UI can feel shaky even when the backend is working correctly.
```

## How To Talk About These Issues

Say:

```text
The most useful debugging work was around policy precision. It is easy to make broad security checks that block too much or miss real risk. I had to separate recipient analysis from content analysis and make redaction preserve required routing fields. That taught me that agent security is not only about detecting bad patterns; it is about understanding the context of a tool call.
```
