import type { JsonRecord, PlannedToolCall, SessionRequest } from "@agentguard/shared";
import { evaluateToolCall, evaluateToolOutput, scanToolDescriptor } from "@agentguard/policy-engine";
import { prisma } from "../prisma";
import { stringifyJson } from "../json";
import { recordAuditEvent } from "./audit";
import { mcpClient } from "./mcpClient";
import { planToolCalls } from "./planner";
import { publicTool } from "./mapper";

export type RealtimeEmitter = (event: string, payload: unknown) => void;

let emitRealtime: RealtimeEmitter = () => undefined;

export function setRealtimeEmitter(emitter: RealtimeEmitter) {
  emitRealtime = emitter;
}

function emit(event: string, payload: unknown) {
  emitRealtime(event, payload);
}

export async function scanAndPersistTools(actor = "admin@agentguard.local") {
  const descriptors = await mcpClient.listTools();
  const server = await prisma.mcpServer.upsert({
    where: { name: "Synthetic Company Tools MCP" },
    update: {
      description: "Local mock MCP server containing synthetic-only tools.",
      endpoint: "stdio://apps/mock-mcp-server/src/index.ts",
      status: "ONLINE"
    },
    create: {
      name: "Synthetic Company Tools MCP",
      description: "Local mock MCP server containing synthetic-only tools.",
      endpoint: "stdio://apps/mock-mcp-server/src/index.ts",
      status: "ONLINE"
    }
  });

  const scans = [];

  for (const descriptor of descriptors) {
    const scan = scanToolDescriptor(descriptor);
    const existing = await prisma.tool.findUnique({ where: { name: scan.name } });
    const tool = await prisma.tool.upsert({
      where: { name: scan.name },
      update: {
        serverId: server.id,
        description: scan.description,
        inputSchema: stringifyJson(scan.inputSchema),
        status: existing?.status && existing.status !== "DISCOVERED" ? existing.status : scan.status,
        baseRisk: scan.baseRisk,
        riskScore: scan.riskScore,
        riskLevel: scan.riskLevel,
        trustScore: scan.trustScore,
        reasons: stringifyJson(scan.reasons)
      },
      create: {
        serverId: server.id,
        name: scan.name,
        description: scan.description,
        inputSchema: stringifyJson(scan.inputSchema),
        status: scan.status,
        baseRisk: scan.baseRisk,
        riskScore: scan.riskScore,
        riskLevel: scan.riskLevel,
        trustScore: scan.trustScore,
        reasons: stringifyJson(scan.reasons)
      }
    });

    scans.push(publicTool(tool));
  }

  const event = await recordAuditEvent({
    eventType: "TOOLS_SCANNED",
    entityType: "Tool",
    actor,
    data: { count: scans.length, tools: scans.map((tool) => tool.name) }
  });

  emit("tools:scanned", { tools: scans, auditEvent: event });
  return scans;
}

async function executeAllowedTool(name: string, args: JsonRecord) {
  return mcpClient.callTool(name, args);
}

async function persistToolCall(input: {
  sessionId?: string | null;
  plannedCall: PlannedToolCall;
  decision: string;
  riskScore: number;
  riskLevel: string;
  reasons: string[];
  status: string;
  output?: unknown;
}) {
  const call = await prisma.toolCall.create({
    data: {
      sessionId: input.sessionId ?? null,
      toolName: input.plannedCall.toolName,
      purpose: input.plannedCall.purpose,
      arguments: stringifyJson(input.plannedCall.arguments),
      output: input.output === undefined ? null : stringifyJson(input.output),
      decision: input.decision,
      riskScore: input.riskScore,
      riskLevel: input.riskLevel,
      reasons: stringifyJson(input.reasons),
      status: input.status
    }
  });

  emit("tool-call:created", call);
  return call;
}

