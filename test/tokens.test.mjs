// The Frewstar tokens, adopted by the bowls app. Run: npm test
//
// frewstar/tokens/ is copied from the frewstar-ui repo by its
// scripts/sync-tokens.mjs and never edited here. frewstar/frewstar-brand.css
// is this app's own. src/lib/theme.js points some constants at the tokens and
// keeps others literal (see the note at its top); this file checks that every
// constant still means exactly the colour or font it meant before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as theme from "../src/lib/theme.js";
import { scan, readBaseline, compare, countHex } from "../scripts/check-hex.mjs";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const TOKENS = read("../frewstar/tokens/frewstar-tokens.css");
const BRAND = read("../frewstar/frewstar-brand.css");
const PIN = JSON.parse(read("../frewstar/tokens.pin.json"));

const HEADER = /^\/\* @frewstar\/tokens v(\d+\.\d+\.\d+) sha256:([0-9a-f]{64}) — generated, do not edit in apps \*\/\n/;

function header(file) {
  const text = read(`../frewstar/tokens/${file}`);
  const m = HEADER.exec(text);
  assert.ok(m, `${file} has no @frewstar/tokens header`);
  const actual = createHash("sha256").update(text.slice(m[0].length), "utf8").digest("hex");
  return { version: m[1], hash: m[2], actual };
}

