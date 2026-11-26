import fs from "node:fs/promises";
import path from "node:path";

export async function resolveProjectPath(root: string, input: string, allowMissing = false): Promise<string> {
  if (!input || path.isAbsolute(input)) throw new Error("Use a relative path inside the project.");
  const candidate = path.resolve(root, input);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path escapes the project root.");
  let resolved: string;
  try { resolved = await fs.realpath(candidate); }
  catch (error) {
    if (!allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = await fs.realpath(path.dirname(candidate));
    resolved = path.join(parent, path.basename(candidate));
  }
  const finalRelative = path.relative(root, resolved);
  if (finalRelative.startsWith("..") || path.isAbsolute(finalRelative)) throw new Error("Resolved path escapes the project root.");
  return resolved;
}