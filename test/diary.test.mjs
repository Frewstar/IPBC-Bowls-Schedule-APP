import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClockToMinutes, fmtMinutes, fmtMinutesRange,
  mergeDiary, byDateThenClock, groupByDay, byKindThenClock, KIND_FIXTURE, KIND_EVENT,
} from "../src/lib/diary.js";

// ── Every distinct club_fixtures."time" in production on 1 Sep 2026 ─────────
// Read straight off the table; the counts are there so a future reader can see
// this was the whole set and not a sample.
const LIVE_FIXTURE_TIMES = [
  ["9.30am",  570, 4], ["10.00am", 600, 1], ["11.00am", 660, 4],
  ["12.00pm", 720, 3], ["1.00pm",  780, 3], ["1.30pm",  810, 6],
  ["2.00pm",  840, 4], ["2:00pm",  840, 1], ["5.30pm", 1050, 1],
  ["6.30pm", 1110, 8],
];

test("every fixture time in production parses", () => {
  let rows = 0;
  for (const [raw, mins, n] of LIVE_FIXTURE_TIMES) {
    assert.equal(parseClockToMinutes(raw), mins, `${raw} should be ${mins}`);
    rows += n;
  }
  assert.equal(rows, 35, "the sample should account for all 35 fixtures");
});

test("12.00pm is midday and 12am is midnight — the two that trip everyone", () => {
  assert.equal(parseClockToMinutes("12.00pm"), 720);
  assert.equal(parseClockToMinutes("12pm"),    720);
  assert.equal(parseClockToMinutes("12am"),      0);
  assert.equal(parseClockToMinutes("12.30am"),  30);
});

test("the hand-typed shapes the brief warned about", () => {
  assert.equal(parseClockToMinutes("2pm"),    840);
  assert.equal(parseClockToMinutes("2 pm"),   840);
  assert.equal(parseClockToMinutes("14:00"),  840);
  assert.equal(parseClockToMinutes("14.00"),  840);
  assert.equal(parseClockToMinutes("2:00PM"), 840);
});

test("unreadable times are null, never a guess", () => {
  for (const bad of [null, undefined, "", "   ", "teatime", "2", "25:00", "2.75pm", "13pm", "0pm", "abc"]) {
    assert.equal(parseClockToMinutes(bad), null, `${JSON.stringify(bad)} should not parse`);
  }
});

// ── Rendering matches What's On's existing output ───────────────────────────
test("event times render exactly as What's On already renders them", () => {
  assert.equal(fmtMinutesRange(parseClockToMinutes("16:00"), parseClockToMinutes("21:00")), "4–9pm");
  assert.equal(fmtMinutesRange(parseClockToMinutes("20:00"), parseClockToMinutes("00:00")), "8pm–midnight");
  assert.equal(fmtMinutesRange(parseClockToMinutes("14:00"), null), "2pm");
  assert.equal(fmtMinutesRange(parseClockToMinutes("11:00"), parseClockToMinutes("13:00")), "11am–1pm");
  assert.equal(fmtMinutesRange(parseClockToMinutes("18:00"), parseClockToMinutes("00:00")), "6pm–midnight");
});

test("fixture times render in the same style as events", () => {
  assert.equal(fmtMinutes(parseClockToMinutes("1.30pm")), "1.30pm");
  assert.equal(fmtMinutes(parseClockToMinutes("2.00pm")), "2pm");
  assert.equal(fmtMinutes(parseClockToMinutes("9.30am")), "9.30am");
  assert.equal(fmtMinutes(parseClockToMinutes("12.00pm")), "12pm");
});

// ── Ordering ────────────────────────────────────────────────────────────────
test("the two formats interleave correctly on one day", () => {
  // 5 Sep: fixture at 9.30am, event 8pm–midnight. Sorted as strings the
  // event's "20:00" would come first, which is the bug this guards.
  const merged = mergeDiary(
    [{ id: "f", event_date: "2026-09-05", event: "Ruth McNab Pairs", time: "9.30am", venue: "home", rinks: null }],
    [{ id: "e", event_date: "2026-09-05", title: "Live music George Hoffin", start_time: "20:00", end_time: "00:00" }],
  );
  assert.deepEqual(merged.map(i => i.title), ["Ruth McNab Pairs", "Live music George Hoffin"]);
  assert.deepEqual(merged.map(i => i.timeLabel), ["9.30am", "8pm–midnight"]);
  assert.deepEqual(merged.map(i => i.kind), [KIND_FIXTURE, KIND_EVENT]);
});

test("an unreadable time sorts last that day but stays in the list", () => {
  const merged = mergeDiary(
    [{ id: "f1", event_date: "2026-09-05", event: "Mystery", time: "teatime", venue: "home" },
     { id: "f2", event_date: "2026-09-05", event: "Later",   time: "6.30pm",  venue: "home" }],
    [{ id: "e1", event_date: "2026-09-05", title: "Karaoke", start_time: "16:00", end_time: "21:00" }],
  );
  assert.deepEqual(merged.map(i => i.title), ["Karaoke", "Later", "Mystery"]);
  // and the typed text survives even though it could not be placed
  assert.equal(merged.find(i => i.title === "Mystery").timeLabel, "teatime");
});