function atLeast(v, min) {
  const [a, b] = [v.split(".").map(Number), min.split(".").map(Number)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

/** Declarations of the first `selector {…}` block, comments stripped. */
function block(css, selector) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const at = src.indexOf(`${selector} {`);
  assert.ok(at > -1, `no ${selector} block`);
  const body = src.slice(src.indexOf("{", at) + 1, src.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

// What <html> ends up with: the tokens' light defaults, then the brand file
// (loaded after them in src/main.jsx). The app has no data-fs-mode, so the
// dark block never applies.
const HTML = { ...block(TOKENS, ":root"), ...block(BRAND, ":root") };

function resolve(value) {
  for (let hops = 0; hops < 10; hops++) {
    const next = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
    if (!next) return value;
    assert.ok(next in HTML, `${next} is not defined`);
    value = HTML[next];
  }
  throw new Error(`${value} does not resolve`);
}

const norm = v => v.toLowerCase().replace(/\s+/g, "");

// ── Synced, untouched, not stale ───────────────────────────────────────────

for (const file of ["frewstar-tokens.css", "frewstar-tokens.ts"]) {
  test(`${file} has not been hand-edited (its content matches the hash in its header)`, () => {
    const h = header(file);
    assert.equal(h.actual, h.hash, `${file} was edited after sync — change the token in frewstar-ui and re-sync`);
  });
  test(`${file} is not older than the pinned version`, () => {
    const h = header(file);
    assert.ok(atLeast(h.version, PIN.version), `${file} is v${h.version}, pin is v${PIN.version}`);
  });
}

test("both synced files are the same version", () => {
  assert.equal(header("frewstar-tokens.ts").version, header("frewstar-tokens.css").version);
});

// ── No visible change ──────────────────────────────────────────────────────

// Every constant in src/lib/theme.js as it was on main (a63fd5e), before the
// tokens. Whether a constant is now a var() or still a literal, it must still
// come out as this.
const BEFORE = {
  GREEN: "#6b1d2e", MID: "#6b1d2e", GOLD: "#c9a84c", GOLD_LIGHT: "#e8c56a", LIGHT: "#c9a84c",
  BG: "#faf8f5", LADIES: "#5a0a2a", LADIES_MID: "#8b1a40",
  SURFACE: "#ffffff", SURFACE2: "#f5f0eb", BORDER: "#e8e0d5", BRAND_HI: "#8b2439", GOLD_MUTED: "#9a7a2e",
  TEXT: "#1a0a0e", TEXT2: "#6b5a5e", TEXT3: "#9e8a8e",
  WIN_GOLD: "#c9a84c", LOSS_RED: "#c0392b", WIN_BG: "#fffbf0", LOSS_BG: "#fdf5f5",
  F_DISPLAY: "'Cormorant Garamond', Georgia, serif",
  F_SANS: "'Inter', system-ui, sans-serif",
  F_UI: "'Inter', system-ui, sans-serif",
};

test("theme.js exports exactly the constants it did before", () => {
  assert.deepEqual(Object.keys(theme).sort(), Object.keys(BEFORE).sort());
});

for (const [name, was] of Object.entries(BEFORE)) {
  test(`${name} still comes out as ${was}`, () => {
    assert.equal(norm(resolve(theme[name])), norm(was));
  });
}

test("the constants pointed at tokens are the ones the brief names, and the safe ones", () => {
  const pointed = Object.entries(theme).filter(([, v]) => v.startsWith("var(")).map(([k]) => k).sort();
  assert.deepEqual(pointed, ["BG", "F_DISPLAY", "F_SANS", "F_UI", "SURFACE", "SURFACE2", "TEXT", "TEXT2"]);
});

// The literal constants are literal because call sites glue hex-alpha onto
// them (`${GOLD}44`) or hand them to SVG attributes. The comment beside each
// in theme.js names the token it matches; hold it to that, so the literal and
// the brand file cannot drift apart.
const LITERAL_TOKEN = {
  GREEN: "--fs-accent", MID: "--fs-accent",
  GOLD: "--fs-accent-secondary", LIGHT: "--fs-accent-secondary", WIN_GOLD: "--fs-accent-secondary",
  BORDER: "--fs-line-default", TEXT3: "--fs-fg-disabled", LOSS_RED: "--fs-status-failed",
};
for (const [name, token] of Object.entries(LITERAL_TOKEN)) {
  test(`${name} (literal) equals ${token} as the brand file sets it`, () => {
    assert.equal(norm(theme[name]), norm(resolve(`var(${token})`)));
  });
}

test("Joseph's bowls decisions: burgundy accent, gold secondary, Cormorant display, Inter body", () => {
  assert.equal(norm(resolve("var(--fs-accent)")), "#6b1d2e");
  assert.equal(norm(resolve("var(--fs-accent-secondary)")), "#c9a84c");
  assert.match(resolve("var(--fs-font-display)"), /^'Cormorant Garamond'/);
  assert.match(resolve("var(--fs-font-body)"), /^'Inter'/);
  assert.equal(norm(resolve("var(--fs-accent-on)")), "#ffffff", "white on burgundy");
});

test("the entry points load the tokens, then the brand file, before the app", () => {
  for (const file of ["../src/main.jsx", "../test/harness/appMain.jsx", "../test/harness/main.jsx"]) {
    const src = read(file);
    const t = src.indexOf('frewstar/tokens/frewstar-tokens.css"');
    const b = src.indexOf('frewstar/frewstar-brand.css"');
    const app = src.search(/import \w+ from "[^"]*(App|LiveGames)\.jsx"/);
    assert.ok(t > -1 && b > t && app > b, `${file}: tokens → brand → app`);
  }
});

// ── The hex guard ──────────────────────────────────────────────────────────

test("no file has more hex colours than its baseline", () => {
  assert.deepEqual(compare(scan(), readBaseline()).over, []);
});

test("the guard counts what it should", () => {
  assert.equal(countHex(`color: "#fff"; background: "#6b1d2e22"; x: "#abcd"`), 3);
  assert.equal(countHex(`&#123; /page#abc id="#root" "#12345"`), 0);
});

test("the guard catches a new hex in a file that had none", () => {
  assert.deepEqual(compare({ "src/New.jsx": 1 }, {}).over.length, 1);
  assert.deepEqual(compare({ "src/App.jsx": 5 }, { "src/App.jsx": 5 }).over, []);
});
