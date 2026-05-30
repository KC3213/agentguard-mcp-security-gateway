import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  History,
  Play,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
  XCircle
} from "lucide-react";
import { io } from "socket.io-client";
import { apiGet, apiPatch, apiPost, API_URL } from "./api";
import type { AgentSession, Approval, AuditEvent, Metrics, Policy, Tool, ToolCall } from "./types";

type View = "console" | "tools" | "approvals" | "flight" | "audit" | "policies";

const navItems: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "console", label: "Agent Console", icon: TerminalSquare },
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

export function App() {
  const [view, setView] = useState<View>("console");
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
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("Ready");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    const [nextTools, nextSessions, nextCalls, nextApprovals, nextAudit, nextPolicies, nextMetrics] =
      await Promise.all([
        apiGet<Tool[]>("/api/tools"),
        apiGet<AgentSession[]>("/api/sessions"),
        apiGet<ToolCall[]>("/api/tool-calls"),
        apiGet<Approval[]>("/api/approvals"),
        apiGet<AuditEvent[]>("/api/audit"),
        apiGet<Policy[]>("/api/policies"),
        apiGet<Metrics>("/api/metrics")
      ]);

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
          <Shield size={28} />
          <div>
            <strong>AgentGuard</strong>
            <span>MCP security gateway</span>
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

        <section className="metrics-grid">
          <MetricCard label="Sessions" value={metrics.sessions} icon={Activity} />
          <MetricCard label="Tool Calls" value={metrics.calls} icon={Database} />
          <MetricCard label="Pending" value={metrics.pendingApprovals} icon={ClipboardCheck} />
          <MetricCard label="Blocked" value={metrics.blocked} icon={AlertTriangle} />
        </section>

        {view === "console" && (
          <section className="panel">
            <div className="console-layout">
              <div className="console-input">
                <label htmlFor="prompt">Prompt</label>
                <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                <div className="scenario-grid">
                  {demoPrompts.map((item) => (
                    <button key={item} onClick={() => setPrompt(item)}>
                      {item}
                    </button>
                  ))}
                </div>
                <button className="primary-button" onClick={runSession} disabled={loading}>
                  <Play size={18} />
                  Run Agent
                </button>
              </div>
              <div className="console-output">
                <h2>Latest Session</h2>
                {activeSession ? (
                  <>
                    <p className="answer">{activeSession.finalAnswer}</p>
                    <Timeline calls={activeSession.toolCalls ?? []} />
                  </>
                ) : (
                  <p className="muted">No session selected.</p>
                )}
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
              <div className="session-list">
                {sessions.map((session) => (
                  <button key={session.id} onClick={() => setActiveSession(session)}>
                    <strong>{session.status}</strong>
                    <span>{session.prompt}</span>
                  </button>
                ))}
              </div>
              <div className="timeline-panel">
                <h2>Tool Timeline</h2>
                <Timeline calls={activeSession?.toolCalls ?? toolCalls.slice(0, 8)} />
              </div>
            </div>
          </section>
        )}

        {view === "audit" && (
          <section className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Actor</th>
                    <th>Hash</th>
                    <th>Chain</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.eventType}</strong>
                        <span>{event.entityType}</span>
                      </td>
                      <td>{event.actor ?? "system"}</td>
                      <td className="mono">{event.hash.slice(0, 14)}...</td>
                      <td>
                        <span className={event.valid ? "badge badge-low" : "badge badge-critical"}>
                          {event.valid ? "valid" : "check"}
                        </span>
                      </td>
                      <td>
                        <JsonBlock value={event.data} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div>
            <div className="timeline-head">
              <strong>{call.toolName}</strong>
              <span className={riskClass(call.riskLevel)}>{call.riskScore}</span>
              <span>{call.status}</span>
            </div>
            <p>{call.purpose}</p>
            <div className="timeline-json">
              <JsonBlock value={call.arguments} />
              {call.output ? <JsonBlock value={call.output} /> : null}
            </div>
            <small>{call.reasons.join(" | ")}</small>
          </div>
        </article>
      ))}
    </div>
  );
}
