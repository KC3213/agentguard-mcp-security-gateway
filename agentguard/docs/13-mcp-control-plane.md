# MCP Control Plane

The MCP Control Plane is the onboarding layer for MCP servers in AgentGuard.

Before this feature, AgentGuard already had:

```text
Mock MCP server
Tool Registry
Policy Engine
MCP Lab
Flight Recorder
Audit Log
```

But the server was mostly assumed to already exist. The new control-plane page makes the first step visible:

```text
Onboard an MCP server
-> Test/register the server
-> Discover tools
-> Apply policy status
-> Audit every server action
```

## Why This Matters

In a company, teams will not use only one MCP server.

They may want to add:

```text
Filesystem MCP
Git MCP
Database MCP
Ticketing MCP
Internal API MCP
```

The security problem is not only whether one tool call is safe. The bigger problem is:

```text
How do we safely onboard MCP servers before agents can use them?
```

AgentGuard now has a basic answer:

```text
Every MCP server must be registered, audited, and scanned before its tools become trusted.
```

## What The Page Does

The new page is:

```text
MCP Control Plane
```

It lets you:

1. Choose a server preset.
2. Review the stdio command and arguments.
3. Register the server in AgentGuard.
4. Keep audit logging enabled.
5. Test/register the server.
6. Discover tools for the AgentGuard demo MCP server.
7. Jump to Tool Registry after discovery.

## Current Presets

### AgentGuard Demo MCP

This is the local MCP server already built in the repo.

```text
apps/mock-mcp-server/src/index.ts
```

It exposes:

```text
read_document
send_email
query_database
create_ticket
```

This preset works now and is the best demo path.

### Filesystem MCP

This is included as a next-step preset.

Purpose:

```text
Onboard an open-source filesystem MCP server and restrict it to demo-data/ and docs/.
```

Why it is useful:

```text
It demonstrates that AgentGuard can govern real open-source MCP servers, not only custom demo servers.
```

### Git MCP

This is included as another next-step preset.

Purpose:

```text
Onboard a Git MCP server pointed at the AgentGuard repo.
```

Why it is useful:

```text
It demonstrates developer-focused MCP governance: repo search, history inspection, and file lookup under audit.
```

## Current Limitation

The current implementation can fully scan the AgentGuard demo MCP server.

Filesystem and Git are present as onboarding presets, but their external adapters are intentionally left for the next feature branch.

This is deliberate because it keeps the commit history clean:

```text
Commit 1: MCP server onboarding API
Commit 2: MCP Control Plane UI
Commit 3: MCP Control Plane docs
Next branch: Filesystem/Git real open-source MCP integration
```

## Backend Routes

The control plane uses these routes:

```text
GET  /api/mcp-servers
POST /api/mcp-servers
POST /api/mcp-servers/:id/test
POST /api/mcp-servers/:id/scan
```

### Onboard Request Example

```json
{
  "name": "Synthetic Company Tools MCP",
  "description": "The local TypeScript MCP server already in this repo.",
  "preset": "agentguard-demo",
  "transport": "stdio",
  "command": "tsx",
  "args": ["apps/mock-mcp-server/src/index.ts"],
  "allowedDirectories": ["demo-data", ".agentguard-runtime"],
  "auditEnabled": true,
  "actor": "admin@agentguard.local"
}
```

## Audit Events

Onboarding creates audit events such as:

```text
MCP_SERVER_ONBOARDED
MCP_SERVER_CONNECTED
MCP_SERVER_REGISTERED
TOOLS_SCANNED
```

This matters because server onboarding itself is a security-sensitive action.

If a malicious MCP server is added, the audit log should show:

```text
who added it
when it was added
which command/args were configured
whether audit was enabled
which tools were later discovered
```

## Interview Explanation

Use this:

```text
I extended AgentGuard from a single MCP gateway into a mini MCP control plane. The system can onboard MCP servers, store their stdio launch configuration, keep audit logging enabled by default, test/register the server, and discover tools into the Tool Registry.
```

Then say:

```text
This matters because companies will not trust random MCP servers by default. They need a governed onboarding flow before any agent can call those tools.
```

## Demo Script

1. Open `MCP Control Plane`.
2. Choose `AgentGuard Demo MCP`.
3. Click `Onboard MCP Server`.
4. Click `Test`.
5. Click `Discover Tools`.
6. Open `Tool Registry`.
7. Show the discovered tools and risk scores.
8. Open `Audit Log`.
9. Search for `MCP_SERVER_ONBOARDED` or `TOOLS_SCANNED`.

Interview punchline:

```text
AgentGuard does not only inspect tool calls. It also governs how MCP servers are onboarded before tools become available.
```
