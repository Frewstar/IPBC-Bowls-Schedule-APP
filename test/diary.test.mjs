import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClockToMinutes, fmtMinutes, fmtMinutesRange,
  mergeDiary, byDateThenClock, groupByDay, countByKind, inDateRange, KIND_FIXTURE, KIND_EVENT,
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

test("a day runs forwards on the clock even when the social comes first", () => {
  // The case that decided the rule. A coffee morning at 11am with 6.30pm
  // trials is an ordinary bowls-club day; a bowls-first hierarchy would put
  // 6.30pm above 11am, which reads as a bug. Does not occur in the current
  // season — that is why it needs pinning down.
  const [day] = groupByDay(mergeDiary(
    [{ id: "f", event_date: "2026-09-12", event: "Gents Trials", time: "6.30pm", venue: "home" }],
    [{ id: "e", event_date: "2026-09-12", title: "Coffee morning", start_time: "11:00" }],
  ));
  assert.deepEqual(day.items.map(i => i.title), ["Coffee morning", "Gents Trials"]);
  assert.deepEqual(day.items.map(i => i.timeLabel), ["11am", "6.30pm"]);
  // The badge, not the order, is what says which is which.
  assert.deepEqual(day.items.map(i => i.kind), [KIND_EVENT, KIND_FIXTURE]);
});

test("the four shared dates in the season are unaffected by the flip", () => {
  // On 5, 12, 19 and 26 September the bowls are also the earlier of the two,
  // so clock order and the old bowls-first order agree. Nothing on screen
  // moved when the rule changed.
  const cases = [
    ["2026-09-05", "Ruth McNab Pairs", "9.30am", "Live music George Hoffin", "20:00"],
    ["2026-09-12", "Ladies/Gents",     "1.30pm", "Ladies v Gents",           "14:00"],
    ["2026-09-19", "Glasgow Ayrshire Presentation", "2:00pm", "Glasgow/Ayrshire Presention", "14:00"],
    ["2026-09-26", "Closing Day",      "1.30pm", "Mens Closing Day",         "14:00"],
  ];
  for (const [date, fixture, ftime, event, etime] of cases) {
    const [day] = groupByDay(mergeDiary(
      [{ id: "f", event_date: date, event: fixture, time: ftime, venue: "home" }],
      [{ id: "e", event_date: date, title: event, start_time: etime }],
    ));
    assert.deepEqual(day.items.map(i => i.title), [fixture, event], `${date}: bowls still lead`);
  }
});

test("two socials and no fixture read forwards on the clock", () => {
  const [day] = groupByDay(mergeDiary([], [
    { id: "b", event_date: "2026-09-06", title: "Karaoke", start_time: "16:00", end_time: "21:00" },
    { id: "a", event_date: "2026-09-06", title: "Coffee morning", start_time: "10:00" },
  ]));
  assert.deepEqual(day.items.map(i => i.title), ["Coffee morning", "Karaoke"]);
});

