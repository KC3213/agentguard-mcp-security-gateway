import type { z } from "zod";
import type { mcpServerOnboardSchema } from "@agentguard/shared";
import { prisma } from "../prisma";
import { recordAuditEvent } from "./audit";
import { scanAndPersistTools } from "./gateway";
import { publicMcpServer } from "./mapper";

type OnboardInput = z.infer<typeof mcpServerOnboardSchema>;

function endpointFromInput(input: OnboardInput) {
  return JSON.stringify(
    {
      preset: input.preset,
      transport: input.transport,
      command: input.command,
      args: input.args,
      allowedDirectories: input.allowedDirectories,
      auditEnabled: input.auditEnabled
    },
    null,
    2
  );
}

function isAgentGuardDemoServer(endpoint: string, name: string) {
  return endpoint.includes("mock-mcp-server") || name.toLowerCase().includes("synthetic company tools");
}

export async function listMcpServers() {
  const servers = await prisma.mcpServer.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { tools: true } },
      tools: { orderBy: { name: "asc" } }
    }
  });

  return servers.map(publicMcpServer);
}

export async function onboardMcpServer(input: OnboardInput) {
  const endpoint = endpointFromInput(input);
  const server = await prisma.mcpServer.upsert({
    where: { name: input.name },
    update: {
      description: input.description,
      endpoint,
      status: "ONBOARDED"
    },
    create: {
      name: input.name,
      description: input.description,
      endpoint,
      status: "ONBOARDED"
    },
    include: {
      _count: { select: { tools: true } },
      tools: { orderBy: { name: "asc" } }
    }
  });

  await recordAuditEvent({
    eventType: "MCP_SERVER_ONBOARDED",
    entityType: "McpServer",
    entityId: server.id,
    actor: input.actor,
    data: {
      name: server.name,
      preset: input.preset,
      transport: input.transport,
      command: input.command,
      args: input.args,
      allowedDirectories: input.allowedDirectories,
      auditEnabled: input.auditEnabled
    }
  });

  return publicMcpServer(server);
}

export async function testMcpServerConnection(serverId: string, actor: string) {
  const server = await prisma.mcpServer.findUnique({ where: { id: serverId } });

  if (!server) {
    throw new Error("MCP server not found");
  }

  const status = isAgentGuardDemoServer(server.endpoint, server.name) ? "ONLINE" : "ONBOARDED";
  const updatedServer = await prisma.mcpServer.update({
    where: { id: serverId },
    data: { status },
    include: {
      _count: { select: { tools: true } },
      tools: { orderBy: { name: "asc" } }
    }
  });

  await recordAuditEvent({
    eventType: status === "ONLINE" ? "MCP_SERVER_CONNECTED" : "MCP_SERVER_REGISTERED",
    entityType: "McpServer",
    entityId: serverId,
    actor,
    data: {
      name: server.name,
      status,
      note:
        status === "ONLINE"
          ? "AgentGuard demo MCP server is available for tool discovery."
          : "Server metadata is onboarded. External server connection adapters are planned next."
    }
  });

  return publicMcpServer(updatedServer);
}

export async function scanMcpServer(serverId: string, actor: string) {
  const server = await prisma.mcpServer.findUnique({ where: { id: serverId } });

  if (!server) {
    throw new Error("MCP server not found");
  }

  if (!isAgentGuardDemoServer(server.endpoint, server.name)) {
    throw new Error("Tool discovery is currently enabled for the AgentGuard demo MCP server only.");
  }

  const tools = await scanAndPersistTools(actor, serverId);
  const updatedServer = await prisma.mcpServer.findUniqueOrThrow({
    where: { id: serverId },
    include: {
      _count: { select: { tools: true } },
      tools: { orderBy: { name: "asc" } }
    }
  });

  return {
    server: publicMcpServer(updatedServer),
    tools
  };
}
