import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let root = "";
let client: Client | undefined;

afterEach(async () => {
  if (client) await client.close();
  client = undefined;
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = "";
});

describe("SuperTools MCP server integration", () => {
  it("starts over stdio and exposes project tools with terminal disabled", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-mcp-"));
    await fs.writeFile(path.join(root, "hello.txt"), "hello from integration test", "utf8");

    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve("dist/index.js")],
      env: { ...env, PROJECT_ROOT: root, ALLOW_TERMINAL: "false" }
    });
    client = new Client({ name: "supertools-integration-test", version: "1.0.0" });

    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      "list_project_files",
      "read_project_file",
      "write_project_file",
      "run_project_command",
      "browser_start_session",
      "browser_open_page",
      "browser_click",
      "browser_fill",
      "browser_screenshot",
      "browser_get_console_logs",
      "browser_get_network_events",
      "browser_devtools_command",
      "browser_get_accessibility_tree",
      "browser_upload_file",
      "browser_download_file",
      "browser_save_pdf"
    ]));

    const listing = await client.callTool({ name: "list_project_files", arguments: {} });
    expect(JSON.stringify(listing)).toContain("hello.txt");

    const read = await client.callTool({
      name: "read_project_file",
      arguments: { path: "hello.txt" }
    });
    expect(JSON.stringify(read)).toContain("hello from integration test");

    const terminal = await client.callTool({
      name: "run_project_command",
      arguments: { shell: "powershell", command: "Write-Output should-not-run", cwd: ".", approved: true }
    });
    expect(terminal.isError).toBe(true);

    const browserStart = await client.callTool({
      name: "browser_start_session",
      arguments: { viewportWidth: 1280, viewportHeight: 800 }
    });
    const browserStartText = (browserStart.content as Array<{ type: string; text?: string }>)
      .find((item) => item.type === "text")?.text || "";
    const sessionId = /sessionId: ([^\\n]+)/.exec(browserStartText)?.[1];
    const pageId = /pageId: ([^\\n]+)/.exec(browserStartText)?.[1];
    expect(sessionId).toBeTruthy();
    expect(pageId).toBeTruthy();

    const screenshot = await client.callTool({
      name: "browser_screenshot",
      arguments: { sessionId, pageId, fullPage: false, format: "png" }
    });
    expect((screenshot.content as Array<{ type: string }>).some((item) => item.type === "image")).toBe(true);

    const closed = await client.callTool({
      name: "browser_close_session",
      arguments: { sessionId }
    });
    expect(JSON.stringify(closed)).toContain("Closed browser session");

    if (process.platform === "win32") {
      await client.close();
      client = undefined;
      const enabledTransport = new StdioClientTransport({
        command: process.execPath,
        args: [path.resolve("dist/index.js")],
        env: { ...env, PROJECT_ROOT: root, ALLOW_TERMINAL: "true" }
      });
      client = new Client({ name: "supertools-powershell-test", version: "1.0.0" });
      await client.connect(enabledTransport);
      const powershell = await client.callTool({
        name: "run_project_command",
        arguments: {
          shell: "powershell",
          command: "Write-Output 'supertools-powershell-ok'",
          cwd: ".",
          approved: true
        }
      });
      expect(JSON.stringify(powershell)).toContain("supertools-powershell-ok");
    }
  }, 20000);
});
