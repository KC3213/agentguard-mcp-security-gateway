import { z } from "zod";

export const firewallDecisionValues = [
  "ALLOW",
  "ALLOW_WITH_LOG",
  "REDACT",
  "REQUIRE_APPROVAL",
  "BLOCK"
] as const;

export const riskLevelValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const toolStatusValues = ["DISCOVERED", "APPROVED", "REQUIRES_APPROVAL", "BLOCKED"] as const;
export const mcpServerPresetValues = ["agentguard-demo", "filesystem", "git", "custom"] as const;
export const mcpTransportValues = ["stdio"] as const;

export type FirewallDecision = (typeof firewallDecisionValues)[number];
export type RiskLevel = (typeof riskLevelValues)[number];
export type ToolStatus = (typeof toolStatusValues)[number];
export type McpServerPreset = (typeof mcpServerPresetValues)[number];
export type McpTransport = (typeof mcpTransportValues)[number];

export type JsonRecord = Record<string, unknown>;

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonRecord;
}

export interface ToolScanResult {
  name: string;
  description: string;
  inputSchema: JsonRecord;
  baseRisk: number;
  riskScore: number;
  trustScore: number;
  riskLevel: RiskLevel;
  status: ToolStatus;
  reasons: string[];
}

export interface FirewallResult {
  decision: FirewallDecision;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  hardBlock: boolean;
  redactedArguments?: JsonRecord;
}

export interface PlannedToolCall {
  toolName: string;
  arguments: JsonRecord;
  purpose: string;
}

export interface SessionRequest {
  prompt: string;
  userEmail: string;
  userRole: "employee" | "reviewer" | "admin";
}

export interface McpLabRequest {
  toolName: string;
  arguments: JsonRecord;
  purpose: string;
  userEmail: string;
  userRole: "employee" | "reviewer" | "admin";
}

export interface SessionResponse {
  sessionId: string;
  status: "COMPLETED" | "WAITING_FOR_APPROVAL" | "BLOCKED";
  finalAnswer: string;
  plannedCalls: PlannedToolCall[];
}

export const sessionRequestSchema = z.object({
  prompt: z.string().min(3).max(4000),
  userEmail: z.string().email().default("employee@agentguard.local"),
  userRole: z.enum(["employee", "reviewer", "admin"]).default("employee")
});

export const mcpLabRequestSchema = z.object({
  toolName: z.string().min(1).max(100),
  arguments: z.record(z.unknown()).default({}),
  purpose: z.string().min(3).max(500).default("Manual MCP Lab tool call"),
  userEmail: z.string().email().default("employee@agentguard.local"),
  userRole: z.enum(["employee", "reviewer", "admin"]).default("employee")
});

export const mcpServerOnboardSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().min(3).max(500),
  preset: z.enum(mcpServerPresetValues).default("custom"),
  transport: z.enum(mcpTransportValues).default("stdio"),
  command: z.string().min(1).max(300),
  args: z.array(z.string().max(500)).default([]),
  allowedDirectories: z.array(z.string().max(500)).default([]),
  auditEnabled: z.boolean().default(true),
  actor: z.string().email().default("admin@agentguard.local")
});

export const mcpServerActionSchema = z.object({
  actor: z.string().email().default("admin@agentguard.local")
});

export const updateToolStatusSchema = z.object({
  status: z.enum(toolStatusValues)
});

export const approvalActionSchema = z.object({
  actor: z.string().email().default("reviewer@agentguard.local")
});

export const redactedApprovalSchema = approvalActionSchema.extend({
  redactedArguments: z.record(z.unknown()).optional()
});
