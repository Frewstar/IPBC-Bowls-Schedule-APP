// ── Signing out, through the real UI, including the reload ─────────────────
//
//   node test/harness/run-app-harness.mjs test/signOut.e2e.mjs
//
// The unit tests drive endSession() and stop. That tests the function; the bug
// was in what the NEXT STARTUP did with what it left behind. So this drives
// the shipping App.jsx in a browser and does what Joseph did: sign in, tap
// "Switch account / update PIN", then RELOAD.
//
// The session store lives in localStorage under a key the app never touches,
// so it survives the reload the way the database does — otherwise step 3
// cannot be asked at all.
//
// The Supabase client is a real PostgrestClient with only fetch replaced, so
// from() and rpc() return genuine builders: thenables with no `.catch`. A
// hand-rolled mock would have a .catch and would have passed the original
// broken code.

import { chromium } from "playwright";
import assert from "node:assert/strict";

const HARNESS = "http://127.0.0.1:4600/app.html";

const pass = [], fail = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); console.log("  ok   ", name); }
  catch (e) { fail.push(name); console.log("  FAIL ", name, "\n         ", e.message.split("\n")[0]); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("pageerror", e => console.log("     [page error]", e.message));

const sessions   = () => page.evaluate(() => window.__harness.sessionCount());
const signOuts   = () => page.evaluate(() => window.__harness.rpcCalls("bowls_sign_out").length);
const stateCalls = () => page.evaluate(() => window.__harness.rpcCalls("bowls_session_state").length);
const storage    = () => page.evaluate(() => Object.fromEntries(
  Object.entries(localStorage).filter(([k]) => k.startsWith("bowls_"))));

await page.goto(HARNESS);

// First-run intro overlays the page and swallows clicks.
const skip = page.getByRole("button", { name: /Skip intro/i });
if (await skip.count()) { await skip.click(); await page.waitForTimeout(300); }
await page.waitForSelector("text=Welcome");

// ── sign in ───────────────────────────────────────────────────────────────
await page.getByPlaceholder("e.g. J FREW").fill("J FREW");
await page.locator("#pin-input").fill("1234");
await page.getByRole("button", { name: /^Sign In$/ }).click();
await page.waitForSelector("text=J FREW", { timeout: 5000 });

// Signing in with no roster link opens the "Link Your Name" sheet, whose
// backdrop covers the header. Dismiss it the way a member would.
await page.waitForTimeout(500);
await page.mouse.click(20, 20);
await page.waitForTimeout(400);

await check("signing in creates exactly one session", async () => {
  assert.equal(await sessions(), 1);
});

await check("the device is signed in", async () => {
  const s = await storage();
  assert.ok(s.bowls_session_token && s.bowls_session_token !== '""', "no token stored");
  assert.equal(JSON.parse(s.bowls_myname), "J FREW");
});

// ── tap "Switch account / update PIN" ─────────────────────────────────────
await page.locator("button", { hasText: "J FREW" }).first().click();
await page.waitForSelector("text=Switch account / update PIN");
await page.waitForTimeout(700);   // the sheet animates in; its container eats clicks until it settles
await page.getByRole("button", { name: "Switch account / update PIN" }).click({ force: true });
await page.waitForTimeout(800);

await check("the control calls bowls_sign_out", async () => {
  assert.equal(await signOuts(), 1);
});

await check("and the session row is gone", async () => {
  assert.equal(await sessions(), 0);
});

await check("the UI shows the sign-in screen", async () => {
  await page.waitForSelector("text=Update Sign-in", { timeout: 3000 });
});

await check("and the device has forgotten the token", async () => {
  const s = await storage();
  assert.equal(JSON.parse(s.bowls_session_token || '""'), "", "token still stored");
  assert.equal(JSON.parse(s.bowls_myname || '""'), "", "name still stored");
});

// ── THE RELOAD. This is the step that was missing. ────────────────────────
const before = await sessions();
await page.reload();
await page.waitForSelector("text=Welcome, text=Update Sign-in", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(800);

await check("reload: still zero sessions — nothing was resurrected", async () => {
  assert.equal(await sessions(), before);
  assert.equal(await sessions(), 0);
});

await check("reload: the member is NOT signed back in", async () => {
  const s = await storage();
  assert.equal(JSON.parse(s.bowls_myname || '""'), "", "signed back in as somebody");
  await page.waitForSelector("text=Welcome", { timeout: 3000 });
});

await check("reload: no token was presented to the server", async () => {
  // A token presented on startup is what advanced last_seen_at on Joseph's
  // row. After a sign-out there is nothing to present, so bowls_session_state
  // must not be called at all.
  assert.equal(await stateCalls(), 0);
});

await check("reload: signed-out survives the reload", async () => {
  const s = await storage();
  assert.equal(JSON.parse(s.bowls_signed_out || "false"), true);
});

await check("reload: no sign-out is left owing", async () => {
  const s = await storage();
  assert.deepEqual(JSON.parse(s.bowls_pending_signout || "[]"), []);
});

await browser.close();

console.log(`\n${pass.length} passed, ${fail.length} failed\n`);
process.exit(fail.length ? 1 : 0);
