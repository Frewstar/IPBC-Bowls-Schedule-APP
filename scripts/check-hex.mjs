#!/usr/bin/env node
/**
 * The hex guard: no NEW hex colours outside the theme files.
 *
 * The app has hundreds of hard-coded hex colours in its components today.
 * Nobody has to rewrite them now. This only stops the number going up, so
 * the next colour anybody adds goes into the theme instead:
 *
 *   src/lib/theme.js             the app's colour constants
 *   frewstar/frewstar-brand.css  the app's values for the Frewstar tokens
 *   frewstar/tokens/             the Frewstar tokens (synced, never edited)
 *
 * ── How it works: a per-file ratchet ──────────────────────────────────────
 * scripts/hex-baseline.json records how many hex colours each file had on
 * 26 Sep 2026. A file may have at most that many; a file not listed may
 * have none. So an edit that ADDS a hex colour fails, a new file has to use
 * the theme from its first line, and a file that gets cleaner is fine.
 *
 * It counts, so it cannot tell which colour is new: swap one hex for another
 * in the same file and the count is unchanged. That is the honest limit.
 *
 * When a file gets cleaner, lock it in:
 *
 *     node scripts/check-hex.mjs --update
 *
 * --update only ever LOWERS a count or drops a file. Raising one, or adding a
 * file, is a hand edit to the JSON, where it shows in review for what it is.
 *
 * bowls-v3.jsx is not scanned. It is Joseph's to deal with separately and
 * this guard does not open it.
 *
 * Usage: node scripts/check-hex.mjs [--update] [--strict]
 *   --strict  also fail when a file is cleaner than its baseline (so the
 *             improvement gets locked in before it is pushed)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_PATH = join(ROOT, "scripts", "hex-baseline.json");

/** Where the app's code lives. index.html holds the app's own <style> block. */
const SCAN = ["src", "api", "index.html"];
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".css", ".html"]);

/** Allowed to hold colours: this is where colours belong. */
export const THEME_FILES = new Set(["src/lib/theme.js"]);
const THEME_DIRS = ["frewstar/"];
/** Not scanned, by instruction. */
const NOT_OPENED = new Set(["bowls-v3.jsx"]);

// #rgb, #rgba, #rrggbb, #rrggbbaa. The lookbehind keeps out HTML entities
// (&#123;), URL fragments (/page#abc) and ids glued to a word.
const HEX = /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

export function countHex(text) {
  return [...text.matchAll(HEX)].length;
}

function walk(path, out) {
  let st;
  try {
    st = statSync(path);
  } catch {
    return out;
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) walk(join(path, name), out);
  } else if (EXTENSIONS.has(extname(path))) {
    out.push(path);
  }
  return out;
}

/** { "src/App.jsx": 123, … } for every scanned file that has any hex. */
export function scan(root = ROOT) {
  const counts = {};
  for (const entry of SCAN) {
    for (const file of walk(join(root, entry), [])) {
      const rel = relative(root, file).split(sep).join("/");
      if (THEME_FILES.has(rel) || NOT_OPENED.has(rel) || THEME_DIRS.some((d) => rel.startsWith(d))) continue;
      const n = countHex(readFileSync(file, "utf8"));
      if (n > 0) counts[rel] = n;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function readBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, "utf8")).files;
}

/** @returns {{ over: string[], cleaner: string[] }} */
export function compare(found, baseline) {
  const over = [];
  for (const [file, n] of Object.entries(found)) {
    const may = baseline[file] ?? 0;
    if (n > may) over.push(`${file}: ${n} hex colour(s), ${may === 0 ? "none allowed" : `baseline allows ${may}`}`);
  }
  const cleaner = Object.entries(baseline)
    .filter(([file, n]) => (found[file] ?? 0) < n)
    .map(([file]) => file);
  return { over, cleaner };
}

export function total(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function main(argv) {
  const found = scan();
  const json = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  let baseline = json.files;

  if (argv.includes("--update")) {
    const next = {};
    for (const [file, n] of Object.entries(baseline)) {
      const lower = Math.min(n, found[file] ?? 0);
      if (lower > 0) next[file] = lower;
    }
    writeFileSync(BASELINE_PATH, JSON.stringify({ ...json, files: next }, null, 2) + "\n");
    console.log(`hex baseline: ${total(baseline)} → ${total(next)}`);
    baseline = next;
  }

  const { over, cleaner } = compare(found, baseline);
  if (over.length) {
    console.error(
      `✖ New hex colours outside the theme. Add the colour to src/lib/theme.js ` +
        `(or a token in frewstar/frewstar-brand.css) and use that instead:\n  ${over.join("\n  ")}`
    );
    process.exit(1);
  }
  if (cleaner.length && argv.includes("--strict")) {
    console.error(`✖ Cleaner than the baseline — lock it in with \`node scripts/check-hex.mjs --update\`:\n  ${cleaner.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Hex check passed: ${total(found)} hex colours outside the theme, baseline ${total(baseline)}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
