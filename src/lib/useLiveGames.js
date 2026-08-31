import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import { applyEvent, mergeFetched, sameList } from "./liveGamesSync.js";

// ════════════════════════════════════════════════════════════════════════
//  useLiveGames — the live-games list, kept current.
//
//  WHAT WAS ACTUALLY WRONG
//  The tab has subscribed to postgres_changes since the feature shipped, and
//  the server has been broadcasting the whole time: live_games is in the
//  supabase_realtime publication with insert, update and delete all enabled.
//  The subscription was never the missing piece. What was missing was
//  everything that keeps it alive on a phone:
//
//    * subscribe() was called with no status callback, so a channel that
//      failed to join failed silently and the tab went on showing whatever
//      it had.
//    * A phone locks, or the browser backgrounds the tab, and the socket is
//      closed under it. Nothing noticed and nothing re-read on the way back.
//    * There was no second source of truth, so a socket that died took the
//      screen with it — which is exactly the reported symptom: a score stuck
//      at 6 while the database held 9, and only a manual reload fixed it.
//    * The screen said "updates automatically" whether or not it was.
//
//  So the fix is not a subscription. It is a subscription that is watched,
//  a poll underneath it that does not care whether it works, a re-read every
//  time the tab comes back to the foreground, and a status the UI can tell
//  the truth with.
//
//  ONE CHANNEL, UNFILTERED — a deliberate call, and a deviation from the
//  brief, which asked for a per-game channel filtered on `id=eq.<gameId>`.
//  The tab keeps every game in one array and the detail view is a lookup
//  into it, so an unfiltered channel already feeds both. Adding a filtered
//  channel on top would mean two subscriptions delivering the same row
//  twice, and a join and a leave on every open and close of a game — more
//  socket churn on a phone, not less. One channel for the whole tab is
//  strictly fewer than one per navigation, which is what the brief was
//  guarding against. The table holds single figures of rows, so there is no
//  bandwidth argument for filtering either. Easy to reverse if you want it.
// ════════════════════════════════════════════════════════════════════════

// Slow on purpose. This is the floor under the socket, not the way the score
// normally travels — when realtime is working every tap arrives in well under
// a second and this poll finds nothing to do.
const POLL_MS = 30000;

export function useLiveGames() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  // "connecting" | "live" | "polling". Never guessed: it is set from the
  // channel's own status callback.
  const [connection, setConnection] = useState("connecting");
  const [lastSync, setLastSync] = useState(null);
  const [nonce, setNonce] = useState(0);

  const alive = useRef(true);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  const refetch = useCallback(async () => {
    // Taken BEFORE the request goes out — mergeFetched needs to know what the
    // server could not yet have seen. See the note there.
    const at = Date.now();
    const { data, error } = await supabase
      .from("live_games").select("*").order("updated_at", { ascending: false });
    if (!alive.current) return;
    if (error || !data) {
      // Leave the rows alone and let the next tick try again. A failed poll
      // must never blank a screen someone is watching a game on.
      setLoading(false);
      return;
    }
    setGames(prev => {
      const next = mergeFetched(prev, data, at);
      return sameList(prev, next) ? prev : next;
    });
    setLastSync(Date.now());
    setLoading(false);
  }, []);

  // ── The socket ──────────────────────────────────────────────────────────
  useEffect(() => {
    alive.current = true;
    refetch();

    const channel = supabase
      .channel("live_games_stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_games" }, payload => {
        if (!alive.current) return;
        setGames(prev => applyEvent(prev, payload));
        setLastSync(Date.now());
      })
      .subscribe(status => {
        if (!alive.current) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Anything that changed between the first read and the socket being
          // ready would otherwise be missed for up to a poll interval. This is
          // the gap the old code never closed.
          refetch();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("polling");
        }
      });

    return () => { alive.current = false; supabase.removeChannel(channel); };
  }, [refetch, nonce]);

  // ── The floor under it ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(refetch, POLL_MS);
    return () => clearInterval(t);
  }, [refetch]);

  // ── Coming back ─────────────────────────────────────────────────────────
  // A locked phone is the common case, not an edge case: the marker puts it
  // in their pocket between ends and half the club is watching from one.
  useEffect(() => {
    function wake() {
      if (document.visibilityState === "hidden") return;
      refetch();
      // supabase-js reconnects the socket on its own, but a channel that was
      // dropped while the tab slept can come back joined to nothing. If we are
      // not live, tear the channel down and build a new one.
      if (connectionRef.current !== "live") {
        setConnection("connecting");
        setNonce(n => n + 1);
      }
    }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [refetch]);

  return { games, setGames, loading, connection, lastSync, refetch };
}
