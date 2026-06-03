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

**MCP Control Plane**

Use this to onboard MCP servers before agents can use their tools.

It shows:

- Presets for the AgentGuard demo MCP server, Filesystem MCP, and Git MCP.
- The stdio command and arguments.
- Allowed demo directories.
- Audit logging toggle.
- Server status and discovered tool count.
- Actions to onboard, test/register, and discover tools.

Interview explanation:

```text
This is the part that makes the project feel like a platform control plane. I am not only blocking individual calls; I am governing how MCP servers become available in the first place.
```

**MCP Lab**

Use this to manually call one registered MCP tool through the same gateway. It is useful when you want to prove the policy engine works without relying on the demo planner.

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

Shows policy records vertically so they are easy to scan, edit, enable, disable, or delete.

Important interview detail: in this prototype, the Policies page is a governance editor. It records the rules your team wants to manage and audits changes to those records. The runtime firewall still uses the deterministic policy engine in `packages/policy-engine`, which is safer for the MVP because enforcement remains predictable and testable.

## UI Design Choices

The dashboard uses:

- Tables for scanning and comparing tools.
- A control-plane flow for onboarding MCP servers.
- Cards only for individual approval and policy items.
- Risk badges for fast scanning.
- A role switcher for MVP auth simulation.
- Human-readable summaries first, with raw tool arguments available where a reviewer needs exact evidence.

## What To Say In An Interview

```text
I intentionally made the frontend operational. The goal was not only to show a chatbot output, but to make agent behavior inspectable: MCP server onboarding, tool registry, approval queue, flight recorder, and audit log.
```

## What You Can Improve Later

- Real login instead of role switcher.
- Search and filters for audit logs.
- Diff view for MCP tool descriptor changes.
- Export approval/audit reports.
- Better reviewer notes and justification fields.