test("two fixtures one day read forwards on the clock", () => {
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

test("one comparator orders the merged list and every day block", () => {
  // groupByDay sorts with byDateThenClock, the same function that orders the
  // merged list and picks nextUp. Within a day the dates are equal, so it is
  // the clock alone.
  const a = { date: "2026-09-06", startMins: 600 };
  const b = { date: "2026-09-06", startMins: 600 };
  assert.equal(byDateThenClock(a, b), 0);
  assert.ok(byDateThenClock({ date: "2026-09-06", startMins: 660 }, { date: "2026-09-06", startMins: 1110 }) < 0);
  // unknown time still last
  assert.ok(byDateThenClock({ date: "2026-09-06", startMins: null }, { date: "2026-09-06", startMins: 1110 }) > 0);
});

test("19 Sep ties on the clock and the fixture still leads, deterministically", () => {
  // Both rows are 840 minutes: the fixture reads "2:00pm", the event "14:00".
  // The clock separates nothing, so the order comes from stable sort over
  // mergeDiary's fixtures-then-events concatenation. Pinned because reversing
  // that concat would flip the day with no other test noticing.
  const fixture = { id: "f", event_date: "2026-09-19", event: "Glasgow Ayrshire Presentation", time: "2:00pm", venue: "home", rinks: 6 };
  const event   = { id: "e", event_date: "2026-09-19", title: "Glasgow/Ayrshire Presention", start_time: "14:00", detail: "Live music Coverstory" };

  const [day] = groupByDay(mergeDiary([fixture], [event]));
  assert.equal(day.items[0].startMins, day.items[1].startMins, "the two genuinely tie");
  assert.deepEqual(day.items.map(i => i.kind), [KIND_FIXTURE, KIND_EVENT]);
  assert.deepEqual(day.items.map(i => i.title),
    ["Glasgow Ayrshire Presentation", "Glasgow/Ayrshire Presention"]);
  // Both facts survive: the bowls on one row, the band on the other.
  assert.equal(day.items[0].rinks, 6);
  assert.equal(day.items[1].detail, "Live music Coverstory");
});

// ── Chip counts ─────────────────────────────────────────────────────────────
// The chips shipped counting the whole season while the list under them showed
// one month: September read "Matches 35" and then rendered six. The e2e that
// was pointed at this measured the ROWS each chip produced, never the number
// printed on the chip, so it passed throughout.
//
// The live rows for the three months that matter. August is included because
// the UI cannot page back to a past month, so the browser test cannot reach it.
const LIVE = {
  fixtures: [
    ["2026-08-01","Bellahouston BC","1.00pm"], ["2026-08-08","Stonehouse BC","1.30pm"],
    ["2026-08-15","Open Triples","9.30am"],    ["2026-08-28","Championship Final","5.30pm"],
    ["2026-08-29","Finals Weekend","12.00pm"], ["2026-08-30","Finals Weekend","12.00pm"],
    ["2026-09-02","Charity Day","2.00pm"],     ["2026-09-05","Ruth McNab Pairs","9.30am"],
    ["2026-09-11","Gents Trials","6.30pm"],    ["2026-09-12","Ladies/Gents","1.30pm"],
    ["2026-09-19","Glasgow Ayrshire Presentation","2:00pm"], ["2026-09-26","Closing Day","1.30pm"],
  ],
  events: [
    ["2026-09-05","Live music George Hoffin","20:00"], ["2026-09-06","Karaoke","16:00"],
    ["2026-09-12","Ladies v Gents","14:00"],           ["2026-09-13","Karaoke","16:00"],
    ["2026-09-19","Glasgow/Ayrshire Presention","14:00"], ["2026-09-20","Karaoke","16:00"],
    ["2026-09-26","Mens Closing Day","14:00"],         ["2026-09-27","Karaoke","16:00"],
    ["2026-10-03","Ladies closing day","14:00"],       ["2026-10-04","Karaoke","16:00"],
    ["2026-10-10","Live music","20:00"],               ["2026-10-11","Karaoke","16:00"],
    ["2026-10-17","Live music","20:00"],               ["2026-10-18","Karaoke","16:00"],
    ["2026-10-23","PRESENTATION DANCE","18:00"],       ["2026-10-25","Tribute to TAKE THAT/WESTLIFE","16:00"],
  ],
};
const liveDiary = () => mergeDiary(
  LIVE.fixtures.map(([event_date, event, time], i) => ({ id: `f${i}`, event_date, event, time, venue: "home" })),
  LIVE.events.map(([event_date, title, start_time], i) => ({ id: `e${i}`, event_date, title, start_time })),
);

test("chip counts are the month on screen, not the season", () => {
  const expected = {
    "2026-08": { all: 6,  matches: 6, socials: 0 },
    "2026-09": { all: 14, matches: 6, socials: 8 },
    "2026-10": { all: 8,  matches: 0, socials: 8 },
  };
  const lastDay = { "2026-08": "31", "2026-09": "30", "2026-10": "31" };
  for (const [month, want] of Object.entries(expected)) {
    const got = countByKind(inDateRange(liveDiary(), `${month}-01`, `${month}-${lastDay[month]}`));
    assert.deepEqual(got, want, `${month} chips`);
  }
});

test("a chip count equals the rows that chip will show — the invariant that broke", () => {
  // Not "the number looks right": the number IS the length of what the filter
  // yields, checked over every month, so the two cannot drift apart again.
  for (const [start, end] of [["2026-08-01","2026-08-31"],["2026-09-01","2026-09-30"],["2026-10-01","2026-10-31"]]) {
    const win = inDateRange(liveDiary(), start, end);
    const counts = countByKind(win);
    assert.equal(counts.all, win.length, `${start}: Everything`);
    assert.equal(counts.matches, win.filter(i => i.kind === KIND_FIXTURE).length, `${start}: Matches`);
    assert.equal(counts.socials, win.filter(i => i.kind !== KIND_FIXTURE).length, `${start}: Socials`);
    assert.equal(counts.matches + counts.socials, counts.all, `${start}: the two halves make the whole`);
  }
});

test("October Matches is 0 — a real number, not a missing chip", () => {
  const oct = countByKind(inDateRange(liveDiary(), "2026-10-01", "2026-10-31"));
  assert.equal(oct.matches, 0);
  assert.equal(oct.all, 8);
  // 0 is the useful answer here: it says the bowls season is over.
  assert.equal(typeof oct.matches, "number");
});

test("a single tapped day scopes the counts to that day", () => {
  const d = inDateRange(liveDiary(), "2026-09-12", "2026-09-12");
  assert.deepEqual(countByKind(d), { all: 2, matches: 1, socials: 1 });
});

test("a window with nothing in it counts zero rather than throwing", () => {
  assert.deepEqual(countByKind(inDateRange(liveDiary(), "2026-12-01", "2026-12-31")), { all: 0, matches: 0, socials: 0 });
  assert.deepEqual(countByKind([]), { all: 0, matches: 0, socials: 0 });
  assert.deepEqual(countByKind(), { all: 0, matches: 0, socials: 0 });
});
