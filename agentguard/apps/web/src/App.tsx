import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  ClipboardCheck,
  Database,
  FileSearch,
  Hash,
  History,
  Play,
  RefreshCw,
  Search,
  ServerCog,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  UserRound,
  Wrench,
  Workflow,
  XCircle
} from "lucide-react";
import { io } from "socket.io-client";
import { apiGet, apiPatch, apiPost, API_URL } from "./api";
import type {
  AgentSession,
  Approval,
  AuditEvent,
  McpLabResult,
  McpServer,
  McpServerScanResult,
  Metrics,
  Policy,
  Tool,
  ToolCall
} from "./types";

type View = "console" | "lab" | "servers" | "tools" | "approvals" | "flight" | "audit" | "policies";

const navItems: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "console", label: "Agent Console", icon: TerminalSquare },
  { id: "lab", label: "MCP Lab", icon: Wrench },
  { id: "servers", label: "MCP Control Plane", icon: ServerCog },
  { id: "tools", label: "Tool Registry", icon: Shield },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck },
  { id: "flight", label: "Flight Recorder", icon: History },
  { id: "audit", label: "Audit Log", icon: FileSearch },
  { id: "policies", label: "Policies", icon: SlidersHorizontal }
];

const demoPrompts = [
  "Create a normal onboarding documentation ticket",
  "Read the public quarterly support report",
  "Query customers with SELECT",
  "Try DROP SQL on the customer table",
  "Summarize complaints and email internally",
  "Send fake customer data externally",
  "Send an API key by email",
  "Use an unknown tool"
];

const labExamples: Record<string, { purpose: string; arguments: Record<string, unknown> }> = {
  read_document: {
    purpose: "MCP Lab: read a synthetic public report through the gateway",
    arguments: { path: "public_report.txt" }
  },
  create_ticket: {
    purpose: "MCP Lab: create a synthetic ticket through the gateway",
    arguments: {
      title: "MCP Lab follow-up",
      description: "Synthetic ticket created from the MCP Lab playground.",
      priority: "medium"
    }
  },
  query_database: {
    purpose: "MCP Lab: run a read-only synthetic customer query",
    arguments: { sql: "SELECT id, name, tier, revenue FROM Customer ORDER BY revenue DESC" }
  },
  send_email: {
    purpose: "MCP Lab: test an internal mock email approval path",
    arguments: {
      to: "support-manager@agentguard.local",
      subject: "MCP Lab synthetic update",
      body: "Synthetic update from AgentGuard MCP Lab. No real email is sent."
    }
  },
  read_text_file: {
    purpose: "MCP Lab: read a demo file through real Filesystem MCP",
    arguments: { path: "/Users/kachadha/Documents/my project/agentguard/demo-data/public_report.txt" }
  },
  read_file: {
    purpose: "MCP Lab: read a demo file through real Filesystem MCP",
    arguments: { path: "/Users/kachadha/Documents/my project/agentguard/demo-data/public_report.txt" }
  },
  list_directory: {
    purpose: "MCP Lab: list the synthetic demo-data folder through real Filesystem MCP",
    arguments: { path: "/Users/kachadha/Documents/my project/agentguard/demo-data" }
  },
  status: {
    purpose: "MCP Lab: inspect this Git repo through real Git MCP",
    arguments: { path: "/Users/kachadha/Documents/my project" }
  },
  diff: {
    purpose: "MCP Lab: inspect Git diff stats through real Git MCP",
    arguments: { path: "/Users/kachadha/Documents/my project" }
  }
};

const mcpServerPresets = [
  {
    id: "agentguard-demo",
    label: "AgentGuard Demo MCP",
    description: "The local TypeScript MCP server already in this repo. Best first onboarding demo.",
    name: "Synthetic Company Tools MCP",
    command: "tsx",
    args: ["apps/mock-mcp-server/src/index.ts"],
    allowedDirectories: ["demo-data", ".agentguard-runtime"]
  },
  {
    id: "filesystem",
    label: "Filesystem MCP",
    description: "Real open-source filesystem MCP restricted to demo-data and docs.",
    name: "Open Source Filesystem MCP",
    command: "mcp-server-filesystem",
    args: ["demo-data", "docs"],
    allowedDirectories: ["demo-data", "docs"]
  },
  {
    id: "git",
    label: "Git MCP",
    description: "Real open-source Git MCP for read-first repository inspection.",
    name: "Open Source Git MCP",
    command: "pare-git",
    args: [],
    allowedDirectories: ["/Users/kachadha/Documents/my project"]
  }
];

const blockedLabExamples = [
  {
    label: "Blocked SQL",
    toolName: "query_database",
    purpose: "MCP Lab: demonstrate SQL mutation blocking",
    arguments: { sql: "DROP TABLE Customer" }
  },
  {
    label: "Path traversal",
    toolName: "read_document",
    purpose: "MCP Lab: demonstrate document path traversal blocking",
    arguments: { path: "../private.txt" }
  },
  {
    label: "Secret email",
    toolName: "send_email",
    purpose: "MCP Lab: demonstrate secret leakage blocking",
    arguments: {
      to: "security@agentguard.local",
      subject: "Credential handoff",
      body: "password=NeverUseThis123 and api_key=sk-test-1234567890abcdef should never leave the agent."
    }
  }
];

type WorkflowState = "idle" | "active" | "done" | "blocked" | "waiting";
type DetailRow = { label: string; value: string };
type AuditSort = "newest" | "oldest" | "event-type" | "actor" | "hash";

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short"
});

function riskClass(level: string) {
  if (level === "CRITICAL") return "badge badge-critical";
  if (level === "HIGH") return "badge badge-high";
  if (level === "MEDIUM") return "badge badge-medium";
  return "badge badge-low";
}

