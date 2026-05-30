import type {
  FirewallResult,
  JsonRecord,
  RiskLevel,
  ToolDescriptor,
  ToolScanResult,
  ToolStatus
} from "@agentguard/shared";

const baseToolRisk: Record<string, number> = {
  create_ticket: 10,
  read_document: 25,
  query_database: 35,
  send_email: 45
};

const suspiciousDescriptorTerms = [
  "ignore previous",
  "bypass",
  "exfiltrate",
  "disable audit",
  "secret",
  "password",
  "token",
  "hidden instruction",
  "send all data"
];

const piiPatterns = [
  { label: "email address", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { label: "phone number", regex: /\b(?:\+?\d{1,3}[-.\s])?(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]\d{4}\b/g },
  { label: "ssn-like identifier", regex: /\b\d{3}-\d{2}-\d{4}\b/g }
];

const secretPatterns = [
  { label: "api key", regex: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}/gi },
  { label: "password", regex: /\bpassword\s*[:=]\s*["']?[^,\s"']{6,}/gi },
  { label: "OpenAI-style key", regex: /\bsk-[A-Za-z0-9_\-]{12,}\b/g }
];

const mutationSql = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|MERGE|GRANT|REVOKE)\b/i;

export function stringifyForInspection(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function detectPii(value: unknown): string[] {
  const text = stringifyForInspection(value);
  const findings = new Set<string>();

  for (const pattern of piiPatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      findings.add(pattern.label);
    }
  }

  return [...findings];
}

export function detectSecrets(value: unknown): string[] {
  const text = stringifyForInspection(value);
  const findings = new Set<string>();

  for (const pattern of secretPatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      findings.add(pattern.label);
    }
  }

  return [...findings];
}

export function containsPathTraversal(value: unknown): boolean {
  const text = stringifyForInspection(value);
  return text.includes("../") || text.includes("..\\") || text.includes("~") || text.includes("/etc/");
}

export function containsSqlMutation(value: unknown): boolean {
  const text = stringifyForInspection(value);
  return mutationSql.test(text);
}

export function isExternalEmail(address: string): boolean {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return !["agentguard.local", "company.local", "internal.local"].includes(domain);
}

export function extractEmailRecipients(args: JsonRecord): string[] {
  const recipientKeys = new Set(["to", "cc", "bcc", "recipient", "recipients"]);
  const values = Object.entries(args)
    .filter(([key]) => recipientKeys.has(key.toLowerCase()))
    .map(([, value]) => value)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");

  return values.flatMap((value) => value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []);
}

export function riskLevel(score: number, hardBlock = false): RiskLevel {
  if (hardBlock || score >= 81) return "CRITICAL";
  if (score >= 61) return "HIGH";
  if (score >= 31) return "MEDIUM";
  return "LOW";
}

export function decisionForScore(score: number, hardBlock = false): FirewallResult["decision"] {
  if (hardBlock || score >= 81) return "BLOCK";
  if (score >= 61) return "REQUIRE_APPROVAL";
  if (score >= 31) return "ALLOW_WITH_LOG";
  return "ALLOW";
}

export function redactSensitiveText(value: unknown): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of [...piiPatterns, ...secretPatterns]) {
      pattern.regex.lastIndex = 0;
      redacted = redacted.replace(pattern.regex, `[REDACTED ${pattern.label.toUpperCase()}]`);
    }
    return redacted;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveText);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, child]) => [key, redactSensitiveText(child)])
    );
  }

  return value;
}

function preserveRecipientFields(original: JsonRecord, redacted: JsonRecord): JsonRecord {
  const recipientKeys = new Set(["to", "cc", "bcc", "recipient", "recipients"]);

  for (const key of Object.keys(original)) {
    if (recipientKeys.has(key.toLowerCase())) {
      redacted[key] = original[key];
    }
  }

  return redacted;
}

export function scanToolDescriptor(tool: ToolDescriptor): ToolScanResult {
  const descriptorText = `${tool.name} ${tool.description} ${stringifyForInspection(tool.inputSchema)}`.toLowerCase();
  const reasons: string[] = [];
  let riskScore = baseToolRisk[tool.name] ?? 90;

  if (!baseToolRisk[tool.name]) {
    reasons.push("Unknown tool name");
  }

  for (const term of suspiciousDescriptorTerms) {
    if (descriptorText.includes(term)) {
      riskScore += 25;
      reasons.push(`Suspicious descriptor term: ${term}`);
      break;
    }
  }

  if (tool.name.includes("email") || descriptorText.includes("external")) {
    reasons.push("Can move data outside the agent boundary");
  }

  if (tool.name.includes("database") || descriptorText.includes("sql")) {
    reasons.push("Can access structured business data");
  }

  const status: ToolStatus =
    tool.name === "send_email"
      ? "REQUIRES_APPROVAL"
      : tool.name in baseToolRisk
        ? "APPROVED"
        : "BLOCKED";

  const clampedRisk = Math.min(100, riskScore);

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    baseRisk: baseToolRisk[tool.name] ?? 90,
    riskScore: clampedRisk,
    trustScore: Math.max(0, 100 - clampedRisk),
    riskLevel: riskLevel(clampedRisk),
    status,
    reasons: reasons.length ? reasons : ["Known demo tool with synthetic-only access"]
  };
}

