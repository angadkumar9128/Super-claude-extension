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

  // Reject symlinks in every existing path component to prevent traversal outside PROJECT_ROOT.
  const parts = relative.split(path.sep).filter(Boolean);
  let current = canonicalRoot;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed in project paths.");
      if (i < parts.length - 1 && !info.isDirectory()) throw new Error("A parent path component is not a directory.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !allowMissing) throw error;
      // Only the final component may be absent; parent directories must already exist.
      if (i !== parts.length - 1) throw error;
    }
  }
  return candidate;
}
