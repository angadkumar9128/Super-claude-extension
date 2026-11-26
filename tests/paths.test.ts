import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveProjectPath } from "../src/utils/paths.js";

let root = "";
afterEach(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); root = ""; });

describe("project path boundary", () => {
  it("allows an ordinary relative path", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-"));
    expect(await resolveProjectPath(root, "src/index.ts", true)).toBe(path.join(root, "src", "index.ts"));
  });
  it("rejects parent traversal and absolute paths", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-"));
    await expect(resolveProjectPath(root, "../outside")).rejects.toThrow();
    await expect(resolveProjectPath(root, path.join(os.tmpdir(), "outside"))).rejects.toThrow();
  });
  it("rejects symlink components", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-outside-"));
    await fs.symlink(outside, path.join(root, "linked"), "junction");
    await expect(resolveProjectPath(root, "linked/secret.txt")).rejects.toThrow(/symbolic links/i);
    await fs.rm(outside, { recursive: true, force: true });
  });
});
