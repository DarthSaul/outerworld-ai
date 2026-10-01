/**
 * Vitest setup file: tests and CI make no network calls (CONSTRAINTS.md). Any `fetch` or TCP/TLS
 * socket to a host other than loopback throws. Loopback stays open for in-process servers.
 * Real-network smoke tests opt out with OUTERWORLD_ALLOW_NETWORK=1, set by hand.
 */
import net from "node:net";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

export const isLoopback = (host: string | undefined) =>
  host === undefined || LOOPBACK.has(host.replace(/^\[|\]$/g, ""));

const blocked = (host: string) =>
  new Error(`network call to ${host} blocked: tests run offline (CONSTRAINTS.md)`);

if (process.env.OUTERWORLD_ALLOW_NETWORK !== "1") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (!isLoopback(url.hostname)) throw blocked(url.host);
    return realFetch(input, init);
  };

  const realConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function connect(this: net.Socket, ...args: unknown[]) {
    // net.connect() passes its already-normalized arguments as one array.
    const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
    const host =
      typeof first === "object" && first !== null
        ? "path" in first
          ? undefined
          : (first as net.TcpNetConnectOpts).host
        : typeof second === "string"
          ? second
          : undefined;
    if (!isLoopback(host)) throw blocked(String(host));
    return (realConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
}
