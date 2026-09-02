// ════════════════════════════════════════════════════════════════════════════
//  Setting up a game — asserted on the row, not on the form.
//
//  The form opening a dropdown proves nothing. Every check here drives the
//  real CreateGame through Chromium and then reads the row the insert
//  produced, because the row is what the club sees a week later and what any
//  future grouping of games has to work from. What is pinned:
//
//    • pairs, triples and fours store a full side each way — 2/2, 3/3, 4/4 —
//      with the names that were picked, in the order they were picked
//    • `discipline` is written from the picker, never left at its "team"
//      default, INCLUDING for a team match, where it now records the size the
//      rinks are played at rather than the shape of the fixture
//    • a team match records who played, rink by rink, and its squad is the sum
//      of its rinks
//    • the team-name string is the club's own — ", " between, " & " before the
//      last — at every size
//    • ends_total is whatever was set, not a hard-coded 15 or 17
//
//  The triples case is the one Jim was blocked on. To mutation-check it, cap
//  the picker — in src/components/tabs/LiveGames.jsx, MemberPicker's caller
//  for the fixed-size disciplines, change `max={disc.players}` to `max={2}` —
//  and "triples stores three a side" must fail. If it still passes, this file
//  is not testing what it says it is.
//
//  Run:  node test/liveGameSetup.e2e.mjs
//  It starts its own mock backend and its own dev server; nothing else needed.
// ════════════════════════════════════════════════════════════════════════════
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { start } from "./harness/server.mjs";

// Bare "playwright" when the project has it, the sandbox's global copy when it
// does not — the same install track0.states.mjs reaches for.
const { chromium } = await import("playwright")
  .catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));

const HARNESS = "http://127.0.0.1:4598";
const API = "http://127.0.0.1:4599";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const rows = () => fetch(`${API}/rows`).then(r => r.json());
const latest = async () => {
  const all = await rows();
  return all[all.length - 1];
};

const pass = [], fail = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); console.log("  ✅", name); }
  catch (e) { fail.push(name); console.log("  ❌", name, "\n     ", e.message.split("\n")[0]); }
};

// ── the world ───────────────────────────────────────────────────────────────
const backend = await start(4599, []);
const vite = spawn("npx", ["vite", "--config", "test/harness/vite.config.mjs"],
  { stdio: "ignore", detached: true });
const upBy = Date.now() + 60000;
for (;;) {
  try { if ((await fetch(HARNESS)).ok) break; } catch {}
  if (Date.now() > upBy) throw new Error("dev server never came up on 4598");
  await new Promise(r => setTimeout(r, 400));
}

const browser = await chromium.launch({
  ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ["--disable-background-networking", "--disable-component-update"],
});

