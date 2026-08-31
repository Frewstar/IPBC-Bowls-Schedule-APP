import { chromium } from "playwright";
import assert from "node:assert/strict";

const HARNESS = "http://127.0.0.1:4598";
const API = "http://127.0.0.1:4599";
const api = (p, b) => fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then(r => r.json());
const presenceCount = () => fetch(`${API}/presence/count?topic=${encodeURIComponent("live_game:game-1")}`).then(r => r.json()).then(j => j.count);

const openGame = async (ctx, who) => {
  const p = await ctx.newPage();
  await p.goto(`${HARNESS}/?name=${who}&cloudkey=${who}-1111&member=member-${who.toLowerCase()}`);
  await p.getByText("Ladies Presidents Final").first().click();
  await p.waitForSelector("text=SALTCOATS");
  return p;
};

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
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const ctxC = await browser.newContext();

const a = await openGame(ctxA, "MARKER");

await check("one viewer alone is NOT told '1 watching'", async () => {
  await a.waitForTimeout(1500);
  assert.equal(await presenceCount(), 1, "server should see exactly one");
  assert.equal(await a.locator("text=/\\d+ watching/").count(), 0, "should show nothing at 1");
});

const b = await openGame(ctxB, "WATCHER");

await check("a second viewer makes both say '2 watching'", async () => {
  await a.waitForSelector("text=2 watching", { timeout: 10000 });
  await b.waitForSelector("text=2 watching", { timeout: 10000 });
});

const c = await openGame(ctxC, "THIRD");

await check("a third makes it 3 for everyone", async () => {
  for (const p of [a, b, c]) await p.waitForSelector("text=3 watching", { timeout: 10000 });
});

await check("closing a tab drops the count for the others", async () => {
  await c.close();
  await a.waitForSelector("text=2 watching", { timeout: 10000 });
});

await check("leaving the game back to the list leaves presence", async () => {
  await b.getByText("All games").first().click();
  await b.waitForSelector("text=Ladies Presidents Final");
  await a.waitForFunction(() => !/\d+ watching/.test(document.body.innerText), null, { timeout: 10000 });
  assert.equal(await presenceCount(), 1, "only the one still on the game should remain");
});

await check("a dead socket hides the count rather than freezing it", async () => {
  // Two on the game again so there is a number to freeze.
  await b.getByText("Ladies Presidents Final").first().click();
  await a.waitForSelector("text=2 watching", { timeout: 10000 });
  await api("/control/kill-stream");
  await a.waitForFunction(() => !/\d+ watching/.test(document.body.innerText), null, { timeout: 15000 });
});

await api("/control/reset");   // leave it as we found it
await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
