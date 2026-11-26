import fs from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./policy.js";

export async function audit(root: string, event: string, details: Record<string, unknown> = {}): Promise<void> {
  const logPath = path.join(root, ".supertools-audit.log");
  const safeDetails = JSON.parse(redactSecrets(JSON.stringify(details)));
  const line = JSON.stringify({ timestamp: new Date().toISOString(), event, details: safeDetails });
  await fs.appendFile(logPath, line + "\n", { encoding: "utf8", mode: 0o600 });
}