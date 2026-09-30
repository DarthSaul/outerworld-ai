#!/usr/bin/env node
// floor-guard.mjs — diff-scoped enforcement of the CONSTRAINTS.md floor.
// Adapted from the constraint-driven-development reference implementation.
// Usage: node scripts/floor-guard.mjs [--base <ref>]   (default base: origin/main, falls back to main)
// Exit: 0 clean, 1 at least one floor violation, 2 the guard could not run.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const argBase = (() => {
  const i = process.argv.indexOf("--base");
  return i > -1 ? process.argv[i + 1] : null;
})();

const git = (args, { diffExit = false } = {}) => {
  try {
    // A whole-milestone diff exceeds Node's default 1 MiB buffer, which would read as "could not diff".
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    return diffExit && e.status === 1 && typeof e.stdout === "string" ? e.stdout : null;
  }
};
const bail = (msg) => {
  console.error(`floor-guard: ${msg}`);
  process.exit(2);
};

const candidates = argBase ? [argBase] : ["origin/main", "main"];
let mergeBase = null;
for (const c of candidates) {
  mergeBase = git(["merge-base", c, "HEAD"])?.trim() || null;
  if (mergeBase) break;
}
if (!mergeBase) bail(`no merge base against ${candidates.join(" or ")}`);

const tracked = git(["diff", "--unified=0", mergeBase, "--"]);
if (tracked === null) bail(`could not diff against ${mergeBase}`);
const untrackedFiles = git(["ls-files", "--others", "--exclude-standard"]);
if (untrackedFiles === null) bail("could not list untracked files");
const untracked = untrackedFiles
  .split("\n")
  .filter(Boolean)
  .map((f) => {
    const d = git(["diff", "--no-index", "--unified=0", "/dev/null", f], { diffExit: true });
    if (d === null) bail(`could not diff untracked file ${f}`);
    return d;
  })
  .join("\n");
const diff = `${tracked}\n${untracked}`;

