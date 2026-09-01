import { test } from "node:test";
import assert from "node:assert/strict";
import { tournamentVisibleToMember, matchesSectionFilter, baseSection, isSeniorSection } from "../src/lib/sections.js";

// The nine senior competitions in production on 1 Sep 2026, as tagged.
const LIVE_SENIORS = [
  ["seniors-championship",        "gents-seniors"],
  ["seniors-pairs",               "gents-seniors"],
  ["seniors-triples",             "gents-seniors"],
  ["ladies-seniors-championship", "ladies-seniors"],
  ["ladies-seniors-pairs",        "ladies-seniors"],
  ["senior-singles",              "seniors"],
  ["senior-pairs",                "seniors"],
  ["senior-triples",              "seniors"],
  ["senior-rinks",                "seniors"],
];

test("the 2026 senior comps were invisible to everyone — they are not now", () => {
  // gents-seniors / ladies-seniors matched none of the four old branches and
  // fell through to `return false`, so all five vanished from the app.
  const NEW = LIVE_SENIORS.filter(([, sec]) => sec !== "seniors");
  assert.equal(NEW.length, 5);
  for (const [id, sec] of NEW) {
    const seenBySomeone = ["gents", "ladies", "gents-senior", "ladies-senior"]
      .some(m => tournamentVisibleToMember(sec, m));
    assert.ok(seenBySomeone, `${id} (${sec}) must be visible to someone`);
  }
});

test("a Gents Senior sees 3 gents-seniors + 4 generic, and none of the ladies ones", () => {
  const seen = LIVE_SENIORS.filter(([, s]) => tournamentVisibleToMember(s, "gents-senior")).map(([id]) => id);
  assert.equal(seen.length, 7);
  assert.ok(seen.includes("seniors-championship"));
  assert.ok(seen.includes("senior-rinks"));
  assert.ok(!seen.includes("ladies-seniors-pairs"), "must not see the ladies senior set");
});

test("a Ladies Senior sees 2 ladies-seniors + 4 generic, and none of the gents ones", () => {
  const seen = LIVE_SENIORS.filter(([, s]) => tournamentVisibleToMember(s, "ladies-senior")).map(([id]) => id);
  assert.equal(seen.length, 6);
  assert.ok(seen.includes("ladies-seniors-championship"));
  assert.ok(seen.includes("senior-triples"));
  assert.ok(!seen.includes("seniors-pairs"), "must not see the gents senior set");
});

test("a non-senior member sees no senior competition at all", () => {
  for (const m of ["gents", "ladies"]) {
    const seen = LIVE_SENIORS.filter(([, s]) => tournamentVisibleToMember(s, m));
    assert.equal(seen.length, 0, `${m} should see no senior comps`);
  }
});

test("the ordinary sections still behave, seniors included", () => {
  assert.ok(tournamentVisibleToMember("gents",  "gents"));
  assert.ok(tournamentVisibleToMember("gents",  "gents-senior"), "a Gents Senior is still a Gent");
  assert.ok(tournamentVisibleToMember("ladies", "ladies-senior"), "a Ladies Senior is still a Lady");
  assert.ok(!tournamentVisibleToMember("gents", "ladies"));
  assert.ok(!tournamentVisibleToMember("ladies", "gents-senior"));
  for (const m of ["gents", "ladies", "gents-senior", "ladies-senior"]) {
    assert.ok(tournamentVisibleToMember("mixed", m), "mixed is for everyone");
  }
});

test("an unknown tag is shown to nobody rather than to the wrong section", () => {
  for (const m of ["gents", "ladies", "gents-senior", "ladies-senior"]) {
    assert.equal(tournamentVisibleToMember("juniors", m), false);
  }
});

test("the Settings Seniors chip finds all nine, not four", () => {
  const under = f => LIVE_SENIORS.filter(([, s]) => matchesSectionFilter(s, f)).length;
  assert.equal(under("seniors"), 9);
  assert.equal(under("all"), 9);
  assert.equal(under("gents"), 0, "the Gents chip is the plain section, not its senior set");
  assert.equal(under("ladies"), 0);
});

test("the Settings chips still split the plain sections", () => {
  assert.ok(matchesSectionFilter("gents", "gents"));
  assert.ok(matchesSectionFilter("ladies", "ladies"));
  assert.ok(matchesSectionFilter("mixed", "mixed"));
  assert.ok(matchesSectionFilter("gents", "all"));
  assert.ok(!matchesSectionFilter("gents", "ladies"));
});

test("helpers read the two vocabularies", () => {
  assert.equal(baseSection("gents-senior"), "gents");
  assert.equal(baseSection("ladies-seniors"), "ladies");
  assert.equal(baseSection(undefined), "gents");
  assert.ok(isSeniorSection("gents-senior"));
  assert.ok(isSeniorSection("seniors"));
  assert.ok(!isSeniorSection("gents"));
});