export interface EvaluateToolCallInput {
  toolName: string;
  toolStatus?: ToolStatus | null;
  baseRisk?: number | null;
  arguments: JsonRecord;
}

export function evaluateToolCall(input: EvaluateToolCallInput): FirewallResult {
  const reasons: string[] = [];
  let score = input.baseRisk ?? baseToolRisk[input.toolName] ?? 90;
  let hardBlock = false;

  if (!input.toolStatus) {
    hardBlock = true;
    reasons.push("Tool is not registered in AgentGuard");
  } else if (input.toolStatus === "BLOCKED" || input.toolStatus === "DISCOVERED") {
    hardBlock = true;
    reasons.push(`Tool status is ${input.toolStatus}`);
  }

  const secrets = detectSecrets(input.arguments);
  if (secrets.length) {
    hardBlock = true;
    reasons.push(`Secret detected: ${secrets.join(", ")}`);
  }

  if (input.toolName === "query_database" && containsSqlMutation(input.arguments)) {
    hardBlock = true;
    reasons.push("SQL mutation command detected");
  }

  if (input.toolName === "read_document" && containsPathTraversal(input.arguments)) {
    hardBlock = true;
    reasons.push("Path traversal attempt detected");
  }

  const pii = detectPii(input.arguments);
  if (pii.length) {
    score += 30;
    reasons.push(`PII detected: ${pii.join(", ")}`);
  }

  const externalRecipients = extractEmailRecipients(input.arguments).filter(isExternalEmail);
  if (input.toolName === "send_email" && externalRecipients.length) {
    score += 30;
    reasons.push(`External recipient: ${externalRecipients.join(", ")}`);
  }

  if (stringifyForInspection(input.arguments).length > 3000) {
    score += 15;
    reasons.push("Large tool input");
  }

  if (input.toolStatus === "REQUIRES_APPROVAL") {
    score = Math.max(score, 61);
    reasons.push("Tool requires human approval by policy");
  }

  const riskScore = Math.min(100, score);

  return {
    decision: decisionForScore(riskScore, hardBlock),
    riskScore,
    riskLevel: riskLevel(riskScore, hardBlock),
    reasons: reasons.length ? reasons : ["No blocking policy matched"],
    hardBlock,
    redactedArguments: preserveRecipientFields(input.arguments, redactSensitiveText(input.arguments) as JsonRecord)
  };
}

export function evaluateToolOutput(toolName: string, output: unknown, priorScore: number): FirewallResult {
  const reasons: string[] = [];
  let score = priorScore;
  let hardBlock = false;

  const secrets = detectSecrets(output);
  if (secrets.length) {
    hardBlock = true;
    reasons.push(`Secret detected in tool output: ${secrets.join(", ")}`);
  }

  const pii = detectPii(output);
  if (pii.length) {
    score += 30;
    reasons.push(`PII detected in tool output: ${pii.join(", ")}`);
  }

  if (stringifyForInspection(output).length > 3000) {
    score += 15;
    reasons.push("Large tool output");
  }

  const riskScore = Math.min(100, score);
  const decision = hardBlock ? "BLOCK" : toolName === "send_email" ? decisionForScore(riskScore) : "ALLOW_WITH_LOG";

  return {
    decision,
    riskScore,
    riskLevel: riskLevel(riskScore, hardBlock),
    reasons: reasons.length ? reasons : ["Tool output passed post-check"],
    hardBlock,
    redactedArguments: undefined
  };
}

export const policyRules = [
  "Known low-risk tools can run automatically.",
  "Unknown, discovered-only, or blocked tools are denied.",
  "Secrets, passwords, API keys, path traversal, and SQL mutation commands are hard blocked.",
  "PII adds risk and may force approval before data leaves the agent boundary.",
  "External email recipients add risk and require approval when combined with sensitive data.",
  "Every decision is logged to the flight recorder and tamper-evident audit chain."
];
