import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";

export interface AppConfig {
  projectRoot: string;
  allowTerminal: boolean;
  terminalTimeoutMs: number;
  terminalMaxOutputChars: number;
  githubToken?: string;
}

export async function loadConfig(): Promise<AppConfig> {
  const configuredRoot = process.env.PROJECT_ROOT;
  if (!configuredRoot) throw new Error("PROJECT_ROOT must be set to an explicitly selected project folder.");
  const projectRoot = await fs.realpath(path.resolve(configuredRoot));
  if (!(await fs.stat(projectRoot)).isDirectory()) throw new Error("PROJECT_ROOT must be a directory.");
  return {
    projectRoot,
    allowTerminal: process.env.ALLOW_TERMINAL === "true",
    terminalTimeoutMs: Math.max(1000, Number(process.env.TERMINAL_TIMEOUT_MS || 30000)),
    terminalMaxOutputChars: Math.max(1000, Number(process.env.TERMINAL_MAX_OUTPUT_CHARS || 20000)),
    githubToken: process.env.GITHUB_TOKEN || undefined
  };
}