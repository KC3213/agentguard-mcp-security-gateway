import cors from "cors";
import express from "express";
import {
  approvalActionSchema,
  redactedApprovalSchema,
  sessionRequestSchema,
  updateToolStatusSchema
} from "@agentguard/shared";
import { prisma } from "./prisma";
import { parseJson, stringifyJson } from "./json";
import { recordAuditEvent, verifyAuditChain } from "./services/audit";
import { approveToolCall, rejectToolCall, runAgentSession, scanAndPersistTools } from "./services/gateway";
import { publicApproval, publicSession, publicTool, publicToolCall } from "./services/mapper";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "agentguard-api", timestamp: new Date().toISOString() });
  });

  app.post("/api/sessions", async (req, res, next) => {
    try {
      const input = sessionRequestSchema.parse(req.body);
      const result = await runAgentSession(input);
      res.status(201).json(result.response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions", async (_req, res, next) => {
    try {
      const sessions = await prisma.agentSession.findMany({
        orderBy: { createdAt: "desc" },
        include: { toolCalls: true }
      });
      res.json(sessions.map(publicSession));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:id", async (req, res, next) => {
    try {
      const session = await prisma.agentSession.findUnique({
        where: { id: req.params.id },
        include: { toolCalls: true }
      });

      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json(publicSession(session));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tools", async (_req, res, next) => {
    try {
      const tools = await prisma.tool.findMany({ orderBy: { name: "asc" } });
      res.json(tools.map(publicTool));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tools/scan", async (req, res, next) => {
    try {
      const actor = typeof req.body?.actor === "string" ? req.body.actor : "admin@agentguard.local";
      const tools = await scanAndPersistTools(actor);
      res.json(tools);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tools/:id/status", async (req, res, next) => {
    try {
      const input = updateToolStatusSchema.parse(req.body);
      const tool = await prisma.tool.update({
        where: { id: req.params.id },
        data: { status: input.status }
      });

      await recordAuditEvent({
        eventType: "TOOL_STATUS_UPDATED",
        entityType: "Tool",
        entityId: tool.id,
        actor: typeof req.body?.actor === "string" ? req.body.actor : "admin@agentguard.local",
        data: { name: tool.name, status: tool.status }
      });

      res.json(publicTool(tool));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tool-calls", async (_req, res, next) => {
    try {
      const calls = await prisma.toolCall.findMany({ orderBy: { createdAt: "desc" } });
      res.json(calls.map(publicToolCall));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/approvals", async (_req, res, next) => {
    try {
      const approvals = await prisma.approval.findMany({
        orderBy: { createdAt: "desc" },
        include: { toolCall: true }
      });
      res.json(approvals.map(publicApproval));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/approvals/:id/approve", async (req, res, next) => {
    try {
      const input = approvalActionSchema.parse(req.body);
      const approval = await approveToolCall(req.params.id, input.actor);
      res.json(publicApproval(approval));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/approvals/:id/reject", async (req, res, next) => {
    try {
      const input = approvalActionSchema.parse(req.body);
      const approval = await rejectToolCall(req.params.id, input.actor);
      res.json(publicApproval(approval));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/approvals/:id/redact-approve", async (req, res, next) => {
    try {
      const input = redactedApprovalSchema.parse(req.body);
      const approval = await approveToolCall(req.params.id, input.actor, input.redactedArguments);
      res.json(publicApproval(approval));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/audit", async (_req, res, next) => {
    try {
      const events = await verifyAuditChain();
      res.json(events.reverse());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/policies", async (_req, res, next) => {
    try {
      const policies = await prisma.policy.findMany({ orderBy: { name: "asc" } });
      res.json(policies);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/metrics", async (_req, res, next) => {
    try {
      const [sessions, calls, approvals, blocked] = await Promise.all([
        prisma.agentSession.count(),
        prisma.toolCall.count(),
        prisma.approval.count({ where: { status: "PENDING" } }),
        prisma.toolCall.count({ where: { status: { contains: "BLOCKED" } } })
      ]);

      res.json({ sessions, calls, pendingApprovals: approvals, blocked });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({
      error: message,
      details: error && typeof error === "object" && "issues" in error ? parseJson(stringifyJson(error), null) : undefined
    });
  });

  return app;
}