export async function runAgentSession(input: SessionRequest) {
  const plannedCalls = planToolCalls(input.prompt);
  const session = await prisma.agentSession.create({
    data: {
      prompt: input.prompt,
      userEmail: input.userEmail,
      userRole: input.userRole,
      status: "RUNNING",
      planned: stringifyJson(plannedCalls)
    }
  });

  await recordAuditEvent({
    eventType: "SESSION_STARTED",
    entityType: "AgentSession",
    entityId: session.id,
    actor: input.userEmail,
    data: { prompt: input.prompt, plannedCalls }
  });

  emit("session:started", session);

  let finalStatus: "COMPLETED" | "WAITING_FOR_APPROVAL" | "BLOCKED" = "COMPLETED";
  const notes: string[] = [];

  for (const plannedCall of plannedCalls) {
    const tool = await prisma.tool.findUnique({ where: { name: plannedCall.toolName } });
    const precheck = evaluateToolCall({
      toolName: plannedCall.toolName,
      toolStatus: tool?.status as never,
      baseRisk: tool?.baseRisk,
      arguments: plannedCall.arguments
    });

    if (precheck.decision === "BLOCK") {
      const call = await persistToolCall({
        sessionId: session.id,
        plannedCall,
        decision: precheck.decision,
        riskScore: precheck.riskScore,
        riskLevel: precheck.riskLevel,
        reasons: precheck.reasons,
        status: "BLOCKED"
      });

      await recordAuditEvent({
        eventType: "TOOL_CALL_BLOCKED",
        entityType: "ToolCall",
        entityId: call.id,
        actor: input.userEmail,
        data: { toolName: plannedCall.toolName, reasons: precheck.reasons }
      });

      finalStatus = "BLOCKED";
      notes.push(`${plannedCall.toolName} was blocked: ${precheck.reasons.join("; ")}`);
      break;
    }

    if (precheck.decision === "REQUIRE_APPROVAL") {
      const call = await persistToolCall({
        sessionId: session.id,
        plannedCall,
        decision: precheck.decision,
        riskScore: precheck.riskScore,
        riskLevel: precheck.riskLevel,
        reasons: precheck.reasons,
        status: "PENDING_APPROVAL"
      });

      const approval = await prisma.approval.create({
        data: {
          toolCallId: call.id,
          status: "PENDING",
          requestedBy: input.userEmail,
          rawArguments: stringifyJson(plannedCall.arguments),
          redactedArgs: stringifyJson(precheck.redactedArguments ?? plannedCall.arguments)
        }
      });

      await recordAuditEvent({
        eventType: "APPROVAL_REQUESTED",
        entityType: "Approval",
        entityId: approval.id,
        actor: input.userEmail,
        data: {
          toolName: plannedCall.toolName,
          riskScore: precheck.riskScore,
          reasons: precheck.reasons
        }
      });

      emit("approval:requested", approval);
      finalStatus = "WAITING_FOR_APPROVAL";
      notes.push(`${plannedCall.toolName} is waiting for approval.`);
      break;
    }

    const output = await executeAllowedTool(plannedCall.toolName, plannedCall.arguments);
    const postcheck = evaluateToolOutput(plannedCall.toolName, output, precheck.riskScore);
    const combinedReasons = [...precheck.reasons, ...postcheck.reasons];
    const persistedOutput = postcheck.hardBlock ? { blockedOutput: true, preview: "[blocked by post-check]" } : output;
    const call = await persistToolCall({
      sessionId: session.id,
      plannedCall,
      decision: postcheck.hardBlock ? "BLOCK" : precheck.decision,
      riskScore: postcheck.riskScore,
      riskLevel: postcheck.riskLevel,
      reasons: combinedReasons,
      status: postcheck.hardBlock ? "BLOCKED_OUTPUT" : "EXECUTED",
      output: persistedOutput
    });

    await recordAuditEvent({
      eventType: postcheck.hardBlock ? "TOOL_OUTPUT_BLOCKED" : "TOOL_CALL_EXECUTED",
      entityType: "ToolCall",
      entityId: call.id,
      actor: input.userEmail,
      data: {
        toolName: plannedCall.toolName,
        decision: postcheck.hardBlock ? "BLOCK" : precheck.decision,
        riskScore: postcheck.riskScore,
        reasons: combinedReasons
      }
    });

    if (postcheck.hardBlock) {
      finalStatus = "BLOCKED";
      notes.push(`${plannedCall.toolName} output was blocked.`);
      break;
    }

    notes.push(`${plannedCall.toolName} executed with decision ${precheck.decision}.`);
  }

  const finalAnswer =
    finalStatus === "COMPLETED"
      ? `Session completed. ${notes.join(" ")}`
      : finalStatus === "WAITING_FOR_APPROVAL"
        ? `Session paused for human approval. ${notes.join(" ")}`
        : `Session blocked by AgentGuard. ${notes.join(" ")}`;

  const updatedSession = await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      status: finalStatus,
      finalAnswer
    },
    include: { toolCalls: true }
  });

  await recordAuditEvent({
    eventType: "SESSION_FINISHED",
    entityType: "AgentSession",
    entityId: session.id,
    actor: input.userEmail,
    data: { status: finalStatus, finalAnswer }
  });

  emit("session:finished", updatedSession);

  return {
    session: updatedSession,
    response: {
      sessionId: session.id,
      status: finalStatus,
      finalAnswer,
      plannedCalls
    }
  };
}

