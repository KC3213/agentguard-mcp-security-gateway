import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createTicket, queryDatabase, readDocument, sendEmail } from "./localTools";

function asTextPayload(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

const server = new McpServer({
  name: "agentguard-synthetic-company-tools",
  version: "0.1.0"
});

server.registerTool(
  "read_document",
  {
    title: "Read Synthetic Document",
    description: "Read a synthetic document from the demo-data directory.",
    inputSchema: {
      path: z.string().describe("File name inside demo-data.")
    }
  },
  async ({ path }) => asTextPayload(await readDocument({ path }))
);

server.registerTool(
  "send_email",
  {
    title: "Write Mock Email",
    description: "Write a mock email record to the local demo outbox. Does not send real email.",
    inputSchema: {
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1)
    }
  },
  async ({ to, subject, body }) => asTextPayload(await sendEmail({ to, subject, body }))
);

server.registerTool(
  "query_database",
  {
    title: "Query Synthetic Database",
    description: "Run read-only SELECT queries against the synthetic Customer table.",
    inputSchema: {
      sql: z.string().describe("SELECT-only SQL query.")
    }
  },
  async ({ sql }) => asTextPayload(await queryDatabase({ sql }))
);

server.registerTool(
  "create_ticket",
  {
    title: "Create Synthetic Ticket",
    description: "Create a synthetic support ticket for workflow tracking.",
    inputSchema: {
      title: z.string().min(1),
      description: z.string().min(1),
      priority: z.enum(["low", "medium", "high"])
    }
  },
  async ({ title, description, priority }) => asTextPayload(await createTicket({ title, description, priority }))
);

const transport = new StdioServerTransport();
await server.connect(transport);