function decisionIcon(status: string) {
  if (status.includes("BLOCK") || status === "REJECTED") return <XCircle size={16} />;
  if (status.includes("PENDING") || status.includes("APPROVAL")) return <AlertTriangle size={16} />;
  return <CheckCircle2 size={16} />;
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>;
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Activity }) {
  return (
    <div className="metric-card">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      <Icon size={22} />
    </div>
  );
}

function workflowClass(state: WorkflowState) {
  return `workflow-step workflow-${state}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanizeLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid time";
  return dateTimeFormatter.format(date);
}

function previewText(value: unknown, maxLength = 180) {
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Not provided";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function summarizeValue(value: unknown, maxLength = 160): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string") return previewText(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "No items";
    return `${value.length} item${value.length === 1 ? "" : "s"}: ${previewText(
      value.map((item) => summarizeValue(item, 60)).join(", "),
      maxLength
    )}`;
  }
  if (isRecord(value)) {
    return previewText(
      Object.entries(value)
        .slice(0, 4)
        .map(([key, entryValue]) => `${humanizeLabel(key)}: ${summarizeValue(entryValue, 50)}`)
        .join("; "),
      maxLength
    );
  }
  return previewText(String(value), maxLength);
}

function detailRowsFromRecord(record: Record<string, unknown>): DetailRow[] {
  const rows = Object.entries(record).map(([key, value]) => ({
    label: humanizeLabel(key),
    value: summarizeValue(value)
  }));
  return rows.length ? rows : [{ label: "Payload", value: "No fields recorded" }];
}

function formatToolArguments(call: ToolCall): DetailRow[] {
  const args = call.arguments ?? {};

  if (call.toolName === "send_email") {
    return [
      { label: "Recipient", value: summarizeValue(args.to) },
      { label: "Subject", value: summarizeValue(args.subject) },
      { label: "Body preview", value: summarizeValue(args.body, 220) }
    ];
  }

  if (call.toolName === "query_database") {
    return [{ label: "SQL query", value: summarizeValue(args.sql, 260) }];
  }

  if (call.toolName === "read_document") {
    return [{ label: "Document path", value: summarizeValue(args.path) }];
  }

  if (call.toolName === "create_ticket") {
    return [
      { label: "Title", value: summarizeValue(args.title) },
      { label: "Priority", value: summarizeValue(args.priority) },
      { label: "Description", value: summarizeValue(args.description, 220) }
    ];
  }

  return detailRowsFromRecord(args);
}

function formatToolOutput(call: ToolCall): DetailRow[] {
  if (!call.output) {
    const reason = call.status.includes("BLOCK")
      ? "Blocked before the MCP tool executed"
      : "No output returned yet";
    return [{ label: "Result", value: reason }];
  }

  if (!isRecord(call.output)) {
    return [{ label: "Result", value: summarizeValue(call.output, 220) }];
  }

  if (call.toolName === "send_email") {
    return [
      { label: "Mock email status", value: summarizeValue(call.output.status) },
      { label: "Record id", value: summarizeValue(call.output.id) },
      { label: "Safety note", value: summarizeValue(call.output.note, 220) }
    ];
  }

  if (call.toolName === "query_database" && Array.isArray(call.output.rows)) {
    const rows = call.output.rows;
    const firstRow = rows.find((row) => isRecord(row));
    return [
      { label: "Rows returned", value: String(rows.length) },
      {
        label: "Columns",
        value: firstRow && isRecord(firstRow) ? Object.keys(firstRow).join(", ") : "No columns"
      },
      { label: "First row preview", value: firstRow ? summarizeValue(firstRow, 220) : "No rows returned" }
    ];
  }

  if (call.toolName === "read_document") {
    return [
      { label: "Document", value: summarizeValue(call.output.path) },
      { label: "Text preview", value: summarizeValue(call.output.text, 260) }
    ];
  }

  if (call.toolName === "create_ticket") {
    return [
      { label: "Ticket id", value: summarizeValue(call.output.id) },
      { label: "Status", value: summarizeValue(call.output.status) },
      { label: "Priority", value: summarizeValue(call.output.priority) }
    ];
  }

  return detailRowsFromRecord(call.output);
}

function statusBadgeClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("BLOCK") || normalized.includes("REJECT")) return "badge badge-critical";
  if (normalized.includes("APPROVAL") || normalized.includes("PENDING") || normalized.includes("WAIT")) {
    return "badge badge-high";
  }
  if (normalized.includes("LOG") || normalized.includes("MEDIUM")) return "badge badge-medium";
  return "badge badge-low";
}

function shortHash(hash: string | null | undefined) {
  return hash ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : "Genesis event";
}

function auditEventSummaryRows(data: unknown): DetailRow[] {
  if (!isRecord(data)) return [{ label: "Summary", value: summarizeValue(data, 220) }];

  const rows: DetailRow[] = [];

  if (typeof data.prompt === "string") {
    rows.push({ label: "Prompt", value: summarizeValue(data.prompt, 220) });
  }

  if (Array.isArray(data.plannedCalls)) {
    const planned = data.plannedCalls.map((call) =>
      isRecord(call)
        ? `${summarizeValue(call.toolName, 40)} (${summarizeValue(call.purpose, 80)})`
        : summarizeValue(call, 80)
    );
    rows.push({ label: "Planned tools", value: planned.join(" -> ") || "No planned tool calls" });
  }

  if (data.toolName) rows.push({ label: "Tool", value: summarizeValue(data.toolName) });
  if (data.name) rows.push({ label: "Name", value: summarizeValue(data.name) });
  if (data.status) rows.push({ label: "Status", value: summarizeValue(data.status) });
  if (data.decision) rows.push({ label: "Decision", value: summarizeValue(data.decision) });
  if (data.postDecision) rows.push({ label: "Post-check decision", value: summarizeValue(data.postDecision) });
  if (data.riskScore !== undefined) rows.push({ label: "Risk score", value: summarizeValue(data.riskScore) });
  if (Array.isArray(data.reasons)) rows.push({ label: "Policy reasons", value: data.reasons.join("; ") });
  if (data.finalAnswer) rows.push({ label: "Gateway result", value: summarizeValue(data.finalAnswer, 260) });
  if (data.count !== undefined) rows.push({ label: "Discovered count", value: summarizeValue(data.count) });
  if (Array.isArray(data.tools)) rows.push({ label: "Tools", value: data.tools.map((tool) => summarizeValue(tool)).join(", ") });

  if (rows.length) return rows;
  return detailRowsFromRecord(data);
}

function auditEventSearchText(event: AuditEvent) {
  return [
    event.hash,
    event.prevHash ?? "Genesis event",
    event.eventType,
    event.entityType,
    event.entityId ?? "",
    event.actor ?? "system",
    JSON.stringify(event.data ?? "")
  ]
    .join(" ")
    .toLowerCase();
}

function getAuditMatchLabel(event: AuditEvent, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (event.hash.toLowerCase().includes(normalized)) return "Current hash match";
  if ((event.prevHash ?? "Genesis event").toLowerCase().includes(normalized)) return "Previous hash match";
  if ((event.entityId ?? "").toLowerCase().includes(normalized)) return "Entity match";
  return "Event payload match";
}

function sortAuditEvents(events: AuditEvent[], sort: AuditSort) {
  return [...events].sort((left, right) => {
    if (sort === "oldest") {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }
    if (sort === "event-type") {
      return left.eventType.localeCompare(right.eventType);
    }
    if (sort === "actor") {
      return (left.actor ?? "system").localeCompare(right.actor ?? "system");
    }
    if (sort === "hash") {
      return left.hash.localeCompare(right.hash);
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function App() {
  const [view, setView] = useState<View>("console");
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ sessions: 0, calls: 0, pendingApprovals: 0, blocked: 0 });
  const [prompt, setPrompt] = useState(demoPrompts[0]);
  const [userRole, setUserRole] = useState<"employee" | "reviewer" | "admin">("employee");
  const [userEmail, setUserEmail] = useState("employee@agentguard.local");
  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [labToolName, setLabToolName] = useState("read_document");
  const [labPurpose, setLabPurpose] = useState(labExamples.read_document.purpose);
  const [labArguments, setLabArguments] = useState(JSON.stringify(labExamples.read_document.arguments, null, 2));
  const [labResult, setLabResult] = useState<McpLabResult | null>(null);
  const [labError, setLabError] = useState<string | null>(null);
  const [serverPreset, setServerPreset] = useState("agentguard-demo");
  const [serverName, setServerName] = useState(mcpServerPresets[0].name);
  const [serverDescription, setServerDescription] = useState(mcpServerPresets[0].description);
  const [serverCommand, setServerCommand] = useState(mcpServerPresets[0].command);
  const [serverArgs, setServerArgs] = useState(mcpServerPresets[0].args.join("\n"));
  const [serverAllowedDirs, setServerAllowedDirs] = useState(mcpServerPresets[0].allowedDirectories.join("\n"));
  const [serverAuditEnabled, setServerAuditEnabled] = useState(true);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditSort, setAuditSort] = useState<AuditSort>("newest");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("Ready");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    const [nextServers, nextTools, nextSessions, nextCalls, nextApprovals, nextAudit, nextPolicies, nextMetrics] =
      await Promise.all([
        apiGet<McpServer[]>("/api/mcp-servers"),
        apiGet<Tool[]>("/api/tools"),
        apiGet<AgentSession[]>("/api/sessions"),
        apiGet<ToolCall[]>("/api/tool-calls"),
        apiGet<Approval[]>("/api/approvals"),
        apiGet<AuditEvent[]>("/api/audit"),
        apiGet<Policy[]>("/api/policies"),
        apiGet<Metrics>("/api/metrics")
      ]);

    setMcpServers(nextServers);
    setTools(nextTools);
    setSessions(nextSessions);
    setToolCalls(nextCalls);
    setApprovals(nextApprovals);
    setAuditEvents(nextAudit);
    setPolicies(nextPolicies);
    setMetrics(nextMetrics);

    setActiveSession((current) =>
      current ? nextSessions.find((session) => session.id === current.id) ?? current : current
    );
  }, []);

  useEffect(() => {
    loadAll().catch((error) => setToast(error.message));
  }, [loadAll]);

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket"] });
    const refresh = () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }

      refreshTimer.current = setTimeout(() => {
        loadAll().catch((error) => setToast(error.message));
      }, 150);
    };
    socket.on("session:finished", refresh);
    socket.on("approval:requested", refresh);
    socket.on("approval:reviewed", refresh);
    socket.on("tools:scanned", refresh);
    socket.on("tool-call:created", refresh);
    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
      socket.disconnect();
    };
  }, [loadAll]);

  useEffect(() => {
    setUserEmail(`${userRole}@agentguard.local`);
  }, [userRole]);

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "PENDING"),
    [approvals]
  );
  const workflowStages = useMemo(() => {
    const calls = activeSession?.toolCalls ?? [];
    const hasSession = Boolean(activeSession);
    const hasBlocked = activeSession?.status === "BLOCKED" || calls.some((call) => call.status.includes("BLOCK"));
    const isWaiting = activeSession?.status === "WAITING_FOR_APPROVAL";
    const hasExecuted = calls.some((call) => call.status.includes("EXECUTED"));

    return [
      {
        label: "Prompt",
        detail: hasSession ? "Request captured" : "Write or choose a task",
        view: "console" as View,
        state: hasSession ? "done" : "active"
      },
      {
        label: "Plan",
        detail: hasSession ? `${activeSession?.planned.length ?? 0} tool call(s)` : "Planner is ready",
        view: "console" as View,
        state: hasSession ? "done" : "idle"
      },
      {
        label: "Policy",
        detail: hasBlocked ? "Unsafe action caught" : hasSession ? "Risk checks applied" : "Waiting for a run",
        view: "tools" as View,
        state: hasBlocked ? "blocked" : hasSession ? "done" : "idle"
      },
      {
        label: "Action",
        detail: hasExecuted ? "MCP tool executed" : isWaiting ? "Paused safely" : "No tool output yet",
        view: "flight" as View,
        state: hasExecuted ? "done" : isWaiting ? "waiting" : "idle"
      },
      {
        label: "Review",
        detail: pendingApprovals.length ? `${pendingApprovals.length} pending` : "No pending review",
        view: "approvals" as View,
        state: pendingApprovals.length ? "waiting" : hasSession ? "done" : "idle"
      },
      {
        label: "Audit",
        detail: metrics.calls ? "Recorded in timeline" : "Audit trail ready",
        view: "audit" as View,
        state: metrics.calls ? "done" : "idle"
      }
    ] satisfies Array<{ label: string; detail: string; view: View; state: WorkflowState }>;
  }, [activeSession, metrics.calls, pendingApprovals.length]);
  const selectedFlightSession = activeSession ?? sessions[0] ?? null;
  const selectedFlightCalls = selectedFlightSession?.toolCalls ?? toolCalls.slice(0, 8);
  const selectedLabTool = useMemo(
    () => tools.find((tool) => tool.name === labToolName) ?? null,
    [labToolName, tools]
  );
  const labToolOptions = useMemo(() => {
    const registeredNames = tools.map((tool) => tool.name);
    const knownNames = Object.keys(labExamples);
    return [...new Set([...registeredNames, ...knownNames])];
  }, [tools]);
  const auditEventsByHash = useMemo(() => {
    return new Map(auditEvents.map((event) => [event.hash, event]));
  }, [auditEvents]);
  const visibleAuditEvents = useMemo(() => {
    const normalizedQuery = auditQuery.trim().toLowerCase();
    const filteredEvents = normalizedQuery
      ? auditEvents.filter((event) => auditEventSearchText(event).includes(normalizedQuery))
      : auditEvents;

    return sortAuditEvents(filteredEvents, auditSort);
  }, [auditEvents, auditQuery, auditSort]);

  async function runSession() {
    setLoading(true);
    setToast("Running deterministic agent");
    try {
      const response = await apiPost<{ sessionId: string; finalAnswer: string }>("/api/sessions", {
        prompt,
        userEmail,
        userRole
      });
      const session = await apiGet<AgentSession>(`/api/sessions/${response.sessionId}`);
      setActiveSession(session);
      await loadAll();
      setToast(response.finalAnswer);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Session failed");
    } finally {
      setLoading(false);
    }
  }

  async function scanTools() {
    setLoading(true);
    try {
      const nextTools = await apiPost<Tool[]>("/api/tools/scan", { actor: userEmail });
      setTools(nextTools);
      await loadAll();
      setToast("Tool registry scanned");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateToolStatus(tool: Tool, status: Tool["status"]) {
    const next = await apiPatch<Tool>(`/api/tools/${tool.id}/status`, { status, actor: userEmail });
    setTools((current) => current.map((item) => (item.id === next.id ? next : item)));
    await loadAll();
  }

  function loadLabExample(toolName: string) {
    const example = labExamples[toolName];
    setLabToolName(toolName);
    setLabPurpose(example?.purpose ?? `MCP Lab: run ${toolName} through the gateway`);
    setLabArguments(JSON.stringify(example?.arguments ?? {}, null, 2));
    setLabResult(null);
    setLabError(null);
  }

  function loadBlockedLabExample(example: (typeof blockedLabExamples)[number]) {
    setLabToolName(example.toolName);
    setLabPurpose(example.purpose);
    setLabArguments(JSON.stringify(example.arguments, null, 2));
    setLabResult(null);
    setLabError(null);
  }

  function applyServerPreset(presetId: string) {
    const preset = mcpServerPresets.find((item) => item.id === presetId) ?? mcpServerPresets[0];
    setServerPreset(preset.id);
    setServerName(preset.name);
    setServerDescription(preset.description);
    setServerCommand(preset.command);
    setServerArgs(preset.args.join("\n"));
    setServerAllowedDirs(preset.allowedDirectories.join("\n"));
    setServerAuditEnabled(true);
  }

  async function runLabTool() {
    setLoading(true);
    setLabError(null);
    setToast("Running MCP Lab tool call");
    try {
      const parsedArguments = JSON.parse(labArguments) as Record<string, unknown>;
      const result = await apiPost<McpLabResult>("/api/mcp-lab/run", {
        toolName: labToolName,
        purpose: labPurpose,
        arguments: parsedArguments,
        userEmail,
        userRole
      });
      setLabResult(result);
      await loadAll();
      setToast(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP Lab run failed";
      setLabError(message);
      setToast(message);
    } finally {
      setLoading(false);
    }
  }

  async function onboardServer() {
    setLoading(true);
    try {
      const server = await apiPost<McpServer>("/api/mcp-servers", {
        name: serverName,
        description: serverDescription,
        preset: serverPreset,
        transport: "stdio",
        command: serverCommand,
        args: serverArgs
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        allowedDirectories: serverAllowedDirs
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        auditEnabled: serverAuditEnabled,
        actor: userEmail
      });
      await loadAll();
      setToast(`${server.name} onboarded into AgentGuard`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "MCP server onboarding failed");
    } finally {
      setLoading(false);
    }
  }

  async function testServer(server: McpServer) {
    const updated = await apiPost<McpServer>(`/api/mcp-servers/${server.id}/test`, { actor: userEmail });
    await loadAll();
    setToast(`${updated.name} status: ${updated.status}`);
  }

  async function scanServer(server: McpServer) {
    try {
      const result = await apiPost<McpServerScanResult>(`/api/mcp-servers/${server.id}/scan`, { actor: userEmail });
      setTools(result.tools);
      await loadAll();
      setToast(`${result.tools.length} tool(s) discovered from ${result.server.name}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "MCP server scan failed");
    }
  }

  async function reviewApproval(approval: Approval, action: "approve" | "reject" | "redact-approve") {
    const body =
      action === "redact-approve"
        ? { actor: userEmail, redactedArguments: approval.redactedArgs ?? approval.rawArguments }
        : { actor: userEmail };
    await apiPost(`/api/approvals/${approval.id}/${action}`, body);
    await loadAll();
    setToast(`Approval ${action.replace("-", " ")} complete`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Shield size={24} />
          </div>
          <div>
            <strong>AgentGuard</strong>
            <span>MCP security gateway</span>
          </div>
        </div>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>Runtime online</strong>
            <span>Gateway enforcing policy</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "nav-active" : ""} onClick={() => setView(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agent workflow control plane</p>
            <h1>{navItems.find((item) => item.id === view)?.label}</h1>
            <p>{toast}</p>
          </div>
          <div className="controls-row">
            <select value={userRole} onChange={(event) => setUserRole(event.target.value as typeof userRole)}>
              <option value="employee">employee</option>
              <option value="reviewer">reviewer</option>
              <option value="admin">admin</option>
            </select>
            <button className="icon-button" onClick={() => loadAll()} title="Refresh dashboard">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {view === "audit" ? (
          <section className="metrics-grid audit-metrics-grid" aria-label="Audit overview">
            <MetricCard label="Audit Events" value={auditEvents.length} icon={FileSearch} />
            <MetricCard label="Visible Results" value={visibleAuditEvents.length} icon={Search} />
            <MetricCard label="Valid Chain" value={auditEvents.filter((event) => event.valid).length} icon={CheckCircle2} />
            <MetricCard label="Hash Issues" value={auditEvents.filter((event) => !event.valid).length} icon={AlertTriangle} />
          </section>
        ) : null}

        {view === "console" && (
          <section className="panel console-panel">
            <section className="workflow-rail console-workflow-rail" aria-label="AgentGuard workflow">
              <div className="workflow-title">
                <Workflow size={18} />
                <span>Console workflow</span>
              </div>
              <div className="workflow-steps">
                {workflowStages.map((stage, index) => (
                  <button key={stage.label} className={workflowClass(stage.state)} onClick={() => setView(stage.view)}>
                    <span className="workflow-index">{index + 1}</span>
                    <span>
                      <strong>{stage.label}</strong>
                      <small>{stage.detail}</small>
                    </span>
                    {index < workflowStages.length - 1 ? <ArrowRight size={15} className="workflow-arrow" /> : null}
                  </button>
                ))}
              </div>
            </section>
            <div className="console-layout">
              <div className="console-input">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Step 1</span>
                    <h2>Choose an agent task</h2>
                  </div>
                  <Bot size={22} />
                </div>
                <label htmlFor="prompt">Prompt</label>
                <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                <div className="scenario-grid">
                  {demoPrompts.map((item) => (
                    <button key={item} className={prompt === item ? "scenario-active" : ""} onClick={() => setPrompt(item)}>
                      {item}
                    </button>
                  ))}
                </div>
                <button className="primary-button" onClick={runSession} disabled={loading}>
                  {loading ? <Sparkles size={18} /> : <Play size={18} />}
                  {loading ? "Running workflow" : "Run Agent"}
                </button>
              </div>
              <div className="console-output">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Step 2</span>
                    <h2>Inspect gateway decision</h2>
                  </div>
                  <Shield size={22} />
                </div>
                {activeSession ? (
                  <>
                    <p className="answer">{activeSession.finalAnswer}</p>
                    <Timeline calls={activeSession.toolCalls ?? []} />
                  </>
                ) : (
                  <div className="empty-state">
                    <Workflow size={28} />
                    <strong>No workflow run yet</strong>
                    <span>Pick a scenario and run the agent to see policy checks, MCP calls, approvals, and audit events.</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {view === "lab" && (
          <section className="panel lab-panel">
            <div className="section-title">
              <div>
                <h2>MCP Tool Playground</h2>
                <p className="muted">Call the mock MCP tools directly, but only through AgentGuard's gateway checks.</p>
              </div>
              <button className="secondary-button" onClick={scanTools} disabled={loading}>
                <RefreshCw size={18} />
                Scan MCP Tools
              </button>
            </div>
            <div className="lab-layout">
              <div className="lab-builder">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Step 1</span>
                    <h2>Choose a tool call</h2>
                  </div>
                  <Wrench size={22} />
                </div>
                <label htmlFor="lab-tool">MCP tool</label>
                <select id="lab-tool" value={labToolName} onChange={(event) => loadLabExample(event.target.value)}>
                  {labToolOptions.map((toolName) => (
                    <option key={toolName} value={toolName}>
                      {toolName}
                    </option>
                  ))}
                </select>
                <label htmlFor="lab-purpose">Purpose</label>
                <input
                  id="lab-purpose"
                  value={labPurpose}
                  onChange={(event) => setLabPurpose(event.target.value)}
                  placeholder="Why is this tool being called?"
                />
                <label htmlFor="lab-arguments">Tool arguments as JSON</label>
                <textarea
                  className="code-textarea"
                  id="lab-arguments"
                  value={labArguments}
                  onChange={(event) => setLabArguments(event.target.value)}
                />
                <button className="primary-button" onClick={runLabTool} disabled={loading}>
                  {loading ? <Sparkles size={18} /> : <Play size={18} />}
                  {loading ? "Running through gateway" : "Run Through Gateway"}
                </button>
                <div className="lab-example-row">
                  {blockedLabExamples.map((example) => (
                    <button key={example.label} onClick={() => loadBlockedLabExample(example)}>
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lab-inspector">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Step 2</span>
                    <h2>Inspect what happened</h2>
                  </div>
                  <Shield size={22} />
                </div>
                <div className="lab-tool-card">
                  <div className="audit-title-row">
                    <div>
                      <span className="session-time">
                        <Database size={14} />
                        {selectedLabTool ? "Registered MCP tool" : "Tool not registered yet"}
                      </span>
                      <strong>{labToolName}</strong>
                    </div>
                    <span className={selectedLabTool ? statusBadgeClass(selectedLabTool.status) : "badge badge-critical"}>
                      {selectedLabTool ? humanizeLabel(selectedLabTool.status) : "Unknown"}
                    </span>
                  </div>
                  <p>{selectedLabTool?.description ?? "Scan tools first, or run it to see the gateway block unknown tools."}</p>
                  {selectedLabTool ? (
                    <div className="call-badges">
                      <span className={riskClass(selectedLabTool.riskLevel)}>
                        {selectedLabTool.riskLevel} / {selectedLabTool.riskScore}
                      </span>
                      <span className="badge badge-low">Trust {selectedLabTool.trustScore}</span>
                    </div>
                  ) : null}
                  <details className="developer-payload">
                    <summary>
                      <Code2 size={15} />
                      Tool schema
                    </summary>
                    <JsonBlock value={selectedLabTool?.inputSchema ?? { message: "No schema loaded" }} />
                  </details>
                </div>
                {labError ? (
                  <p className="lab-error">{labError}</p>
                ) : labResult ? (
                  <div className="lab-result-stack">
                    <ReadablePayload
                      title="Gateway decision"
                      rows={[
                        { label: "Decision", value: humanizeLabel(labResult.decision) },
                        { label: "Status", value: humanizeLabel(labResult.status) },
                        { label: "Risk", value: `${labResult.riskLevel} / ${labResult.riskScore}` },
                        { label: "Message", value: labResult.message }
                      ]}
                    />
                    {labResult.approval ? (
                      <ReadablePayload
                        title="Approval created"
                        rows={[
                          { label: "Approval id", value: labResult.approval.id },
                          { label: "Status", value: humanizeLabel(labResult.approval.status) },
                          { label: "Reviewer action", value: "Open Approvals to approve, reject, or redact" }
                        ]}
                      />
                    ) : null}
                    {labResult.toolCall ? <Timeline calls={[labResult.toolCall]} /> : null}
                  </div>
                ) : (
                  <div className="empty-state lab-empty">
                    <Wrench size={28} />
                    <strong>No MCP Lab run yet</strong>
                    <span>Pick a tool, edit the JSON arguments, and run it through the same firewall used by the agent.</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {view === "servers" && (
          <section className="panel server-panel">
            <div className="section-title">
              <div>
                <h2>MCP Server Onboarding</h2>
                <p className="muted">Register MCP servers, keep audit on, and discover tools through AgentGuard.</p>
              </div>
              <span className="count-pill">{mcpServers.length}</span>
            </div>
            <div className="server-control-layout">
              <div className="server-onboard-form">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Step 1</span>
                    <h2>Choose a server preset</h2>
                  </div>
                  <ServerCog size={22} />
                </div>
                <div className="preset-grid">
                  {mcpServerPresets.map((preset) => (
                    <button
                      className={serverPreset === preset.id ? "preset-active" : ""}
                      key={preset.id}
                      onClick={() => applyServerPreset(preset.id)}
                    >
                      <strong>{preset.label}</strong>
                      <span>{preset.description}</span>
                    </button>
                  ))}
                </div>
                <label htmlFor="server-name">Server name</label>
                <input id="server-name" value={serverName} onChange={(event) => setServerName(event.target.value)} />
                <label htmlFor="server-description">Description</label>
                <textarea
                  id="server-description"
                  value={serverDescription}
                  onChange={(event) => setServerDescription(event.target.value)}
                />
                <label htmlFor="server-command">Stdio command</label>
                <input id="server-command" value={serverCommand} onChange={(event) => setServerCommand(event.target.value)} />
                <label htmlFor="server-args">Arguments, one per line</label>
                <textarea
                  className="code-textarea server-code-textarea"
                  id="server-args"
                  value={serverArgs}
                  onChange={(event) => setServerArgs(event.target.value)}
                />
                <label htmlFor="server-dirs">Allowed directories, one per line</label>
                <textarea
                  className="code-textarea server-code-textarea"
                  id="server-dirs"
                  value={serverAllowedDirs}
                  onChange={(event) => setServerAllowedDirs(event.target.value)}
                />
                <label className="audit-toggle">
                  <input
                    checked={serverAuditEnabled}
                    onChange={(event) => setServerAuditEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Audit every tool discovery and server action</span>
                </label>
                <button className="primary-button" onClick={onboardServer} disabled={loading}>
                  <ServerCog size={18} />
                  Onboard MCP Server
                </button>
              </div>
              <div className="server-registry">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Step 2</span>
                    <h2>Operate onboarded servers</h2>
                  </div>
                  <Shield size={22} />
                </div>
                <div className="control-plane-flow">
                  {["Onboard", "Test", "Discover", "Govern", "Audit"].map((step) => (
                    <span key={step}>{step}</span>
                  ))}
                </div>
                <div className="server-card-list">
                  {mcpServers.map((server) => (
                    <article className="server-card" key={server.id}>
                      <div className="audit-title-row">
                        <div>
                          <span className="session-time">
                            <ServerCog size={14} />
                            {humanizeLabel(server.config.preset ?? "custom")} / {server.config.transport ?? "stdio"}
                          </span>
                          <strong>{server.name}</strong>
                        </div>
                        <span className={statusBadgeClass(server.status)}>{humanizeLabel(server.status)}</span>
                      </div>
                      <p>{server.description}</p>
                      <div className="server-meta-grid">
                        <div>
                          <span>Command</span>
                          <strong>{summarizeValue(server.config.command ?? server.endpoint, 80)}</strong>
                        </div>
                        <div>
                          <span>Tools</span>
                          <strong>{server.toolsCount}</strong>
                        </div>
                        <div>
                          <span>Audit</span>
                          <strong>{server.config.auditEnabled === false ? "Disabled" : "Enabled"}</strong>
                        </div>
                      </div>
                      <div className="button-row">
                        <button onClick={() => testServer(server)}>Test</button>
                        <button onClick={() => scanServer(server)}>Discover Tools</button>
                        <button onClick={() => setView("tools")}>Registry</button>
                      </div>
                      <details className="developer-payload">
                        <summary>
                          <Code2 size={15} />
                          Server launch config
                        </summary>
                        <JsonBlock value={server.config} />
                      </details>
                    </article>
                  ))}
                  {!mcpServers.length ? (
                    <div className="empty-state server-empty">
                      <ServerCog size={28} />
                      <strong>No MCP servers onboarded</strong>
                      <span>Use the AgentGuard Demo MCP preset to register the existing local MCP server first.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        )}

        {view === "tools" && (
          <section className="panel">
            <div className="section-title">
              <h2>Registered Tools</h2>
              <button className="secondary-button" onClick={scanTools} disabled={loading}>
                <RefreshCw size={18} />
                Scan
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Trust</th>
                    <th>Reasons</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool) => (
                    <tr key={tool.id}>
                      <td>
                        <strong>{tool.name}</strong>
                        <span>{tool.description}</span>
                      </td>
                      <td>{tool.status}</td>
                      <td>
                        <span className={riskClass(tool.riskLevel)}>{tool.riskScore}</span>
                      </td>
                      <td>{tool.trustScore}</td>
                      <td>{tool.reasons.join(", ")}</td>
                      <td>
                        <div className="button-row">
                          <button onClick={() => updateToolStatus(tool, "APPROVED")}>Approve</button>
                          <button onClick={() => updateToolStatus(tool, "REQUIRES_APPROVAL")}>Review</button>
                          <button onClick={() => updateToolStatus(tool, "BLOCKED")}>Block</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "approvals" && (
          <section className="panel">
            <div className="section-title">
              <h2>Pending Reviews</h2>
              <span className="count-pill">{pendingApprovals.length}</span>
            </div>
            <div className="approval-grid">
              {approvals.map((approval) => (
                <article className="approval-card" key={approval.id}>
                  <div className="approval-head">
                    <strong>{approval.toolCall?.toolName}</strong>
                    <span>{approval.status}</span>
                  </div>
                  <JsonBlock value={approval.rawArguments} />
                  <div className="button-row">
                    <button disabled={approval.status !== "PENDING"} onClick={() => reviewApproval(approval, "approve")}>
                      Approve
                    </button>
                    <button
                      disabled={approval.status !== "PENDING"}
                      onClick={() => reviewApproval(approval, "redact-approve")}
                    >
                      Redact & Approve
                    </button>
                    <button disabled={approval.status !== "PENDING"} onClick={() => reviewApproval(approval, "reject")}>
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "flight" && (
          <section className="panel">
            <div className="flight-layout">
              <div className="session-column">
                <div className="section-title compact-title">
                  <h2>Recorded Sessions</h2>
                  <span className="count-pill">{sessions.length}</span>
                </div>
                <div className="session-list">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className={selectedFlightSession?.id === session.id ? "session-active" : ""}
                      onClick={() => setActiveSession(session)}
                    >
                      <span className="session-time">
                        <Clock size={14} />
                        {formatDateTime(session.createdAt)}
                      </span>
                      <strong>{humanizeLabel(session.status)}</strong>
                      <span>{previewText(session.prompt, 96)}</span>
                      <small>
                        {session.planned.length} planned / {session.toolCalls?.length ?? 0} recorded
                      </small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="timeline-panel">
                {selectedFlightSession ? (
                  <div className="session-summary">
                    <div>
                      <span className="session-time">
                        <Clock size={14} />
                        {formatDateTime(selectedFlightSession.createdAt)}
                      </span>
                      <h2>{humanizeLabel(selectedFlightSession.status)} Session</h2>
                      <p>{selectedFlightSession.prompt}</p>
                    </div>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span>Actor</span>
                        <strong>{selectedFlightSession.userEmail}</strong>
                      </div>
                      <div className="summary-item">
                        <span>Role</span>
                        <strong>{humanizeLabel(selectedFlightSession.userRole)}</strong>
                      </div>
                      <div className="summary-item">
                        <span>Planned calls</span>
                        <strong>{selectedFlightSession.planned.length}</strong>
                      </div>
                      <div className="summary-item">
                        <span>Recorded calls</span>
                        <strong>{selectedFlightSession.toolCalls?.length ?? 0}</strong>
                      </div>
                    </div>
                    {selectedFlightSession.finalAnswer ? (
                      <p className="answer compact-answer">{selectedFlightSession.finalAnswer}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty-state">
                    <History size={28} />
                    <strong>No sessions yet</strong>
                    <span>Run the agent once to create a readable execution timeline.</span>
                  </div>
                )}
                <div className="section-title compact-title">
                  <h2>Tool Timeline</h2>
                  <span className="muted">{selectedFlightCalls.length} event(s)</span>
                </div>
                <Timeline calls={selectedFlightCalls} />
              </div>
            </div>
          </section>
        )}

        {view === "audit" && (
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Tamper-Evident Audit Trail</h2>
                <p className="muted">Readable event history with the raw payload available when you need it.</p>
              </div>
              <span className="count-pill">{auditEvents.length}</span>
            </div>
            <div className="audit-toolbar">
              <label className="audit-search">
                <span>Search audit trail</span>
                <div className="input-with-icon">
                  <Search size={17} />
                  <input
                    aria-label="Audit search"
                    value={auditQuery}
                    onChange={(event) => setAuditQuery(event.target.value)}
                    placeholder="Paste current hash, previous hash, actor, event id..."
                  />
                </div>
              </label>
              <label className="audit-sort">
                <span>Sort</span>
                <select
                  aria-label="Audit sort"
                  value={auditSort}
                  onChange={(event) => setAuditSort(event.target.value as AuditSort)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="event-type">Event type</option>
                  <option value="actor">Actor</option>
                  <option value="hash">Current hash</option>
                </select>
              </label>
              <div className="audit-result-card">
                <strong>{visibleAuditEvents.length}</strong>
                <span>{auditQuery.trim() ? "matching events" : "events shown"}</span>
              </div>
            </div>
            <div className="audit-list">
              {visibleAuditEvents.map((event) => (
                <AuditEventCard
                  event={event}
                  hashQuery={auditQuery}
                  key={event.id}
                  previousEvent={event.prevHash ? auditEventsByHash.get(event.prevHash) ?? null : null}
                />
              ))}
              {!visibleAuditEvents.length ? (
                <div className="empty-state audit-empty">
                  <Hash size={28} />
                  <strong>No audit events found</strong>
                  <span>Try a different hash fragment, actor, event name, or entity id.</span>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {view === "policies" && (
          <section className="panel">
            <div className="policy-grid">
              {policies.map((policy) => (
                <article className="policy-card" key={policy.id}>
                  <div>
                    <strong>{policy.name}</strong>
                    <span>{policy.severity}</span>
                  </div>
                  <p>{policy.description}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Timeline({ calls }: { calls: ToolCall[] }) {
  if (!calls.length) {
    return <p className="muted">No tool calls recorded.</p>;
  }

  return (
    <div className="timeline">
      {calls.map((call) => (
        <article className="timeline-item" key={call.id}>
          <div className="timeline-icon">{decisionIcon(call.status)}</div>
          <div className="timeline-content">
            <div className="timeline-head">
              <div>
                <span className="session-time">
                  <Clock size={14} />
                  {formatDateTime(call.createdAt)}
                </span>
                <strong>{humanizeLabel(call.toolName)}</strong>
                <p>{call.purpose}</p>
              </div>
              <div className="call-badges">
                <span className={riskClass(call.riskLevel)}>
                  {call.riskLevel} / {call.riskScore}
                </span>
                <span className={statusBadgeClass(call.status)}>{humanizeLabel(call.status)}</span>
                <span className={statusBadgeClass(call.decision)}>{humanizeLabel(call.decision)}</span>
              </div>
            </div>
            <div className="call-summary-grid">
              <ReadablePayload title="Input sent to MCP" rows={formatToolArguments(call)} />
              <ReadablePayload title="Gateway result" rows={formatToolOutput(call)} />
            </div>
            {call.reasons.length ? (
              <div className="reason-strip">
                {call.reasons.map((reason) => (
                  <span className="reason-chip" key={reason}>
                    {reason}
                  </span>
                ))}
              </div>
            ) : null}
            <details className="developer-payload">
              <summary>
                <Code2 size={15} />
                Developer payload
              </summary>
              <div className="timeline-json">
                <JsonBlock value={call.arguments} />
                <JsonBlock value={call.output ?? { result: "No output recorded" }} />
              </div>
            </details>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReadablePayload({ title, rows }: { title: string; rows: DetailRow[] }) {
  return (
    <div className="payload-card">
      <span className="payload-title">{title}</span>
      <div className="detail-grid">
        {rows.map((row) => (
          <div className="detail-row" key={`${row.label}-${row.value}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditEventCard({
  event,
  hashQuery,
  previousEvent
}: {
  event: AuditEvent;
  hashQuery: string;
  previousEvent: AuditEvent | null;
}) {
  const rows = auditEventSummaryRows(event.data);
  const matchLabel = getAuditMatchLabel(event, hashQuery);

  return (
    <article className="audit-card">
      <div className="audit-icon">{event.valid ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</div>
      <div className="audit-content">
        <div className="audit-title-row">
          <div>
            <span className="session-time">
              <Clock size={14} />
              {formatDateTime(event.createdAt)}
            </span>
            <strong>{humanizeLabel(event.eventType)}</strong>
          </div>
          <div className="event-badge-group">
            {matchLabel ? <span className="badge badge-medium">{matchLabel}</span> : null}
            <span className={event.valid ? "badge badge-low" : "badge badge-critical"}>
              {event.valid ? "Hash chain valid" : "Hash mismatch"}
            </span>
          </div>
        </div>
        <div className="audit-meta">
          <span>
            <UserRound size={14} />
            {event.actor ?? "system"}
          </span>
          <span>
            <Database size={14} />
            {event.entityType}
            {event.entityId ? ` / ${event.entityId.slice(0, 8)}` : ""}
          </span>
          <span>
            <Hash size={14} />
            {shortHash(event.hash)}
          </span>
        </div>
        <ReadablePayload title="Event summary" rows={rows} />
        <details className="developer-payload">
          <summary>
            <Code2 size={15} />
            Raw audit payload and hashes
          </summary>
          <div className="hash-grid">
            <div>
              <span>Previous hash</span>
              <code>{event.prevHash ?? "Genesis event"}</code>
              <small>
                {previousEvent
                  ? `Points to ${humanizeLabel(previousEvent.eventType)} from ${formatDateTime(previousEvent.createdAt)}`
                  : event.prevHash
                    ? "No matching previous event loaded"
                    : "Start of this audit chain"}
              </small>
            </div>
            <div>
              <span>Current hash</span>
              <code>{event.hash}</code>
            </div>
          </div>
          <JsonBlock value={event.data} />
        </details>
      </div>
    </article>
  );
}
