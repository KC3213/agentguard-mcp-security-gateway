# Workflow

This document explains what happens during one complete AgentGuard run.

## Happy Path

Example prompt:

```text
Create a normal onboarding documentation ticket
```

Flow:

```text
1. User enters prompt in Agent Console.
2. Backend creates an AgentSession.
3. Planner creates a tool call:
   create_ticket(title, description, priority)
4. Policy engine checks the call.
5. Risk score is low.
6. Gateway allows the call.
7. Mock MCP server creates a synthetic ticket.
8. Flight recorder stores the session and tool call.
9. Audit log records the event.
10. Dashboard shows the completed timeline.
```

Result:

```text
ALLOW
```

## Approval Path

Example prompt:

```text
Summarize complaints and email internally
```

Planned calls:

```text
read_document("customer_complaints.txt")
send_email("support-manager@agentguard.local", summary)
```

The first call is allowed because reading from `demo-data/` is permitted.

The second call requires approval because the email body contains fake PII-like values:

```text
ada.lovelace@demo.customer
555-010-1111
```

AgentGuard creates an approval request instead of sending the mock email immediately.

Reviewer options:

```text
Approve
Reject
Redact & Approve
```

The best demo choice is `Redact & Approve`. It keeps the internal recipient but redacts fake customer contact data from the body.

## Block Path

Example prompt:

```text
Try DROP SQL on the customer table
```

Planned call:

```text
query_database({ sql: "DROP TABLE Customer" })
```

The policy engine sees a mutation command:

```text
DROP
```

Result:

```text
BLOCK
```

The mock MCP server is never called. This is important: the gateway blocks the action before execution.

## Why Pre-Check And Post-Check Both Exist

Pre-check protects the system before an action happens.

```text
Input: send_email(to, body)
Check: Is this recipient external? Does the body contain PII? Is the tool approved?
```

Post-check protects the system after a tool returns data.

```text
Output: database rows or document text
Check: Did the tool return secrets or PII that should not be shown or passed forward?
```

In real systems, both are needed. A tool may look safe from its input but return risky data.

## Session Timeline Example

```text
Session started
  prompt = "Summarize complaints and email internally"

Tool call 1
  tool = read_document
  decision = ALLOW
  output = synthetic complaint document

Tool call 2
  tool = send_email
  decision = REQUIRE_APPROVAL
  reason = PII detected, tool requires human approval

Approval requested
  reviewer can approve, reject, or redact

Session paused
```

This timeline is what the Flight Recorder view is meant to explain.

## MCP Lab Workflow

The MCP Lab is a shorter workflow for testing one tool at a time.

Instead of starting with a natural-language prompt, you start with a specific MCP tool and JSON arguments.

Example:

```text
Tool: read_document
Arguments: { "path": "public_report.txt" }
```

Flow:

```text
1. User opens MCP Lab.
2. User selects one registered MCP tool.
3. User edits the JSON arguments.
4. Frontend calls POST /api/mcp-lab/run.
5. Backend sends the proposed call to the same policy engine.
6. If safe, the gateway calls the mock MCP server.
7. If risky, the gateway blocks it or creates an approval.
8. ToolCall is saved with decision, risk score, input, output, and reasons.
9. AuditEvent is written with the hash chain.
10. Dashboard shows the result in MCP Lab, Flight Recorder, and Audit Log.
```

This is useful in interviews because it proves the project has a working MCP server and not just an agent simulation.

## What To Say In An Interview

```text
I designed the workflow so the agent's plan is not automatically trusted. Every planned tool call becomes a security event. The gateway checks the tool, arguments, risk score, and output before the action is allowed to complete.
```
