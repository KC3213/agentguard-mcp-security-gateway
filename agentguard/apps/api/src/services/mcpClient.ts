import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonRecord, ToolDescriptor } from "@agentguard/shared";
import { executeFallbackTool, fallbackToolDescriptors } from "./fallbackTools";

type McpSdkClient = {
  connect: (transport: unknown) => Promise<void>;
  listTools: () => Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: JsonRecord }> }>;
  callTool: (input: { name: string; arguments: JsonRecord }) => Promise<{ content?: Array<{ type: string; text?: string }> }>;
};

export class McpToolClient {
  private client: McpSdkClient | null = null;
  private connecting: Promise<McpSdkClient | null> | null = null;

  async listTools(): Promise<ToolDescriptor[]> {
    const client = await this.getClient();

    if (!client) {
      return fallbackToolDescriptors;
    }

    try {
      const response = await client.listTools();
      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? {}
      }));
    } catch {
      return fallbackToolDescriptors;
    }
  }

  async callTool(name: string, args: JsonRecord): Promise<unknown> {
    const client = await this.getClient();

    if (!client) {
      return executeFallbackTool(name, args);
    }

    try {
      const response = await client.callTool({ name, arguments: args });
      const text = response.content
        ?.filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text)
        .join("\n");

      if (!text) {
        return response;
      }

      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    } catch {
      return executeFallbackTool(name, args);
    }
  }

  private async getClient(): Promise<McpSdkClient | null> {
    if (this.client) {
      return this.client;
    }

    if (!this.connecting) {
      this.connecting = this.connect();
    }

    this.client = await this.connecting;
    return this.client;
  }

  private async connect(): Promise<McpSdkClient | null> {
    if (process.env.DISABLE_MCP_STDIO === "true") {
      return null;
    }

    try {
      const [{ Client }, { StdioClientTransport }] = await Promise.all([
        import("@modelcontextprotocol/sdk/client/index.js"),
        import("@modelcontextprotocol/sdk/client/stdio.js")
      ]);

      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const rootDir = path.resolve(currentDir, "../../../..");
      const serverPath = path.join(rootDir, "apps/mock-mcp-server/src/index.ts");
      const tsxBin = path.join(rootDir, "node_modules/.bin/tsx");
      const transport = new StdioClientTransport({
        command: tsxBin,
        args: [serverPath]
      });

      const client = new Client({ name: "agentguard-gateway", version: "0.1.0" }) as McpSdkClient;
      await client.connect(transport);
      return client;
    } catch {
      return null;
    }
  }
}

export const mcpClient = new McpToolClient();

