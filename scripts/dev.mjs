#!/usr/bin/env node
// pnpm dev: the daemon and the SPA together.
// - Station directory: $OUTERWORLD_HOME when set; otherwise .outerworld/dev-home/, copied from
//   fixtures/demo-station on first run so the fixture itself is never mutated.
// - Builds the daemon's and the SPA's workspace dependencies once, then keeps them rebuilt with
//   `turbo watch`; the daemon restarts under `node --watch`; Vite serves the SPA with HMR and
//   proxies /api to the daemon.
// Usage: pnpm dev   (OUTERWORLD_HOME=~/.outerworld pnpm dev for a real station)
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = process.env.OUTERWORLD_PORT ?? "4317";
const devOrigin = "http://localhost:5173";
const home = process.env.OUTERWORLD_HOME
  ? resolve(process.env.OUTERWORLD_HOME)
  : join(root, ".outerworld", "dev-home");

if (!process.env.OUTERWORLD_HOME && !existsSync(home)) {
  cpSync(join(root, "fixtures", "demo-station"), home, { recursive: true });
  console.log(`dev: copied fixtures/demo-station to ${home}`);
}

const filters = ["--filter=daemon...", "--filter=station^..."];
const build = spawnSync(
  "pnpm",
  ["turbo", "run", "build", ...filters, "--output-logs=errors-only"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const env = {
  ...process.env,
  OUTERWORLD_HOME: home,
  OUTERWORLD_PORT: port,
  OUTERWORLD_DEV_ORIGIN: devOrigin,
};
const children = [];
const run = (name, command, args) => {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => `${name.padEnd(7)}│ ${l}`)
      .join("\n");
  child.stdout.on("data", (d) => console.log(prefix(d)));
  child.stderr.on("data", (d) => console.error(prefix(d)));
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${name} exited (${code}); stopping`);
      stop(code ?? 1);
    }
  });
  children.push(child);
};

let stopping = false;
const stop = (code = 0) => {
  stopping = true;
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 300);
};
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

run("watch", "pnpm", ["turbo", "watch", "build", ...filters, "--output-logs=errors-only"]);
run("daemon", "node", ["--watch", "--enable-source-maps", "apps/daemon/dist/main.js"]);
run("vite", "pnpm", ["--filter", "station", "exec", "vite"]);
console.log(`dev: station ${home}\ndev: open ${devOrigin}`);
