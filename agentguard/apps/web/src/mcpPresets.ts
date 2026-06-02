export const mcpServerPresets = [
  {
    id: "agentguard-demo",
    label: "AgentGuard Demo MCP",
    description: "The local TypeScript MCP server already in this repo. Best first onboarding demo.",
    name: "Synthetic Company Tools MCP",
    command: "tsx",
    args: ["apps/mock-mcp-server/src/index.ts"],
    allowedDirectories: ["demo-data", ".agentguard-runtime"]
  },
  {
    id: "filesystem",
    label: "Filesystem MCP",
    description: "Real open-source filesystem MCP restricted to demo-data and docs.",
    name: "Open Source Filesystem MCP",
    command: "mcp-server-filesystem",
    args: ["demo-data", "docs"],
    allowedDirectories: ["demo-data", "docs"]
  },
  {
    id: "git",
    label: "Git MCP",
    description: "Real open-source Git MCP for read-first repository inspection.",
    name: "Open Source Git MCP",
    command: "pare-git",
    args: [],
    allowedDirectories: ["/Users/kachadha/Documents/my project"]
  }
];

export type McpServerPreset = (typeof mcpServerPresets)[number];
