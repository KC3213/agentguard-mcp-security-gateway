# Mock MCP Server

The local MCP server lives in:

```text
apps/mock-mcp-server
```

It uses the official TypeScript MCP SDK and stdio transport.

## Why Build A Mock MCP Server

For a fresher project, using real Gmail, Jira, Slack, or a production database would create unnecessary risk and setup complexity.

So this project uses realistic but synthetic tools:

```text
read_document(path)
send_email(to, subject, body)
query_database(sql)
create_ticket(title, description, priority)
```

This lets you demonstrate the architecture without leaking real data or needing real enterprise credentials.

## Tool 1: read_document

Purpose:

```text
Read a synthetic document from demo-data/
```

Example call:

```json
{
  "path": "public_report.txt"
}
```

Security constraint:

```text
The file path must stay inside demo-data/.
```

Blocked example:

```json
{
  "path": "../private.txt"
}
```

## Tool 2: send_email

Purpose:

```text
Simulate sending an email.
```

Important:

```text
It never sends real email.
```

It writes a mock record to:

```text
.agentguard-runtime/outbox.jsonl
```

Example call:

```json
{
  "to": "support-manager@agentguard.local",
  "subject": "Synthetic complaint summary",
  "body": "Three fictional customers reported onboarding and billing issues."
}
```

Security constraint:

```text
PII in the body requires approval. External recipients add risk.
```

## Tool 3: query_database

Purpose:

```text
Query synthetic customer rows.
```

Allowed:

```sql
SELECT id, name, tier FROM Customer
```

Blocked:

```sql
DROP TABLE Customer
```

Security constraint:

```text
Only SELECT-style read queries are allowed in the mock tool.
```

## Tool 4: create_ticket

Purpose:

```text
Create a synthetic support ticket.
```

Example call:

```json
{
  "title": "Follow up on onboarding documentation",
  "description": "Synthetic ticket created by AgentGuard demo agent.",
  "priority": "medium"
}
```

Security constraint:

```text
Low-risk tool, allowed by default.
```

## What The MCP Server Teaches

This project shows that an MCP server is not magic. It is a program that:

1. Registers tools.
2. Defines input schemas.
3. Receives tool calls.
4. Returns structured output.

The important part is that AgentGuard does not blindly trust the server. It scans the tool metadata and checks each call at runtime.

## Real Development Detail

The backend has a fallback path if stdio MCP startup fails during local development. This was added because developer environments can be unreliable: missing dependencies, path issues, or network installation problems can block a demo.

The fallback uses the same synthetic tool behavior so the demo remains safe.

Interview explanation:

```text
I still implemented the MCP server, but I added a local fallback so the project remains demoable even if stdio transport fails on a machine. In production, I would remove or tightly control that fallback.
```
