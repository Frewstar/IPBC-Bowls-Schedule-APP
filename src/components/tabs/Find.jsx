import { Phone } from "lucide-react";
import { GREEN, GOLD, GOLD_MUTED, SURFACE, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_UI } from "../../lib/theme.js";
import { DEFAULT_TOURNAMENTS } from "../../lib/constants.js";

export default function FindTab({ search, setSearch, playerGames, tournaments, onH2H }) {
  const TOURNAMENTS = tournaments || DEFAULT_TOURNAMENTS;
  return (
    <div>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>Find Draw Games by Surname</div>
        <input type="text" placeholder="e.g. FREW, SMITH, BOYD…" value={search} onChange={e => setSearch(e.target.value)} autoFocus
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "16px", border: `1px solid ${BORDER}`, borderRadius: "6px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, letterSpacing: "1px" }} />
      </div>
      {search.length >= 2 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "28px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>🔍</div>
          <div style={{ fontFamily: F_DISPLAY, fontSize: "20px", fontWeight: "700", color: GREEN, marginBottom: "8px" }}>Draw lookup coming soon</div>
          <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6 }}>
            This will show real draw results once the club sets this up for the season. Check the tie board in the clubhouse in the meantime.
          </div>
        </div>
      )}
      {Array.isArray(playerGames) && playerGames.map((g, i) => (
        <div key={i} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: "10px", padding: "14px", marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "5px" }}>
            <span style={{ fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.tournament}</span>
            <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, letterSpacing: "0.3px" }}>{g.date}</span>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div style={{ flex: 1, background: `${GOLD}0a`, border: `1px solid ${GOLD}22`, borderRadius: "6px", padding: "10px 12px" }}>
              <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>You</div>
              <div style={{ fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.entry}</div>
            </div>
            <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px" }}>vs</div>
            <div style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "10px 12px" }}>
              <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>Opponent</div>
              {onH2H
                ? <button onClick={() => onH2H(g.opponent)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: TEXT, textAlign: "left" }}>{g.opponent}</button>
                : <div style={{ fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: TEXT }}>{g.opponent}</div>}
              {g.oppPhone && <a href={`tel:${g.oppPhone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500" }}><Phone size={12} strokeWidth={1.75} />{g.oppPhone}</a>}
            </div>
          </div>
        </div>
      ))}
      {!search && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "18px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, marginBottom: "12px", letterSpacing: "2px", textTransform: "uppercase" }}>Competitions</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
            {TOURNAMENTS.map(t => (
              <div key={t.id} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: "20px", padding: "5px 12px", fontFamily: F_UI, fontSize: "11px", color: TEXT2, letterSpacing: "0.5px" }}>{t.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
