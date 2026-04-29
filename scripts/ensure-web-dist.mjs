#!/usr/bin/env node
/**
 * Ensures `apps/web/dist` is fresh enough for Wrangler (`[assets] directory = "../web/dist"`).
 * Rebuilds when dist is missing, when `apps/web` sources/config are newer than dist, or when
 * `BABEL_FORCE_WEB_BUILD=1`.
 *
 * Run from repo root: `npm run ensure-dist -w babel-room-worker`
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(root, "apps/web");
const distIndex = join(webRoot, "dist/index.html");
const force = process.env.BABEL_FORCE_WEB_BUILD === "1";

const IGNORE_DIRS = new Set(["node_modules", "dist", ".git"]);

/**
 * @param {string} dir
 * @returns {number}
 */
function latestMtimeUnder(dir) {
  let max = 0;
  /** @param {string} d */
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        walk(join(d, ent.name));
      } else {
        try {
          const t = statSync(join(d, ent.name)).mtimeMs;
          if (t > max) max = t;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return max;
}

/** @param {string[]} files */
function maxFileMtime(files) {
  let max = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    try {
      const t = statSync(f).mtimeMs;
      if (t > max) max = t;
    } catch {
      /* ignore */
    }
  }
  return max;
}

const srcTree = join(webRoot, "src");
const configFiles = [
  join(webRoot, "index.html"),
  join(webRoot, "package.json"),
  join(webRoot, "vite.config.ts"),
  join(webRoot, "tailwind.config.ts"),
  join(webRoot, "postcss.config.js"),
];

const inputsMtime = Math.max(
  latestMtimeUnder(srcTree),
  maxFileMtime(configFiles),
);

const distMtime = existsSync(distIndex) ? statSync(distIndex).mtimeMs : 0;
const stale = !distMtime || inputsMtime > distMtime;

if (existsSync(distIndex) && !stale && !force) {
  console.log(
    "ensure-web-dist: apps/web/dist is up to date — skip build (set BABEL_FORCE_WEB_BUILD=1 to force)",
  );
  process.exit(0);
}

if (force) {
  console.log("ensure-web-dist: BABEL_FORCE_WEB_BUILD=1 — rebuilding apps/web…");
} else if (!distMtime) {
  console.log("ensure-web-dist: apps/web/dist missing — building babel-room-web…");
} else {
  console.log("ensure-web-dist: web sources newer than dist — rebuilding babel-room-web…");
}

const result = spawnSync("npm", ["run", "build", "-w", "babel-room-web"], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
