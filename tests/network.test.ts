import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPublicIpAddress } from "../src/security/network.js";

describe("browser network address policy", () => {
  it.each([
    "127.0.0.1", "10.0.0.8", "172.16.0.1", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "224.0.0.1", "0.0.0.0"
  ])("blocks non-public IPv4 address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])(
    "allows public IPv4 address %s", (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    }
  );

  it.each(["::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"])(
    "blocks non-public IPv6 address %s", (address) => {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  );

  it("allows a global-unicast IPv6 address", () => {
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
  });

  it.each([
    "http://localhost/",
    "http://service.local/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://user:secret@example.com/",
    "file:///etc/passwd"
  ])("rejects unsafe browser URL %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow();
  });
});
