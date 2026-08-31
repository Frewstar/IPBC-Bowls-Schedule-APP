import { chromium } from "playwright";
import assert from "node:assert/strict";

const HARNESS = "http://127.0.0.1:4598";
const API = "http://127.0.0.1:4599";
const api = (p, b) => fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then(r => r.json());

const MARKER  = `${HARNESS}/?name=MARKER&cloudkey=MARKER-1111&member=member-marker`;
const WATCHER = `${HARNESS}/?name=WATCHER&cloudkey=WATCHER-2222&member=member-watcher`;

const openGame = async (ctx, url) => {
  const p = await ctx.newPage();
  await p.goto(url);
  await p.getByText("Ladies Presidents Final").first().click();
  await p.waitForSelector("text=SALTCOATS");
  return p;
};
// The score sits in the hero as its own element; read the home side.
const homeScore = async p =>
  (await p.locator("text=/^\\d+$/").first().innerText()).trim();

const pass = [], fail = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); console.log("  ✅", name); }
  catch (e) { fail.push(name); console.log("  ❌", name, "\n     ", e.message.split("\n")[0]); }
};

// Start from the seed every time. These specs mutate the world — one severs
// the stream, another deletes the game — so without this, whichever runs
// second fails for reasons that have nothing to do with the code under test.
// Test order must not decide whether a test passes.
await api("/control/reset");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// ── 1. two contexts, one game: the score moves with no refresh ────────────
const markerCtx = await browser.newContext();
const watcherCtx = await browser.newContext();
const marker = await openGame(markerCtx, MARKER);
const watcher = await openGame(watcherCtx, WATCHER);

await check("the marker gets scoring controls on their own game", async () => {
  assert.ok(await marker.locator("button", { hasText: "+" }).first().isVisible().catch(() => false)
         || await marker.locator("svg.lucide-plus").first().isVisible().catch(() => false),
    "no + control for the creator");
});

await check("a different member gets NO scoring controls", async () => {
  const n = await watcher.locator("svg.lucide-plus").count();
  assert.equal(n, 0, `watcher can see ${n} + buttons`);
});

await check("the watcher is told it is following live", async () => {
  await watcher.waitForSelector("text=Following live", { timeout: 5000 });
});

await check("scoring in one context moves the other with no refresh", async () => {
  const before = await homeScore(watcher);
  await marker.locator("svg.lucide-plus").first().click();
  await watcher.waitForFunction(
    b => !![...document.querySelectorAll("*")].find(e => e.children.length === 0 && /^\d+$/.test(e.textContent.trim()) && e.textContent.trim() !== b),
    before, { timeout: 8000 });
  const after = await homeScore(watcher);
  assert.notEqual(after, before, "watcher's score did not move");
});

// ── 2. kill the socket: the poll backstop must catch up ───────────────────
await check("with the socket dead the watcher stops claiming to be live", async () => {
  await api("/control/kill-stream");
  await watcher.waitForSelector("text=/Not live|Connecting/", { timeout: 10000 });
});

await check("with the socket dead the score STILL catches up, via the poll", async () => {
  const before = await homeScore(watcher);
  // Write straight to the backend — no client involved, no event delivered.
  const rows = await fetch(API + "/rows").then(r => r.json());
  const g = rows.find(r => r.id === "game-1");
  await api("/update", { id: "game-1", patch: { home_score: (g.home_score || 0) + 5, updated_at: new Date(Date.now() + 1000).toISOString() } });
  const open = await fetch(API + "/control/streams").then(r => r.json());
  assert.equal(open.open, 0, "expected no live stream for this test to mean anything");
  await watcher.waitForFunction(
    b => !![...document.querySelectorAll("*")].find(e => e.children.length === 0 && /^\d+$/.test(e.textContent.trim()) && e.textContent.trim() !== b),
    before, { timeout: 45000 });
});

// ── 3. deletion while watching ────────────────────────────────────────────
await check("a game deleted underneath the watcher says so instead of going blank", async () => {
  await api("/control/revive-stream");
  await watcher.reload();
  await watcher.getByText("Ladies Presidents Final").first().click();
  await watcher.waitForSelector("text=SALTCOATS");
  await api("/delete", { id: "game-1" });
  await watcher.waitForSelector("text=That game was deleted", { timeout: 15000 });
});

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
