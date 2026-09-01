// ════════════════════════════════════════════════════════════════════════════
//  Going live by mistake — the confirmation and the undo, in a browser
//
//  Drives the real LiveGames tab against the harness (test/harness), with the
//  Supabase client swapped for the mock and nothing else. Asserts what the
//  buttons and the prompts actually SAY, not that no error appeared: a
//  confirmation that fires with the wrong date in it, or an undo that puts a
//  scored game back without mentioning the score, would both pass a test that
//  only checked the status changed.
//
//  Starts the harness itself.  Run:  node test/liveGameGuards.e2e.mjs
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const HARNESS = "http://127.0.0.1:4598";
const API     = "http://127.0.0.1:4599";

const now = new Date();
const atLocal = (d, hh, mm = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).toISOString();
const plusDays = n => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };

const TEN_DAYS = plusDays(10);
const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Worked out here independently of the source, so a wrong label in the app
// cannot agree with a wrong label in the test.
const TEN_DAYS_LABEL = `${DAYS[TEN_DAYS.getDay()]} ${TEN_DAYS.getDate()} ${MONTHS[TEN_DAYS.getMonth()]}`;

const base = {
  format: "single", home_score: 0, away_score: 0, ends_played: 0, ends_total: 0,
  rinks: [], location: "Irvine Park", discipline: "triples",
  creator_member_id: "member-marker", creator_name: "MARKER",
  updated_at: new Date(Date.now() - 60000).toISOString(),
};
const SEED = [
  { ...base, id: "g-early", title: "Ladies Triples Final", home_team: "L BROWN & C MCCLEAN", away_team: "L MAIR & N POLLOCK",
    status: "scheduled", ends_total: 15, starts_at: atLocal(TEN_DAYS, 18, 30) },
  { ...base, id: "g-today", title: "Tonight", home_team: "TONIGHT HOME", away_team: "TONIGHT AWAY",
    status: "scheduled", starts_at: atLocal(now, 19, 0) },
  { ...base, id: "g-nostart", title: "On the spot", home_team: "L HART", away_team: "MADGE WILLIAMSON",
    status: "scheduled", starts_at: null },
  { ...base, id: "g-live0", title: "Mis-tap", home_team: "MISTAP HOME", away_team: "MISTAP AWAY",
    status: "live", starts_at: atLocal(TEN_DAYS, 14, 0) },
  { ...base, id: "g-live12", title: "In progress", home_team: "SCORED HOME", away_team: "SCORED AWAY",
    status: "live", home_score: 12, away_score: 8, ends_played: 9, ends_total: 18, starts_at: null },
];

const rows = () => fetch(`${API}/rows`).then(r => r.json());
const row  = async id => (await rows()).find(r => r.id === id);
const waitFor = async (fn, ms = 6000) => {
  const t0 = Date.now();
  for (;;) { if (await fn()) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 150)); }
};

const pass = [], fail = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); console.log("  ✓", name); }
  catch (e) { fail.push(name); console.log("  ✗", name, "\n      ", e.message.split("\n")[0]); }
};

// ── bring the harness up ────────────────────────────────────────────────────
const api = spawn(process.execPath, ["test/harness/server.mjs", "run", "4599"],
  { env: { ...process.env, SEED: JSON.stringify(SEED) }, stdio: "ignore" });
