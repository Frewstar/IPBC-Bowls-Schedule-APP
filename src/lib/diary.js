// ════════════════════════════════════════════════════════════════════════════
//  The diary — one list, two sources
//
//  club_fixtures and club_events stay separate: different owners, different
//  cadence, different fields, edited in their own places. This module is the
//  read model that lets them be shown together, and nothing here writes.
//
//  THE TIME PROBLEM, WHICH IS THE WHOLE REASON THIS FILE EXISTS
//  The two sources record time in incompatible formats:
//
//    club_fixtures."time"        free text, entered by hand: "2.00pm",
//                                "9.30am", and — already in production —
//                                "2:00pm" with a colon instead of a dot
//    club_events.start_time      "HH:MM" 24-hour, CHECK-constrained
//
//  "2.00pm" and "14:00" cannot be compared as strings: "14:00" sorts before
//  "2.00pm" because "1" < "2". Shown side by side they also read as two
//  different apps. So both sides are parsed to minutes-since-midnight for
//  ordering, and rendered through one formatter for display.
//
//  WHICH FORMAT MEMBERS SEE
//  The What's On style, for both: "2pm", "9.30am", "4–9pm", "8pm–midnight".
//  It is how the club's own flyers put it, it collapses a range to one suffix
//  when both ends share it, and it is already mirrored in api/share.js. The
//  Fixtures tab keeps rendering its own "2.00pm" — it is out of scope here and
//  untouched — so the same fixture reads "2.00pm" there and "2pm" in the
//  diary. That is deliberate: consistency *within* one list matters more than
//  matching a tab a member is not looking at.
// ════════════════════════════════════════════════════════════════════════════

export const KIND_FIXTURE = "fixture";
export const KIND_EVENT   = "event";