export async function approveToolCall(approvalId: string, actor: string, redactedArguments?: JsonRecord) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { toolCall: true }
  });

  if (!approval) {
    throw new Error("Approval not found");
  }

  if (approval.status !== "PENDING") {
    throw new Error("Approval has already been reviewed");
  }

  const args = redactedArguments ?? JSON.parse(approval.rawArguments);
  const output = await executeAllowedTool(approval.toolCall.toolName, args);
  const postcheck = evaluateToolOutput(approval.toolCall.toolName, output, approval.toolCall.riskScore);
  const outputForStorage = postcheck.hardBlock ? { blockedOutput: true, preview: "[blocked by post-check]" } : output;

  await prisma.toolCall.update({
    where: { id: approval.toolCallId },
    data: {
      arguments: stringifyJson(args),
      output: stringifyJson(outputForStorage),
      status: postcheck.hardBlock ? "BLOCKED_OUTPUT" : "APPROVED_EXECUTED",
      decision: postcheck.hardBlock ? "BLOCK" : "ALLOW_WITH_LOG",
      riskScore: postcheck.riskScore,
      riskLevel: postcheck.riskLevel,
      reasons: stringifyJson([...JSON.parse(approval.toolCall.reasons), ...postcheck.reasons])
    }
  });

  const updatedApproval = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: redactedArguments ? "REDACTED_APPROVED" : "APPROVED",
      reviewedBy: actor,
      redactedArgs: redactedArguments ? stringifyJson(redactedArguments) : approval.redactedArgs,
      reviewedAt: new Date()
    },
    include: { toolCall: true }
  });

  if (approval.toolCall.sessionId) {
    await prisma.agentSession.update({
      where: { id: approval.toolCall.sessionId },
      data: {
        status: postcheck.hardBlock ? "BLOCKED" : "COMPLETED",
        finalAnswer: postcheck.hardBlock
          ? "Approved tool call was blocked during output post-check."
          : "Approved tool call executed through the mock MCP server."
      }
    });
  }

  await recordAuditEvent({
    eventType: redactedArguments ? "APPROVAL_REDACTED_APPROVED" : "APPROVAL_APPROVED",
    entityType: "Approval",
    entityId: approvalId,
    actor,
    data: {
      toolName: approval.toolCall.toolName,
      postDecision: postcheck.decision,
      riskScore: postcheck.riskScore
    }
  });

  emit("approval:reviewed", updatedApproval);
  return updatedApproval;
}

export async function rejectToolCall(approvalId: string, actor: string) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { toolCall: true }
  });

  if (!approval) {
    throw new Error("Approval not found");
  }

  if (approval.status !== "PENDING") {
    throw new Error("Approval has already been reviewed");
  }

  await prisma.toolCall.update({
    where: { id: approval.toolCallId },
    data: {
      status: "REJECTED",
      decision: "BLOCK"
    }
  });

  if (approval.toolCall.sessionId) {
    await prisma.agentSession.update({
      where: { id: approval.toolCall.sessionId },
      data: {
        status: "BLOCKED",
        finalAnswer: "Human reviewer rejected the pending tool call."
      }
    });
  }

  const updatedApproval = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: "REJECTED",
      reviewedBy: actor,
      reviewedAt: new Date()
    },
    include: { toolCall: true }
  });

  await recordAuditEvent({
    eventType: "APPROVAL_REJECTED",
    entityType: "Approval",
    entityId: approvalId,
    actor,
    data: { toolName: approval.toolCall.toolName }
  });

  emit("approval:reviewed", updatedApproval);
  return updatedApproval;
}

