// ════════════════════════════════════════════════════════════════════════
//  Keeping the live-games list in step with the server.
//
//  Pure functions, no React and no network, because the interesting part of
//  a realtime feature is the reconciliation and that is the part worth
//  testing directly. The hook in useLiveGames.js supplies the events.
//
//  ONE RULE RUNS THROUGH ALL OF IT: updated_at decides.
//
//  The client writes updated_at itself on every patch and the server stores
//  exactly what it was sent, so the row we hold and the row that comes back
//  are directly comparable. That single rule covers four situations that
//  would otherwise each need their own special case:
//
//    * The marker's own +1, shown instantly. The write goes out with a new
//      updated_at; a poll that started before it landed comes back older and
//      is ignored rather than snapping the score back to what it was.
//    * Realtime events arriving out of order, which a dropped and re-opened
//      socket can do.
//    * The echo of our own write returning after we have already tapped
//      again.
//    * Two phones scoring the same game: last write wins, which is what the
//      table already did.
// ════════════════════════════════════════════════════════════════════════

// Missing or unparseable sorts oldest, so a row without one never wins a
// comparison against a row that has one.
export function rowTime(row) {
  if (!row || !row.updated_at) return 0;
  const t = new Date(row.updated_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// True when the two arrays hold the same rows, same objects, same order —
// so a poll that changed nothing can return the previous array and not
// re-render the tab every thirty seconds.
export function sameList(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// A postgres_changes payload from the live_games channel.
export function applyEvent(games, payload) {
  if (!payload) return games;

  if (payload.eventType === "DELETE") {
    // live_games is REPLICA IDENTITY DEFAULT, so `old` carries the primary
    // key and NOTHING else. Reading any other column off it here would be a
    // bug that only shows up when a game is deleted mid-match — which has
    // happened once already. The table is deliberately not switched to
    // REPLICA IDENTITY FULL: that writes every column of every row to the
    // WAL on every score tap, to save this one lookup.
    const id = payload.old && payload.old.id;
    if (!id) return games;
    return games.some(g => g.id === id) ? games.filter(g => g.id !== id) : games;
  }

  const row = payload.new;
  if (!row || !row.id) return games;

  const existing = games.find(g => g.id === row.id);
  if (!existing) return [row, ...games];
  // Strictly older loses. Equal wins, so the echo of our own write replaces
  // the optimistic copy with the server's own version of the row.
  if (rowTime(existing) > rowTime(row)) return games;
  return games.map(g => (g.id === row.id ? row : g));
}

// Reconcile against a full re-read of the table — the poll backstop, and
// what runs when the tab comes back to the foreground.
//
// fetchedAtMs is when the request went OUT, not when it came back. A row we
// hold that is absent from the response was either deleted on the server or
// created here after the request left; the timestamp is what tells those
// apart, and without it a game created seconds ago would vanish from the
// creator's own screen.
export function mergeFetched(games, fetched, fetchedAtMs) {
  const byId = new Map(fetched.map(r => [r.id, r]));

  const kept = games
    .filter(g => byId.has(g.id) || rowTime(g) > fetchedAtMs)
    .map(g => {
      const server = byId.get(g.id);
      if (!server) return g;
      // Older than what we hold means our write has not landed yet. Keep ours.
      return rowTime(server) >= rowTime(g) ? server : g;
    });

  const keptIds = new Set(kept.map(g => g.id));
  const added = fetched.filter(r => !keptIds.has(r.id));
  return added.length ? [...added, ...kept] : kept;
}

// ── Who may score ─────────────────────────────────────────────────────────
// creator_member_id is the key from 20260903 onward. creator_cloudkey is the
// old one and is still read, because a game created before that shipped has
// only the old key and its marker must not lose the buttons mid-match. The
// fallback goes when no bundle in the field writes cloudkey any more.
//
// This check is ADVISORY and always has been: live_games carries
// `using (true)` on all four operations, so anyone with the publishable key
// out of the bundle can update any game whatever this returns. It decides
// which buttons to draw, not who may write. The real lock is an RPC that
// verifies a PIN server-side — noted in the migration, not built yet.
export function canScore(game, { memberId, cloudKey, isAdmin }) {
  if (!game) return false;
  if (isAdmin) return true;
  if (game.creator_member_id) return !!memberId && game.creator_member_id === memberId;
  if (game.creator_cloudkey) return !!cloudKey && game.creator_cloudkey === cloudKey;
  return false;
}