const ignoreGlobs = existsSync(".constraintsignore")
  ? readFileSync(".constraintsignore", "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
  : [];
const globToRe = (g) =>
  new RegExp(
    `^${g
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "__GLOBSTAR__")
      .replace(/\*/g, "[^/]*")
      .replace(/__GLOBSTAR__/g, ".*")}$`,
  );
const ignoreRes = ignoreGlobs.map(globToRe);
const ignored = (f) => ignoreRes.some((re) => re.test(f));

const added = [];
const removed = [];
const deleted = [];
const pathOf = (s) => s.replace(/^[ab]\//, "");
let file = "";
let oldFile = "";
for (const line of diff.split("\n")) {
  if (line.startsWith("--- ")) oldFile = pathOf(line.slice(4));
  else if (line.startsWith("+++ ")) {
    const newFile = pathOf(line.slice(4));
    file = newFile === "/dev/null" ? oldFile : newFile;
    if (newFile === "/dev/null") deleted.push(file);
  } else if (line.startsWith("+") && !line.startsWith("+++"))
    added.push({ file, text: line.slice(1) });
  else if (line.startsWith("-") && !line.startsWith("---"))
    removed.push({ file, text: line.slice(1) });
}

const findings = [];
const flag = (rule, f, text) => {
  if (!ignored(f)) findings.push({ rule, file: f, text: text.trim().slice(0, 120) });
};
const isTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
const isConstraints = (f) => /CONSTRAINTS\.md$/.test(f);
const isThisGuard = (f) => /scripts\/floor-guard\.mjs$/.test(f);
const isDocs = (f) => /\.md$/.test(f) || /^docs\//.test(f) || /\.claude\//.test(f);
// Token rule applies to component and app source, not to the token definitions themselves.
const isTokenSource = (f) =>
  /^(packages\/ui|apps\/web)\/.*\.(tsx?|css)$/.test(f) &&
  !/\/tokens\//.test(f) &&
  !isTest(f) &&
  !/\/dev\//.test(f);

// 1. Silenced checker.
const SUPPRESSIONS =
  /@ts-ignore|@ts-nocheck|@ts-expect-error(?!\s*:?\s*\S)|biome-ignore|istanbul ignore|v8 ignore|gitleaks:allow/;
// 4. Unfinished work.
const STUBS =
  /throw new (Error|NotImplemented)\w*\(.*[Nn]ot implemented|catch\s*\(\w*\)\s*\{\s*\}|catch\s*\{\s*\}|\bTODO\b|\bFIXME\b/;
// 2. A test made easier.
const SKIPS = /\b(it|test|describe)\.(skip|todo|only)\b|\bxit\(|\bxdescribe\(/;
// 6. Hardcoded design tokens (project floor rule).
const TOKENS =
  /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|\b\d+(\.\d+)?ms\b|border-radius:\s*\d+px|rounded-\[\d+px\]/;
// 7. Themed vocabulary in code identifiers (project floor rule). Neutral names only.
const THEMED =
  /\b(planet|planets|orbit|orbits|galaxy|starship|spaceship|rocket|moon|moons|outpost|outposts|clearance|clearances|relay|relays|manifest|manifests|sortie|sorties|commission|commissions|assayer)\b/i;

for (const { file, text } of added) {
  if (isThisGuard(file)) continue;
  if (SUPPRESSIONS.test(text) && !isDocs(file)) flag("silenced-checker", file, text);
  if (STUBS.test(text) && !isDocs(file)) flag("unfinished-work", file, text);
  if (SKIPS.test(text) && !isDocs(file)) flag("test-made-easier", file, text);
  if (isConstraints(file) && /^\| *(W|E)\d+ *\|/.test(text)) flag("new-exception", file, text);
  if (isTokenSource(file) && TOKENS.test(text)) flag("hardcoded-token", file, text);
  if (
    !isDocs(file) &&
    !/glossary/.test(file) &&
    /\.(tsx?|mjs|cjs|js|json)$/.test(file) &&
    THEMED.test(text)
  ) {
    flag("themed-vocabulary", file, text);
  }
}

// A test retired together with what it tests is not a test made easier: its whole package is
// deleted (package.json in the same diff), or the module it tests (foo.test.ts with foo.ts) is.
// Deleting a test while its code stays is still flagged.
const deletedPackages = deleted
  .filter((f) => /(^|\/)package\.json$/.test(f))
  .map((f) => f.replace(/package\.json$/, ""))
  .filter((dir) => dir !== ""); // deleting the root package.json retires nothing
const retired = (f) =>
  deletedPackages.some((dir) => f.startsWith(dir)) ||
  deleted.includes(f.replace(/\.(test|spec)(\.[cm]?[jt]sx?)$/, "$2"));
for (const f of deleted) if (isTest(f) && !retired(f)) flag("test-deleted", f, "file deleted");
// A changed assertion (one line out, one in) is reviewed in the diff; a net loss of assertion
// lines in a kept test file is flagged.
const ASSERTION = /\b(expect|assert)\b/;
const assertionBalance = new Map();
const tally = (lines, delta) => {
  for (const { file, text } of lines) {
    if (!isTest(file) || deleted.includes(file) || !ASSERTION.test(text)) continue;
    const b = assertionBalance.get(file) ?? { net: 0, sample: text };
    b.net += delta;
    if (delta < 0) b.sample = text;
    assertionBalance.set(file, b);
  }
};
tally(removed, -1);
tally(added, 1);
for (const [file, { net, sample }] of assertionBalance) {
  if (net < 0)
    flag("assertion-removed", file, `${-net} fewer assertion line(s), e.g. ${sample.trim()}`);
}

// Threshold loosening in CONSTRAINTS.md.
const ruleKey = (t) => {
  const s = t.trim();
  if (s.startsWith("|"))
    return (
      s
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)[0] ?? ""
    );
  if (/^[-*] /.test(s)) return s.slice(2).split(":")[0].trim();
  return null;
};
const isException = (t) => /^\| *(W|E)\d+ *\|/.test(t.trim());
const MIN_BEFORE = /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const MAX_BEFORE =
  /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
const MIN_AFTER = /^\s*\S*\s*(or more|or higher|must not fall|must not drop)/;
const MAX_AFTER = /^\s*\S*\s*(or less|or lower|must not grow|must not exceed)/;
const thresholds = (t) => {
  const out = [];
  const re = /\d+(?:\.\d+)?/g;
  let m = re.exec(t);
  while (m) {
    const before = t.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
    const dir =
      MIN_BEFORE.test(before) || MIN_AFTER.test(after)
        ? "min"
        : MAX_BEFORE.test(before) || MAX_AFTER.test(after)
          ? "max"
          : null;
    out.push({ n: Number(m[0]), dir });
    m = re.exec(t);
  }
  return out;
};
const removedRules = removed.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
const addedRules = added.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
for (const r of removedRules) {
  const a = addedRules.find((x) => ruleKey(x.text) === ruleKey(r.text));
  if (!a) {
    if (!isException(r.text)) flag("rule-removed", r.file, r.text);
    continue;
  }
  const before = thresholds(r.text);
  const after = thresholds(a.text);
  let verdict = null;
  for (const dir of ["min", "max", null]) {
    const was = before.filter((x) => x.dir === dir);
    const now = after.filter((x) => x.dir === dir);
    was.forEach((b, i) => {
      const n = now[i];
      if (verdict) return;
      if (!n) verdict = "threshold-removed";
      else if (n.n === b.n) return;
      else if (dir === "min" ? n.n < b.n : dir === "max" ? n.n > b.n : true) {
        verdict = dir ? "threshold-loosened" : "threshold-changed";
      }
    });
  }
  if (verdict) flag(verdict, r.file, `${r.text}  ->  ${a.text}`);
}

if (findings.length === 0) {
  console.log("floor-guard: clean");
  process.exit(0);
}
console.error(`floor-guard: ${findings.length} floor violation(s):`);
for (const f of findings) console.error(`  [${f.rule}] ${f.file}: ${f.text}`);
console.error(
  "\nEach is a move that lowers the bar. Fix the code, or route it through a tracked exception in CONSTRAINTS.md.",
);
process.exit(1);
