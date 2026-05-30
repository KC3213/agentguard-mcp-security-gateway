# Frontend

The frontend is a React operational dashboard. It is designed to feel like a small internal security console, not a marketing page.

## Why The Frontend Matters

In agent security, the UI is not just decoration. It helps a human understand:

- What the agent tried to do.
- Why a tool call was risky.
- What data would be sent.
- Whether a reviewer approved or rejected the action.
- Whether the audit chain is valid.

This matters because human approval is only useful if the reviewer sees the raw action clearly.

## Views

**Agent Console**

Use this to run demo prompts. It shows the prompt, final answer, planned tool calls, decisions, and tool outputs.

Interview explanation:

```text
This is where I demonstrate that the agent can plan actions, but the gateway controls execution.
```

**Tool Registry**

Shows discovered MCP tools, descriptions, input schemas, risk scores, trust scores, and approval status.

This view answers:

```text
Which tools exist?
Which tools are approved?
Which tools require review?
Which tools are blocked?
```

**Approvals**

Shows pending tool calls that require human review. The important detail is that it displays raw tool arguments, not only the agent's friendly summary.

Why:

```text
An agent could summarize a risky action incorrectly. A reviewer should see the actual tool input.
```

**Flight Recorder**

Shows the session timeline. This is useful for debugging:

```text
Prompt -> planned call -> decision -> output -> approval
```

**Audit Log**

Shows tamper-evident audit events with hash-chain status.

This is not a full compliance product, but it demonstrates the idea that agent actions should be traceable.

**Policies**

Lists the active policy rules in plain English.

## UI Design Choices

The dashboard uses:

- Tables for scanning and comparing tools.
- Cards only for individual approval and policy items.
- Risk badges for fast scanning.
- A role switcher for MVP auth simulation.
- JSON blocks for raw tool arguments and outputs.

## What To Say In An Interview

```text
I intentionally made the frontend operational. The goal was not only to show a chatbot output, but to make agent behavior inspectable: tool registry, approval queue, flight recorder, and audit log.
```

## What You Can Improve Later

- Real login instead of role switcher.
- Search and filters for audit logs.
- Diff view for MCP tool descriptor changes.
- Export approval/audit reports.
- Better reviewer notes and justification fields.
