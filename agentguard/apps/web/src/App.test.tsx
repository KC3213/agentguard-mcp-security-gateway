import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn()
  })
}));

const demoSession = {
  id: "session-1",
  prompt: "Read the public quarterly support report",
  userEmail: "employee@agentguard.local",
  userRole: "employee",
  status: "COMPLETED",
  finalAnswer: "Session completed. read_document executed with decision ALLOW.",
  planned: [{ toolName: "read_document", purpose: "Read synthetic public report", arguments: { path: "public_report.txt" } }],
  createdAt: "2026-06-01T09:09:01.524Z",
  toolCalls: [
    {
      id: "call-1",
      sessionId: "session-1",
      toolName: "read_document",
      purpose: "Read synthetic public report",
      arguments: { path: "public_report.txt" },
      output: { path: "public_report.txt", text: "AgentGuard Synthetic Quarterly Support Report" },
      decision: "ALLOW",
      riskScore: 25,
      riskLevel: "LOW",
      reasons: ["No blocking policy matched", "Tool output passed post-check"],
      status: "EXECUTED",
      createdAt: "2026-06-01T09:09:01.826Z"
    }
  ]
};

const previousAuditHash = "111aaa832b4afa91f265e570f5a18310e486bd89e172d4c3fa56ff5d828222";

const previousAuditEvent = {
  id: "audit-0",
  eventType: "TOOL_CALL_EXECUTED",
  entityType: "ToolCall",
  entityId: "call-1",
  actor: "employee@agentguard.local",
  data: {
    toolName: "read_document",
    decision: "ALLOW",
    riskScore: 25
  },
  prevHash: null,
  hash: previousAuditHash,
  valid: true,
  createdAt: "2026-06-01T09:08:01.530Z"
};

const demoAuditEvent = {
  id: "audit-1",
  eventType: "SESSION_STARTED",
  entityType: "AgentSession",
  entityId: "session-1",
  actor: "employee@agentguard.local",
  data: {
    prompt: "Read the public quarterly support report",
    plannedCalls: [{ toolName: "read_document", purpose: "Read synthetic public report", arguments: { path: "public_report.txt" } }]
  },
  prevHash: previousAuditHash,
  hash: "c392a1832b4afa91f265e570f5a18310e486bd89e172d4c3fa56ff5d82828980",
  valid: true,
  createdAt: "2026-06-01T09:09:01.530Z"
};

const emptyResponse = (path: string) => {
  if (path.endsWith("/api/metrics")) return { sessions: 0, calls: 0, pendingApprovals: 0, blocked: 0 };
  return [];
};

const readableResponse = (path: string) => {
  if (path.endsWith("/api/sessions")) return [demoSession];
  if (path.endsWith("/api/tool-calls")) return demoSession.toolCalls;
  if (path.endsWith("/api/audit")) return [demoAuditEvent, previousAuditEvent];
  if (path.endsWith("/api/metrics")) return { sessions: 1, calls: 1, pendingApprovals: 0, blocked: 0 };
  return [];
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders the main dashboard navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(emptyResponse(String(input)))
        })
      )
    );

    render(<App />);

    expect(await screen.findByText("AgentGuard")).toBeInTheDocument();
    expect(screen.getByText("Tool Registry")).toBeInTheDocument();
    expect(screen.getByText("Flight Recorder")).toBeInTheDocument();
  });

  it("renders flight recorder and audit log as readable summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(readableResponse(String(input)))
        })
      )
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Flight Recorder/i }));

    expect(await screen.findByText("Recorded Sessions")).toBeInTheDocument();
    expect(screen.getByText("Input sent to MCP")).toBeInTheDocument();
    expect(screen.getByText("Document path")).toBeInTheDocument();
    expect(screen.getByText("Developer payload")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Audit Log/i }));

    expect(await screen.findByText("Tamper-Evident Audit Trail")).toBeInTheDocument();
    expect(screen.getByText("Session Started")).toBeInTheDocument();
    expect(screen.getAllByText("Hash chain valid")).toHaveLength(2);
    expect(screen.getAllByText("Raw audit payload and hashes")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Audit search"), { target: { value: "c392a1832" } });

    expect(screen.getByText("Current hash match")).toBeInTheDocument();
    expect(screen.getByText("matching events")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Audit sort"), { target: { value: "oldest" } });

    expect(screen.getByDisplayValue("Oldest first")).toBeInTheDocument();
  });
});
