# Demo Script

Use this during an interview or project presentation.

## Opening Line

Say:

```text
This project is called AgentGuard. It is an MCP security gateway for AI agents. The goal is to show that once agents can call tools, we need runtime controls: tool scanning, risk scoring, human approval, and audit logs.
```

## Step 1: Show Tool Registry

Open:

```text
http://localhost:5173
```

Go to **Tool Registry** and click **Scan**.

Say:

```text
Before the agent can use tools, AgentGuard scans the MCP tool descriptors. It records each tool's name, description, input schema, base risk, trust score, and status.
```

Point out:

- `create_ticket` is low risk.
- `query_database` is medium risk.
- `send_email` requires approval.

## Step 2: Show A Safe Action

Go to **Agent Console**.

Run:

```text
Create a normal onboarding documentation ticket
```

Say:

```text
This is the happy path. The planner creates a create_ticket tool call, the risk score is low, and the gateway allows it.
```

Expected result:

```text
create_ticket -> ALLOW -> EXECUTED
```

## Step 3: Show SQL Blocking

Run:

```text
Try DROP SQL on the customer table
```

Say:

```text
This simulates an agent trying to perform a destructive database operation. The gateway detects DROP before the MCP server is called, so the database tool never executes.
```

Expected result:

```text
query_database -> BLOCK
Reason: SQL mutation command detected
```

## Step 4: Show Human Approval

Run:

```text
Summarize complaints and email internally
```

Say:

```text
The agent reads a synthetic complaint file, then tries to email a summary internally. The content includes fake PII, so AgentGuard pauses execution and asks for human approval.
```

Go to **Approvals**.

Point out:

- Raw arguments are visible.
- The reviewer can approve, reject, or redact.
- The UI does not hide the real tool input behind the agent's summary.

Click:

```text
Redact & Approve
```

Say:

```text
This preserves the internal recipient but redacts customer contact details in the body.
```

## Step 5: Show External Data Exfiltration Block

Run:

```text
Send fake customer data externally
```

Say:

```text
This is the key security demo. The same sensitive content becomes more dangerous when the destination is external. AgentGuard combines PII detection and external-recipient detection, raises the risk to critical, and blocks the call.
```

Expected result:

```text
send_email -> BLOCK
Reason: PII detected + external recipient + approval-required tool
```

## Step 6: Show Flight Recorder

Go to **Flight Recorder**.

Say:

```text
This view is like a black box for AI agents. It shows what the user asked, what the agent planned, which tools were called, what decisions were made, and what outputs came back.
```

## Step 7: Show Audit Log

Go to **Audit Log**.

Say:

```text
Every important event is stored with a hash and previous hash. This makes the log tamper-evident for demo purposes.
```

## Closing Line

Say:

```text
The main learning from this project is that agent safety cannot rely only on better prompts. When agents can call tools, we need runtime enforcement at the tool boundary. AgentGuard demonstrates that pattern with MCP.
```

## Questions Interviewers May Ask

**Why not let the LLM decide if a tool call is safe?**

Answer:

```text
LLMs are useful for reasoning, but security decisions should be deterministic, auditable, and repeatable. That is why I used a rule-based policy engine for the MVP.
```

**Why use synthetic tools?**

Answer:

```text
The purpose is to demonstrate architecture safely. Real email, real customer databases, or real company files would create unnecessary risk. The synthetic tools behave like enterprise tools but avoid leaking real data.
```

**What was the hardest part?**

Answer:

```text
The hardest part was separating content risk from destination risk. For example, an email body can contain customer email addresses, but that does not mean those addresses are recipients. I fixed this by only checking recipient fields for external-destination risk, while still scanning the body for PII.
```
