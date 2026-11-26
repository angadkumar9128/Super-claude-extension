import { spawn } from "node:child_process";
import { z } from "zod";
import { resolveProjectPath } from "../utils/paths.js";
import { isCommandBlocked, redactSecrets } from "../security/policy.js";
import { audit } from "../security/audit.js";

export interface TerminalOptions { enabled: boolean; timeoutMs: number; maxOutputChars: number; }

export function registerTerminalTool(server: any, root: string, options: TerminalOptions): void {
  server.tool("run_project_command", "Run an approved PowerShell or WSL2 command with cwd inside the project. This is not an OS sandbox.", {
    shell: z.enum(["powershell", "wsl"]), command: z.string().min(1).max(4000),
    cwd: z.string().default("."), approved: z.boolean()
  }, async ({ shell, command, cwd, approved }: { shell: "powershell" | "wsl"; command: string; cwd: string; approved: boolean }) => {
    if (!options.enabled) throw new Error("Terminal is disabled. Set ALLOW_TERMINAL=true to enable it.");
    if (approved !== true) throw new Error("Explicit approval is required for every terminal command.");
    if (isCommandBlocked(command)) throw new Error("Command blocked by the conservative safety policy.");
    const workdir = await resolveProjectPath(root, cwd || ".", false);
    const executable = shell === "powershell" ? "powershell.exe" : "wsl.exe";
    const args = shell === "powershell" ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["--", "bash", "-lc", command];
    await audit(root, "terminal_start", { shell, command, cwd });
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(executable, args, { cwd: workdir, windowsHide: true, env: process.env });
      let output = "";
      let settled = false;
      const append = (chunk: Buffer) => { output += chunk.toString("utf8"); if (output.length > options.maxOutputChars) output = output.slice(-options.maxOutputChars); };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const timer = setTimeout(() => { child.kill(); if (!settled) { settled = true; resolve({ code: null, output: output + "\n[Timed out]" }); } }, options.timeoutMs);
      child.on("error", (error) => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
      child.on("close", (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ code, output }); } });
    });
    await audit(root, "terminal_end", { shell, exitCode: result.code });
    return { content: [{ type: "text", text: "Exit code: " + result.code + "\n" + redactSecrets(result.output) }] };
  });
}