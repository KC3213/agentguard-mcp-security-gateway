# Interview Prep

Use this file to train yourself to explain the project naturally.

## 30-Second Pitch

```text
AgentGuard is an MCP security gateway for AI agents. It sits between an agent and MCP tools, scans tool metadata, risk-scores every tool call, blocks unsafe actions, asks for human approval when needed, and records a flight-recorder audit trail. I built it because agentic AI is not only about generating answers anymore; agents can take actions, so companies need runtime control.
```

## 2-Minute Explanation

```text
The project has three main parts. First, a Tool Trust Scanner inspects MCP tools before use. It looks at the tool name, description, input schema, base risk, and approval status. Second, an Agent Firewall checks every tool call at runtime. It detects PII, secrets, SQL mutation commands, path traversal, unknown tools, and external email recipients. Third, a Flight Recorder stores the full session timeline: prompt, planned calls, decisions, outputs, approvals, and audit events.

The demo uses synthetic enterprise tools: read_document, send_email, query_database, and create_ticket. I kept the planner deterministic so the project runs without an API key and the security behavior is repeatable.
```

## Explain MCP Like A Beginner Who Learned It

```text
MCP is a standard way for AI applications to connect to external capabilities. An MCP server exposes tools, resources, and prompts. An MCP client discovers those capabilities and calls them. In my project, the mock MCP server exposes tools like send_email and query_database, and AgentGuard acts as the client and gateway.
```

## Explain Why This Is Not Just A Chatbot

```text
A chatbot mostly returns text. AgentGuard focuses on what happens when an agent can take actions. If the agent can send email or query a database, the system needs policy enforcement, approval, and auditability. That is the difference.
```

## Explain The Security Model

```text
I used deterministic rules because security decisions should be repeatable. Every tool has a base risk score. Then the policy engine adds risk for PII, external recipients, large payloads, and approval-required tools. Some things are hard-blocked immediately, such as secrets, SQL mutation commands, path traversal, and unknown tools.
```

## Best Demo Story

Show this sequence:

```text
1. Safe ticket creation -> allowed.
2. DROP SQL query -> blocked before execution.
3. Internal complaint email -> approval required.
4. Redact & Approve -> executes through mock outbox.
5. External customer-data email -> blocked.
6. Flight Recorder -> shows the whole timeline.
7. Audit Log -> shows tamper-evident events.
```

## Questions And Strong Answers

**Q: Why did you use MCP?**

```text
Because MCP gives a standard interface for tool discovery and tool calling. That standard boundary is a good place to add security controls. Instead of securing every tool integration differently, the gateway can inspect MCP tool metadata and runtime calls consistently.
```

**Q: Why not use a real LLM planner?**

```text
I wanted the MVP to be deterministic and demoable without API keys. The project is about securing tool execution, not model quality. A real LLM planner can be added later behind an API key, but the policy engine should still remain deterministic.
```

**Q: What happens if the agent is tricked by prompt injection?**

```text
If the agent is tricked into calling a risky tool, AgentGuard still checks the tool call. For example, if hidden text tells the agent to email customer data externally, the gateway sees the external recipient and PII, then blocks the call.
```

**Q: How is tool poisoning handled?**

```text
The Tool Trust Scanner looks at tool descriptions and schemas before approval. In a real system, I would also store descriptor versions and alert when a tool description changes unexpectedly.
```

**Q: What did you learn while building it?**

```text
I learned that agent security has small design details that matter. For example, I initially scanned the whole email body when checking for external recipients. That caused a false positive because the body contained a customer email address. I fixed it by separating destination checks from content checks.
```

**Q: What is the production version of this?**

```text
A production version would use real SSO, per-tool scopes, OAuth-aware MCP authorization, OpenTelemetry traces, stronger DLP, sandboxing, policy-as-code with OPA or Cedar, and immutable audit storage.
```

**Q: What are the limitations?**

```text
The tools are synthetic, auth is simulated with a role switcher, the planner is deterministic, and the audit chain is a demo control. But the project demonstrates the right architecture: gateway enforcement, approval, and observability.
```

## Vocabulary To Use

Use these phrases:

- Runtime policy enforcement.
- Tool-call boundary.
- Human-in-the-loop approval.
- Sensitive data leakage.
- Excessive agency.
- Tool poisoning.
- Indirect prompt injection.
- Tamper-evident audit chain.
- MCP client and server.
- Deterministic policy engine.

## Avoid Saying

Avoid:

```text
I just made a chatbot.
```

Say:

```text
I built a control layer for tool-using AI agents.
```

Avoid:

```text
The AI decides if something is safe.
```

Say:

```text
The gateway decides if a tool call is allowed.
```

Avoid:

```text
This is fully production ready.
```

Say:

```text
This is a working prototype that demonstrates the architecture. I know what would need to change for production.
```
