import { describe, expect, it } from "vitest";
import { isCommandBlocked, redactSecrets } from "../src/security/policy.js";

describe("terminal policy", () => {
  it("blocks common destructive commands", () => {
    expect(isCommandBlocked("Remove-Item C:\\ -Recurse")).toBe(true);
    expect(isCommandBlocked("rm -rf /")).toBe(true);
    expect(isCommandBlocked("shutdown /s")).toBe(true);
  });
  it("allows ordinary development commands", () => {
    expect(isCommandBlocked("npm test")).toBe(false);
    expect(isCommandBlocked("git status --short")).toBe(false);
  });
});

describe("secret redaction", () => {
  it("redacts GitHub tokens and bearer credentials", () => {
    const value = "token=ghp_abcdefghijklmnopqrstuvwxyz123456 Bearer abcdefghijk";
    expect(redactSecrets(value)).not.toContain("ghp_");
    expect(redactSecrets(value)).not.toContain("Bearer abcdefghijk");
  });
});