const web = spawn("npx", ["vite", "--config", "test/harness/vite.config.mjs"], { stdio: "ignore" });
const up = async url => { try { await fetch(url); return true; } catch { return false; } };
if (!await waitFor(() => up(`${API}/rows`), 15000)) { console.log("mock backend did not start"); process.exit(1); }
if (!await waitFor(() => up(HARNESS), 30000))       { console.log("harness did not start");      process.exit(1); }

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// Every dialog is recorded and answered as `accept` says. Registering a
// handler also means an UNEXPECTED dialog is caught rather than silently
// auto-dismissed by Playwright.
async function open(gameHome, { who = "MARKER", member = "member-marker", admin = "0", accept = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
  const dialogs = [];
  page.on("dialog", async d => { dialogs.push(d.message()); await (accept ? d.accept() : d.dismiss()); });
  await page.goto(`${HARNESS}/?name=${who}&cloudkey=${who}-1111&member=${member}&admin=${admin}`);
  await page.getByText(gameHome).first().click();
  await page.waitForTimeout(400);
  return { page, dialogs };
}
const tap = async (page, label) => {
  const b = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  await b.click();
  await page.waitForTimeout(500);
};

console.log("\n═══ GO LIVE — only asks when it is actually early ═══");

await check(`a game ten days out asks, naming the date (${TEN_DAYS_LABEL})`, async () => {
  const { page, dialogs } = await open("L BROWN & C MCCLEAN", { accept: false });
  await tap(page, "Go live");
  assert.equal(dialogs.length, 1, `expected one prompt, got ${dialogs.length}`);
  assert.equal(dialogs[0], `This is scheduled for ${TEN_DAYS_LABEL}. Start it anyway?`);
  await page.close();
});

await check("cancelling leaves it scheduled — on screen and in the row", async () => {
  const { page } = await open("L BROWN & C MCCLEAN", { accept: false });
  await tap(page, "Go live");
  assert.equal((await row("g-early")).status, "scheduled", "the row was changed by a cancelled prompt");
  // Presence, not absence: the scheduled notice is still the thing on screen.
  await page.waitForSelector("text=/Not started yet/");
  assert.equal(await page.getByRole("button", { name: /Go live/i }).count(), 1, "Go live should still be the button");
  await page.close();
});

await check("accepting the prompt does take it live", async () => {
  const { page, dialogs } = await open("L BROWN & C MCCLEAN", { accept: true });
  await tap(page, "Go live");
  assert.equal(dialogs.length, 1);
  assert.ok(await waitFor(async () => (await row("g-early")).status === "live"), "row never went live");
  await page.waitForSelector("text=Mark as finished");
  await page.close();
});

await check("a game with no starts_at is still one tap, no prompt", async () => {
  const { page, dialogs } = await open("L HART", { accept: false });
  await tap(page, "Go live");
  assert.deepEqual(dialogs, [], `unexpected prompt: ${dialogs[0]}`);
  assert.ok(await waitFor(async () => (await row("g-nostart")).status === "live"), "row did not go live");
  await page.close();
});

await check("a game starting today is still one tap, no prompt", async () => {
  const { page, dialogs } = await open("TONIGHT HOME", { accept: false });
  await tap(page, "Go live");
  assert.deepEqual(dialogs, [], `unexpected prompt: ${dialogs[0]}`);
  assert.ok(await waitFor(async () => (await row("g-today")).status === "live"), "row did not go live");
  await page.close();
});

console.log("\n═══ THE UNDO ═══");

await check("a live game at 0–0 offers 'Back to scheduled'", async () => {
  const { page } = await open("MISTAP HOME");
  const btn = page.getByRole("button", { name: /Back to scheduled/i });
  assert.equal(await btn.count(), 1, "the undo button is not on screen");
  assert.match((await btn.first().innerText()).trim(), /^Back to scheduled$/);
  await page.close();
});

await check("at 0–0 with no ends it goes back with no prompt at all", async () => {
  const { page, dialogs } = await open("MISTAP HOME", { accept: false });
  await tap(page, "Back to scheduled");
  assert.deepEqual(dialogs, [], `unexpected prompt: ${dialogs[0]}`);
  assert.ok(await waitFor(async () => (await row("g-live0")).status === "scheduled"), "row did not go back");
  await page.waitForSelector("text=/Not started yet/");
  await page.close();
});

await check("a scored game asks, quoting the score, and says it is kept", async () => {
  const { page, dialogs } = await open("SCORED HOME", { accept: false });
  await tap(page, "Back to scheduled");
  assert.equal(dialogs.length, 1, `expected one prompt, got ${dialogs.length}`);
  assert.equal(dialogs[0],
    "This game has 12–8 recorded and 9 ends played. Put it back to scheduled? The score is kept.");
  assert.equal((await row("g-live12")).status, "live", "a cancelled prompt changed the row");
  await page.close();
});

await check("accepting puts it back AND the score survives", async () => {
  const { page } = await open("SCORED HOME", { accept: true });
  await tap(page, "Back to scheduled");
  assert.ok(await waitFor(async () => (await row("g-live12")).status === "scheduled"), "row did not go back");
  const r = await row("g-live12");
  assert.equal(r.home_score, 12, "home score lost");
  assert.equal(r.away_score, 8,  "away score lost");
  assert.equal(r.ends_played, 9, "ends lost");
  await page.close();
});

console.log("\n═══ WHO SEES IT ═══");

await check("a member who is neither creator nor admin sees no undo", async () => {
  // g-live0 was put back to scheduled above; use a game that is live now.
  await fetch(`${API}/update`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "g-live0", patch: { status: "live", updated_at: new Date().toISOString() } }) });
  const { page } = await open("MISTAP HOME", { who: "STRANGER", member: "member-stranger", admin: "0" });
  assert.equal(await page.getByRole("button", { name: /Back to scheduled/i }).count(), 0, "the undo is showing to a stranger");
  assert.equal(await page.getByRole("button", { name: /Mark as finished/i }).count(), 0, "finish is showing to a stranger");
  // Presence: they do get the follower's notice, so the page did render.
  await page.waitForSelector("text=/Following live|Not live/");
  await page.close();
});

await check("an admin who is not the creator does see the undo", async () => {
  const { page } = await open("MISTAP HOME", { who: "BOSS", member: "member-boss", admin: "1" });
  assert.equal(await page.getByRole("button", { name: /Back to scheduled/i }).count(), 1, "an admin should have the undo");
  await page.close();
});

await browser.close();
api.kill(); web.kill();
console.log(`\n${fail.length === 0 ? "ALL CHECKS PASSED" : `${fail.length} CHECK(S) FAILED`} — ${pass.length} passed\n`);
process.exit(fail.length ? 1 : 0);
