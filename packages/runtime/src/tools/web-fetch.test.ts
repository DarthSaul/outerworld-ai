import { describe, expect, it } from "vitest";
import { createWebFetch, htmlToText, isPublicAddress } from "./web-fetch.js";

const ctx = {
  agentId: "a",
  sessionId: "s",
  runId: "r",
  depth: 0,
  signal: new AbortController().signal,
};

type Route = { status?: number; body?: string; type?: string; location?: string };

/** A fake network: fetch answers from `routes`; DNS answers from `dns`. Nothing leaves the test. */
const setup = (routes: Record<string, Route>, dns: Record<string, string[]> = {}, limits = {}) => {
  const requested: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    requested.push(url);
    expect(init?.redirect).toBe("manual");
    const r = routes[url];
    if (!r) throw new TypeError("fetch failed");
    return new Response(r.body ?? "", {
      status: r.status ?? 200,
      headers: {
        ...(r.type ? { "content-type": r.type } : {}),
        ...(r.location ? { location: r.location } : {}),
      },
    });
  }) as unknown as typeof globalThis.fetch;
  const lookup = async (host: string) => {
    const addresses = dns[host] ?? ["93.184.216.34"];
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { tool: createWebFetch({ fetch, lookup, ...limits }), requested };
};

describe("web_fetch", () => {
  it("is read-class", () => {
    expect(setup({}).tool.class).toBe("read");
  });

  it("fetches a public page and returns readable text", async () => {
    const { tool } = setup({
      "https://example.test/": {
        type: "text/html; charset=utf-8",
        body: "<html><head><title>T</title><style>p{}</style><script>evil()</script></head><body><h1>Hello</h1><p>A &amp; B</p></body></html>",
      },
    });
    expect(await tool.execute({ url: "https://example.test/" }, ctx)).toEqual({
      url: "https://example.test/",
      status: 200,
      contentType: "text/html; charset=utf-8",
      text: "T\nHello\nA & B",
      truncated: false,
    });
  });

  it("passes plain text and JSON through", async () => {
    const { tool } = setup({ "https://api.test/x": { type: "application/json", body: '{"a":1}' } });
    expect(await tool.execute({ url: "https://api.test/x" }, ctx)).toMatchObject({
      text: '{"a":1}',
    });
  });

  it("refuses non-http schemes", async () => {
    const { tool } = setup({});
    for (const url of ["file:///etc/passwd", "ftp://x.test/", "javascript:alert(1)"]) {
      await expect(tool.execute({ url }, ctx), url).rejects.toThrow(/http/);
    }
  });

  it("refuses loopback, private, link-local, and local names, before any request", async () => {
    const { tool, requested } = setup(
      {},
      { "intranet.test": ["10.0.0.5"], "sneaky.test": ["93.184.216.34", "127.0.0.1"] },
    );
    for (const url of [
      "http://127.0.0.1:4317/api/health",
      "http://localhost/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "http://192.168.1.1/",
      "http://printer.local/",
      "http://intranet.test/",
      "http://sneaky.test/",
    ]) {
      await expect(tool.execute({ url }, ctx), url).rejects.toThrow(/not allowed/);
    }
    expect(requested).toEqual([]);
  });

  it("follows redirects, re-checking every hop", async () => {
    const { tool, requested } = setup({
      "https://a.test/": { status: 302, location: "https://b.test/final" },
      "https://b.test/final": { type: "text/plain", body: "ok" },
      "https://c.test/": { status: 301, location: "http://127.0.0.1/admin" },
    });
    expect(await tool.execute({ url: "https://a.test/" }, ctx)).toMatchObject({
      url: "https://b.test/final",
      text: "ok",
    });
    await expect(tool.execute({ url: "https://c.test/" }, ctx)).rejects.toThrow(/not allowed/);
    expect(requested).not.toContain("http://127.0.0.1/admin");
  });

  it("stops after too many redirects", async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 10; i++)
      routes[`https://r.test/${i}`] = { status: 302, location: `https://r.test/${i + 1}` };
    await expect(setup(routes).tool.execute({ url: "https://r.test/0" }, ctx)).rejects.toThrow(
      /redirects/,
    );
  });

  it("truncates a large body at the size cap", async () => {
    const { tool } = setup(
      { "https://big.test/": { type: "text/plain", body: "x".repeat(5000) } },
      {},
      { maxBytes: 1000 },
    );
    const r = (await tool.execute({ url: "https://big.test/" }, ctx)) as {
      text: string;
      truncated: boolean;
    };
    expect(r.truncated).toBe(true);
    expect(r.text).toHaveLength(1000);
  });

  it("refuses binary content", async () => {
    const { tool } = setup({ "https://img.test/a.png": { type: "image/png", body: "\x89PNG" } });
    await expect(tool.execute({ url: "https://img.test/a.png" }, ctx)).rejects.toThrow(/not text/);
  });

  it("reports an HTTP error status without failing the call", async () => {
    const { tool } = setup({
      "https://gone.test/": { status: 404, type: "text/plain", body: "missing" },
    });
    expect(await tool.execute({ url: "https://gone.test/" }, ctx)).toMatchObject({
      status: 404,
      text: "missing",
    });
  });
});

describe("isPublicAddress", () => {
  it("allows public addresses and blocks every private range", () => {
    for (const a of ["93.184.216.34", "1.1.1.1", "2606:4700::1111"])
      expect(isPublicAddress(a), a).toBe(true);
    for (const a of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
  });
});

describe("htmlToText", () => {
  it("drops scripts, styles, and tags, decodes entities, and keeps block breaks", () => {
    expect(
      htmlToText("<div>One<br>Two</div><script>x</script><p>&lt;3 &quot;q&quot; &#39;s&#39;</p>"),
    ).toBe("One\nTwo\n<3 \"q\" 's'");
  });
});
