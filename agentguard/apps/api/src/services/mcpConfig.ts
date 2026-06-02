import path from "node:path";
import { fileURLToPath } from "node:url";

export type McpServerConfig = {
  preset?: string;
  transport?: string;
  command?: string;
  args?: string[];
  allowedDirectories?: string[];
  auditEnabled?: boolean;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(currentDir, "../../../..");
const repoRoot = path.resolve(rootDir, "..");
const emptyNpmUserConfig = "/private/tmp/agentguard-empty-npmrc";

export function defaultDemoConfig(): McpServerConfig {
  return {
    preset: "agentguard-demo",
    transport: "stdio",
    command: "tsx",
    args: ["apps/mock-mcp-server/src/index.ts"],
    allowedDirectories: ["demo-data", ".agentguard-runtime"],
    auditEnabled: true
  };
}

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

export function isDemoConfig(config: McpServerConfig) {
  return (
    config.preset === "agentguard-demo" ||
    config.command?.includes("mock-mcp-server") ||
    config.args?.some((arg) => arg.includes("mock-mcp-server"))
  );
}

export function resolveCommand(command: string) {
  if (command === "mcp-server-filesystem" || command === "pare-git") {
    return path.join(rootDir, "node_modules/.bin", command);
  }

  if (command === "tsx") {
    return path.join(rootDir, "node_modules/.bin/tsx");
  }

  return command;
}

export function workingDirectory(config: McpServerConfig) {
  if (config.preset === "git") {
    const firstDirectory = config.allowedDirectories?.[0];
    return firstDirectory && path.isAbsolute(firstDirectory) ? firstDirectory : repoRoot;
  }

  return rootDir;
}

export function serverEnvironment(config: McpServerConfig) {
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
