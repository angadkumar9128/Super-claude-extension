import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveProjectPath } from "../src/utils/paths.js";

let root = "";
let outside = "";

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  if (outside) await fs.rm(outside, { recursive: true, force: true });
  root = "";
  outside = "";
});

describe("project path boundary", () => {
  it("allows an ordinary relative path", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-"));
    const canonicalRoot = await fs.realpath(root);
    expect(await resolveProjectPath(root, "src/index.ts", true))
      .toBe(path.join(canonicalRoot, "src", "index.ts"));
  });

  it("rejects parent traversal and absolute paths", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-"));
    await expect(resolveProjectPath(root, "../outside")).rejects.toThrow();
    await expect(resolveProjectPath(root, path.join(os.tmpdir(), "outside"))).rejects.toThrow();
  });

  it("rejects symlink components", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-"));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "supertools-outside-"));
    await fs.symlink(outside, path.join(root, "linked"), "junction");
    await expect(resolveProjectPath(root, "linked/secret.txt"))
      .rejects.toThrow(/symbolic links/i);
  });
});
