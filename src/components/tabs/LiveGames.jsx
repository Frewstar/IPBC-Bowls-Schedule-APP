import { useState, useEffect, useMemo } from "react";
import {
  Radio, Plus, Minus, ChevronLeft, MapPin, X,
  Share2, Trash2, Flag, CircleCheckBig, Users, Clock, WifiOff, Eye,
} from "lucide-react";
import {
  GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER,
  TEXT, TEXT2, TEXT3, WIN_GOLD, LOSS_RED, F_SANS, F_UI,
} from "../../lib/theme.js";
import { supabase } from "../../lib/supabase.js";
import { useLiveGames } from "../../lib/useLiveGames.js";
import { canScore } from "../../lib/liveGamesSync.js";
import { useWatching } from "../../lib/useWatching.js";

const LIVE_RED = "#c0392b";
const HOME_GROUND = "Irvine Park Bowling Club";

// discipline → players per side, and score structure
const DISCIPLINES = [
  { id: "singles", label: "Singles",    players: 1, format: "single" },
  { id: "pairs",   label: "Pairs",      players: 2, format: "single" },
  { id: "triples", label: "Triples",    players: 3, format: "single" },
  { id: "rinks",   label: "Rinks",      players: 4, format: "single" },
  { id: "team",    label: "Team match", players: 0, format: "rinks"  },
];
const discLabel = id => (DISCIPLINES.find(d => d.id === id) || {}).label || "";

// A team match is several rinks totalled together, and every rink in it is the
// same size. That size is the discipline the match is actually played at — a
// Balloted Pairs night is pairs however the fixture card reads — so it is
// picked on the form and written to `discipline` instead of being left at the
// "team" default. Games created before this read back as "team", which is why
// nothing here treats a missing size as an error: it just says "Team match".
//
// Two labels each. `label` is how the club says it and is what the scoreboard
// shows; `pick` is what the button says, because "Triples" would otherwise
// appear twice on the form — once as a game of its own and once as the size of
// a rink inside a team match — and they are not the same choice.
const RINK_SIZES = [
  { id: "pairs",   label: "Pairs",   pick: "2 a side", players: 2 },
  { id: "triples", label: "Triples", pick: "3 a side", players: 3 },
  { id: "rinks",   label: "Fours",   pick: "4 a side", players: 4 },
];
const rinkSizeLabel = id => (RINK_SIZES.find(s => s.id === id) || {}).label || "";
const rinkSizePlayers = id => (RINK_SIZES.find(s => s.id === id) || {}).players || 0;

// What kind of game this is, in one phrase, for the scoreboard, the cards and
// the share text. Reading `format` first is deliberate: a multi-rink fixture is
// a team match whatever its discipline says, and the discipline only adds how
// big its rinks are.
function shapeLabel(g) {
  if (!g) return "";
  if (g.format === "rinks") {
    const size = rinkSizeLabel(g.discipline);
    return size ? `Team match · ${size}` : "Team match";
  }
  return g.discipline && g.discipline !== "team" ? discLabel(g.discipline) : "";
}

// ── helpers ──────────────────────────────────────────────────────────────
function totalsFor(g) {
  if (!g) return { home: 0, away: 0 };
  if (g.format === "single") return { home: g.home_score || 0, away: g.away_score || 0 };
  const rinks = Array.isArray(g.rinks) ? g.rinks : [];
  return {
    home: rinks.reduce((s, r) => s + (Number(r.home) || 0), 0),
    away: rinks.reduce((s, r) => s + (Number(r.away) || 0), 0),
  };
}

function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 15) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function mapsUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Sunday 2:30pm", or "Sun 14 Sep, 2:30pm" once it's more than a week out.
// One club, one green, one timezone — the phone's own clock is the right one.
function fmtStartTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const h24 = d.getHours();
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mins = d.getMinutes();
  const clock = `${h12}${mins ? `:${String(mins).padStart(2, "0")}` : ""}${suffix}`;

  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (days === 0) return `Today ${clock}`;
  if (days === 1) return `Tomorrow ${clock}`;
  if (days > 1 && days < 7) return `${DAY_FULL[d.getDay()]} ${clock}`;
  return `${DAY_FULL[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}, ${clock}`;
}

