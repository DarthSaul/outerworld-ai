import { isAbsolute, join, resolve } from "node:path";

export interface DaemonConfig {
  /** The station data directory (`$OUTERWORLD_HOME`). */
  readonly home: string;
  readonly port: number;
  /** Always loopback (brief §11). Not configurable on purpose. */
  readonly host: "127.0.0.1";
  /** The built SPA; absent in development, where Vite serves it. */
  readonly spaDir?: string;
  /** Development only: the Vite dev server's origin, allowed to call the API through its proxy. */
  readonly devOrigin?: string;
}

const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/;

/**
 * Daemon configuration from the environment:
 * `OUTERWORLD_HOME` (default `~/.outerworld`), `OUTERWORLD_PORT` (default 4317, 0 for any free
 * port), `OUTERWORLD_DEV_ORIGIN` (loopback http only; set by `pnpm dev`, which also drops the
 * built SPA).
 */
export function resolveConfig(
  env: Readonly<Record<string, string | undefined>>,
  context: { readonly homedir: string; readonly defaultSpaDir?: string; readonly cwd?: string },
): DaemonConfig {
  const rawHome = env.OUTERWORLD_HOME;
  const home =
    rawHome === undefined || rawHome === ""
      ? join(context.homedir, ".outerworld")
      : rawHome.startsWith("~/")
        ? join(context.homedir, rawHome.slice(2))
        : isAbsolute(rawHome)
          ? rawHome
          : resolve(context.cwd ?? process.cwd(), rawHome);

  const rawPort = env.OUTERWORLD_PORT ?? "4317";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port > 65535) {
    throw new Error(`OUTERWORLD_PORT must be an integer from 0 to 65535, got "${rawPort}"`);
  }

  const devOrigin = env.OUTERWORLD_DEV_ORIGIN;
  if (devOrigin !== undefined && !LOOPBACK_ORIGIN.test(devOrigin)) {
    throw new Error(`OUTERWORLD_DEV_ORIGIN must be a loopback http origin, got "${devOrigin}"`);
  }

  return {
    home,
    port,
    host: "127.0.0.1",
    ...(devOrigin !== undefined
      ? { devOrigin }
      : context.defaultSpaDir !== undefined
        ? { spaDir: context.defaultSpaDir }
        : {}),
  };
}