// ── driving the form ────────────────────────────────────────────────────────
// One helper, because every case is the same handful of taps with different
// answers. It returns the row that was actually stored.
async function setUp({ type, internal = false, home = [], away = [], rinkSize, rinks = [], numRinks, opponent, ends, title }) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${HARNESS}/?name=J%20LAW&cloudkey=JIM-1&member=m8`);
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: type, exact: true }).click();
  if (internal) await page.getByRole("button", { name: "Two of our own" }).click();
  if (title) await page.getByPlaceholder("e.g. Ayrshire Cup").fill(title);

  if (numRinks !== undefined) {
    const label = numRinks < 4 ? "One rink fewer" : "One rink more";
    for (let n = 0; n < Math.abs(numRinks - 4); n++) await page.getByRole("button", { name: label }).click();
  }
  if (rinkSize) await page.getByRole("button", { name: rinkSize, exact: true }).click();

  // Fails on the name it could not add, not thirty seconds later on a timeout:
  // a picker that has closed because it thinks the side is full is exactly the
  // bug these tests exist to catch, so it has to read as that and not as a
  // flaky locator.
  const pick = async (ariaLabel, names) => {
    for (const [n, name] of names.entries()) {
      const box = page.getByLabel(ariaLabel, { exact: true });
      if (await box.count() === 0) {
        throw new Error(`"${ariaLabel}" stopped taking names at ${n} of ${names.length} — it will not accept ${name}`);
      }
      await box.fill(name.slice(0, 4));
      const option = page.getByRole("button", { name, exact: true }).first();
      await option.waitFor({ state: "visible", timeout: 4000 });
      await option.click();
    }
  };
  if (home.length) await pick(internal ? "First side" : "IPBC players", home);
  if (away.length) await pick("Second side", away);
  for (const [i, lineUp] of rinks.entries()) {
    if (lineUp.home?.length) await pick(`Rink ${i + 1} ${internal ? "first side" : "IPBC players"}`, lineUp.home);
    if (lineUp.away?.length) await pick(`Rink ${i + 1} second side`, lineUp.away);
  }

  if (opponent !== undefined) await page.getByPlaceholder("Opponent").fill(opponent);
  if (ends !== undefined) {
    await page.getByRole("button", { name: "Set number of ends" }).click();
    // 15 is where the stepper starts; step to whatever this game is.
    const step = page.getByRole("button", { name: ends < 15 ? "One end fewer" : "One end more" });
    for (let n = 0; n < Math.abs(ends - 15); n++) await step.click();
  }

  await page.getByRole("button", { name: /Start live game/ }).click();
  await page.waitForTimeout(700);
  assert.deepEqual(errors, [], "the form threw while being filled in");
  const row = await latest();
  return { row, page };
}

const NAMES = {
  pairsHome:   ["L BROWN", "C MCCLEAN"],
  pairsAway:   ["L MAIR", "N POLLOCK"],
  triplesHome: ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON"],
  triplesAway: ["L MAIR", "N POLLOCK", "S COUSER"],
  foursHome:   ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON", "L HART"],
  foursAway:   ["L MAIR", "N POLLOCK", "S COUSER", "J LAW"],
};

console.log("\nA single match keeps a full side either way\n");

await check("pairs stores two a side", async () => {
  const { row, page } = await setUp({ type: "Pairs", internal: true, home: NAMES.pairsHome, away: NAMES.pairsAway });
  assert.equal(row.format, "single");
  assert.equal(row.discipline, "pairs");
  assert.deepEqual(row.home_players, NAMES.pairsHome);
  assert.deepEqual(row.away_players, NAMES.pairsAway);
  assert.equal(row.home_team, "L BROWN & C MCCLEAN");
  assert.equal(row.away_team, "L MAIR & N POLLOCK");
  await page.close();
});

// The case Jim was blocked on, and the one to break when mutation-checking.
await check("triples stores three a side", async () => {
  const { row, page } = await setUp({ type: "Triples", internal: true, home: NAMES.triplesHome, away: NAMES.triplesAway, ends: 15 });
  assert.equal(row.discipline, "triples", "the discipline must come from the picker, not the default");
  assert.equal(row.home_players.length, 3, `three were picked, ${row.home_players.length} were stored`);
  assert.equal(row.away_players.length, 3, `three were picked, ${row.away_players.length} were stored`);
  assert.deepEqual(row.home_players, NAMES.triplesHome);
  assert.deepEqual(row.away_players, NAMES.triplesAway);
  // The shape Pamela's row already has in production, name for name.
  assert.equal(row.home_team, "L BROWN, C MCCLEAN & MADGE WILLIAMSON");
  assert.equal(row.away_team, "L MAIR, N POLLOCK & S COUSER");
  assert.equal(row.ends_total, 15);
  await page.close();
});

await check("fours stores four a side", async () => {
  const { row, page } = await setUp({ type: "Rinks", internal: true, home: NAMES.foursHome, away: NAMES.foursAway });
  assert.equal(row.discipline, "rinks");
  assert.deepEqual(row.home_players, NAMES.foursHome);
  assert.deepEqual(row.away_players, NAMES.foursAway);
  assert.equal(row.home_team, "L BROWN, C MCCLEAN, MADGE WILLIAMSON & L HART");
  await page.close();
});

console.log("\nA team match records who played, rink by rink\n");

await check("a team match stores a line-up on every rink", async () => {
  const { row, page } = await setUp({
    type: "Team match", numRinks: 2, rinkSize: "3 a side", opponent: "SALTCOATS", ends: 17,
    rinks: [
      { home: ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON"] },
      { home: ["L MAIR", "N POLLOCK", "S COUSER"] },
    ],
  });
  assert.equal(row.format, "rinks");
  assert.equal(row.rinks.length, 2);
  assert.deepEqual(row.rinks[0].home_players, ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON"]);
  assert.deepEqual(row.rinks[1].home_players, ["L MAIR", "N POLLOCK", "S COUSER"]);
  // Scores still start where they always did.
  assert.deepEqual(row.rinks.map(r => [r.home, r.away]), [[0, 0], [0, 0]]);
  assert.equal(row.ends_total, 17, "17 was chosen; nothing may hard-code 15");
  await page.close();
});

await check("a team match records the size its rinks are played at", async () => {
  const { row, page } = await setUp({
    type: "Team match", numRinks: 1, rinkSize: "2 a side", opponent: "ARDROSSAN", title: "Balloted Pairs",
    rinks: [{ home: ["L BROWN", "C MCCLEAN"] }],
  });
  // The Balloted Pairs row in production says "team", which is the default and
  // tells you nothing. A pairs night is now stored as pairs.
  assert.equal(row.discipline, "pairs");
  assert.equal(row.rinks[0].home_players.length, 2);
  await page.close();
});

await check("the squad on a team match is the sum of its rinks", async () => {
  const { row, page } = await setUp({
    type: "Team match", numRinks: 2, rinkSize: "2 a side", opponent: "KILWINNING",
    rinks: [
      { home: ["L BROWN", "C MCCLEAN"] },
      { home: ["L MAIR", "N POLLOCK"] },
    ],
  });
  // It used to be empty on every team match, which is why "who played in the
  // Ayrshire tie" was not a question the row could answer.
  assert.deepEqual(row.home_players, ["L BROWN", "C MCCLEAN", "L MAIR", "N POLLOCK"]);
  await page.close();
});

await check("an internal team match fills both sides of every rink", async () => {
  const { row, page } = await setUp({
    type: "Team match", internal: true, numRinks: 1, rinkSize: "3 a side",
    rinks: [{ home: ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON"], away: ["L MAIR", "N POLLOCK", "S COUSER"] }],
  });
  assert.deepEqual(row.rinks[0].home_players, ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON"]);
  assert.deepEqual(row.rinks[0].away_players, ["L MAIR", "N POLLOCK", "S COUSER"]);
  assert.deepEqual(row.away_players, ["L MAIR", "N POLLOCK", "S COUSER"]);
  assert.equal(row.home_team, "L BROWN, C MCCLEAN & MADGE WILLIAMSON");
  await page.close();
});

await check("a team match set up before the draw is made still stores", async () => {
  // The old behaviour, kept: line-ups are optional, so the fixture can go up
  // the moment it is known and the names can follow.
  const { row, page } = await setUp({ type: "Team match", numRinks: 3, opponent: "LARGS" });
  assert.equal(row.rinks.length, 3);
  assert.deepEqual(row.home_players, []);
  assert.deepEqual(row.rinks[0].home_players, []);
  await page.close();
});

console.log("\nWhat the scoreboard shows\n");

await check("the rink line-ups reach the scoreboard", async () => {
  const { row, page } = await setUp({
    type: "Team match", numRinks: 1, rinkSize: "3 a side", opponent: "SALTCOATS",
    rinks: [{ home: ["L BROWN", "C MCCLEAN", "MADGE WILLIAMSON"] }],
  });
  await page.waitForSelector("text=RINK 1");
  const shown = await page.locator("body").innerText();
  assert.match(shown, /L BROWN, C MCCLEAN, MADGE WILLIAMSON/, "the line-up should be on the rink card");
  assert.match(shown, /Team match · Triples/, "a team match should say how big its rinks are");
  assert.ok(row.id);
  await page.close();
});

// ── down ────────────────────────────────────────────────────────────────────
await browser.close();
backend.close();
try { process.kill(-vite.pid); } catch {}
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
