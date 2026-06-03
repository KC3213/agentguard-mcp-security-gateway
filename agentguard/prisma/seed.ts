import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { policyRules, scanToolDescriptor } from "@agentguard/policy-engine";

const prisma = new PrismaClient();
const demoServerEndpoint = JSON.stringify(
  {
    preset: "agentguard-demo",
    transport: "stdio",
    command: "tsx",
    args: ["apps/mock-mcp-server/src/index.ts"],
    allowedDirectories: ["demo-data", ".agentguard-runtime"],
    auditEnabled: true
  },
  null,
  2
);

const descriptors = [
  {
    name: "read_document",
    description: "Read a synthetic document from the demo-data directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File name inside demo-data." }
      },
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
      properties: {
        sql: { type: "string", description: "SELECT-only SQL query." }
      },
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
        priority: { type: "string", enum: ["low", "medium", "high"] }
      },
      required: ["title", "description", "priority"]
    }
  }
];

function hashEvent(data: unknown, prevHash: string | null) {
  const payload = {
    eventType: "SEED_COMPLETE",
    entityType: "System",
    entityId: null,
    actor: "seed",
    data
  };

  return createHash("sha256")
    .update(JSON.stringify({ payload, prevHash }))
    .digest("hex");
}

async function main() {
  const users = [
    { email: "employee@agentguard.local", role: "employee", name: "Employee Demo" },
    { email: "reviewer@agentguard.local", role: "reviewer", name: "Reviewer Demo" },
    { email: "admin@agentguard.local", role: "admin", name: "Admin Demo" }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: user,
      create: user
    });
  }

  const server = await prisma.mcpServer.upsert({
    where: { name: "Synthetic Company Tools MCP" },
    update: {
      description: "Local mock MCP server containing synthetic-only tools.",
      endpoint: demoServerEndpoint,
      status: "ONLINE"
    },
    create: {
      name: "Synthetic Company Tools MCP",
      description: "Local mock MCP server containing synthetic-only tools.",
      endpoint: demoServerEndpoint,
      status: "ONLINE"
    }
  });

  for (const descriptor of descriptors) {
    const scan = scanToolDescriptor(descriptor);
    await prisma.tool.upsert({
      where: { name: scan.name },
      update: {
        serverId: server.id,
        description: scan.description,
        inputSchema: JSON.stringify(scan.inputSchema, null, 2),
        status: scan.status,
        baseRisk: scan.baseRisk,
        riskScore: scan.riskScore,
        riskLevel: scan.riskLevel,
        trustScore: scan.trustScore,
        reasons: JSON.stringify(scan.reasons)
      },
      create: {
        serverId: server.id,
        name: scan.name,
        description: scan.description,
        inputSchema: JSON.stringify(scan.inputSchema, null, 2),
        status: scan.status,
        baseRisk: scan.baseRisk,
        riskScore: scan.riskScore,
        riskLevel: scan.riskLevel,
        trustScore: scan.trustScore,
        reasons: JSON.stringify(scan.reasons)
      }
    });
  }

  for (const [index, rule] of policyRules.entries()) {
    await prisma.policy.upsert({
      where: { name: `Rule ${index + 1}` },
      update: {
        description: rule,
        enabled: true,
        severity: index <= 2 ? "critical" : "medium"
      },
      create: {
        name: `Rule ${index + 1}`,
        description: rule,
        enabled: true,
        severity: index <= 2 ? "critical" : "medium"
      }
    });
  }

  await prisma.customer.deleteMany();
  await prisma.customer.createMany({
    data: [
      {
        name: "Ada Lovelace",
        email: "ada.lovelace@demo.customer",
        phone: "555-010-1111",
        tier: "enterprise",
        revenue: 120000,
        openComplaints: 2
      },
      {
        name: "Grace Hopper",
        email: "grace.hopper@demo.customer",
        phone: "555-010-2222",
        tier: "enterprise",
        revenue: 98000,
        openComplaints: 1
      },
      {
        name: "Katherine Johnson",
        email: "katherine.johnson@demo.customer",
        phone: "555-010-3333",
        tier: "growth",
        revenue: 45000,
        openComplaints: 0
      }
    ]
  });

  const existingSeedEvent = await prisma.auditEvent.findFirst({
    where: { eventType: "SEED_COMPLETE" }
  });

  if (!existingSeedEvent) {
    const data = { message: "Synthetic AgentGuard seed data created" };
    await prisma.auditEvent.create({
      data: {
        eventType: "SEED_COMPLETE",
        entityType: "System",
        actor: "seed",
        data: JSON.stringify(data),
        prevHash: null,
        hash: hashEvent(data, null)
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
