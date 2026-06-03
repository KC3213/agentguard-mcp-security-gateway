# Architecture

AgentGuard is designed like a small enterprise control plane for AI agents.

```text
User
  -> React dashboard
  -> Express API
  -> MCP server registry
  -> deterministic demo planner
  -> AgentGuard policy engine
  -> MCP client
  -> mock MCP server
  -> synthetic tool result
  -> post-check
  -> flight recorder + audit log
```

The important design decision is that the agent does not call tools directly. The backend gateway owns the security decision.

## Components

**React Dashboard**

The dashboard gives seven operational views:

- Agent Console
- MCP Lab
- MCP Control Plane
- Tool Registry
- Approvals
- Flight Recorder
- Audit Log
- Policies

It is intentionally not a landing page. It behaves like an internal security or platform console.

**Express API**

The API is the central gateway. It receives user prompts, creates sessions, asks the planner for tool calls, runs policy checks, calls MCP tools, and stores logs.

**MCP Control Plane**

The control plane is the onboarding layer for MCP servers.

It stores:

- Server name and description.
- Stdio command and arguments.
- Allowed demo directories.
- Audit setting.
- Current server status.
- Discovered tool count.

The important idea is that an MCP server is not trusted just because someone knows how to run it. AgentGuard records the server first, tests/registers it, discovers tools, and then lets the Tool Registry govern those tools.

**Deterministic Demo Planner**

The planner converts known demo prompts into tool calls. This keeps the project runnable without an LLM API key.

Example:

```text
Prompt:
Try DROP SQL on the customer table

Plan:
query_database({ sql: "DROP TABLE Customer" })
```

Using a deterministic planner is not a weakness for the MVP. It lets the demo focus on the security architecture instead of model randomness.

**Policy Engine**

The policy engine is a pure TypeScript package. It scores each tool call and returns a decision:

```text
ALLOW
ALLOW_WITH_LOG
REQUIRE_APPROVAL
BLOCK
```

It checks:

- Tool status.
- Tool base risk.
- PII-like values.
- Secrets or API keys.
- SQL mutation commands.
- Path traversal.
- External email recipients.

**MCP Client**

The backend tries to connect to the mock MCP server using the TypeScript MCP SDK. If stdio is unavailable in local development, it falls back to equivalent local synthetic functions. That fallback is only for developer reliability; the project still includes a real MCP server implementation.

For the control-plane MVP, the AgentGuard demo server can be scanned end-to-end. Filesystem and Git MCP servers are shown as next-step presets so the interview story can explain how real open-source MCP integrations would be governed without adding token or secret risk.

**Mock MCP Server**

The server exposes four synthetic tools:

```text
read_document(path)
send_email(to, subject, body)
query_database(sql)
create_ticket(title, description, priority)
```

These are realistic enterprise-style tools without using real company systems.

**Flight Recorder**

The flight recorder stores:

- User prompt.
- Planned tool calls.
- Tool arguments.
- Gateway decision.
- Risk score.
- Tool output.
- Approval status.
- Audit event hash.

This matters because enterprise teams need to debug and audit agent behavior after the fact.

## Why A Gateway Architecture

There are two possible designs:

```text
Option A:
Agent -> MCP server directly

Option B:
Agent -> Gateway -> MCP server
```

AgentGuard uses Option B.

Reason:

```text
If the agent talks directly to tools, policy becomes optional.
If the gateway is mandatory, policy becomes part of the runtime path.
```

That is the main architectural argument to explain in an interview.

## Real-World Analogy

Think of a company employee using corporate systems.

An employee may want to:

- Read a file.
- Query a database.
- Email a manager.
- Create a support ticket.

The company does not give every employee unlimited access. It uses SSO, RBAC, audit logs, DLP, approval workflows, and monitoring.

AgentGuard applies the same idea to AI agents.

```text
AI agents should not get unlimited tool access just because they can produce a confident plan.
```
