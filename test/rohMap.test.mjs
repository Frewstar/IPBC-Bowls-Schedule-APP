// ════════════════════════════════════════════════════════════════════════════
//  ROH_MAP points at categories that exist
//
//  A tournament final maps to an honours board by id. If the id is wrong, the
//  RPC answers `no_category` and the prompt reports it — but nobody is looking,
//  because the failure only happens on the night somebody wins a final.
//  "presidents" pointed at "roh-president" for as long as anyone can remember;
//  it took deleting that stray category to notice, and only then by accident.
//
//  So: read ROH_MAP out of the shipping source and check every value against
//  the category ids production actually holds. This does not know when the
//  database changes — refresh the fixture when categories come and go — but it
//  catches a typo the moment it is typed, and it pins the Presidents pair so
//  the single-Presidents assumption cannot come back.
//
//  ── THIS FILE IS A STOPGAP. RETIRE IT, DO NOT KEEP IT. ─────────────────────
//
//  It is the third instance of one class of fault: the client referencing
//  something the database does not have.
//
//      admin_requests.role_title    button silently did nothing
//      club_events.end_time         button silently did nothing, ten times,
//                                   for Christine
//      ROH_MAP → roh-president      a write path aimed at a category that was
//                                   not there to write to
//
//  All three are what layer 2 of the deploy check was scoped to catch:
//  extract what the client references, query information_schema and the live
//  tables, fail the build on a mismatch. A dangling ROH_MAP value is the same
//  shape as a missing column, and the deploy check reads the database at build
//  time instead of trusting a snapshot somebody has to remember to refresh.
//
//  So when the deploy check lands, DELETE this file and
//  test/fixtures-roh-categories.json rather than running both. A test nobody
//  remembers to update is the next stale pointer — this one rots exactly the
//  way roh-president did, and it would keep passing while it rotted.
// ════════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const block = src.match(/const ROH_MAP = \{([\s\S]*?)\n  \};/);
assert.ok(block, "ROH_MAP not found in src/App.jsx — this test needs updating, not deleting");
const MAP = Object.fromEntries([...block[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(m => [m[1], m[2]]));

const fx = JSON.parse(fs.readFileSync(path.resolve("test/fixtures-roh-categories.json"), "utf8"));
const CATEGORY_IDS  = new Set(fx.categories.map(c => c.id));
const TOURNAMENT_IDS = new Set(fx.tournaments.map(t => t.id));
const seasons = id => fx.categories.find(c => c.id === id)?.seasons;

test("the map is not empty — a passing suite over nothing proves nothing", () => {
  assert.ok(Object.keys(MAP).length >= 14, `only ${Object.keys(MAP).length} entries parsed`);
});

test("every mapped category exists", () => {
  const dangling = Object.entries(MAP).filter(([, cid]) => !CATEGORY_IDS.has(cid));
  assert.deepEqual(dangling, [], `dangling: ${dangling.map(d => d.join(" → ")).join(", ")}`);
});

test("every mapped tournament exists", () => {
  const orphans = Object.keys(MAP).filter(tid => !TOURNAMENT_IDS.has(tid));
  assert.deepEqual(orphans, [], `no such tournament: ${orphans.join(", ")}`);
});

test("no two tournaments share one board", () => {
  const byTarget = {};
  for (const [tid, cid] of Object.entries(MAP)) (byTarget[cid] ||= []).push(tid);
  const shared = Object.entries(byTarget).filter(([, v]) => v.length > 1);
  assert.deepEqual(shared, [], `shared: ${shared.map(([c, v]) => `${c} ← ${v.join("+")}`).join("; ")}`);
});

// The pair this file was written for. Named explicitly, both directions, so a
// future edit that collapses them back into one Presidents fails here.
test("the gents Presidents maps to the gents board, 67 seasons", () => {
  assert.equal(MAP["presidents"], "roh-gents-presidents");
  assert.equal(seasons("roh-gents-presidents"), 67);
});

test("the ladies Presidents maps to the ladies board, 65 seasons", () => {
  assert.equal(MAP["ladies-presidents"], "roh-ladies-presidents");
  assert.equal(seasons("roh-ladies-presidents"), 65);
});

test("they are two different boards", () => {
  assert.notEqual(MAP["presidents"], MAP["ladies-presidents"]);
});

// Mixed Pairs: the board existed with nothing pointing at it, which is the
// same fault as the ladies Presidents seen from the other end.
test("Mixed Pairs maps to the mixed board", () => {
  assert.equal(MAP["mixed-pairs"], "roh-mixed-pairs");
  assert.ok(CATEGORY_IDS.has("roh-mixed-pairs"));
});

// Balloted Pairs is the other mixed competition and has no board of its own.
// Pointing it at roh-mixed-pairs would put two finals on one board, where the
// second would replace the first for that year.
test("Balloted Pairs is deliberately unmapped", () => {
  assert.equal(MAP["balloted-pairs"], undefined);
});

test("roh-president, the stray, is not used as an id anywhere in src/", () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name)) files.push(p);
    }
  })(path.resolve("src"));
  // Comments stripped first: the history of why that id was wrong is worth
  // keeping written down, and this test is about what the code reaches for.
  // Crude enough to mistake a "//" inside a string literal for a comment,
  // which cannot hide an id from this check in any file we have.
  const code = f => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const hits = files.filter(f => /["']roh-president["']/.test(code(f)));
  assert.deepEqual(hits, []);
});
