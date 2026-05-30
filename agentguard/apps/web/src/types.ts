import type { FirewallDecision, RiskLevel, ToolStatus } from "@agentguard/shared";

export interface Tool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  status: ToolStatus;
  baseRisk: number;
  riskScore: number;
  riskLevel: RiskLevel;
  trustScore: number;
  reasons: string[];
}

export interface ToolCall {
  id: string;
  sessionId: string | null;
  toolName: string;
  purpose: string;
  arguments: Record<string, unknown>;
  output: unknown;
  decision: FirewallDecision;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  status: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  toolCallId: string;
  status: string;
  requestedBy: string;
  reviewedBy: string | null;
  rawArguments: Record<string, unknown>;
  redactedArgs: Record<string, unknown> | null;
  createdAt: string;
  reviewedAt: string | null;
  toolCall?: ToolCall;
}

export interface AgentSession {
  id: string;
  prompt: string;
  userEmail: string;
  userRole: string;
  status: string;
  finalAnswer: string | null;
  planned: Array<{ toolName: string; purpose: string; arguments: Record<string, unknown> }>;
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  actor: string | null;
  data: unknown;
  prevHash: string | null;
  hash: string;
  valid: boolean;
  createdAt: string;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
}

export interface Metrics {
  sessions: number;
  calls: number;
  pendingApprovals: number;
  blocked: number;
}

