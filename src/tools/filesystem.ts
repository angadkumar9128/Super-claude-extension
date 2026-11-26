import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/paths.js";
import { audit } from "../security/audit.js";

export function registerFilesystemTools(server: any, root: string): void {
  server.tool("list_project_files", "List files and folders within the selected project root.", {}, async () => {
    const walk = async (dir: string, prefix = ""): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const output: string[] = [];
      for (const entry of entries) {
        if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
        const rel = path.posix.join(prefix, entry.name);
        output.push(rel + (entry.isDirectory() ? "/" : ""));
        if (entry.isDirectory()) output.push(...await walk(path.join(dir, entry.name), rel));
      }
      return output;
    };
    return { content: [{ type: "text", text: (await walk(root)).join("\n") || "(empty project)" }] };
  });

  server.tool("read_project_file", "Read a UTF-8 text file inside the selected project.", { path: z.string() }, async ({ path: input }: { path: string }) => {
    const target = await resolveProjectPath(root, input);
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 1000000) throw new Error("Only regular files up to 1 MB can be read.");
    return { content: [{ type: "text", text: await fs.readFile(target, "utf8") }] };
  });

  server.tool("write_project_file", "Create or replace a UTF-8 file inside the selected project. Requires explicit approval.", {
    path: z.string(), content: z.string().max(500000), approved: z.boolean()
  }, async ({ path: input, content, approved }: { path: string; content: string; approved: boolean }) => {
    if (approved !== true) throw new Error("Set approved=true only after reviewing the exact file change.");
    const target = await resolveProjectPath(root, input, true);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { encoding: "utf8", flag: "w" });
    await audit(root, "write_project_file", { path: input, characters: content.length });
    return { content: [{ type: "text", text: "Wrote " + input + " (" + content.length + " characters)." }] };
  });
}