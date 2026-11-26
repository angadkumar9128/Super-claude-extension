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
      "browser_open_page"
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
