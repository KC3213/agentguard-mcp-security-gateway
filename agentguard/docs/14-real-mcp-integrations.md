# Real MCP Integrations

This branch extends AgentGuard from a synthetic-only MCP demo into a gateway that can onboard and inspect real MCP servers.

The goal is not to give an agent unlimited access to the machine. The goal is to show the safer enterprise pattern:

```text
Real MCP server
-> onboarded through MCP Control Plane
-> tested through AgentGuard
-> tools discovered into Tool Registry
-> risky tools blocked or approval-gated
-> every action audited
```

## What We Are Adding

The next integrations are:

```text
Filesystem MCP
Git MCP
```

These are good interview choices because they feel real but can still be kept safe:

- Filesystem MCP demonstrates file access governance.
- Git MCP demonstrates developer-tool governance.
- Neither requires API keys, OAuth tokens, Slack tokens, Google Drive credentials, or real company data.

## Why We Use The MCP Control Plane

The control plane is the correct place to add real servers.

Bad pattern:

```text
Developer manually runs an MCP server
Agent calls it directly
No central record
No review of exposed tools
No audit trail
```

AgentGuard pattern:

```text
Admin chooses a preset
Admin reviews command, arguments, and allowlisted directories
AgentGuard stores the server config
AgentGuard tests the connection
AgentGuard discovers tools
Policy engine classifies tools
Tool Registry controls status
Gateway enforces runtime policy
Audit Log records the whole lifecycle
```

This is the main interview point:

```text
I did not bolt real MCP servers onto the side. I routed them through the same governance path as the demo server.
```

## Filesystem MCP Workflow

The Filesystem server should only receive safe demo folders:

```text
demo-data/
docs/
```

Expected workflow:

```text
1. Open MCP Control Plane.
2. Choose Filesystem MCP.
3. Review the command and allowed directories.
4. Onboard the server.
5. Test the real stdio connection.
6. Discover filesystem tools.
7. Tool Registry marks read/list/search tools as usable and write/edit/delete-style tools as blocked or review-only.
8. MCP Lab can run a safe read/list tool through the firewall.
9. Audit Log shows onboarding, connection, scan, and tool-call events.
```

Why this matters:

```text
File tools are useful, but they are dangerous if the server can read the whole laptop. The safe design is to pass only explicit allowlisted directories and still keep gateway policy checks.
```

## Git MCP Workflow

The Git server should point only at this project repository:

```text
/Users/kachadha/Documents/my project
```

Expected workflow:

```text
1. Open MCP Control Plane.
2. Choose Git MCP.
3. Confirm the repository path.
4. Onboard and test the server.
5. Discover Git tools.
6. Tool Registry allows read-only actions such as status, log, diff, and show.
7. Tool Registry blocks or approval-gates mutation actions such as commit, add, reset, checkout, or branch creation.
8. MCP Lab can run a safe Git inspection call.
9. Flight Recorder and Audit Log show the result.
```

Why this matters:

```text
Developer agents often need repo context. But an agent that can also commit, reset, or checkout branches needs controls. AgentGuard separates repo-reading from repo-changing.
```

## What We Could Have Used Instead

We could have integrated GitHub, Slack, Google Drive, Jira, or database MCP servers first.

I did not choose them for the first real integration because:

- They often need secrets or OAuth tokens.
- They can touch real external services.
- A fresher/interview demo should avoid leaking credentials.
- The safety story is clearer when all data stays local and synthetic.

We could also have used Fetch MCP.

That is useful for SSRF and domain allowlist demos, but it touches the internet. It should come after local Filesystem/Git controls are stable.

## Safety Boundaries

The real integration branch should keep these boundaries:

- No real emails.
- No tokens in code.
- No private folders outside explicit allowlists.
- No shell access exposed to the agent.
- No write/delete filesystem demo by default.
- No mutating Git actions without a block or approval decision.

## Demo Script

Say this:

```text
Earlier AgentGuard used a local synthetic MCP server. I extended it so the MCP Control Plane can also onboard real MCP servers. For the first real integrations I chose Filesystem and Git because they are realistic enterprise tools but do not require secrets. The gateway discovers their tools, classifies them by risk, blocks mutation-style actions by default, and audits every server and tool action.
```

Then show:

```text
MCP Control Plane
-> Filesystem MCP preset
-> Onboard
-> Test
-> Discover Tools
-> Tool Registry
-> Audit Log
```

Then repeat with:

```text
Git MCP preset
```

Interview punchline:

```text
This is not just an MCP demo. It is a governance layer for real MCP servers.
```
