import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcpEndpoint, resolveCommand, rootDir, workingDirectory } from "./mcpConfig";

describe("mcp config helpers", () => {
  it("parses stored JSON endpoint config", () => {
    const config = parseMcpEndpoint(
      JSON.stringify({
        preset: "filesystem",
        transport: "stdio",
        command: "mcp-server-filesystem",
        args: ["demo-data", "docs"],
        allowedDirectories: ["demo-data", "docs"],
        auditEnabled: true
      })
    );

    expect(config.preset).toBe("filesystem");
    expect(config.command).toBe("mcp-server-filesystem");
    expect(config.args).toEqual(["demo-data", "docs"]);
  });

  it("keeps legacy stdio endpoint compatibility", () => {
    const config = parseMcpEndpoint("stdio://apps/mock-mcp-server/src/index.ts");

    expect(config.preset).toBe("agentguard-demo");
    expect(config.command).toBe("tsx");
    expect(config.args).toEqual(["apps/mock-mcp-server/src/index.ts"]);
  });

  it("resolves local MCP binaries to the project node_modules", () => {
    expect(resolveCommand("mcp-server-filesystem")).toBe(path.join(rootDir, "node_modules/.bin/mcp-server-filesystem"));
    expect(resolveCommand("pare-git")).toBe(path.join(rootDir, "node_modules/.bin/pare-git"));
  });

  it("uses the allowlisted repository directory as the Git MCP cwd", () => {
    expect(
      workingDirectory({
        preset: "git",
        allowedDirectories: ["/tmp/agentguard-repo"]
      })
    ).toBe("/tmp/agentguard-repo");
  });
});
