import { createServer } from "node:http";
import net from "node:net";
import { describe, expect, it } from "vitest";
import { isLoopback } from "./no-network.js";

describe("the offline test guard", () => {
  it("blocks fetch to a public host", async () => {
    await expect(fetch("https://example.test/")).rejects.toThrow(/blocked/);
  });

  it("blocks a raw socket to a public address", () => {
    expect(() => net.connect({ host: "203.0.113.7", port: 443 })).toThrow(/blocked/);
    expect(() => net.connect(443, "203.0.113.7")).toThrow(/blocked/);
  });

  it("allows loopback, so in-process servers still work", async () => {
    const server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as net.AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(await res.text()).toBe("ok");
    server.close();
  });

  it("treats localhost, 127.0.0.1, and ::1 (bracketed or not) as loopback", () => {
    for (const h of ["localhost", "127.0.0.1", "::1", "[::1]", undefined]) {
      expect(isLoopback(h)).toBe(true);
    }
    expect(isLoopback("10.0.0.1")).toBe(false);
  });
});
