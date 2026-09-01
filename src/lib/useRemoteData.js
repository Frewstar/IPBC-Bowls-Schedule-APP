import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  useRemoteData — telling "the table is empty" apart from "the read failed"
//
//  THE BUG THIS EXISTS TO STOP
//  A Supabase read that comes back with no rows and a Supabase read that never
//  arrived look identical at the call site: the data is empty either way. Five
//  lists in App.jsx used to treat both the same and substitute a hardcoded
//  copy of Irvine Park's content —
//
//      if (data?.length > 0) setTournaments(data);   // else: Irvine Park's
//
//  — which is survivable with one club and indefensible with two. A second
//  club's tables are empty, so the guard never fires, so they are shown
//  another club's tournaments, fixtures, roll of honour and member directory
//  (with phone numbers), at first paint and then permanently. Nothing ever
//  clears it, because an empty table never stops looking empty.
//
//  The fix is not "delete the fallback". It is to stop conflating the two
//  states, so each can be rendered honestly:
//
//    "loading"  first read in flight; nothing decided yet
//    "ready"    the server answered. Zero rows MEANS zero rows — render a
//               real empty state, never a stand-in from somewhere else.
//    "failed"   the request did not arrive. Say so. Never claim a table is
//               empty on the strength of a request that failed.
//
//  A failed REFRESH deliberately keeps what is already on screen: a member
//  watching a fixture list should not have it blanked because one poll timed
//  out. So "failed" WITH data means "this is what we had, it may be stale";
//  "failed" with nothing means "we have nothing and could not ask".
//
//  USAGE — deliberately shaped like useState, because callers also mutate the
//  data optimistically after a write:
//
//      const [fixtures, setFixtures, fixturesLoad] = useRemoteData(
//        () => supabase.from("club_fixtures").select("*").order("sort_order"),
//        [],
//        { transform: rows => rows.map(toFixture) },
//      );
//      // fixturesLoad.status  -> "loading" | "ready" | "failed"
//      // fixturesLoad.reload() -> try again
// ════════════════════════════════════════════════════════════════════════════

export function useRemoteData(loader, deps = [], { initial = [], transform } = {}) {
  const [data, setData]     = useState(initial);
  const [status, setStatus] = useState("loading");
  const [nonce, setNonce]   = useState(0);

  // Held in refs so a caller can pass inline arrows without the read firing on
  // every render. `deps` alone decides when to re-read.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    // Only the first read shows "loading". A re-read leaves whatever is on
    // screen in place until it succeeds or fails on its own terms.
    setStatus(s => (s === "ready" ? s : "loading"));

    (async () => {
      let res;
      try {
        res = await loaderRef.current();
      } catch (e) {
        res = { data: null, error: e };
      }
      if (cancelled) return;

      if (res?.error) {
        // Leave `data` alone. Stale-but-labelled beats blank, and both beat a
        // stand-in from another club.
        setStatus("failed");
        return;
      }

      const raw = res?.data;
      setData(transformRef.current ? transformRef.current(raw) : (raw ?? initial));
      setStatus("ready");
    })();

    return () => { cancelled = true; };
  }, [...deps, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coming back ──────────────────────────────────────────────────────────
  // Without this a phone that opened with no signal sits on "Couldn't load"
  // until someone taps Try again, even once it is back on wifi — which is the
  // same trap useLiveGames.js exists to avoid, so it is solved the same way.
  //
  // Only when the last read FAILED. A successful read is left alone: these
  // five tables change a few times a season, and re-reading them on every
  // foreground would be traffic for nothing.
  useEffect(() => {
    if (status !== "failed") return;
    function wake() {
      if (document.visibilityState === "hidden") return;
      reload();
    }
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [status, reload]);

  return [data, setData, { status, reload }];
}