// Value for a datetime-local input, in the phone's own timezone.
function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "A FREW & J MUIR", or "A FREW, J MUIR, K HOUSTON & W REID" for a rink.
// Used to name both sides of an internal club game, where "IPBC v IPBC" tells
// nobody anything.
function sideName(players, fallback = "") {
  const list = (players || []).map(n => String(n).trim()).filter(Boolean);
  if (list.length === 0) return fallback;
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

// A side whose name was built from its players reads better as the lead name
// on top with the partners underneath than as one long "A & B & C" heading.
// An away club keeps its own name and lists its players below, as before.
function splitSide(name, players = []) {
  const list = (players || []).map(n => String(n).trim()).filter(Boolean);
  if (list.length > 1 && name === sideName(list)) {
    return { heading: list[0], rest: list.slice(1) };
  }
  return { heading: name, rest: list };
}

// Upcoming games are listed soonest-first. A scheduled game with no start time
// sorts last rather than disappearing.
function byStartsAt(a, b) {
  const ta = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
  const tb = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return new Date(a.updated_at) - new Date(b.updated_at);
}

// Live and finished games are listed by most recent activity.
function byUpdatedDesc(a, b) {
  return new Date(b.updated_at) - new Date(a.updated_at);
}

export default function LiveGamesTab({ myName, cloudKey, myMemberId = null, isAdmin, setActiveTab, members = [], deepLinkGameId = null, onDeepLinkHandled }) {
  const { games, setGames, loading, connection, lastSync } = useLiveGames();
  const [view, setView] = useState("list");   // "list" | "detail" | "create"
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [missingGame, setMissingGame] = useState(false);
  const [, forceTick] = useState(0);

  const canCreate = !!(myName && cloudKey);

  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Someone followed a shared link. Wait for the list before deciding — the
  // game is only genuinely missing once we've actually looked. Finished games
  // open too: people click these after the game is over.
  useEffect(() => {
    if (!deepLinkGameId || loading) return;
    if (games.some(g => g.id === deepLinkGameId)) {
      setOpenId(deepLinkGameId);
      setView("detail");
    } else {
      // Deleted, or from another club's copy of the app. Say so and leave them
      // on the list rather than on an empty screen.
      setMissingGame(true);
    }
    onDeepLinkHandled?.();
  }, [deepLinkGameId, loading, games]); // eslint-disable-line react-hooks/exhaustive-deps

  // A game can be removed while someone is watching it — one was, the night
  // this was written. Realtime delivers the DELETE, the row leaves `games`,
  // and without this the detail view would simply fall through to the list
  // with no explanation. Deliberately NOT tied to `deleting` state: this
  // fires for the watcher, not for whoever pressed the button.
  const deletedWatched = view === "detail" && openId && !loading
    && !games.some(g => g.id === openId);
  useEffect(() => {
    if (!deletedWatched) return;
    setView("list");
    setOpenId(null);
    showToast("That game was deleted");
  }, [deletedWatched]); // eslint-disable-line react-hooks/exhaustive-deps

  // Soonest first — a fixture list, not an activity feed.
  const scheduledGames = useMemo(
    () => games.filter(g => g.status === "scheduled").sort(byStartsAt), [games]);
  const liveGames = useMemo(
    () => games.filter(g => g.status === "live").sort(byUpdatedDesc), [games]);
  const finishedGames = useMemo(
    () => games.filter(g => g.status === "finished").sort(byUpdatedDesc), [games]);
  const openGame = openId ? games.find(g => g.id === openId) : null;
  // Only while a game is open, so a viewer holds one presence channel at a
  // time and none at all on the list.
  const { count: watching, live: watchingLive } =
    useWatching(view === "detail" && openGame ? openGame.id : null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200); }
  function canEdit(g) { return canScore(g, { memberId: myMemberId, cloudKey, isAdmin }); }

  async function patchGame(id, patch) {
    const full = { ...patch, updated_at: new Date().toISOString(), last_updated_by: myName || "Someone" };
    setGames(prev => prev.map(g => (g.id === id ? { ...g, ...full } : g)));
    const { error } = await supabase.from("live_games").update(full).eq("id", id);
    if (error) showToast("Couldn't save — try again");
  }

  // Changing the score is what starts the broadcast: the marker's first end
  // takes a scheduled game live, so nobody has to remember to tap Go live.
  // The clock never does this on its own — a game nobody scores stays
  // scheduled however long ago it was due to start.
  function patchScore(g, patch) {
    const promote = g.status === "scheduled" ? { status: "live" } : null;
    patchGame(g.id, { ...patch, ...promote });
    if (promote) showToast("Game is now live");
  }

  function bumpRink(g, idx, side, delta) {
    const rinks = (g.rinks || []).map((r, i) =>
      i === idx ? { ...r, [side]: Math.max(0, (Number(r[side]) || 0) + delta) } : r
    );
    patchScore(g, { rinks });
  }
  function bumpSingle(g, side, delta) {
    const key = side === "home" ? "home_score" : "away_score";
    patchScore(g, { [key]: Math.max(0, (Number(g[key]) || 0) + delta) });
  }
  // Starting the ends count is starting the game, same as putting a shot on.
  function bumpEnds(g, delta) {
    const total = Number(g.ends_total) || 0;
    const next = Math.min(total, Math.max(0, (Number(g.ends_played) || 0) + delta));
    if (next === (Number(g.ends_played) || 0)) return;
    patchScore(g, { ends_played: next });
  }
  async function setFinished(g, finished) {
    // A finished game reopens to live, never back to scheduled.
    await patchGame(g.id, { status: finished ? "finished" : "live" });
    showToast(finished ? "Marked as finished" : "Back to live");
  }
  async function goLive(g) {
    await patchGame(g.id, { status: "live" });
    showToast("Game is now live");
  }
  async function deleteGame(g) {
    if (!window.confirm(`Delete "${g.home_team} v ${g.away_team}"? This can't be undone.`)) return;
    setGames(prev => prev.filter(x => x.id !== g.id));
    await supabase.from("live_games").delete().eq("id", g.id);
    setView("list"); setOpenId(null);
    showToast("Game deleted");
  }

  function shareGame(g) {
    const t = totalsFor(g);
    let body = `🎳 ${g.home_team} ${t.home}–${t.away} ${g.away_team}`;
    if (g.title) body += ` (${g.title})`;
    const shape = shapeLabel(g);
    if (shape) body += `\n${shape}`;
    if (g.format === "rinks" && (g.rinks || []).length) {
      body += "\n" + g.rinks.map(r => `${r.label}: ${r.home || 0}–${r.away || 0}`).join("\n");
    }
    if (g.ends_total > 0) {
      body += g.ends_played >= g.ends_total
        ? `\nAll ${g.ends_total} ends played`
        : `\nEnd ${(g.ends_played || 0) + 1} of ${g.ends_total}`;
    }
    if (g.location) body += `\n📍 ${g.location}`;
    const standing = g.status === "finished" ? "Full time"
      : g.status === "scheduled" ? (g.starts_at ? `Starts ${fmtStartTime(g.starts_at)}` : "Coming up")
      : "Live now";
    body += `\n\n${standing} · IPBC Bowls app`;
    // Kept inside `text` rather than passed as navigator.share's `url`: some
    // targets drop one or the other, and the message format is the point.
    body += `\n${window.location.origin}/?game=${g.id}`;
    if (navigator.share) navigator.share({ text: body }).catch(() => {});
    else navigator.clipboard?.writeText(body).then(() => showToast("Score copied — paste into WhatsApp"));
  }

  // ════════════════════════════════════════════════════════════════════════
  if (view === "create") {
    return (
      <>
        <CreateGame
          myName={myName} cloudKey={cloudKey} myMemberId={myMemberId} members={members}
          onCancel={() => setView("list")}
          onCreated={id => { setOpenId(id); setView("detail"); }}
          showToast={showToast}
          pushGame={row => setGames(prev => [row, ...prev.filter(g => g.id !== row.id)])}
        />
        {/* Without this the form's messages went nowhere: it refused to submit
            and said so to an empty room. */}
        {toast && <Toast msg={toast} />}
      </>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  if (view === "detail" && openGame) {
    const g = openGame;
    const t = totalsFor(g);
    const editable = canEdit(g);
    const leadHome = t.home > t.away, leadAway = t.away > t.home;
    const homePlayers = Array.isArray(g.home_players) ? g.home_players : [];
    const awayPlayers = Array.isArray(g.away_players) ? g.away_players : [];
    // Steppers are narrow, and the full line-up is already on the scoreboard
    // above them, so they take the lead name only.
    const homeShort = splitSide(g.home_team, homePlayers).heading;
    const awayShort = splitSide(g.away_team, awayPlayers).heading;

    return (
      <div>
        <button onClick={() => { setView("list"); setOpenId(null); }} style={backBtn}>
          <ChevronLeft size={14} strokeWidth={2} />All games
        </button>

        {/* Scoreboard hero */}
        <div style={{ background: GREEN, borderRadius: "14px", padding: "18px 16px", marginBottom: "14px", boxShadow: "0 4px 16px rgba(74,14,31,0.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <StatusBadge status={g.status} />
            <button onClick={() => shareGame(g)} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "8px", padding: "6px", cursor: "pointer", color: "#fff", display: "flex" }} title="Share score">
              <Share2 size={15} strokeWidth={1.75} />
            </button>
          </div>

          <div style={{ textAlign: "center", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
            {[g.title, shapeLabel(g)].filter(Boolean).length > 0 && (
              <div style={{ fontFamily: F_UI, fontSize: "12px", color: GOLD, fontWeight: "600", letterSpacing: "0.04em" }}>
                {[g.title, shapeLabel(g)].filter(Boolean).join(" · ")}
              </div>
            )}
            {g.location && (
              <a href={mapsUrl(g.location)} target="_blank" rel="noreferrer"
                style={{ fontFamily: F_UI, fontSize: "12px", color: "rgba(255,255,255,0.85)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <MapPin size={12} strokeWidth={1.75} color={GOLD} />{g.location}
              </a>
            )}
            {g.status === "scheduled" && g.starts_at && (
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: "#fff", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <Clock size={13} strokeWidth={2} color={GOLD} />{fmtStartTime(g.starts_at)}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "start", gap: "8px" }}>
            <TeamCol name={g.home_team} score={t.home} lead={leadHome} players={homePlayers} />
            <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "600", color: "rgba(255,255,255,0.5)", paddingTop: "22px" }}>–</div>
            <TeamCol name={g.away_team} score={t.away} lead={leadAway} players={awayPlayers} />
          </div>

          {g.last_updated_by && (
            <div style={{ textAlign: "center", marginTop: "12px", fontFamily: F_UI, fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
              Updated by {g.last_updated_by} · {timeAgo(g.updated_at)}
            </div>
          )}

          {/* Three conditions, and each one is load-bearing.
              watchingLive — presence rides the socket, so a dead socket must
                take the number with it rather than freeze it. Showing a stale
                "6 watching" on a screen that has stopped updating is the same
                lie this whole change set exists to stop telling.
              >= 2 — at 1 it is only you, and "1 watching" reads as a room
                with nobody in it.
              not finished — on a result from three weeks ago the number is
                true and means nothing. It belongs to a game in progress or
                one about to start. */}
          {watchingLive && watching >= 2 && g.status !== "finished" && (
            <div style={{ textAlign: "center", marginTop: "6px", fontFamily: F_UI, fontSize: "11px", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
              <Eye size={12} strokeWidth={1.75} color={GOLD_MUTED} />
              {watching} watching
            </div>
          )}
        </div>

        {!editable && g.status === "live" && (
          <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontFamily: F_UI, fontSize: "12px", color: TEXT2, display: "flex", alignItems: "center", gap: "8px" }}>
            {connection === "live"
              ? <><Radio size={14} strokeWidth={1.75} color={GOLD_MUTED} style={{ flexShrink: 0 }} />
                  Following live — updates automatically. Only {g.creator_name || "the organiser"} &amp; admins can edit.</>
              : <><WifiOff size={14} strokeWidth={1.75} color={TEXT3} style={{ flexShrink: 0 }} />
                  {/* Never claim live when we are not. If the socket is down the
                      score still moves, just every 30 seconds instead of at once,
                      and the reader is told which one they are getting. */}
                  {connection === "connecting" ? "Connecting…" : "Not live — checking every 30 seconds."}
                  {lastSync ? ` Last checked ${timeAgo(new Date(lastSync).toISOString())}.` : ""}</>}
          </div>
        )}

        {g.status === "scheduled" && (
          <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontFamily: F_UI, fontSize: "12px", color: TEXT2, display: "flex", alignItems: "center", gap: "8px", lineHeight: 1.5 }}>
            <Clock size={14} strokeWidth={1.75} color={GOLD_MUTED} style={{ flexShrink: 0 }} />
            {editable
              ? "Not started yet. Tap Go live when play begins — or just start scoring and it goes live on its own."
              : "Not started yet. The score will appear here once play begins."}
          </div>
        )}

        {g.ends_total > 0 && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "10px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
            <div style={{ ...sectionLabel, marginBottom: "8px" }}>Ends</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px" }}>
              {editable && (
                <button onClick={() => bumpEnds(g, -1)} style={stepBtn} aria-label="One end fewer">
                  <Minus size={16} strokeWidth={2.5} />
                </button>
              )}
              <div style={{ textAlign: "center", minWidth: "120px" }}>
                <div style={{ fontFamily: F_SANS, fontSize: "24px", fontWeight: "700", color: TEXT, lineHeight: 1.1 }}>
                  {g.ends_played >= g.ends_total ? "All ends played" : `End ${(g.ends_played || 0) + 1} of ${g.ends_total}`}
                </div>
                <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "3px" }}>
                  {g.ends_played || 0} of {g.ends_total} complete
                </div>
              </div>
              {editable && (
                <button onClick={() => bumpEnds(g, +1)} style={{ ...stepBtn, background: GREEN, color: "#fff", borderColor: GREEN }} aria-label="One end more">
                  <Plus size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        )}

        {g.format === "rinks" ? (
          <div>
            <div style={sectionLabel}>Rinks</div>
            {(g.rinks || []).map((r, idx) => {
              const rHome = Number(r.home) || 0, rAway = Number(r.away) || 0;
              return (
                <div key={r.id || idx} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "8px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{r.label || `Rink ${idx + 1}`}</div>
                  {/* Only when the rink actually carries a line-up. Games set
                      up before rinks recorded players, and rinks left empty
                      because the draw wasn't made yet, keep the card they had. */}
                  <RinkLineUps rink={r} homeShort={homeShort} awayShort={awayShort} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <ScoreStepper label={homeShort} value={rHome} editable={editable}
                      onDec={() => bumpRink(g, idx, "home", -1)} onInc={() => bumpRink(g, idx, "home", +1)} lead={rHome > rAway} />
                    <ScoreStepper label={awayShort} value={rAway} editable={editable}
                      onDec={() => bumpRink(g, idx, "away", -1)} onInc={() => bumpRink(g, idx, "away", +1)} lead={rAway > rHome} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div style={sectionLabel}>Score</div>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px 14px", marginBottom: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
              <ScoreStepper label={homeShort} value={t.home} editable={editable}
                onDec={() => bumpSingle(g, "home", -1)} onInc={() => bumpSingle(g, "home", +1)} lead={leadHome} big />
              <ScoreStepper label={awayShort} value={t.away} editable={editable}
                onDec={() => bumpSingle(g, "away", -1)} onInc={() => bumpSingle(g, "away", +1)} lead={leadAway} big />
            </div>
          </div>
        )}

        {editable && (
          <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
            {g.status === "scheduled" ? (
              <button onClick={() => goLive(g)} style={{ flex: 1, minWidth: "150px", background: LIVE_RED, border: "none", borderRadius: "10px", color: "#fff", padding: "12px", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                <Radio size={15} strokeWidth={2} />Go live
              </button>
            ) : g.status === "live" ? (
              <button onClick={() => setFinished(g, true)} style={{ flex: 1, minWidth: "150px", background: GOLD, border: "none", borderRadius: "10px", color: "#fff", padding: "12px", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                <Flag size={15} strokeWidth={2} />Mark as finished
              </button>
            ) : (
              <button onClick={() => setFinished(g, false)} style={{ flex: 1, minWidth: "150px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", color: TEXT2, padding: "12px", fontFamily: F_UI, fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                <Radio size={15} strokeWidth={1.75} />Reopen as live
              </button>
            )}
            <button onClick={() => deleteGame(g)} style={{ background: SURFACE, border: `1px solid ${LOSS_RED}44`, borderRadius: "10px", color: LOSS_RED, padding: "12px 16px", fontFamily: F_UI, fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
              <Trash2 size={15} strokeWidth={1.75} />
            </button>
          </div>
        )}

        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: "7px" }}>
          <Radio size={14} strokeWidth={2} />Live Games{
            liveGames.length ? ` · ${liveGames.length} on now`
            : scheduledGames.length ? ` · ${scheduledGames.length} upcoming`
            : ""}
        </div>
        {canCreate && (
          <button onClick={() => setView("create")} style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 14px", fontFamily: F_UI, fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <Plus size={14} strokeWidth={2.5} />New
          </button>
        )}
      </div>

      {missingGame && (
        <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <Clock size={15} strokeWidth={1.75} color={GOLD_MUTED} style={{ flexShrink: 0, marginTop: "1px" }} />
          <div style={{ flex: 1, fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.55 }}>
            That game isn't here any more — it may have been removed. Anything else that's on is below.
          </div>
          <button onClick={() => setMissingGame(false)} aria-label="Dismiss"
            style={{ background: "none", border: "none", padding: "0 0 0 4px", cursor: "pointer", color: TEXT3, display: "flex", flexShrink: 0 }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {!canCreate && (
        <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px", fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.5 }}>
          Set your name in <button onClick={() => setActiveTab("myties")} style={{ background: "none", border: "none", color: GREEN, fontWeight: "700", cursor: "pointer", padding: 0, fontSize: "12px", textDecoration: "underline" }}>My Ties</button> to set up a game. You can still follow any live game below.
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>Loading…</div>
      ) : scheduledGames.length === 0 && liveGames.length === 0 && finishedGames.length === 0 ? (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "40px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
          <Radio size={32} strokeWidth={1} color={BORDER} style={{ marginBottom: "12px" }} />
          <div style={{ fontFamily: F_SANS, fontSize: "20px", fontWeight: "600", color: TEXT2, marginBottom: "6px" }}>No games yet</div>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, lineHeight: 1.5 }}>
            {canCreate ? "Tap New to set up a match — then anyone can follow the score live." : "Live scores will appear here when a game is set up."}
          </div>
        </div>
      ) : (
        <>
          {scheduledGames.length > 0 && (
            <>
              <div style={{ ...sectionLabel, marginTop: "4px" }}>Upcoming</div>
              {scheduledGames.map(g => <GameCard key={g.id} g={g} onOpen={() => { setOpenId(g.id); setView("detail"); }} />)}
            </>
          )}
          {liveGames.length > 0 && (
            <>
              {scheduledGames.length > 0 && <div style={{ ...sectionLabel, marginTop: "22px" }}>On now</div>}
              {/* Only when there is something live to be wrong about. A stale
                  fixture list or an old result costs nobody anything; a score
                  that has stopped moving while the badge says LIVE is the whole
                  bug. Each card already carries its own "N min ago" underneath
                  this, which is the fallback the reader falls back TO. */}
              {connection !== "live" && (
                <div style={{ display: "flex", alignItems: "center", gap: "7px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "9px", padding: "8px 11px", marginBottom: "9px", fontFamily: F_UI, fontSize: "11px", color: TEXT3, lineHeight: 1.45 }}>
                  <WifiOff size={13} strokeWidth={1.75} color={TEXT3} style={{ flexShrink: 0 }} />
                  {connection === "connecting"
                    ? "Connecting to live updates…"
                    : "Live updates are off — checking every 30 seconds. Times below show how old each score is."}
                </div>
              )}
              {liveGames.map(g => <GameCard key={g.id} g={g} onOpen={() => { setOpenId(g.id); setView("detail"); }} />)}
            </>
          )}
          {finishedGames.length > 0 && (
            <>
              <div style={{ ...sectionLabel, marginTop: (liveGames.length || scheduledGames.length) ? "22px" : "4px" }}>Recent results</div>
              {finishedGames.slice(0, 20).map(g => <GameCard key={g.id} g={g} finished onOpen={() => { setOpenId(g.id); setView("detail"); }} />)}
            </>
          )}
        </>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: LIVE_RED, borderRadius: "20px", padding: "3px 10px 3px 8px" }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff", animation: "pulse 1.4s ease-in-out infinite" }} />
      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: "#fff", letterSpacing: "0.14em", textTransform: "uppercase" }}>Live</span>
    </span>
  );
}
function FullTimeBadge() {
  return <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD, letterSpacing: "0.14em", textTransform: "uppercase", border: `1px solid ${GOLD}66`, borderRadius: "20px", padding: "2px 10px" }}>Full time</span>;
}
// Deliberately not a red dot and not animated: a fixture that hasn't started
// must never read as live, however long ago its start time passed.
function UpcomingBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: `1px solid ${GOLD}66`, borderRadius: "20px", padding: "2px 10px 2px 8px" }}>
      <Clock size={10} strokeWidth={2.5} color={GOLD} />
      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD, letterSpacing: "0.14em", textTransform: "uppercase" }}>Upcoming</span>
    </span>
  );
}
function StatusBadge({ status }) {
  if (status === "scheduled") return <UpcomingBadge />;
  if (status === "finished") return <FullTimeBadge />;
  return <LiveBadge />;
}

function TeamCol({ name, score, lead, players = [] }) {
  const { heading, rest } = splitSide(name, players);
  return (
    <div style={{ textAlign: "center", minWidth: 0 }}>
      <div style={{ fontFamily: F_SANS, fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.85)", marginBottom: "4px", overflowWrap: "anywhere", lineHeight: 1.25 }}>{heading}</div>
      <div style={{ fontFamily: F_SANS, fontSize: "44px", fontWeight: "700", color: lead ? GOLD : "#fff", lineHeight: 1 }}>{score}</div>
      {rest.length > 0 && (
        <div style={{ fontFamily: F_UI, fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "6px", lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {rest.map(n => <div key={n}>{n}</div>)}
        </div>
      )}
    </div>
  );
}

function GameCard({ g, finished, onOpen }) {
  const t = totalsFor(g);
  const scheduled = g.status === "scheduled";
  const leadHome = !scheduled && t.home > t.away, leadAway = !scheduled && t.away > t.home;
  const endsLabel = g.ends_total > 0
    ? (g.ends_played >= g.ends_total ? `${g.ends_total} ends` : `End ${(g.ends_played || 0) + 1} of ${g.ends_total}`)
    : null;
  const meta = [shapeLabel(g) || null, endsLabel, g.location].filter(Boolean).join(" · ");
  const stripe = scheduled ? GOLD : finished ? BORDER : LIVE_RED;
  return (
    <button onClick={onOpen} style={{ width: "100%", textAlign: "left", background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${stripe}`, borderRadius: "12px", padding: "13px 15px", marginBottom: "9px", cursor: "pointer", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", opacity: finished ? 0.9 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <StatusBadge status={g.status} />
          {g.title && <span style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>}
        </div>
        {scheduled
          ? g.starts_at && <span style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, flexShrink: 0 }}>{fmtStartTime(g.starts_at)}</span>
          : !finished && <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, flexShrink: 0 }}>{timeAgo(g.updated_at)}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: leadHome ? "700" : "500", color: leadHome ? GREEN : TEXT, overflowWrap: "anywhere", lineHeight: 1.3 }}>{g.home_team}</div>
          <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: leadAway ? "700" : "500", color: leadAway ? GREEN : TEXT, overflowWrap: "anywhere", lineHeight: 1.3 }}>{g.away_team}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {/* A fixture that hasn't started has no score — 0–0 would read as a
              game in progress that nobody is winning. */}
          <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: scheduled ? TEXT3 : leadHome ? WIN_GOLD : TEXT, lineHeight: 1.15 }}>{scheduled ? "–" : t.home}</div>
          <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: scheduled ? TEXT3 : leadAway ? WIN_GOLD : TEXT, lineHeight: 1.15 }}>{scheduled ? "–" : t.away}</div>
        </div>
      </div>
      {meta && (
        <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
          {g.location && <MapPin size={11} strokeWidth={1.75} />}{meta}
        </div>
      )}
    </button>
  );
}

function ScoreStepper({ label, value, editable, onDec, onInc, lead, big }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: TEXT2, marginBottom: "6px", overflowWrap: "anywhere", lineHeight: 1.3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        {editable && <button onClick={onDec} style={stepBtn} aria-label={`${label} minus one`}><Minus size={16} strokeWidth={2.5} /></button>}
        <div style={{ fontFamily: F_SANS, fontSize: big ? "40px" : "30px", fontWeight: "700", color: lead ? WIN_GOLD : TEXT, minWidth: big ? "60px" : "44px", lineHeight: 1 }}>{value}</div>
        {editable && <button onClick={onInc} style={{ ...stepBtn, background: GREEN, color: "#fff", borderColor: GREEN }} aria-label={`${label} plus one`}><Plus size={16} strokeWidth={2.5} /></button>}
      </div>
    </div>
  );
}

// One rink's line-up, under its label and above its steppers. Names only —
// the position a player bowls at is not something the app is told.
function RinkLineUps({ rink, homeShort, awayShort }) {
  const home = Array.isArray(rink.home_players) ? rink.home_players.filter(Boolean) : [];
  const away = Array.isArray(rink.away_players) ? rink.away_players.filter(Boolean) : [];
  if (home.length === 0 && away.length === 0) return null;
  const line = (label, names) => names.length === 0 ? null : (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px", overflowWrap: "anywhere" }}>{label}</div>
      <div style={{ fontFamily: F_SANS, fontSize: "13px", fontWeight: "500", color: TEXT2, lineHeight: 1.4, overflowWrap: "anywhere" }}>{names.join(", ")}</div>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
      {line(homeShort, home)}
      {line(awayShort, away)}
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: GREEN, color: "#fff", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontFamily: F_UI, fontWeight: "600", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center" }}>
      {msg}
    </div>
  );
}

// ── Member picker ────────────────────────────────────────────────────────────
function MemberPicker({ members, selected, onChange, max, placeholder, ariaLabel }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const needle = q.toUpperCase();
    return members
      .filter(m => m.name.toUpperCase().includes(needle) && !selected.includes(m.name))
      .slice(0, 6);
  }, [q, members, selected]);
  const atMax = max > 0 && selected.length >= max;

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {selected.map(name => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: `${GREEN}0f`, border: `1px solid ${GREEN}33`, borderRadius: "20px", padding: "4px 6px 4px 11px", fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: GREEN }}>
              {name}
              <button onClick={() => onChange(selected.filter(n => n !== name))} style={{ background: "none", border: "none", cursor: "pointer", color: GREEN, display: "flex", padding: 0 }} aria-label={`Remove ${name}`}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      {!atMax && (
        <>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder || "Search members…"}
            aria-label={ariaLabel || placeholder || "Search members"} style={inp} />
          {results.length > 0 && (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: "10px", overflow: "hidden", marginTop: "6px" }}>
              {results.map(m => (
                <button key={m.id} onClick={() => { onChange([...selected, m.name]); setQ(""); }}
                  style={{ width: "100%", textAlign: "left", background: SURFACE, border: "none", borderBottom: `1px solid ${BORDER}`, padding: "10px 13px", cursor: "pointer", fontFamily: F_SANS, fontSize: "14px", fontWeight: "500", color: TEXT }}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Create game form ────────────────────────────────────────────────────────
function CreateGame({ myName, cloudKey, myMemberId = null, members, onCancel, onCreated, showToast, pushGame }) {
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("team");
  const [homeTeam, setHomeTeam] = useState("IPBC");
  const [awayTeam, setAwayTeam] = useState("");
  const [venue, setVenue] = useState("home");
  const [location, setLocation] = useState(HOME_GROUND);
  const [numRinks, setNumRinks] = useState(4);
  // A team match records who played, rink by rink. Everything is held here as
  // an array per rink so that changing the number of rinks can't leave a
  // line-up stranded on a rink that no longer exists.
  const [rinkSize, setRinkSize] = useState("rinks");
  const [rinkHome, setRinkHome] = useState([]);
  const [rinkAway, setRinkAway] = useState([]);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState("");
  const [saving, setSaving] = useState(false);
  // An internal club final: both sides are our own members, so the away side
  // gets the same picker as the home side and neither is called "IPBC".
  const [internal, setInternal] = useState(false);
  const [awayMembers, setAwayMembers] = useState([]);
  // Singles is played to 21 shots; pairs and rinks are usually a set number of
  // ends. Null total means no ends limit.
  const [byEnds, setByEnds] = useState(false);
  const [numEnds, setNumEnds] = useState(15);
  // Setting a game up — now or for later — is open to any member who has put
  // their name in. It used to be that scheduling was admin-only, on the
  // reasoning that a fixture is a statement about the club's calendar. In
  // practice that meant the person who actually knows the tie is on couldn't
  // put it up, and the section secretaries were reduced to starting games that
  // had already begun. The people who set up games are the people who play in
  // them.
  const [scheduleIt, setScheduleIt] = useState(false);
  const [startsAt, setStartsAt] = useState("");

  const disc = DISCIPLINES.find(d => d.id === discipline);
  const isTeam = discipline === "team";
  const scheduling = scheduleIt;
  // How many a side each rink of a team match is played at. Drives the pickers
  // and is what gets stored as the discipline, so the size is never a guess
  // made later from the team names.
  const perRink = rinkSizePlayers(rinkSize);
  // Read through these rather than off state directly: the arrays are grown
  // lazily, so a rink that has had nobody added to it yet has no entry at all.
  const rinkHomeAt = i => rinkHome[i] || [];
  const rinkAwayAt = i => rinkAway[i] || [];
  const setRinkSideAt = (setter, i, names) =>
    setter(prev => {
      const next = Array.from({ length: numRinks }, (_, n) => prev[n] || []);
      next[i] = names;
      return next;
    });
  // The squad is the sum of the line-ups, in rink order and without repeats —
  // a player who leads on one rink and skips on another is one member of the
  // squad, not two. This is what keeps home_players meaningful on a team
  // match, where it used to be an empty array.
  const squadFrom = sides => {
    const out = [];
    for (const side of sides) for (const n of side) if (!out.includes(n)) out.push(n);
    return out;
  };
  const homeSquad = squadFrom(Array.from({ length: numRinks }, (_, i) => rinkHomeAt(i)));
  const awaySquad = squadFrom(Array.from({ length: numRinks }, (_, i) => rinkAwayAt(i)));
  // In a team match a member plays one rink, so a name already down anywhere
  // in the match drops out of every other picker. On an internal tie that
  // covers both sides at once, which is also what stops anyone being drawn
  // against themselves.
  const alreadyPicked = [...homeSquad, ...(internal ? awaySquad : [])];
  // On an internal game the two sides are named after who is playing. A team
  // match names itself from the squad, which is the same rule one level up.
  const homeSide = isTeam ? homeSquad : homePlayers;
  const awaySide = isTeam ? awaySquad : awayMembers;
  const homeLabel = internal ? sideName(homeSide) : (homeTeam.trim() || "IPBC");
  const awayLabel = internal ? sideName(awaySide) : awayTeam.trim();

  function toggleSchedule(on) {
    setScheduleIt(on);
    if (on && !startsAt) {
      // Default to the next half hour, which is how fixtures are actually set.
      const d = new Date(Date.now() + 30 * 60 * 1000);
      d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
      setStartsAt(toLocalInputValue(d));
    }
  }

  function pickVenue(v) {
    setVenue(v);
    // sensible default location for a home tie
    if (v === "home" && (!location || location === "")) setLocation(HOME_GROUND);
    if (v === "away" && location === HOME_GROUND) setLocation("");
  }

  // What, if anything, is stopping this game being created. Shown under the
  // button as well as raised as a toast, so it can't be missed.
  const blockedReason =
    internal && (homeSide.length === 0 || awaySide.length === 0)
      ? "Pick the players on both sides"
      : !internal && !awayTeam.trim()
      ? "Add the opponent's name"
      : scheduling && !startsAt
      ? "Add a start time"
      : null;

  async function create() {
    if (blockedReason) { showToast(blockedReason); return; }
    setSaving(true);
    // Each rink carries its own line-up alongside its score. The two player
    // keys are new; every reader treats them as optional, so a game created
    // before this — or one set up without line-ups, which stays allowed —
    // still renders and still scores.
    const rinks = disc.format === "rinks"
      ? Array.from({ length: numRinks }, (_, i) => ({
          id: `r${i + 1}`, label: `Rink ${i + 1}`, home: 0, away: 0,
          home_players: rinkHomeAt(i),
          away_players: internal ? rinkAwayAt(i) : [],
        }))
      : [];
    const away = isTeam
      ? (internal ? awaySquad : awayPlayers.split(",").map(s => s.trim()).filter(Boolean))
      : internal
      ? awayMembers
      : awayPlayers.split(",").map(s => s.trim()).filter(Boolean);
    const row = {
      title: title.trim() || null,
      // A team match stores the size its rinks are played at, not the "team"
      // placeholder. That is the difference between a Balloted Pairs night and
      // an Ayrshire fours tie, and it is not recoverable from the row later.
      discipline: isTeam ? rinkSize : discipline,
      home_team: homeLabel,
      away_team: awayLabel,
      venue,
      location: location.trim(),
      format: disc.format,
      status: scheduling ? "scheduled" : "live",
      starts_at: scheduling ? new Date(startsAt).toISOString() : null,
      rinks,
      home_score: 0,
      away_score: 0,
      home_players: homeSide,
      away_players: away,
      ends_total: byEnds ? numEnds : null,
      ends_played: 0,
      creator_member_id: myMemberId || null,
      // The credential is written ONLY when there is no member id to write
      // instead — i.e. when the signer-in has not linked their roster entry.
      // 67 of 216 members are linked, so this is not a rare path, and the
      // alternative is a game its own marker cannot score. It is the same
      // trade the permission check makes, and it is why creator_cloudkey
      // cannot be dropped yet. A signed-in account always has a
      // player_data.id even when it has no members row — keying on that
      // instead would close this last gap, and is worth deciding before the
      // column is dropped.
      creator_cloudkey: myMemberId ? null : cloudKey,
      creator_name: myName,
      last_updated_by: myName,
    };
    const { data, error } = await supabase.from("live_games").insert(row).select().single();
    setSaving(false);
    if (error || !data) {
      showToast(error?.message ? `Couldn't create: ${error.message}` : "Couldn't create — no response from the server");
      return;
    }
    pushGame(data);
    onCreated(data.id);
  }

  return (
    <div>
      <button onClick={onCancel} style={backBtn}><ChevronLeft size={14} strokeWidth={2} />Cancel</button>
      <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: GREEN, marginBottom: "16px" }}>
        {scheduling ? "Schedule a game" : "Set up a live game"}
      </div>

      <Field label="When">
        <div style={{ display: "flex", gap: "8px", marginBottom: scheduleIt ? "8px" : 0 }}>
          <button onClick={() => toggleSchedule(false)} style={toggleBtn(!scheduleIt)}>Starting now</button>
          <button onClick={() => toggleSchedule(true)} style={toggleBtn(scheduleIt)}>Schedule it</button>
        </div>
        {scheduleIt && (
          <>
            <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={inp} />
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px", lineHeight: 1.5 }}>
              Listed under Upcoming until someone takes it live. It won't show a score, and the start time passing doesn't start it.
            </div>
          </>
        )}
      </Field>

      <Field label="Type of game">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: "8px" }}>
          {DISCIPLINES.map(d => (
            <button key={d.id} onClick={() => setDiscipline(d.id)} style={toggleBtn(discipline === d.id)}>{d.label}</button>
          ))}
        </div>
        {isTeam && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "6px" }}>Several rinks totalled together — e.g. an Ayrshire or Scotland tie.</div>}
      </Field>

      <Field label="Occasion / competition (optional)">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ayrshire Cup" style={inp} />
      </Field>

      <Field label="Who's playing?">
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setInternal(false)} style={toggleBtn(!internal)}>Another club</button>
          <button onClick={() => setInternal(true)} style={toggleBtn(internal)}>Two of our own</button>
        </div>
        {internal && (
          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "6px", lineHeight: 1.5 }}>
            A club final or an internal tie. Both sides are named after the players, so the
            scoreboard doesn't read "IPBC v IPBC".
          </div>
        )}
      </Field>

      {!internal && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <Field label="Home team"><input value={homeTeam} onChange={e => setHomeTeam(e.target.value)} style={inp} /></Field>
          <Field label="Away team"><input value={awayTeam} onChange={e => setAwayTeam(e.target.value)} placeholder="Opponent" style={inp} /></Field>
        </div>
      )}

      {isTeam ? (
        <>
          <Field label="How many rinks?">
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <button onClick={() => setNumRinks(n => Math.max(1, n - 1))} style={stepBtn} aria-label="One rink fewer"><Minus size={16} strokeWidth={2.5} /></button>
              <span style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: TEXT, minWidth: "34px", textAlign: "center" }}>{numRinks}</span>
              <button onClick={() => setNumRinks(n => Math.min(12, n + 1))} style={{ ...stepBtn, background: GREEN, color: "#fff", borderColor: GREEN }} aria-label="One rink more"><Plus size={16} strokeWidth={2.5} /></button>
            </div>
          </Field>

          <Field label="Each rink is played as">
            <div style={{ display: "flex", gap: "8px" }}>
              {RINK_SIZES.map(sz => (
                <button key={sz.id} onClick={() => setRinkSize(sz.id)} style={toggleBtn(rinkSize === sz.id)}>{sz.pick}</button>
              ))}
            </div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "6px", lineHeight: 1.5 }}>
              Recorded on the game, so a Balloted Pairs night isn't filed as the same thing as a fours tie.
            </div>
          </Field>

          {/* Optional against another club, on purpose: a team match could
              always be set up with no players at all and often is — somebody
              puts the fixture on the moment it is known and the rinks are
              drawn later — and taking that away to gain the line-ups would be
              a bad trade. Between two of our own it is not optional, because
              there the line-ups are what the two sides are called. */}
          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Users size={13} strokeWidth={2} />Line-ups{internal ? "" : " (optional)"}</span>}>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginBottom: "8px", lineHeight: 1.5 }}>
              {perRink} a side on each rink.{internal ? "" : " Leave a rink empty if it isn't settled yet."}
            </div>
            {Array.from({ length: numRinks }, (_, i) => (
              <div key={i} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
                <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Rink {i + 1}</div>
                <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: TEXT2, marginBottom: "5px" }}>
                  {internal ? "First side" : `${homeTeam.trim() || "IPBC"} — pick ${perRink}`}
                </div>
                <MemberPicker members={members.filter(m => !alreadyPicked.includes(m.name))}
                  selected={rinkHomeAt(i)} onChange={names => setRinkSideAt(setRinkHome, i, names)}
                  max={perRink} placeholder="Search members…"
                  ariaLabel={`Rink ${i + 1} ${internal ? "first side" : "IPBC players"}`} />
                {internal && (
                  <>
                    <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: TEXT2, margin: "9px 0 5px" }}>Second side</div>
                    <MemberPicker members={members.filter(m => !alreadyPicked.includes(m.name))}
                      selected={rinkAwayAt(i)} onChange={names => setRinkSideAt(setRinkAway, i, names)}
                      max={perRink} placeholder="Search members…"
                      ariaLabel={`Rink ${i + 1} second side`} />
                  </>
                )}
              </div>
            ))}
            {homeSquad.length > 0 && (
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, marginTop: "2px", fontWeight: "600", lineHeight: 1.5 }}>
                Squad: {homeSquad.join(", ")}
              </div>
            )}
          </Field>

          {!internal && (
            <Field label="Opponent players (optional)">
              <input value={awayPlayers} onChange={e => setAwayPlayers(e.target.value)} placeholder="Names, separated by commas" style={inp} />
            </Field>
          )}
        </>
      ) : (
        <>
          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Users size={13} strokeWidth={2} />{
            internal ? `First side${disc.players ? ` — pick ${disc.players}` : ""}`
                     : `IPBC players${disc.players ? ` — pick ${disc.players}` : ""}`}</span>}>
            <MemberPicker members={members} selected={homePlayers} onChange={setHomePlayers}
              max={disc.players} placeholder="Search members…"
              ariaLabel={internal ? "First side" : "IPBC players"} />
            {internal && homePlayers.length > 0 && (
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, marginTop: "6px", fontWeight: "600" }}>
                Shown as: {sideName(homePlayers)}
              </div>
            )}
            {/* The picker stops at the discipline's size, which is right — and
                was read as the form refusing to take a full club tie, because
                the other three names go in the side below and that side is
                only offered once "Two of our own" is on. Say so where the
                picker fills up, not in the release notes. */}
            {!internal && disc.players > 0 && homePlayers.length >= disc.players && (
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "6px", lineHeight: 1.5 }}>
                That's {disc.players} — a full side. Both sides ours? Switch "Who's playing?" to
                "Two of our own" and you can pick all {disc.players * 2}.
              </div>
            )}
          </Field>

          {internal ? (
            <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Users size={13} strokeWidth={2} />Second side{disc.players ? ` — pick ${disc.players}` : ""}</span>}>
              <MemberPicker members={members.filter(m => !homePlayers.includes(m.name))}
                selected={awayMembers} onChange={setAwayMembers}
                max={disc.players} placeholder="Search members…"
                ariaLabel="Second side" />
              {awayMembers.length > 0 && (
                <div style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, marginTop: "6px", fontWeight: "600" }}>
                  Shown as: {sideName(awayMembers)}
                </div>
              )}
            </Field>
          ) : (
            <Field label="Opponent players (optional)">
              <input value={awayPlayers} onChange={e => setAwayPlayers(e.target.value)} placeholder="Names, separated by commas" style={inp} />
            </Field>
          )}
        </>
      )}

      <Field label="How is it played?">
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setByEnds(false)} style={toggleBtn(!byEnds)}>To 21 shots</button>
          <button onClick={() => setByEnds(true)} style={toggleBtn(byEnds)}>Set number of ends</button>
        </div>
        {byEnds && (
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px" }}>
            <button onClick={() => setNumEnds(n => Math.max(1, n - 1))} style={stepBtn} aria-label="One end fewer"><Minus size={16} strokeWidth={2.5} /></button>
            <div style={{ textAlign: "center", minWidth: "84px" }}>
              <div style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: TEXT, lineHeight: 1 }}>{numEnds}</div>
              <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "3px" }}>ends</div>
            </div>
            <button onClick={() => setNumEnds(n => Math.min(30, n + 1))} style={{ ...stepBtn, background: GREEN, color: "#fff", borderColor: GREEN }} aria-label="One end more"><Plus size={16} strokeWidth={2.5} /></button>
          </div>
        )}
      </Field>

      <Field label="Where is it?">
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          {[["home", "Home"], ["away", "Away"]].map(([v, l]) => (
            <button key={v} onClick={() => pickVenue(v)} style={toggleBtn(venue === v)}>{l}</button>
          ))}
        </div>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Green / address so supporters can find it" style={inp} />
        <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px" }}>Shown as a tappable map link on the scoreboard.</div>
      </Field>

      {blockedReason && (
        <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "9px", padding: "10px 13px", marginTop: "4px", marginBottom: "10px", fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.5 }}>
          {blockedReason} before you can start.
        </div>
      )}

      <button onClick={create} disabled={saving} style={{ width: "100%", marginTop: "10px", background: saving ? TEXT3 : GOLD, border: "none", borderRadius: "10px", color: "#fff", padding: "14px", fontFamily: F_UI, fontSize: "14px", fontWeight: "700", cursor: saving ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        <CircleCheckBig size={17} strokeWidth={2} />{saving ? "Creating…" : scheduling ? "Schedule game" : "Start live game"}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: TEXT2, marginBottom: "6px", letterSpacing: "0.02em" }}>{label}</div>
      {children}
    </div>
  );
}

// ── shared styles ──
const backBtn = { background: "none", border: "none", color: TEXT2, cursor: "pointer", fontSize: "13px", padding: "0 0 16px", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px" };
const sectionLabel = { fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" };
const stepBtn = { width: "38px", height: "38px", borderRadius: "10px", border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT2, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const inp = { width: "100%", padding: "11px 13px", borderRadius: "10px", border: `1px solid ${BORDER}`, fontSize: "14px", fontFamily: F_UI, color: TEXT };
const toggleBtn = active => ({ flex: 1, padding: "11px 8px", borderRadius: "10px", border: `1px solid ${active ? GREEN : BORDER}`, background: active ? GREEN : SURFACE, color: active ? "#fff" : TEXT2, fontFamily: F_UI, fontSize: "13px", fontWeight: active ? "700" : "500", cursor: "pointer" });