test("byDateThenClock puts earlier dates first regardless of clock", () => {
  const a = { date: "2026-09-05", startMins: 1200 };
  const b = { date: "2026-09-06", startMins: 60 };
  assert.ok(byDateThenClock(a, b) < 0);
});

// ── Normalising ─────────────────────────────────────────────────────────────
test("a cancelled event stays in the diary and carries its flag", () => {
  const [item] = mergeDiary([], [{ id: "x", event_date: "2026-09-06", title: "Karaoke", start_time: "16:00", cancelled: true }]);
  assert.equal(item.cancelled, true);
  assert.equal(item.title, "Karaoke");
});

test("fixtures carry venue and rinks; events carry poster and series", () => {
  const [fx] = mergeDiary([{ id: "f", event_date: "2026-09-19", event: "Glasgow Ayrshire Presentation", time: "2:00pm", venue: "away", rinks: 6 }], []);
  assert.equal(fx.venue, "away");
  assert.equal(fx.rinks, 6);
  assert.equal(fx.cancelled, false);

  const [ev] = mergeDiary([], [{ id: "e", event_date: "2026-09-05", title: "Live music", start_time: "20:00", poster_path: "a/b/c.jpg", series_id: "s1" }]);
  assert.equal(ev.posterPath, "a/b/c.jpg");
  assert.equal(ev.seriesId, "s1");
});

test("keys are unique across sources even if the two ids collide", () => {
  const merged = mergeDiary(
    [{ id: "same", event_date: "2026-09-05", event: "F", time: "1pm", venue: "home" }],
    [{ id: "same", event_date: "2026-09-05", title: "E", start_time: "13:00" }],
  );
  assert.equal(new Set(merged.map(i => i.key)).size, 2);
});

// ── Day grouping ────────────────────────────────────────────────────────────
test("every date becomes a block, one item or several", () => {
  const days = groupByDay(mergeDiary(
    [{ id: "f1", event_date: "2026-09-02", event: "Charity Day", time: "2.00pm", venue: "home" },
     { id: "f2", event_date: "2026-09-05", event: "Ruth McNab Pairs", time: "9.30am", venue: "home" }],
    [{ id: "e1", event_date: "2026-09-05", title: "Live music George Hoffin", start_time: "20:00", end_time: "00:00" },
     { id: "e2", event_date: "2026-09-06", title: "Karaoke", start_time: "16:00", end_time: "21:00" }],
  ));
  assert.deepEqual(days.map(d => d.date), ["2026-09-02", "2026-09-05", "2026-09-06"]);
  assert.deepEqual(days.map(d => d.items.length), [1, 2, 1]);
  // 5 Sep: bowls in the morning, band in the evening — one block, both facts.
  assert.deepEqual(days[1].items.map(i => i.title), ["Ruth McNab Pairs", "Live music George Hoffin"]);
});

test("bowls lead the day even when the social is earlier on the clock", () => {
  // Does not occur in production today; this pins the rule down so it cannot
  // drift into clock-order by accident.
  const [day] = groupByDay(mergeDiary(
    [{ id: "f", event_date: "2026-09-12", event: "Gents Trials", time: "6.30pm", venue: "home" }],
    [{ id: "e", event_date: "2026-09-12", title: "Coffee morning", start_time: "11:00" }],
  ));
  assert.deepEqual(day.items.map(i => i.title), ["Gents Trials", "Coffee morning"]);
  assert.deepEqual(day.items.map(i => i.timeLabel), ["6.30pm", "11am"]);
});

test("two socials and no fixture fall back to the clock", () => {
  const [day] = groupByDay(mergeDiary([], [
    { id: "b", event_date: "2026-09-06", title: "Karaoke", start_time: "16:00", end_time: "21:00" },
    { id: "a", event_date: "2026-09-06", title: "Coffee morning", start_time: "10:00" },
  ]));
  assert.deepEqual(day.items.map(i => i.title), ["Coffee morning", "Karaoke"]);
});

test("two fixtures one day also fall back to the clock", () => {
  const [day] = groupByDay(mergeDiary([
    { id: "b", event_date: "2026-09-12", event: "Evening Trials", time: "6.30pm", venue: "home" },
    { id: "a", event_date: "2026-09-12", event: "Morning Pairs", time: "9.30am", venue: "away" },
  ], []));
  assert.deepEqual(day.items.map(i => i.title), ["Morning Pairs", "Evening Trials"]);
});

test("grouping never merges or rewrites a title", () => {
  const [day] = groupByDay(mergeDiary(
    [{ id: "f", event_date: "2026-09-12", event: "Ladies/Gents", time: "1.30pm", venue: "home" }],
    [{ id: "e", event_date: "2026-09-12", title: "Ladies v Gents", start_time: "14:00", detail: "£12 Dancing the night away to Craig McGill" }],
  ));
  assert.deepEqual(day.items.map(i => i.title), ["Ladies/Gents", "Ladies v Gents"]);
  assert.equal(day.items[1].detail, "£12 Dancing the night away to Craig McGill");
  assert.equal(day.items[0].venue, "home");
});

test("byKindThenClock is stable for identical items", () => {
  const a = { kind: KIND_EVENT, startMins: 600 };
  const b = { kind: KIND_EVENT, startMins: 600 };
  assert.equal(byKindThenClock(a, b), 0);
});
