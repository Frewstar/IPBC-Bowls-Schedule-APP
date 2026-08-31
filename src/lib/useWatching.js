import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

// ════════════════════════════════════════════════════════════════════════
//  useWatching — how many people have this game open.
//
//  Realtime Presence, on a channel of its own, per game. This is the
//  per-game channel the live-scores brief originally asked for and did not
//  get: it was the wrong shape for postgres_changes, where one array feeds
//  the list and the detail view alike, and it is the right shape here,
//  because "who has THIS game open" is inherently per-game. It is joined
//  when a game is opened and left when it is closed, so a viewer holds one
//  presence channel at a time and none at all on the list.
//
//  WHAT IS TRACKED: nothing. track({}) sends an empty payload under a
//  presence key the client library generates at random.
//
//  That is deliberate and it is the whole privacy design. Presence state is
//  readable by every subscriber on the channel, and this channel is
//  reachable by anyone holding the publishable key out of the bundle —
//  which, for a game shared by link, is anyone with the link. A count is
//  fine to be public. WHO is watching is not something a shared link should
//  give away, so no name, no member id, and not even a signed-in flag goes
//  into the payload. There is nothing in it to leak.
//
//  WHAT THE NUMBER IS, HONESTLY: open connections, not people. One person
//  with the app on a phone and a tablet is two. At a bowls club, where the
//  interesting numbers are 3 and 8 rather than 300, that distortion is a
//  real share of the count, which is why the label reads "watching" and not
//  "people watching".
//
//  THE COUNT INCLUDES YOU. track() puts this client into the same presence
//  state the count is read from, so "2 watching" is you and one other, not
//  you and two others. Decided rather than inherited:
//
//    * It is what every presence UI does — a shared document showing three
//      faces is showing yours among them — so it is the reading people
//      arrive with.
//    * Excluding self is worse where it matters most. Two people on a game
//      would BOTH read "1 watching", which sounds like one person in total
//      rather than two, and there is no wording that fixes that.
//    * The case it reads oddly in is the marker's: "2 watching" is one
//      person watching them, plus themselves. That is mild, and the >= 2
//      gate already spares them the worst of it — a marker alone with the
//      game open is never told "1 watching".
//
//  If it should ever exclude self, it is one line — subtract one before
//  returning — but then the gate has to move to >= 1 and the label has to
//  become "1 other watching" to stay true. The test named
//  "the count includes you" in test/watching.e2e.mjs pins the current
//  choice, so flipping it fails loudly rather than drifting.
// ════════════════════════════════════════════════════════════════════════

// Presence state arrives as { <presence key>: [ {…}, … ] }. One key is one
// client, however many entries it carries, so the count is the number of
// keys. Defensive about shape: this is parsed straight off the wire.
export function countWatching(state) {
  if (!state || typeof state !== "object") return 0;
  return Object.keys(state).filter(k => Array.isArray(state[k]) && state[k].length > 0).length;
}

export function useWatching(gameId) {
  const [count, setCount] = useState(0);
  // Presence rides the same socket as everything else, so when that socket
  // dies this goes quiet — and a frozen count on a dead socket is precisely
  // the bug useLiveGames.js exists to stop. `live` is reported from the
  // channel's own status so the caller can hide the number rather than show
  // a stale one.
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!gameId) { setCount(0); setLive(false); return; }
    let alive = true;

    // No presence key is set, so the client library generates a random one
    // per connection. That is the default, and it is what keeps the entries
    // anonymous — a key of our choosing would be an identifier.
    const channel = supabase.channel(`live_game:${gameId}`);

    channel
      .on("presence", { event: "sync" }, () => {
        if (!alive) return;
        setCount(countWatching(channel.presenceState()));
      })
      .subscribe(status => {
        if (!alive) return;
        if (status === "SUBSCRIBED") {
          setLive(true);
          channel.track({});
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive(false);
          setCount(0);
        }
      });

    return () => {
      alive = false;
      // untrack before leaving so the other viewers' counts drop now rather
      // than when the server times the connection out.
      try { channel.untrack(); } catch {}
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return { count, live };
}
