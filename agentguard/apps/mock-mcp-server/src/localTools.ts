import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const demoDataDir = path.join(rootDir, "demo-data");
const runtimeDir = path.join(rootDir, ".agentguard-runtime");

function ensureInsideDemoData(fileName: string) {
  const target = path.resolve(demoDataDir, path.normalize(fileName));
  const relative = path.relative(demoDataDir, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Document path must stay inside demo-data.");
  }

  return target;
}

export async function readDocument(input: { path: string }) {
  const target = ensureInsideDemoData(input.path);
  const text = await fs.readFile(target, "utf8");
  return {
    path: path.basename(target),
    text
  };
}

export async function sendEmail(input: { to: string; subject: string; body: string }) {
  await fs.mkdir(runtimeDir, { recursive: true });
  const record = {
    id: `mock-email-${Date.now()}`,
    to: input.to,
    subject: input.subject,
    body: input.body,
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

export async function queryDatabase(input: { sql: string }) {
  if (!/^\s*SELECT\b/i.test(input.sql)) {
    throw new Error("Only SELECT queries are supported by the mock database tool.");
  }

  const rows = await prisma.$queryRawUnsafe(input.sql);
  return { rows };
}

export async function createTicket(input: { title: string; description: string; priority: string }) {
  return {
    id: `TICKET-${Math.floor(Math.random() * 9000 + 1000)}`,
    title: input.title,
    description: input.description,
    priority: input.priority,
    status: "created"
  };
}

