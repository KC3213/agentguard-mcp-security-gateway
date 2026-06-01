# AgentGuard

AgentGuard is a full-stack prototype for securing AI agents that use MCP tools. The core idea is simple:

```text
An agent may decide what it wants to do, but AgentGuard decides what it is allowed to do.
```

Most beginner AI projects stop at "chat with your data." AgentGuard focuses on the next enterprise problem: when an AI agent can call tools such as email, file search, ticket creation, or database queries, companies need permission checks, risk scoring, approvals, and audit logs.

## What This Project Demonstrates

- How MCP separates an AI application from external tools.
- How a gateway can sit between an agent and MCP servers.
- How to scan MCP tool metadata before trusting a tool.
- How to enforce runtime policy on every tool call.
- How to detect risky inputs such as PII, secrets, SQL mutation, and path traversal.
- How to pause high-risk actions for human approval.
- How to keep a flight recorder of agent sessions, tool calls, decisions, and audit events.
- How to manually test real MCP tool calls in the MCP Lab without bypassing the gateway.

## Architecture

```text
React dashboard
  -> Node/Express AgentGuard API
  -> deterministic demo agent planner
  -> policy engine pre-check
  -> mock MCP server tools
  -> policy engine post-check
  -> SQLite flight recorder + audit hash chain
```

The project uses synthetic data only. It does not send real email, read private files, call a real LLM by default, or connect to external business systems.

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- MCP: official TypeScript SDK
- Database: Prisma + SQLite
- Realtime: Socket.IO
- Styling: Tailwind CSS
- Testing: Vitest, Supertest, React Testing Library

## Local Setup

```bash
cd "/Users/kachadha/Documents/my project/agentguard"
npm install --userconfig /private/tmp/agentguard-empty-npmrc --strict-ssl=false --registry=https://registry.npmmirror.com
npm run dev
```

If your network can reach the normal npm registry, plain `npm install` is fine. The longer command avoids stale local npm credentials and worked during development when `registry.npmjs.org` was blocked by the network.

Open:

```text
http://localhost:5173
```

The API runs at:

```text
http://localhost:4000
```

No-install fallback:

```bash
npm run dev:standalone
```

Standalone URL:

```text
http://localhost:4173
```

## Demo Users

Use the role switcher in the dashboard:

- `employee@agentguard.local`
- `reviewer@agentguard.local`
- `admin@agentguard.local`

This is intentionally simple for the MVP. In a production version, the role would come from SSO or an identity provider.

## Demo Scenarios

Run these from the Agent Console:

- Create a normal onboarding documentation ticket -> allowed.
- Read the public quarterly support report -> allowed.
- Query customers with SELECT -> logged.
- Try DROP SQL on the customer table -> blocked.
- Summarize complaints and email internally -> requires approval.
- Send fake customer data externally -> blocked by high risk.
- Send an API key by email -> blocked.
- Use an unknown tool -> blocked.

Use the MCP Lab to manually test the same tool boundary:

- `read_document` with `public_report.txt` -> allowed.
- `query_database` with `SELECT` -> logged.
- `query_database` with `DROP TABLE Customer` -> blocked.
- `send_email` with an internal recipient -> approval required.
- `send_email` with a fake password/API key in the body -> blocked.

## Interview Pitch

Short version:

```text
I built AgentGuard, an MCP security gateway for AI agents. It scans tools before use, enforces runtime policy on every tool call, detects sensitive-data leakage and unsafe actions, supports human approval, and stores a tamper-evident flight recorder for auditability.
```

Stronger version:

```text
The main thing I learned is that agent safety is not only a prompt-engineering problem. Once an agent can call tools, safety becomes a runtime control problem. AgentGuard treats MCP tool calls like security events: each call is inspected, scored, allowed, blocked, or routed to a human reviewer.
```

## How To Study This Repo

Read the docs in this order:

1. `docs/01-mcp-basics.md` for MCP fundamentals.
2. `docs/02-architecture.md` for the system design.
3. `docs/03-workflow.md` for what happens during one agent run.
4. `docs/04-security-model.md` for the policy rules.
5. `docs/07-mcp-server.md` for how the mock MCP server works.
6. `docs/08-demo-script.md` for exactly how to present it.
7. `docs/09-interview-prep.md` for answers you can say out loud.
8. `docs/10-troubleshooting-journal.md` for real issues faced while building.
9. `docs/11-end-to-end-workflow.md` for the complete workflow from prompt to audit log.
10. `docs/12-mcp-lab.md` for the manual MCP tool playground workflow.

## Screenshots To Capture

Run the app and capture these views for a resume/portfolio:

- Agent Console after a safe ticket run.
- MCP Lab after a blocked SQL or secret-email run.
- Approvals after the internal complaint email scenario.
- Tool Registry after a scan.
- Flight Recorder after several sessions.
- Audit Log showing valid hash-chain events.

## Limitations

- The default planner is deterministic, not LLM-based.
- The MCP tools are synthetic and local.
- Auth is represented by a role switcher for MVP speed.
- The policy engine is rule-based; an LLM judge can be added later.
- The audit hash chain is a demo control, not a complete compliance system.

## Future Improvements

- Optional OpenAI/Claude planner behind an API key.
- Real identity provider integration.
- OpenTelemetry tracing.
- OPA/Rego or Cedar policy support.
- MCP server descriptor diffing between scans.
- Exportable audit reports.
- Sandboxed tool execution.
- Per-user and per-tool permission scopes.
