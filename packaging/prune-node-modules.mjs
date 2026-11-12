#!/usr/bin/env node
// Closure-based node_modules pruner for the laintas-openclaw release
// tarball (used by .github/workflows/release.yml after `pnpm prune
// --prod`, before the staging copies).
//
// Usage: node packaging/prune-node-modules.mjs <packageRoot>
//          [--optional=full|platform|none] [--delete] [--report <file>]
//
// <packageRoot> is the package tree being shipped: it contains
// package.json, dist/, extensions/, packages/ and node_modules/
// (pnpm layout).
//
// v1.0.3 staged the whole production node_modules (918 MB tarball,
// 2.5 GB of node_modules): the graph also carries the dev/non-root
// workspace importers' packages and native payloads that no shipped
// code imports. This script keeps only the runtime closure:
//
//   1. every package reachable from the root package.json
//      dependencies + optionalDependencies, resolved the way Node
//      resolves them (walk-up through node_modules, following symlinks);
//   2. every target of a symlink that lives under extensions/ or
//      packages/ (their local node_modules encode the deps pnpm chose);
//   3. every bare specifier found by scanning the shipped code
//      (dist/, extensions/, packages/, root *.mjs), resolved from the
//      importing file;
// then closed over package.json dependencies + peerDependencies of
// every kept package instance (plus optionalDependencies per
// --optional), again resolved with Node's walk-up rule (for .pnpm
// instances this follows the sibling symlinks pnpm installed, which
// is exactly the resolved dep set).
//
// The release workflow runs with --optional=none: optionalDependency
// edges are not followed, because the payloads behind them in this
// graph are native binaries that shipped code never statically
// imports — the @openai/codex and @anthropic-ai/claude-agent-sdk
// platform binaries (spawned lazily by the ACP adapters at session
// time) and the @lancedb/lancedb platform binary (loaded through a
// guarded dynamic import whose @lancedb/lancedb specifier does not
// resolve in the staged tree anyway). Optional deps that shipped
// code DOES statically import (e.g. onnxruntime-node in
// extensions/onnx) are still kept via the import scan (seed 3).
//
// Everything else under node_modules/.pnpm is deleted (with
// --delete), as are top-level node_modules entries whose target
// instance is not kept, and .bin / .pnpm/node_modules entries
// pointing at deleted ids. Deletion is whole-.pnpm-id only, so the
// symlink layout inside every kept instance stays exactly as pnpm
// installed it.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const doDelete = process.argv.includes("--delete");
// --optional=full: follow optionalDependencies like regular deps.
// --optional=platform: follow an optional dep only when it is a platform
//   binary package of the depender (name starts with depender name + "-",
//   the napi-rs / optional-platform-package pattern, e.g.
//   @openclaw/fs-safe -> @openclaw/fs-safe-linux-x64-gnu).
// --optional=none: never follow optionalDependencies during BFS.
// (Root package.json optionalDependencies are always seeded directly.)
const optMode = (process.argv.find((a) => a.startsWith("--optional=")) || "--optional=full").split(
  "=",
)[1];
const reportIdx = process.argv.indexOf("--report");
const reportPath = reportIdx >= 0 ? process.argv[reportIdx + 1] : null;
const NM = path.join(root, "node_modules");
const PNPM = path.join(NM, ".pnpm");

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function readPkg(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}
function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

// Resolve a package name from a starting directory using Node's walk-up
// rule. Returns the realpath of the package dir or null.
const resolveCache = new Map();
function resolvePkg(fromDir, name) {
  const key = fromDir + "\0" + name;
  if (resolveCache.has(key)) return resolveCache.get(key);
  let dir = fromDir;
  let out = null;
  for (;;) {
    const cand = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(cand, "package.json")) || isDir(cand)) {
      out = real(cand);
      if (out) break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    if (dir === path.dirname(root)) break; // do not escape the staged tree
  }
  resolveCache.set(key, out);
  return out;
}

function pkgNameOfSpecifier(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? parts[0] + "/" + parts[1] : null;
  }
  return spec.split("/")[0];
}

const kept = new Map(); // realpath -> reason
function keep(dir, reason) {
  if (!dir) return null;
  if (!kept.has(dir)) kept.set(dir, reason);
  return dir;
}

// --- seed 1: root package.json deps -------------------------------------
const rootPkg = readPkg(root);
const rootDeps = [
  ...Object.keys(rootPkg.dependencies || {}),
  ...Object.keys(rootPkg.optionalDependencies || {}),
];
for (const name of rootDeps) keep(resolvePkg(root, name), "root-dep:" + name);

// --- seed 2: symlink targets under extensions/ and packages/ ------------
function* walkSymlinks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) yield p;
    else if (e.isDirectory() && e.name !== ".git") yield* walkSymlinks(p);
  }
}
for (const base of ["extensions", "packages"]) {
  const baseDir = path.join(root, base);
  if (!isDir(baseDir)) continue;
  for (const link of walkSymlinks(baseDir)) {
    // only care about links that land inside root node_modules/.pnpm or
    // root packages/ (workspace): those identify runtime instances
    const target = real(link);
    if (!target) continue;
    if (
      target.startsWith(PNPM + path.sep) ||
      target.startsWith(path.join(root, "packages") + path.sep)
    ) {
      keep(target, "ws-link:" + path.relative(root, link));
    }
  }
}

