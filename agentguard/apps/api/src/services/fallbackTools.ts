import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonRecord, ToolDescriptor } from "@agentguard/shared";

const prisma = new PrismaClient();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../../..");
const demoDataDir = path.join(rootDir, "demo-data");
const runtimeDir = path.join(rootDir, ".agentguard-runtime");

export const fallbackToolDescriptors: ToolDescriptor[] = [
  {
    name: "read_document",
    description: "Read a synthetic document from the demo-data directory.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "send_email",
    description: "Write a mock email record to the local demo outbox. Does not send real email.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "query_database",
    description: "Run read-only SELECT queries against the synthetic Customer table.",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string" } },
      required: ["sql"]
    }
  },
  {
    name: "create_ticket",
    description: "Create a synthetic support ticket for workflow tracking.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string" }
      },
      required: ["title", "description", "priority"]
    }
  }
];

function ensureInsideDemoData(fileName: string) {
  const normalized = path.normalize(fileName);
  const target = path.resolve(demoDataDir, normalized);
  const relative = path.relative(demoDataDir, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Document path must stay inside demo-data.");
  }

  return target;
}

export async function executeFallbackTool(name: string, args: JsonRecord) {
  if (name === "read_document") {
    const documentPath = ensureInsideDemoData(String(args.path ?? ""));
    const text = await fs.readFile(documentPath, "utf8");
    return {
      path: path.basename(documentPath),
      text
    };
  }

  if (name === "send_email") {
    await fs.mkdir(runtimeDir, { recursive: true });
    const record = {
      id: `mock-email-${Date.now()}`,
      to: String(args.to ?? ""),
      subject: String(args.subject ?? ""),
      body: String(args.body ?? ""),
      sentAt: new Date().toISOString(),
      transport: "mock-outbox"
    };

    await fs.appendFile(path.join(runtimeDir, "outbox.jsonl"), `${JSON.stringify(record)}\n`);
    return {
      id: record.id,
      status: "mock_sent",
      note: "No real email was sent. The record was written to .agentguard-runtime/outbox.jsonl."
    };
  }

  if (name === "query_database") {
    const sql = String(args.sql ?? "");
    if (!/^\s*SELECT\b/i.test(sql)) {
      throw new Error("Only SELECT queries are supported by the mock database tool.");
    }

    const rows = await prisma.$queryRawUnsafe(sql);
    return { rows };
  }

  if (name === "create_ticket") {
    return {
      id: `TICKET-${Math.floor(Math.random() * 9000 + 1000)}`,
      title: String(args.title ?? "Untitled"),
      description: String(args.description ?? ""),
      priority: String(args.priority ?? "medium"),
      status: "created"
    };
  }

  throw new Error(`Unknown fallback tool: ${name}`);
}

