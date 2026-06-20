import { useState } from "react";
import { Phone } from "lucide-react";
import { GREEN, GOLD, GOLD_MUTED, MID, SURFACE, BORDER, TEXT, TEXT2, TEXT3, F_SANS, F_UI } from "../../lib/theme.js";
import { DEFAULT_TOURNAMENTS } from "../../lib/constants.js";
import { rowsToDisplay, ViewToggle, BracketDisplay, BracketTreeView } from "../DrawViewer.jsx";

export default function FindTab({ search, setSearch, playerGames, tournaments, publishedDraws = [], drawPairings = [], onH2H }) {
  const TOURNAMENTS = tournaments || DEFAULT_TOURNAMENTS;
  const [selectedDraw, setSelectedDraw] = useState(null); // {draw, rows}
  const [viewMode, setViewMode]         = useState("list");

  // ── Deduplicate search results ──
  const seen = new Set();
  const uniqueGames = (Array.isArray(playerGames) ? playerGames : []).filter(g => {
    const key = [g.tournamentId, g.entry, g.opponent].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Open a competition full draw ──
  function openDraw(draw) {
    const rows = drawPairings.filter(p => p.draw_id === draw.id);
    setSelectedDraw({ draw, rows });
    setViewMode("list");
  }

  // ── Full competition bracket view ──
  if (selectedDraw) {
    const { draw, rows } = selectedDraw;
    const { slots, prelims } = rows.length ? rowsToDisplay(rows) : { slots: [], prelims: [] };
    const roundDates = draw.round_dates || [];
    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <button onClick={() => setSelectedDraw(null)}
            style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer", fontFamily: F_UI, fontSize: "13px", padding: 0 }}>
            ← Back
          </button>
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "15px", fontWeight: "700", color: TEXT }}>{draw.tournament_name}</div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{draw.season_year} season · {draw.published_at ? `Published ${new Date(draw.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</div>
          </div>
        </div>

        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />

        {rows.length === 0
          ? <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, textAlign: "center", padding: "30px" }}>Loading draw…</div>
          : viewMode === "bracket"
            ? <BracketTreeView slots={slots} prelims={prelims} roundDates={roundDates} />
            : <BracketDisplay  slots={slots} prelims={prelims} />
        }
      </div>
    );
  }

  return (
    <div>
      {/* Search box */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>Find Draw Games by Surname</div>
        <input type="text" placeholder="e.g. FREW, SMITH, BOYD…" value={search} onChange={e => setSearch(e.target.value)} autoFocus
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "16px", border: `1px solid ${BORDER}`, borderRadius: "6px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, letterSpacing: "1px" }} />
      </div>

      {/* Search results */}
      {search.length >= 2 && uniqueGames.length === 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "28px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>🔍</div>
          <div style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: TEXT, marginBottom: "8px" }}>No draw found for "{search}"</div>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.6 }}>
            Check the tie board in the clubhouse, or the draw may not have been published yet.
          </div>
        </div>
      )}

      {search.length >= 2 && uniqueGames.map((g) => (
        <div key={`${g.drawId}-${g.entry}-${g.opponent}`} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: "10px", padding: "14px", marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "5px" }}>
            <span style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.tournament}</span>
            {g.seasonYear && <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>{g.seasonYear} season</span>}
          </div>
          {g.isBye ? (
            <div style={{ background: `${GOLD}0a`, border: `1px solid ${GOLD}22`, borderRadius: "6px", padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>{g.roundType === 'prelim' ? "Preliminary Round" : "Round 1"}</div>
              <div style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.entry} — <span style={{ color: GOLD_MUTED }}>BYE</span></div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1, background: `${GOLD}0a`, border: `1px solid ${GOLD}22`, borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>{g.roundType === 'prelim' ? "Preliminary" : "Round 1"}</div>
                <div style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.entry}</div>
              </div>
              <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px" }}>vs</div>
              <div style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>Opponent</div>
                {onH2H
                  ? <button onClick={() => onH2H(g.opponent)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT, textAlign: "left" }}>{g.opponent}</button>
                  : <div style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.opponent}</div>}
                {g.oppPhone && <a href={`tel:${g.oppPhone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", marginTop: "4px" }}><Phone size={12} strokeWidth={1.75} />{g.oppPhone}</a>}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Competition list (no search active) */}
      {!search && (
        <div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Competitions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {TOURNAMENTS.filter(t => t.source !== "personal").map(t => {
              const draw = publishedDraws.find(d => d.tournament_id === t.id);
              return (
                <button key={t.id} onClick={() => draw && openDraw(draw)} disabled={!draw}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", cursor: draw ? "pointer" : "default", textAlign: "left", width: "100%", opacity: draw ? 1 : 0.5 }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: t.color || MID, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{t.name}</div>
                    {draw && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px" }}>Tap to view full draw</div>}
                  </div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: draw ? GREEN : TEXT3 }}>
                    {draw ? "Draw live ✓" : "Not published"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
