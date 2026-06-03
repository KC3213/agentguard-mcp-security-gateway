import type { JsonRecord, ToolDescriptor } from "@agentguard/shared";
import { executeFallbackTool, fallbackToolDescriptors } from "./fallbackTools";
import {
  defaultDemoConfig,
  isDemoConfig,
  parseMcpEndpoint,
  resolveCommand,
  rootDir,
  serverEnvironment,
  type McpServerConfig,
  workingDirectory
} from "./mcpConfig";

type McpSdkClient = {
  connect: (transport: unknown, options?: { timeout?: number }) => Promise<void>;
  close: () => Promise<void>;
  listTools: (
    params?: Record<string, unknown>,
    options?: { timeout?: number }
  ) => Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: JsonRecord }> }>;
  callTool: (
    input: { name: string; arguments: JsonRecord },
    resultSchema?: unknown,
    options?: { timeout?: number }
  ) => Promise<{ content?: Array<{ type: string; text?: string }> }>;
};

const requestTimeout = 30_000;

function normalizeToolResponse(response: { content?: Array<{ type: string; text?: string }> }) {
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
}

export class McpToolClient {
  private client: McpSdkClient | null = null;
  private connecting: Promise<McpSdkClient | null> | null = null;

  async listTools(endpoint?: string | null): Promise<ToolDescriptor[]> {
    if (endpoint) {
      const config = parseMcpEndpoint(endpoint);

      try {
        return await this.withEphemeralClient(config, async (client) => {
          const response = await client.listTools(undefined, { timeout: requestTimeout });
          return response.tools.map((tool) => ({
            name: tool.name,
            description: tool.description ?? "",
            inputSchema: tool.inputSchema ?? {}
          }));
        });
      } catch (error) {
        if (isDemoConfig(config)) {
          return fallbackToolDescriptors;
        }

        throw error;
      }
    }

    const client = await this.getClient();

    if (!client) {
      return fallbackToolDescriptors;
    }

    try {
      const response = await client.listTools(undefined, { timeout: requestTimeout });
      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? {}
      }));
    } catch {
      return fallbackToolDescriptors;
    }
  }

  async callTool(name: string, args: JsonRecord, endpoint?: string | null): Promise<unknown> {
    if (endpoint) {
      const config = parseMcpEndpoint(endpoint);

      try {
        return await this.withEphemeralClient(config, async (client) => {
          const response = await client.callTool({ name, arguments: args }, undefined, { timeout: requestTimeout });
          return normalizeToolResponse(response);
        });
      } catch (error) {
        if (isDemoConfig(config)) {
          return executeFallbackTool(name, args);
        }

        throw error;
      }
    }

    const client = await this.getClient();

    if (!client) {
      return executeFallbackTool(name, args);
    }

    try {
      const response = await client.callTool({ name, arguments: args }, undefined, { timeout: requestTimeout });
      return normalizeToolResponse(response);
    } catch {
      return executeFallbackTool(name, args);
    }
  }

  async testConnection(endpoint: string) {
    const tools = await this.listTools(endpoint);
    return {
      ok: true,
      toolCount: tools.length,
      tools: tools.map((tool) => tool.name)
    };
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

      const config = defaultDemoConfig();
      const transport = new StdioClientTransport({
        command: resolveCommand(config.command ?? "tsx"),
        args: config.args ?? [],
        cwd: rootDir
      });

      const client = new Client({ name: "agentguard-gateway", version: "0.1.0" }) as McpSdkClient;
      await client.connect(transport, { timeout: requestTimeout });
      return client;
    } catch {
      return null;
    }
  }

  private async withEphemeralClient<T>(config: McpServerConfig, callback: (client: McpSdkClient) => Promise<T>) {
    if (config.transport && config.transport !== "stdio") {
      throw new Error(`Unsupported MCP transport: ${config.transport}`);
    }

    if (!config.command) {
      throw new Error("MCP server command is required.");
    }

    const [{ Client }, { StdioClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js")
    ]);

    const transport = new StdioClientTransport({
      command: resolveCommand(config.command),
      args: config.args ?? [],
      cwd: workingDirectory(config),
      env: serverEnvironment(config),
      stderr: "pipe"
    });

    const client = new Client({ name: "agentguard-control-plane", version: "0.1.0" }) as McpSdkClient;

    try {
      await client.connect(transport, { timeout: requestTimeout });
      return await callback(client);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

export const mcpClient = new McpToolClient();
