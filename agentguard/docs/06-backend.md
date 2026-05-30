# Backend

The backend is a Node.js + Express TypeScript service. It is the most important part of the project because it acts as the security gateway.

The frontend can request an action, and the agent can plan an action, but the backend decides whether the action is allowed.

## Main Responsibilities

The backend:

- Creates agent sessions.
- Converts prompts into planned tool calls through a deterministic planner.
- Scans MCP tools.
- Stores tool registry state.
- Runs pre-checks before tool execution.
- Calls MCP tools when allowed.
- Runs post-checks on tool output.
- Creates approval records.
- Records audit events.
- Streams updates to the frontend.

## Main Routes

```text
GET    /api/health
POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:id
GET    /api/tools
POST   /api/tools/scan
PATCH  /api/tools/:id/status
GET    /api/tool-calls
GET    /api/approvals
POST   /api/approvals/:id/approve
POST   /api/approvals/:id/reject
POST   /api/approvals/:id/redact-approve
GET    /api/audit
GET    /api/policies
GET    /api/metrics
```

## Key Backend Files

```text
apps/api/src/app.ts
```

Defines Express routes.

```text
apps/api/src/services/gateway.ts
```

Runs the main session workflow: plan, check, call tool, store result, approval, audit.

```text
apps/api/src/services/planner.ts
```

Maps demo prompts to deterministic tool calls.

```text
apps/api/src/services/mcpClient.ts
```

Connects to the mock MCP server and calls tools.

```text
packages/policy-engine/src/index.ts
```

Contains the security decision logic.

## Example Request

```bash
curl -X POST http://localhost:4000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Try DROP SQL on the customer table",
    "userEmail": "employee@agentguard.local",
    "userRole": "employee"
  }'
```

Expected response:

```json
{
  "status": "BLOCKED",
  "finalAnswer": "Session blocked by AgentGuard..."
}
```

## Why The Backend Owns Security

The frontend should never be trusted to enforce security. A user can bypass frontend controls by calling the API directly.

So the backend must enforce:

- Tool status.
- Risk scoring.
- Hard-block rules.
- Approval status.
- Safe execution boundaries.

Interview explanation:

```text
I treated the backend as the policy enforcement point. The UI is only a control surface. Even if someone bypasses the UI, the API still blocks unsafe tool calls.
```

## Database Models

The Prisma schema stores:

- `User`
- `McpServer`
- `Tool`
- `Policy`
- `AgentSession`
- `ToolCall`
- `Approval`
- `AuditEvent`
- `Customer`

The `Customer` table is synthetic demo data only.

## Audit Hash Chain

Each audit event stores:

```text
prevHash
hash
```

The hash is generated from the event payload and the previous event hash. This creates a simple tamper-evident chain.

It does not prevent database tampering by itself, but it can reveal that the chain has changed.
