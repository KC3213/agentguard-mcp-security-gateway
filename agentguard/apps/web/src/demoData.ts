export const demoPrompts = [
  "Create a normal onboarding documentation ticket",
  "Read the public quarterly support report",
  "Query customers with SELECT",
  "Try DROP SQL on the customer table",
  "Summarize complaints and email internally",
  "Send fake customer data externally",
  "Send an API key by email",
  "Use an unknown tool"
];

export type LabExample = {
  purpose: string;
  arguments: Record<string, unknown>;
};

export const labExamples: Record<string, LabExample> = {
  read_document: {
    purpose: "MCP Lab: read a synthetic public report through the gateway",
    arguments: { path: "public_report.txt" }
  },
  create_ticket: {
    purpose: "MCP Lab: create a synthetic ticket through the gateway",
    arguments: {
      title: "MCP Lab follow-up",
      description: "Synthetic ticket created from the MCP Lab playground.",
      priority: "medium"
    }
  },
  query_database: {
    purpose: "MCP Lab: run a read-only synthetic customer query",
    arguments: { sql: "SELECT id, name, tier, revenue FROM Customer ORDER BY revenue DESC" }
  },
  send_email: {
    purpose: "MCP Lab: test an internal mock email approval path",
    arguments: {
      to: "support-manager@agentguard.local",
      subject: "MCP Lab synthetic update",
      body: "Synthetic update from AgentGuard MCP Lab. No real email is sent."
    }
  },
  read_text_file: {
    purpose: "MCP Lab: read a demo file through real Filesystem MCP",
    arguments: { path: "/Users/kachadha/Documents/my project/agentguard/demo-data/public_report.txt" }
  },
  read_file: {
    purpose: "MCP Lab: read a demo file through real Filesystem MCP",
    arguments: { path: "/Users/kachadha/Documents/my project/agentguard/demo-data/public_report.txt" }
  },
  list_directory: {
    purpose: "MCP Lab: list the synthetic demo-data folder through real Filesystem MCP",
    arguments: { path: "/Users/kachadha/Documents/my project/agentguard/demo-data" }
  },
  status: {
    purpose: "MCP Lab: inspect this Git repo through real Git MCP",
    arguments: { path: "/Users/kachadha/Documents/my project" }
  },
  diff: {
    purpose: "MCP Lab: inspect Git diff stats through real Git MCP",
    arguments: { path: "/Users/kachadha/Documents/my project" }
  }
};

export const blockedLabExamples = [
  {
    label: "Blocked SQL",
    toolName: "query_database",
    purpose: "MCP Lab: demonstrate SQL mutation blocking",
    arguments: { sql: "DROP TABLE Customer" }
  },
  {
    label: "Path traversal",
    toolName: "read_document",
    purpose: "MCP Lab: demonstrate document path traversal blocking",
    arguments: { path: "../private.txt" }
  },
  {
    label: "Secret email",
    toolName: "send_email",
    purpose: "MCP Lab: demonstrate secret leakage blocking",
    arguments: {
      to: "security@agentguard.local",
      subject: "Credential handoff",
      body: "password=NeverUseThis123 and api_key=sk-test-1234567890abcdef should never leave the agent."
    }
  }
];
