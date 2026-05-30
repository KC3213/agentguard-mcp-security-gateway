# Security Model

AgentGuard uses deterministic security controls for the MVP. Deterministic means the same tool call should get the same decision every time.

That matters because LLMs can be probabilistic, but security decisions should be explainable and repeatable.

## Threats This Project Handles

**Excessive agency**

The agent tries to do more than it should.

Example:

```text
send_email("attacker@example.com", customer_data)
```

Control:

```text
External recipient + PII = critical risk, block
```

**Sensitive data leakage**

The tool call contains fake customer contact details or secrets.

Example:

```text
body = "Customer email: ada.lovelace@demo.customer"
```

Control:

```text
PII detector increases risk and can require approval
```

**Credential leakage**

The agent tries to send a key or password.

Example:

```text
api_key=sk-test-1234567890abcdef
```

Control:

```text
Hard block
```

**Unsafe database action**

The agent tries to mutate data.

Example:

```sql
DROP TABLE Customer
```

Control:

```text
Hard block before the MCP tool is called
```

**Path traversal**

The agent tries to read outside the allowed demo folder.

Example:

```text
read_document("../private.txt")
```

Control:

```text
Hard block
```

**Unknown tool**

The agent asks for a tool that was not scanned or approved.

Example:

```text
export_customer_database(format="csv")
```

Control:

```text
Hard block
```

## Risk Scores

Base tool risk:

```text
create_ticket   -> 10
read_document   -> 25
query_database  -> 35
send_email      -> 45
unknown tool    -> 90
```

Risk modifiers:

```text
PII detected               -> +30
external email recipient   -> +30
large input or output      -> +15
tool requires approval     -> minimum score 61
secret detected            -> hard block
SQL mutation detected      -> hard block
path traversal detected    -> hard block
unapproved tool            -> hard block
```

Decision thresholds:

```text
0-30   -> ALLOW
31-60  -> ALLOW_WITH_LOG
61-80  -> REQUIRE_APPROVAL
81-100 -> BLOCK
```

## Why Risk Scoring Is Useful

Risk scoring gives the interviewer a clear engineering story:

```text
I did not hardcode one-off if statements for every scenario. I created a policy engine that combines base tool risk, input signals, destination signals, and hard-block rules into a decision.
```

## Why Some Rules Are Hard Blocks

Some actions should never depend only on a numeric score.

For example:

```text
password=NeverUseThis123
DROP TABLE Customer
../private.txt
```

These are hard-blocked because approval would still be unsafe in a beginner prototype. In a real enterprise system, there may be break-glass admin workflows, but those require stronger identity, logging, and justification controls.

## Real Development Lesson

During implementation, one bug appeared in recipient detection. The first version scanned the entire email body for email addresses and treated any email-like string as a recipient. That caused an internal email to be scored as if it were being sent externally because the body contained `ada.lovelace@demo.customer`.

Fix:

```text
Only inspect recipient fields such as to, cc, bcc, recipient, and recipients for external destination checks.
Still inspect the body for PII separately.
```

This is a good interview story because it shows a real security design detail:

```text
Destination analysis and content analysis are different checks. Mixing them creates false positives.
```