// ── Parsing ─────────────────────────────────────────────────────────────────
// Free text in, minutes since midnight out, null when it cannot be read.
// Deliberately permissive about separators and spacing and strict about the
// numbers: a fixture whose time is nonsense still belongs in the diary, it
// just cannot be placed on the clock.
//
// Accepts: "2.00pm" "2:00pm" "2 pm" "2pm" "14:00" "14.00" "9.30am" "12am"
// Rejects: "" null "teatime" "25:00" "2.75pm"
export function parseClockToMinutes(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // <h><sep><mm>[am|pm]
  let m = s.match(/^(\d{1,2})[.:](\d{2})(am|pm)?$/);
  if (!m) {
    // <h>[am|pm] — the bare-hour form only makes sense with a suffix, because
    // "2" on its own is as likely to be 14:00 as 02:00 and guessing is worse
    // than declining.
    m = s.match(/^(\d{1,2})(am|pm)$/);
    if (!m) return null;
    m = [m[0], m[1], "00", m[2]];
  }

  let h = Number(m[1]);
  const min = Number(m[2]);
  const suffix = m[3];

  if (!Number.isInteger(h) || !Number.isInteger(min) || min > 59) return null;

  if (suffix) {
    if (h < 1 || h > 12) return null;
    if (suffix === "pm" && h !== 12) h += 12;
    if (suffix === "am" && h === 12) h = 0;      // 12am is midnight
  } else if (h > 23) {
    return null;
  }

  return h * 60 + min;
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Reproduces What's On's existing fmtTime exactly, from minutes rather than
// from an "HH:MM" string, so nothing Christine already has on screen changes
// how it reads.
export function fmtMinutes(mins, withSuffix = true) {
  if (mins == null) return "";
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  if (h === 0 && m === 0) return "midnight";
  const suffix = withSuffix ? (h < 12 ? "am" : "pm") : "";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}.${String(m).padStart(2, "0")}${suffix}`;
}

// "16:00"+"21:00" → "4–9pm"; "11:00"+"13:00" → "11am–1pm"; "20:00"+"00:00" →
// "8pm–midnight". The first suffix is dropped only when both ends share it,
// which is how anyone would say it out loud.
export function fmtMinutesRange(startMins, endMins) {
  if (startMins == null) return endMins == null ? "" : `until ${fmtMinutes(endMins)}`;
  if (endMins == null) return fmtMinutes(startMins);
  const sh = Math.floor(startMins / 60), eh = Math.floor(endMins / 60);
  const sameHalf = (sh < 12) === (eh < 12) && !(eh === 0 && sh !== 0);
  return `${fmtMinutes(startMins, !sameHalf)}–${fmtMinutes(endMins)}`;
}

// ── Normalising ─────────────────────────────────────────────────────────────
// Both row shapes become the same item. `raw` is kept so the caller can still
// reach the original row (the detail sheet, the poster, the edit path) without
// this module having to mirror every column.

export function fixtureToDiaryItem(f) {
  const startMins = parseClockToMinutes(f.time);
  return {
    key: `fixture:${f.id}`,
    kind: KIND_FIXTURE,
    id: f.id,
    date: f.event_date,
    startMins,
    endMins: null,
    // An unreadable time is not the same as no time, and the difference shows:
    // this keeps the typed text so "teatime" is still on screen even though it
    // could not be placed on the clock.
    timeLabel: startMins != null ? fmtMinutes(startMins) : (f.time || "").trim(),
    title: f.event,
    detail: null,
    cancelled: false,          // club_fixtures has no cancelled flag
    posterPath: null,
    venue: f.venue || "home",
    rinks: f.rinks ?? null,
    seriesId: null,
    raw: f,
  };
}

export function eventToDiaryItem(e) {
  const startMins = parseClockToMinutes(e.start_time);
  const endMins   = parseClockToMinutes(e.end_time);
  return {
    key: `event:${e.id}`,
    kind: KIND_EVENT,
    id: e.id,
    date: e.event_date,
    startMins,
    endMins,
    timeLabel: fmtMinutesRange(startMins, endMins),
    title: e.title,
    detail: e.detail || null,
    cancelled: !!e.cancelled,
    posterPath: e.poster_path || null,
    venue: null,
    rinks: null,
    seriesId: e.series_id || null,
    raw: e,
  };
}

// ── Ordering ────────────────────────────────────────────────────────────────
// Day, then clock. An item whose time could not be read sorts LAST within its
// day — it is still in the diary, it just cannot be placed among things that
// do have a time.
//
// This is one rule for both sources. What's On's own sort used to put a
// timeless event FIRST ("usually the all-day thing"); no row in either table
// currently has a missing or unreadable time, so nothing on screen moves, but
// the rule is now uniform rather than per-source.
//
// EXACT TIES. 19 September has both a fixture ("2:00pm") and an event
// ("14:00") at 840 minutes, so the clock separates nothing and this returns 0.
// The fixture still renders first, and deterministically: Array#sort is stable
// (ES2019 onward) and mergeDiary concatenates fixtures ahead of events. That is
// the sensible result, but it comes from input order rather than from a rule
// here, so a test pins it — reversing the concat in mergeDiary would silently
// flip 19 September otherwise.
export function byDateThenClock(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startMins == null && b.startMins == null) return 0;
  if (a.startMins == null) return 1;
  if (b.startMins == null) return -1;
  return a.startMins - b.startMins;
}

// The merged, ordered diary. Nothing is deduplicated and nothing is linked:
// a fixture and an event on the same day are two rows, because they are two
// records with two owners and neither is complete on its own — the fixture
// carries the bowls (1.30pm, home, six rinks), the event carries the price and
// the band (£12, Craig McGill). Merging the titles would lose one of them.
export function mergeDiary(fixtures = [], events = []) {
  return [
    ...fixtures.map(fixtureToDiaryItem),
    ...events.map(eventToDiaryItem),
  ].sort(byDateThenClock);
}

// ── Reading a day ───────────────────────────────────────────────────────────
// A day block runs forwards on the clock, both sources treated the same. There
// is no bowls-first hierarchy, and there was briefly: it read correctly only
// because the bowls happen to be earlier on all four shared dates in the
// current season, which is coincidence rather than principle. A members'
// coffee morning at 11am sharing a date with 6.30pm trials is an ordinary
// bowls-club day, and hierarchy would have rendered 6.30pm above 11am.
//
// Three reasons:
//
//   * A day block answers "what's on this day", and people read a day
//     forwards. That is the mental model of every diary they have used.
//   * The badge already says which is the match and which is the social.
//     Order does not need to carry that a second time — and when the two
//     disagree, the reader trusts the visible times.
//   * It is one rule instead of two. Within a block showing both times,
//     6.30pm above 11am reads as a bug, not a hierarchy. One rule is easier
//     to keep true, so groupByDay sorts with byDateThenClock — the same
//     comparator that orders the merged list and picks nextUp. Within a day
//     the dates are equal, so it degenerates to the clock.
//
// Unknown time still sorts last: see byDateThenClock.

// One block per date, every date, whether it holds one thing or three.
//
// Grouping is unconditional on purpose. The alternative — group only when the
// two rows "look related" — means guessing relatedness from titles and times,
// and that guess is exactly what reads 12 September's "Ladies/Gents" and
// "Ladies v Gents" as one thing entered twice when they are a match and the
// dance after it. A date is a fact; relatedness is an inference.
//
// It is also what stops the grouping implying anything. If only some days had
// a heading, a heading would mean "these two are connected". Because every day
// has one, a two-row day is just a day with two things on it, and the two
// times and two badges underneath do the explaining.
export function groupByDay(items = []) {
  const days = new Map();
  for (const it of items) {
    if (!days.has(it.date)) days.set(it.date, []);
    days.get(it.date).push(it);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, list]) => ({ date, items: [...list].sort(byDateThenClock) }));
}

// ── What a filter chip is allowed to claim ──────────────────────────────────
// A count on a filter describes what that filter will show. Nothing else.
//
// The diary shipped with chips counting the whole season while the list under
// them showed one month, so September read "Matches 35" and then showed six.
// The number is the thing people trust, so it has to be derived from the same
// window the list is, which is what these two make easy: take the window
// first, count second, and the two cannot disagree.
export function inDateRange(items = [], startISO, endISO) {
  return items.filter(i => i.date >= startISO && i.date <= endISO);
}

export function countByKind(items = []) {
  return {
    all:     items.length,
    matches: items.filter(i => i.kind === KIND_FIXTURE).length,
    socials: items.filter(i => i.kind !== KIND_FIXTURE).length,
  };
}
