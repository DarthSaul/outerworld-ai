#!/usr/bin/env node
// Runs gitleaks when it is installed. When it is not, prints a loud notice and exits 0 so the
// local task-end check still runs the rest of the bar; CI installs gitleaks and never skips.
// Exit codes: 0 clean or not installed locally, 1 findings, 2 gitleaks itself failed.
import { spawnSync } from "node:child_process";

const probe = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
if (probe.error) {
  const inCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  const msg =
    "gitleaks: NOT INSTALLED — secrets check skipped locally (CI enforces it). Install: brew install gitleaks";
  if (inCi) {
    console.error("gitleaks: not installed in CI; refusing to skip.");
    process.exit(2);
  }
  console.warn(`\n${"!".repeat(msg.length)}\n${msg}\n${"!".repeat(msg.length)}\n`);
  process.exit(0);
}

const run = spawnSync("gitleaks", ["detect", "--redact", "--no-banner", "--source", "."], {
  stdio: "inherit",
});
if (run.status === 0) process.exit(0);
if (run.status === 1) process.exit(1);
console.error(`gitleaks: exited with ${run.status ?? run.signal}`);
process.exit(2);
