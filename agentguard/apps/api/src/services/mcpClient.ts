import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonRecord, ToolDescriptor } from "@agentguard/shared";
import { executeFallbackTool, fallbackToolDescriptors } from "./fallbackTools";

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

type McpServerConfig = {
  preset?: string;
  transport?: string;
  command?: string;
  args?: string[];
  allowedDirectories?: string[];
  auditEnabled?: boolean;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../../..");
const repoRoot = path.resolve(rootDir, "..");
const requestTimeout = 30_000;
const emptyNpmUserConfig = "/private/tmp/agentguard-empty-npmrc";

export function parseMcpEndpoint(endpoint?: string | null): McpServerConfig {
  if (!endpoint) {
    return defaultDemoConfig();
  }

  try {
    const parsed = JSON.parse(endpoint);
    if (parsed && typeof parsed === "object") {
      return parsed as McpServerConfig;
    }
  } catch {
    if (endpoint.startsWith("stdio://")) {
      return {
        preset: "agentguard-demo",
        transport: "stdio",
        command: "tsx",
        args: [endpoint.replace("stdio://", "")]
      };
    }
  }

  return {
    preset: "custom",
    transport: "stdio",
    command: endpoint,
    args: []
  };
}

function defaultDemoConfig(): McpServerConfig {
  return {
    preset: "agentguard-demo",
    transport: "stdio",
    command: "tsx",
    args: ["apps/mock-mcp-server/src/index.ts"],
    allowedDirectories: ["demo-data", ".agentguard-runtime"],
    auditEnabled: true
  };
}

function isDemoConfig(config: McpServerConfig) {
  return (
    config.preset === "agentguard-demo" ||
    config.command?.includes("mock-mcp-server") ||
    config.args?.some((arg) => arg.includes("mock-mcp-server"))
  );
}

function resolveCommand(command: string) {
  if (command === "mcp-server-filesystem" || command === "pare-git") {
    return path.join(rootDir, "node_modules/.bin", command);
  }

  if (command === "tsx") {
    return path.join(rootDir, "node_modules/.bin/tsx");
  }

  return command;
}

function workingDirectory(config: McpServerConfig) {
  if (config.preset === "git") {
    const firstDirectory = config.allowedDirectories?.[0];
    return firstDirectory && path.isAbsolute(firstDirectory) ? firstDirectory : repoRoot;
  }

  return rootDir;
}

function serverEnvironment(config: McpServerConfig) {
  if (config.command !== "npx") {
    return undefined;
  }

  return {
    NPM_CONFIG_USERCONFIG: emptyNpmUserConfig,
    npm_config_userconfig: emptyNpmUserConfig,
    NPM_CONFIG_STRICT_SSL: "false",
    npm_config_strict_ssl: "false",
    NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmmirror.com",
    npm_config_registry: process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmmirror.com"
  };
}

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