// --- seed 3: scan shipped JS for bare specifiers -------------------------
const specRe = /(?:from\s+|import\s*\(|require\s*\(|import\s+)["']([^"']+)["']/g;
let scannedFiles = 0;
function scanFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (text.length > 4_000_000) return;
  scannedFiles++;
  let m;
  while ((m = specRe.exec(text))) {
    const spec = m[1];
    if (
      spec.startsWith(".") ||
      spec.startsWith("/") ||
      spec.startsWith("node:") ||
      spec.startsWith("data:") ||
      spec.startsWith("file:")
    )
      continue;
    const name = pkgNameOfSpecifier(spec);
    if (!name) continue;
    keep(resolvePkg(path.dirname(file), name), "scan:" + spec);
  }
}
function* walkJs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      yield* walkJs(p);
    } else if (/\.(mjs|cjs|js|ts|tsx|mts|cts)$/.test(e.name)) yield p;
  }
}
for (const f of walkJs(path.join(root, "dist"))) scanFile(f);
for (const f of walkJs(path.join(root, "extensions"))) scanFile(f);
for (const f of walkJs(path.join(root, "packages"))) scanFile(f);
for (const e of fs.readdirSync(root)) {
  if (e.endsWith(".mjs")) scanFile(path.join(root, e));
}

// --- BFS closure over package.json deps ----------------------------------
const queue = [...kept.keys()];
const seen = new Set(queue);
while (queue.length) {
  const inst = queue.shift();
  const pkg = readPkg(inst);
  if (!pkg) continue;
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
  if (optMode === "full") Object.assign(deps, pkg.optionalDependencies || {});
  else if (optMode === "platform" && pkg.name) {
    for (const name of Object.keys(pkg.optionalDependencies || {})) {
      if (name.startsWith(pkg.name + "-")) deps[name] = pkg.optionalDependencies[name];
    }
  }
  for (const name of Object.keys(deps)) {
    const target = resolvePkg(inst, name);
    if (target && !seen.has(target)) {
      seen.add(target);
      keep(target, "dep-of:" + (pkg.name || inst));
      queue.push(target);
    }
  }
}

// --- classify .pnpm ids ----------------------------------------------------
const pnpmIds = fs
  .readdirSync(PNPM)
  .filter((d) => d !== "node_modules" && isDir(path.join(PNPM, d)));
const keptIds = new Set();
for (const dir of kept.keys()) {
  if (dir.startsWith(PNPM + path.sep)) {
    keptIds.add(dir.slice(PNPM.length + 1).split(path.sep)[0]);
  }
}
const droppedIds = pnpmIds.filter((id) => !keptIds.has(id));

// top-level entries whose target is kept
function topLevelKept() {
  const keepNames = new Set();
  for (const e of fs.readdirSync(NM, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(NM, e.name);
    if (e.name.startsWith("@")) {
      for (const sub of fs.readdirSync(p, { withFileTypes: true })) {
        const t = real(path.join(p, sub.name));
        if (t && kept.has(t)) keepNames.add(e.name + "/" + sub.name);
      }
    } else {
      const t = real(p);
      if (t && kept.has(t)) keepNames.add(e.name);
    }
  }
  return keepNames;
}
const keptTop = topLevelKept();

const report = {
  scannedFiles,
  keptInstances: kept.size,
  pnpmIdsTotal: pnpmIds.length,
  pnpmIdsKept: keptIds.size,
  pnpmIdsDropped: droppedIds.length,
  droppedIds: droppedIds.sort(),
  keptTopLevel: [...keptTop].sort(),
};
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      scannedFiles,
      keptInstances: kept.size,
      pnpmIdsTotal: pnpmIds.length,
      pnpmIdsKept: keptIds.size,
      pnpmIdsDropped: droppedIds.length,
      keptTopLevel: keptTop.size,
    },
    null,
    2,
  ),
);

if (!doDelete) process.exit(0);

// --- delete dropped .pnpm ids ---------------------------------------------
for (const id of droppedIds) {
  fs.rmSync(path.join(PNPM, id), { recursive: true, force: true });
}
// top-level entries not kept (skip dot entries except .bin handling below)
for (const e of fs.readdirSync(NM, { withFileTypes: true })) {
  if (e.name.startsWith(".")) continue;
  const p = path.join(NM, e.name);
  if (e.name.startsWith("@")) {
    for (const sub of fs.readdirSync(p)) {
      if (!keptTop.has(e.name + "/" + sub))
        fs.rmSync(path.join(p, sub), { recursive: true, force: true });
    }
    if (fs.readdirSync(p).length === 0) fs.rmSync(p, { recursive: true, force: true });
  } else if (!keptTop.has(e.name)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}
// .bin + hoisted .pnpm/node_modules: drop entries whose target vanished
for (const dir of [path.join(NM, ".bin"), path.join(PNPM, "node_modules")]) {
  if (!isDir(dir)) continue;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith("@") && isDir(p) && !e.isSymbolicLink()) {
      for (const sub of fs.readdirSync(p)) {
        const sp = path.join(p, sub);
        if (real(sp) === null || !fs.existsSync(sp))
          fs.rmSync(sp, { recursive: true, force: true });
      }
      if (fs.readdirSync(p).length === 0) fs.rmSync(p, { recursive: true, force: true });
    } else if (real(p) === null || !fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}
console.log("prune complete");
