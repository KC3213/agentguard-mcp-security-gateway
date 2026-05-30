import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn()
  })
}));

const emptyResponse = (path: string) => {
  if (path.endsWith("/api/metrics")) return { sessions: 0, calls: 0, pendingApprovals: 0, blocked: 0 };
  return [];
};

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
});

