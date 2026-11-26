import fs from "node:fs/promises";
import path from "node:path";

export async function resolveProjectPath(root: string, input: string, allowMissing = false): Promise<string> {
  if (!input || path.isAbsolute(input)) throw new Error("Use a relative path inside the project.");
  const canonicalRoot = await fs.realpath(root);
  const candidate = path.resolve(canonicalRoot, input);
  const relative = path.relative(canonicalRoot, candidate);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Path escapes the project root.");
  }
  const parts = relative.split(path.sep).filter(Boolean);
  let current = canonicalRoot;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed in project paths.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !allowMissing) throw error;
    }
  }
  return candidate;
}
