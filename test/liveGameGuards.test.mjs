// ════════════════════════════════════════════════════════════════════════════
//  When to ask, and what to say
//
//  The three rows below are the three real games in live_games on 1 Sep 2026,
//  copied out of production, because each one is a different case:
//
//    Ladies Triples      scheduled Fri 11 Sep, 0–0, no ends   → the incident
//    Ladies Presidents   no starts_at, 3–21, finished         → must stay 1 tap
//    Balloted Pairs      rinks 17–13, 16 ends, finished       → looks 0–0 on
//                                                                the columns
//
//  That last one is the trap: a `rinks` game keeps 0 in home_score/away_score,
//  so anything reading those columns would call a 17–13 game unscored and put
//  it back without asking.
// ════════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import {
  totalsFor, isSameLocalDay, fmtDayLabel,
  earlyStartWarning, scoreSummary, undoLiveWarning,
} from "../src/lib/liveGameGuards.js";

// Local time, so the tests mean the same thing wherever they run.
const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm);
const iso = date => date.toISOString();

const LADIES_TRIPLES = {
  status: "scheduled", format: "single", home_score: 0, away_score: 0,
  ends_played: 0, ends_total: 15, starts_at: iso(at(2026, 9, 11, 18, 30)),
};
const PRESIDENTS = {
  status: "finished", format: "single", home_score: 3, away_score: 21,
  ends_played: 0, ends_total: null, starts_at: null,
};
const BALLOTED_PAIRS = {
  status: "finished", format: "rinks", home_score: 0, away_score: 0,
  ends_played: 16, ends_total: 17, starts_at: iso(at(2026, 8, 30, 14, 30)),
  rinks: [{ id: "r1", label: "Rink 1", home: 17, away: 13 }],
};

// ── the score, wherever it lives ────────────────────────────────────────────
test("a rinks game's score comes off the rinks, not the columns", () => {
  assert.deepEqual(totalsFor(BALLOTED_PAIRS), { home: 17, away: 13 });
  // The columns it would have been read from, had this gone the obvious way.
  assert.equal(BALLOTED_PAIRS.home_score, 0);
});

test("a single game's score comes off the columns", () => {
  assert.deepEqual(totalsFor(PRESIDENTS), { home: 3, away: 21 });
  assert.deepEqual(totalsFor(LADIES_TRIPLES), { home: 0, away: 0 });
});

test("totalsFor survives a missing game and a missing rinks array", () => {
  assert.deepEqual(totalsFor(null), { home: 0, away: 0 });
  assert.deepEqual(totalsFor({ format: "rinks" }), { home: 0, away: 0 });
});

// ── going live early ────────────────────────────────────────────────────────
test("THE INCIDENT: a game ten days out asks, and names the date", () => {
  const w = earlyStartWarning(LADIES_TRIPLES, at(2026, 9, 1, 15));
  assert.equal(w, "This is scheduled for Fri 11 Sep. Start it anyway?");
});

test("a game with no starts_at is one tap — the Presidents Final case", () => {
  assert.equal(earlyStartWarning(PRESIDENTS, at(2026, 9, 1)), null);
  assert.equal(earlyStartWarning({ starts_at: "" }, at(2026, 9, 1)), null);
});

test("a game starting today is one tap, early in the day or late", () => {
  const today = { starts_at: iso(at(2026, 9, 1, 19, 0)) };
  assert.equal(earlyStartWarning(today, at(2026, 9, 1, 9, 0)), null);
  assert.equal(earlyStartWarning(today, at(2026, 9, 1, 23, 59)), null);
  // Ten hours before it starts is still today, and still no prompt.
  assert.equal(earlyStartWarning({ starts_at: iso(at(2026, 9, 1, 23, 0)) }, at(2026, 9, 1, 13, 0)), null);
});

test("a game left scheduled from last week asks too, not just future ones", () => {
  const w = earlyStartWarning({ starts_at: iso(at(2026, 8, 25, 18, 0)) }, at(2026, 9, 1));
  assert.equal(w, "This is scheduled for Tue 25 Aug. Start it anyway?");
});

test("tomorrow asks, and yesterday asks — one day either side is not today", () => {
  assert.match(earlyStartWarning({ starts_at: iso(at(2026, 9, 2, 10)) }, at(2026, 9, 1, 23)), /Wed 2 Sep/);
  assert.match(earlyStartWarning({ starts_at: iso(at(2026, 8, 31, 23)) }, at(2026, 9, 1, 1)), /Mon 31 Aug/);
});

test("an unreadable starts_at does not block the button", () => {
  assert.equal(earlyStartWarning({ starts_at: "not a date" }, at(2026, 9, 1)), null);
});

test("fmtDayLabel reads the way the fixture list does", () => {
  assert.equal(fmtDayLabel(at(2026, 9, 11)), "Fri 11 Sep");
  assert.equal(fmtDayLabel(at(2026, 1, 1)),  "Thu 1 Jan");
  assert.equal(fmtDayLabel(at(2026, 12, 25)), "Fri 25 Dec");
});

test("isSameLocalDay is about the day, not 24 hours", () => {
  assert.equal(isSameLocalDay(at(2026, 9, 1, 0, 1), at(2026, 9, 1, 23, 59)), true);
  assert.equal(isSameLocalDay(at(2026, 9, 1, 23, 59), at(2026, 9, 2, 0, 1)), false);
});

// ── the undo ────────────────────────────────────────────────────────────────
test("a game at 0–0 with no ends goes back with no prompt", () => {
  assert.equal(scoreSummary(LADIES_TRIPLES), null);
  assert.equal(undoLiveWarning(LADIES_TRIPLES), null);
});

test("a scored game asks, quotes the score, and says it is kept", () => {
  const w = undoLiveWarning({ format: "single", home_score: 12, away_score: 8, ends_played: 0 });
  assert.equal(w, "This game has 12–8 recorded. Put it back to scheduled? The score is kept.");
});

test("THE TRAP: a rinks game at 0 on the columns still asks", () => {
  const w = undoLiveWarning(BALLOTED_PAIRS);
  assert.equal(w, "This game has 17–13 recorded and 16 ends played. Put it back to scheduled? The score is kept.");
});

test("ends alone count as scored — 0–0 after 4 ends is not untouched", () => {
  const w = undoLiveWarning({ format: "single", home_score: 0, away_score: 0, ends_played: 4 });
  assert.equal(w, "This game has 4 ends played. Put it back to scheduled? The score is kept.");
});

test("one end is an end, not 1 ends", () => {
  assert.match(undoLiveWarning({ format: "single", ends_played: 1 }), /has 1 end played/);
});

test("the prompt never promises to discard, and never stays silent about keeping", () => {
  for (const g of [BALLOTED_PAIRS, { format: "single", home_score: 2, away_score: 0 }]) {
    const w = undoLiveWarning(g);
    assert.match(w, /The score is kept\./);
    assert.ok(!/delete|discard|lost|clear/i.test(w), w);
  }
});
