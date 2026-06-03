# MCP Lab

The MCP Lab is a small playground inside AgentGuard where you can call one MCP tool directly through the security gateway.

It exists for one reason: to prove that this project is not only a dashboard. It has a mock MCP server, real tool metadata, gateway checks, tool execution, approval handling, flight recording, and audit logging.

## What Was Added

The app now has a new page:

```text
MCP Lab
```

It uses the tools that already exist in the mock MCP server:

```text
read_document(path)
send_email(to, subject, body)
query_database(sql)
create_ticket(title, description, priority)
```

No real email is sent. No private files are read. No external data is used. Every tool still uses synthetic demo data only.

## Why This Looks Good In An Interview

Many projects say "I used MCP", but the interviewer may not see MCP behavior clearly.

The MCP Lab makes the flow visible:

```text
Choose MCP tool
-> Edit JSON arguments
-> Run through AgentGuard
-> Gateway performs pre-check
-> Tool is allowed, blocked, or paused for approval
-> MCP server executes only if allowed
-> Gateway performs post-check
-> Tool call is saved in Flight Recorder
-> Audit Log records the event and hash chain
```

This lets you say:

```text
I built a working MCP tool playground, but every manual tool call still goes through the same security gateway as an agent-planned tool call.
```

## How To Use It

Open:

```text
MCP Lab
```

Then:

1. Select a tool.
2. Review or edit the JSON arguments.
3. Click `Run Through Gateway`.
4. Read the gateway decision.
5. Open Flight Recorder or Audit Log to see the stored event.

## Safe Example

Tool:

```text
read_document
```

Arguments:

```json
{
  "path": "public_report.txt"
}
```

Expected result:

```text
ALLOW
```

Why:

```text
The path stays inside demo-data and the document is synthetic.
```

## Logged Example

Tool:

```text
query_database
```

Arguments:

```json
{
  "sql": "SELECT id, name, tier, revenue FROM Customer ORDER BY revenue DESC"
}
```

Expected result:

```text
ALLOW_WITH_LOG
```

Why:

```text
Database access is useful but sensitive, so AgentGuard logs it with a medium risk score.
```

## Approval Example

Tool:

```text
send_email
```

Arguments:

```json
{
  "to": "support-manager@agentguard.local",
  "subject": "MCP Lab synthetic update",
  "body": "Synthetic update from AgentGuard MCP Lab. No real email is sent."
}
```

Expected result:

```text
REQUIRE_APPROVAL
```

Why:

```text
send_email can move data outside the agent boundary, so this prototype treats it as a tool that needs human approval.
```

## Blocked Examples

The MCP Lab includes quick buttons for unsafe examples.

### Blocked SQL

```json
{
  "sql": "DROP TABLE Customer"
}
```

Expected result:

```text
BLOCK
```

Why:

```text
The policy engine detects a SQL mutation command before the MCP server is called.
```

### Path Traversal

```json
{
  "path": "../private.txt"
}
```

Expected result:

```text
BLOCK
```

Why:

```text
The gateway blocks attempts to read outside demo-data.
```

### Secret Email

```json
{
  "to": "security@agentguard.local",
  "subject": "Credential handoff",
  "body": "password=NeverUseThis123 and api_key=sk-test-1234567890abcdef should never leave the agent."
}
```

Expected result:

```text
BLOCK
```

Why:

```text
The gateway detects password/API key patterns and blocks the call before execution.
```

## What Happens In The Backend

The frontend calls:

```text
POST /api/mcp-lab/run
```

The request contains:

```json
{
  "toolName": "read_document",
  "purpose": "MCP Lab: read a synthetic public report through the gateway",
  "arguments": {
    "path": "public_report.txt"
  },
  "userEmail": "employee@agentguard.local",
  "userRole": "employee"
}
```

The backend then:

1. Looks up the tool in the Tool Registry.
2. Runs `evaluateToolCall`.
3. Blocks immediately if the input is unsafe.
4. Creates an approval if policy requires review.
5. Calls the mock MCP server only when allowed.
6. Runs `evaluateToolOutput`.
7. Stores a `ToolCall`.
8. Records an `AuditEvent`.

## Interview Explanation

Use this explanation:

```text
I added an MCP Lab so I could demonstrate the tool boundary directly. Instead of only showing an agent prompt, I can select a real MCP tool, edit its JSON arguments, and run it through the same AgentGuard gateway. This proves the system is enforcing policy at runtime, not just displaying static risk scores.
```

Then show:

```text
read_document -> allowed
query_database SELECT -> logged
DROP SQL -> blocked
send_email -> approval required
secret in email body -> blocked
```

## What This Teaches

The important concept is:

```text
MCP makes tools available. AgentGuard decides whether using those tools is safe.
```

The MCP Lab makes that concept visible, testable, and easy to explain.
