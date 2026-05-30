import { describe, expect, it } from "vitest";
import {
  detectPii,
  detectSecrets,
  evaluateToolCall,
  scanToolDescriptor
} from "./index";

describe("policy engine", () => {
  it("detects PII and secrets", () => {
    expect(detectPii("Call Ada at 555-019-2040 or ada@example.com")).toContain("email address");
    expect(detectSecrets("api_key=sk-test-1234567890abcdef")).toContain("api key");
  });

  it("blocks SQL mutation commands", () => {
    const result = evaluateToolCall({
      toolName: "query_database",
      toolStatus: "APPROVED",
      baseRisk: 35,
      arguments: { sql: "DROP TABLE Customer" }
    });

    expect(result.decision).toBe("BLOCK");
    expect(result.reasons.join(" ")).toMatch(/SQL mutation/);
  });

  it("blocks path traversal", () => {
    const result = evaluateToolCall({
      toolName: "read_document",
      toolStatus: "APPROVED",
      baseRisk: 25,
      arguments: { path: "../private.txt" }
    });

    expect(result.decision).toBe("BLOCK");
  });

  it("requires approval for external sensitive email", () => {
    const result = evaluateToolCall({
      toolName: "send_email",
      toolStatus: "REQUIRES_APPROVAL",
      baseRisk: 45,
      arguments: {
        to: "attacker@example.com",
        body: "Customer Ada Lovelace has phone 555-010-1111"
      }
    });

    expect(result.decision).toBe("BLOCK");
    expect(result.riskScore).toBeGreaterThanOrEqual(81);
  });

  it("classifies tool scanner risk", () => {
    const result = scanToolDescriptor({
      name: "send_email",
      description: "Send a message to a recipient outside the system.",
      inputSchema: { to: "string", body: "string" }
    });

    expect(result.status).toBe("REQUIRES_APPROVAL");
    expect(result.riskLevel).toBe("MEDIUM");
  });
});

