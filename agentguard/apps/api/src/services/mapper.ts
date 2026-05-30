import type { ToolScanResult } from "@agentguard/shared";
import { parseJson } from "../json";

type ToolRecord = {
  id: string;
  name: string;
  description: string;
  inputSchema: string;
  status: string;
  baseRisk: number;
  riskScore: number;
  riskLevel: string;
  trustScore: number;
  reasons: string;
  createdAt: Date;
  updatedAt: Date;
};

export function publicTool(tool: ToolRecord) {
  return {
    ...tool,
    inputSchema: parseJson(tool.inputSchema, {}),
    reasons: parseJson<string[]>(tool.reasons, [])
  };
}

export function publicScan(scan: ToolScanResult) {
  return scan;
}

type ToolCallRecord = {
  id: string;
  sessionId: string | null;
  toolName: string;
  purpose: string;
  arguments: string;
  output: string | null;
  decision: string;
  riskScore: number;
  riskLevel: string;
  reasons: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function publicToolCall(call: ToolCallRecord) {
  return {
    ...call,
    arguments: parseJson(call.arguments, {}),
    output: parseJson(call.output, null),
    reasons: parseJson<string[]>(call.reasons, [])
  };
}

type ApprovalRecord = {
  id: string;
  toolCallId: string;
  status: string;
  requestedBy: string;
  reviewedBy: string | null;
  rawArguments: string;
  redactedArgs: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  toolCall?: ToolCallRecord;
};

export function publicApproval(approval: ApprovalRecord) {
  return {
    ...approval,
    rawArguments: parseJson(approval.rawArguments, {}),
    redactedArgs: parseJson(approval.redactedArgs, null),
    toolCall: approval.toolCall ? publicToolCall(approval.toolCall) : undefined
  };
}

type SessionRecord = {
  id: string;
  prompt: string;
  userEmail: string;
  userRole: string;
  status: string;
  finalAnswer: string | null;
  planned: string;
  createdAt: Date;
  updatedAt: Date;
  toolCalls?: ToolCallRecord[];
};

export function publicSession(session: SessionRecord) {
  return {
    ...session,
    planned: parseJson(session.planned, []),
    toolCalls: session.toolCalls?.map(publicToolCall)
  };
}

