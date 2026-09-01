// ════════════════════════════════════════════════════════════════════════════
//  Going live by mistake, and the way back
//
//  Jim tapped "Go live" on the Ladies Triples final, scheduled for Fri 11 Sep,
//  ten days out. One tap, no confirmation, and nothing in the app to put it
//  back — it had to be reversed in the database.
//
//  These are the rules for when to ask, and what to say. Pure functions with
//  no React and no network, for the same reason liveGamesSync.js is: the
//  decision is the interesting part and it is worth testing on its own.
//
//  WHAT THESE ARE NOT. live_games carries `using (true)` on all four
//  operations, so anyone holding the publishable key out of the bundle can set
//  any status on any game whatever this file decides. A confirmation is a
//  guard against a mis-tap by someone who meant well. It is not a permission
//  check and nothing enforces it server-side.
// ════════════════════════════════════════════════════════════════════════════

// The score, wherever it lives. A `rinks` game keeps 0 in home_score/away_score
// and carries the real numbers in the rinks array — the Balloted Pairs game
// reads 0–0 on those columns while actually standing at 17–13. Anything asking
// "has this been scored?" has to come through here or it gets the wrong
// answer on exactly the games that matter.
export function totalsFor(g) {
  if (!g) return { home: 0, away: 0 };
  if (g.format === "single") return { home: g.home_score || 0, away: g.away_score || 0 };
  const rinks = Array.isArray(g.rinks) ? g.rinks : [];
  return {
    home: rinks.reduce((s, r) => s + (Number(r.home) || 0), 0),
    away: rinks.reduce((s, r) => s + (Number(r.away) || 0), 0),
  };
}

const startOfLocalDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function isSameLocalDay(a, b) {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Fri 11 Sep" — the way the date is said out loud at the club, so the
// confirmation can be checked against the fixture list without translating.
export function fmtDayLabel(d) {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Null when Go live should be one tap, otherwise the question to ask.
//
//   starts_at is null   → no prompt. A game with no scheduled time is meant to
//                         start now; that is how the Ladies Presidents Final
//                         was created and scored on the spot, and it must stay
//                         one tap.
//   starts_at is today  → no prompt. Normal use.
//   any other day       → ask, naming the date.
//
// Past days ask too. A game still sitting scheduled from last week, started
// today, is just as likely to be a mis-tap as one ten days out — and the
// wording ("scheduled for Tue 25 Aug") reads correctly either way.
export function earlyStartWarning(game, now = new Date()) {
  const raw = game && game.starts_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;   // unreadable: do not block
  if (isSameLocalDay(d, now)) return null;
  return `This is scheduled for ${fmtDayLabel(d)}. Start it anyway?`;
}

// What is on the game, in words — or null if genuinely nothing is.
// Ends count: a game at 0–0 after 16 ends has been scored, whatever the
// numbers say.
export function scoreSummary(game) {
  const t = totalsFor(game);
  const ends = Number(game && game.ends_played) || 0;
  const parts = [];
  if (t.home > 0 || t.away > 0) parts.push(`${t.home}–${t.away} recorded`);
  if (ends > 0) parts.push(`${ends} ${ends === 1 ? "end" : "ends"} played`);
  return parts.length ? parts.join(" and ") : null;
}

// Null when the undo should be frictionless — 0–0 and no ends, which is the
// mis-tap this exists for. Otherwise the question, saying what happens to the
// score, because the two things not to do are discard one silently and keep
// one silently.
export function undoLiveWarning(game) {
  const summary = scoreSummary(game);
  if (!summary) return null;
  return `This game has ${summary}. Put it back to scheduled? The score is kept.`;
}
