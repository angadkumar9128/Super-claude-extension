import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerTerminalTool } from "./tools/terminal.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerGitHubTools } from "./tools/github.js";

const config = await loadConfig();
const server = new McpServer({ name: "supertools-mcp", version: "0.1.0" });
registerFilesystemTools(server, config.projectRoot);
registerTerminalTool(server, config.projectRoot, {
  enabled: config.allowTerminal,
  timeoutMs: config.terminalTimeoutMs,
  maxOutputChars: config.terminalMaxOutputChars
});
registerBrowserTools(server, config.projectRoot);
registerGitHubTools(server, config.githubToken);
await server.connect(new StdioServerTransport());
