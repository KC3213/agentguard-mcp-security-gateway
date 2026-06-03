import type { FirewallDecision, PolicySeverity, RiskLevel, ToolStatus } from "@agentguard/shared";

export type { PolicySeverity };

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

export interface McpServer {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  status: string;
  config: {
    preset?: string;
    transport?: string;
    command?: string;
    args?: string[];
    allowedDirectories?: string[];
    auditEnabled?: boolean;
  };
  toolsCount: number;
  tools?: Tool[];
  createdAt: string;
  updatedAt: string;
}

export interface McpServerScanResult {
  server: McpServer;
  tools: Tool[];
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
  severity: PolicySeverity;
}

export interface Metrics {
  sessions: number;
  calls: number;
  pendingApprovals: number;
  blocked: number;
}

export interface McpLabResult {
  message: string;
  decision: FirewallDecision;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  status: string;
  output?: unknown;
  redactedArguments?: Record<string, unknown>;
  toolCall?: ToolCall;
  approval?: Approval;
}
