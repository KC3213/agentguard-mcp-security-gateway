import type { z } from "zod";
import type { mcpServerOnboardSchema } from "@agentguard/shared";
import { prisma } from "../prisma";
import { recordAuditEvent } from "./audit";
import { scanAndPersistTools } from "./gateway";
import { publicMcpServer } from "./mapper";
import { mcpClient } from "./mcpClient";

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

  let probe;

  try {
    probe = await mcpClient.testConnection(server.endpoint);
  } catch (error) {
    await prisma.mcpServer.update({
      where: { id: serverId },
      data: { status: "ERROR" }
    });

    await recordAuditEvent({
      eventType: "MCP_SERVER_CONNECTION_FAILED",
      entityType: "McpServer",
      entityId: serverId,
      actor,
      data: {
        name: server.name,
        status: "ERROR",
        error: error instanceof Error ? error.message : "Unknown MCP connection error"
      }
    });

    throw error;
  }

  const status = "ONLINE";
  const updatedServer = await prisma.mcpServer.update({
    where: { id: serverId },
    data: { status },
    include: {
      _count: { select: { tools: true } },
      tools: { orderBy: { name: "asc" } }
    }
  });

  await recordAuditEvent({
    eventType: "MCP_SERVER_CONNECTED",
    entityType: "McpServer",
    entityId: serverId,
    actor,
    data: {
      name: server.name,
      status,
      toolCount: probe.toolCount,
      tools: probe.tools
    }
  });

  return publicMcpServer(updatedServer);
}

export async function scanMcpServer(serverId: string, actor: string) {
  const server = await prisma.mcpServer.findUnique({ where: { id: serverId } });

  if (!server) {
    throw new Error("MCP server not found");
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
