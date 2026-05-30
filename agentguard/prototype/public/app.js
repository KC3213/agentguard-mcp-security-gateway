const views = [
  ["console", "Agent Console"],
  ["tools", "Tool Registry"],
  ["approvals", "Approvals"],
  ["flight", "Flight Recorder"],
  ["audit", "Audit Log"],
  ["policies", "Policies"]
];

const prompts = [
  "Create a normal onboarding documentation ticket",
  "Read the public quarterly support report",
  "Query customers with SELECT",
  "Try DROP SQL on the customer table",
  "Summarize complaints and email internally",
  "Send fake customer data externally",
  "Send an API key by email",
  "Use an unknown tool"
];

const state = {
  view: "console",
  role: "employee",
  prompt: prompts[0],
  tools: [],
  sessions: [],
  toolCalls: [],
  approvals: [],
  audit: [],
  policies: [],
  metrics: { sessions: 0, calls: 0, pendingApprovals: 0, blocked: 0 },
  activeSession: null
};

const $ = (selector) => document.querySelector(selector);

async function get(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function send(path, body = {}, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function roleEmail() {
  return `${state.role}@agentguard.local`;
}

function toast(message) {
  $("#toast").textContent = message;
}

async function loadAll() {
  const [tools, sessions, toolCalls, approvals, audit, policies, metrics] = await Promise.all([
    get("/api/tools"),
    get("/api/sessions"),
    get("/api/tool-calls"),
    get("/api/approvals"),
    get("/api/audit"),
    get("/api/policies"),
    get("/api/metrics")
  ]);
  Object.assign(state, { tools, sessions, toolCalls, approvals, audit, policies, metrics });
  if (state.activeSession) {
    state.activeSession = sessions.find((session) => session.id === state.activeSession.id) ?? state.activeSession;
  }
  render();
}

function riskClass(level) {
  if (level === "CRITICAL") return "badge critical";
  if (level === "HIGH") return "badge high";
  if (level === "MEDIUM") return "badge medium";
  return "badge low";
}

function json(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderNav() {
  $("#nav").innerHTML = views
    .map(
      ([id, label]) =>
        `<button class="${state.view === id ? "active" : ""}" data-view="${id}"><span>${label}</span></button>`
    )
    .join("");
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });
}

function renderMetrics() {
  $("#metrics").innerHTML = [
    ["Sessions", state.metrics.sessions],
    ["Tool Calls", state.metrics.calls],
    ["Pending", state.metrics.pendingApprovals],
    ["Blocked", state.metrics.blocked]
  ]
    .map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderConsole() {
  return `
    <div class="console">
      <div class="stack">
        <label for="prompt">Prompt</label>
        <textarea id="prompt">${escapeHtml(state.prompt)}</textarea>
        <div class="scenario-grid">
          ${prompts.map((prompt) => `<button data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
        </div>
        <button class="primary" id="run">Run Agent</button>
      </div>
      <div class="stack">
        <h2>Latest Session</h2>
        ${
          state.activeSession
            ? `<p class="answer">${escapeHtml(state.activeSession.finalAnswer ?? "")}</p>${timeline(state.activeSession.toolCalls ?? [])}`
            : `<p class="muted">No session selected.</p>`
        }
      </div>
    </div>
  `;
}

function renderTools() {
  return `
    <div class="section-title"><h2>Registered Tools</h2><button id="scan">Scan</button></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tool</th><th>Status</th><th>Risk</th><th>Trust</th><th>Reasons</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.tools
            .map(
              (tool) => `
              <tr>
                <td><strong>${tool.name}</strong><span>${tool.description}</span></td>
                <td>${tool.status}</td>
                <td><span class="${riskClass(tool.riskLevel)}">${tool.riskScore}</span></td>
                <td>${tool.trustScore}</td>
                <td>${tool.reasons.join(", ")}</td>
                <td>
                  <div class="row-buttons">
                    <button data-tool="${tool.id}" data-status="APPROVED">Approve</button>
                    <button data-tool="${tool.id}" data-status="REQUIRES_APPROVAL">Review</button>
                    <button data-tool="${tool.id}" data-status="BLOCKED">Block</button>
                  </div>
                </td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderApprovals() {
  return `
    <div class="cards">
      ${state.approvals
        .map(
          (approval) => `
          <article class="card">
            <div class="card-head"><strong>${approval.toolCall?.toolName ?? "tool"}</strong><span>${approval.status}</span></div>
            ${json(approval.rawArguments)}
            <div class="row-buttons">
              <button data-approval="${approval.id}" data-action="approve" ${approval.status !== "PENDING" ? "disabled" : ""}>Approve</button>
              <button data-approval="${approval.id}" data-action="redact-approve" ${approval.status !== "PENDING" ? "disabled" : ""}>Redact & Approve</button>
              <button data-approval="${approval.id}" data-action="reject" ${approval.status !== "PENDING" ? "disabled" : ""}>Reject</button>
            </div>
          </article>`
        )
        .join("") || `<p class="muted">No approvals yet.</p>`}
    </div>`;
}

function renderFlight() {
  return `
    <div class="flight">
      <div class="session-list">
        ${state.sessions
          .map(
            (session) =>
              `<button data-session="${session.id}"><strong>${session.status}</strong><span>${escapeHtml(session.prompt)}</span></button>`
          )
          .join("")}
      </div>
      <div>
        <h2>Tool Timeline</h2>
        ${timeline(state.activeSession?.toolCalls ?? state.toolCalls.slice(0, 8))}
      </div>
    </div>`;
}

function renderAudit() {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Actor</th><th>Hash</th><th>Chain</th><th>Data</th></tr></thead>
        <tbody>
          ${state.audit
            .map(
              (event) => `
              <tr>
                <td><strong>${event.eventType}</strong><span>${event.entityType}</span></td>
                <td>${event.actor ?? "system"}</td>
                <td class="mono">${event.hash.slice(0, 14)}...</td>
                <td><span class="${event.valid ? "badge low" : "badge critical"}">${event.valid ? "valid" : "check"}</span></td>
                <td>${json(event.data)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderPolicies() {
  return `
    <div class="cards">
      ${state.policies
        .map(
          (policy) => `
          <article class="card">
            <div class="card-head"><strong>${policy.name}</strong><span>${policy.severity}</span></div>
            <p>${policy.description}</p>
          </article>`
        )
        .join("")}
    </div>`;
}

function timeline(calls) {
  if (!calls?.length) return `<p class="muted">No tool calls recorded.</p>`;
  return `<div class="timeline">${calls
    .map(
      (call) => `
      <article class="timeline-item">
        <div class="timeline-head">
          <strong>${call.toolName}</strong>
          <span class="${riskClass(call.riskLevel)}">${call.riskScore}</span>
          <span>${call.status}</span>
        </div>
        <p>${call.purpose}</p>
        <div class="json-grid">${json(call.arguments)}${call.output ? json(call.output) : ""}</div>
        <small>${call.reasons.join(" | ")}</small>
      </article>`
    )
    .join("")}</div>`;
}

function render() {
  renderNav();
  renderMetrics();
  $("#role").value = state.role;
  $("#view-title").textContent = views.find(([id]) => id === state.view)?.[1] ?? "AgentGuard";

  const content = {
    console: renderConsole,
    tools: renderTools,
    approvals: renderApprovals,
    flight: renderFlight,
    audit: renderAudit,
    policies: renderPolicies
  }[state.view]();
  $("#content").innerHTML = content;
  bindViewEvents();
}

function bindViewEvents() {
  $("#run")?.addEventListener("click", async () => {
    state.prompt = $("#prompt").value;
    toast("Running deterministic agent");
    const result = await send("/api/sessions", { prompt: state.prompt, userRole: state.role, userEmail: roleEmail() });
    await loadAll();
    state.activeSession = await get(`/api/sessions/${result.sessionId}`);
    toast(result.finalAnswer);
    render();
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prompt = button.dataset.prompt;
      render();
    });
  });

  $("#scan")?.addEventListener("click", async () => {
    await send("/api/tools/scan", { actor: roleEmail() });
    await loadAll();
    toast("Tool registry scanned");
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", async () => {
      await send(`/api/tools/${button.dataset.tool}/status`, { status: button.dataset.status, actor: roleEmail() }, "PATCH");
      await loadAll();
    });
  });

  document.querySelectorAll("[data-approval]").forEach((button) => {
    button.addEventListener("click", async () => {
      await send(`/api/approvals/${button.dataset.approval}/${button.dataset.action}`, { actor: roleEmail() });
      await loadAll();
      toast(`Approval ${button.dataset.action.replace("-", " ")} complete`);
    });
  });

  document.querySelectorAll("[data-session]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSession = state.sessions.find((session) => session.id === button.dataset.session);
      render();
    });
  });
}

$("#role").addEventListener("change", (event) => {
  state.role = event.target.value;
});

$("#refresh").addEventListener("click", () => loadAll().catch((error) => toast(error.message)));

loadAll().catch((error) => toast(error.message));

