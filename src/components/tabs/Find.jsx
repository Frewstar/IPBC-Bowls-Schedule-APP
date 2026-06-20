import { useState } from "react";
import { Phone } from "lucide-react";
import { GREEN, GOLD, GOLD_MUTED, MID, SURFACE, BORDER, TEXT, TEXT2, TEXT3, F_SANS, F_UI } from "../../lib/theme.js";
import { DEFAULT_TOURNAMENTS } from "../../lib/constants.js";
import { rowsToDisplay, fmtRoundDate, ViewToggle, BracketDisplay, BracketTreeView, BRACKET_SIZE } from "../DrawViewer.jsx";

function printTieSheet(draw, slots, prelims, roundDates) {
  const LABELS  = ["1st Round", "2nd Round", "3rd Round", "4th Round", "Semi-Final", "Final"];
  const ROW_H = 13, N = BRACKET_SIZE, ROUNDS = 6, HDR = 26;
  const NUM_W = 22, NAME_W = 138, BRACE_W = 20, LINE_W = 88;
  const TOTAL_H = N * ROW_H;
  const nameMap = {};
  (slots || []).forEach(s => { if (s?.name) nameMap[s.slotIndex] = s; });
  const ply  = i       => (i + 1) * ROW_H;
  const rly  = (ri, g) => (2 * g + 1) * Math.pow(2, ri) * ROW_H + ROW_H * 0.5;
  const bTop = (ri, g) => ri === 0 ? ply(2 * g)     : rly(ri - 1, 2 * g);
  const bBot = (ri, g) => ri === 0 ? ply(2 * g + 1) : rly(ri - 1, 2 * g + 1);
  let nameRows = "";
  for (let i = 0; i < N; i++) {
    const s = nameMap[i + 1];
    nameRows += `<div style="height:${ROW_H}px;display:flex;align-items:flex-end;"><span style="width:${NUM_W}px;font-size:8px;color:#999;text-align:right;padding-right:3px;flex-shrink:0;padding-bottom:1px;">${i+1}</span><div style="width:${NAME_W}px;border-bottom:1px solid ${s?.name?"#333":"#bbb"};font-size:${s?.name?"10":"9"}px;font-weight:${s?.name?"600":"400"};color:${s?.name?"#111":"#ccc"};padding-left:3px;padding-bottom:1px;white-space:nowrap;overflow:hidden;">${s?.name?s.name+(s.handicap?` (${s.handicap})`:""):""}</div></div>`;
  }
  let bracketCols = "";
  for (let ri = 0; ri < ROUNDS; ri++) {
    const gc = N / Math.pow(2, ri + 1), isLast = ri === ROUNDS - 1, colW = isLast ? LINE_W + 24 : LINE_W;
    let svgLines = "", resultLines = "";
    for (let g = 0; g < gc; g++) {
      const tY = bTop(ri,g)+HDR, bY = bBot(ri,g)+HDR, mY = rly(ri,g)+HDR, x = BRACE_W/2;
      svgLines += `<line x1="0" y1="${tY}" x2="${x}" y2="${tY}" stroke="#aaa" stroke-width="0.7"/><line x1="${x}" y1="${tY}" x2="${x}" y2="${bY}" stroke="#aaa" stroke-width="0.7"/><line x1="0" y1="${bY}" x2="${x}" y2="${bY}" stroke="#aaa" stroke-width="0.7"/><line x1="${x}" y1="${mY}" x2="${BRACE_W}" y2="${mY}" stroke="#aaa" stroke-width="0.7"/>`;
      resultLines += `<div style="position:absolute;top:${mY}px;left:0;right:${isLast?12:0}px;height:1px;background:${isLast?"#333":"#aaa"};"></div>`;
    }
    const dateStr = roundDates[ri] ? fmtRoundDate(roundDates[ri]) : "";
    const winnerHtml = isLast ? `<div style="position:absolute;top:${rly(ROUNDS-1,0)+HDR+4}px;left:2px;font-size:8px;font-weight:800;text-transform:uppercase;color:#333;">Winner</div>` : "";
    bracketCols += `<svg width="${BRACE_W}" height="${TOTAL_H+HDR}" style="display:block;flex-shrink:0;overflow:visible;">${svgLines}</svg><div style="width:${colW}px;flex-shrink:0;position:relative;height:${TOTAL_H+HDR}px;"><div style="height:${HDR}px;padding-left:2px;display:flex;flex-direction:column;justify-content:center;"><div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#444;">${LABELS[ri]}</div>${dateStr?`<div style="font-size:7px;color:#888;margin-top:1px;">${dateStr}</div>`:""}</div>${resultLines}${winnerHtml}</div>`;
  }
  const prelimHtml = prelims.length > 0 ? `<div style="margin-bottom:10px;"><div style="font-size:10px;font-weight:800;text-transform:uppercase;border-bottom:1.5px solid #333;padding-bottom:3px;margin-bottom:5px;">Preliminary Round</div><table style="border-collapse:collapse;font-size:10px;">${prelims.map(m=>`<tr><td style="padding:3px 8px 3px 0;font-weight:600;">${m.p1?.name||""}${m.p1?.handicap?` (${m.p1.handicap})`:""}</td><td style="padding:3px 8px;color:#888;font-size:8px;">vs</td><td style="padding:3px 8px 3px 0;font-weight:600;">${m.p2?m.p2.name+(m.p2.handicap?` (${m.p2.handicap})`:""): "BYE"}</td></tr>`).join("")}</table></div>` : "";
  const safeName = (draw?.tournament_name||"Draw").replace(/"/g,"");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${safeName} ${draw?.season_year||""}</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;color:#111;padding:10px 14px;}@page{size:A4 landscape;margin:8mm;}@media print{body{padding:0;}.toolbar{display:none!important;}}</style></head><body><div class="toolbar" style="display:flex;gap:8px;padding:10px 14px;background:#f5f5f5;border-bottom:1px solid #ddd;margin:-10px -14px 12px;"><button onclick="window.print()" style="flex:1;padding:9px 16px;background:#1a5e35;color:#fff;border:none;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">🖨️ Print</button><button onclick="(function(){var o=document.title;document.title='${safeName}_${draw?.season_year||""}.pdf';window.print();document.title=o;})()" style="flex:1;padding:9px 16px;background:#fff;color:#1a5e35;border:2px solid #1a5e35;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">💾 Save as PDF</button><button onclick="window.close()" style="padding:9px 14px;background:#fff;color:#888;border:1px solid #ccc;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;cursor:pointer;">✕ Close</button></div><div style="text-align:center;border-bottom:2px solid #111;padding-bottom:7px;margin-bottom:8px;"><div style="font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:#777;">Irvine Park Bowling Club</div><div style="font-size:17px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;margin-top:2px;">${draw?.tournament_name||"Competition"}</div><div style="font-size:9px;color:#666;margin-top:2px;">${draw?.season_year||""} Season</div></div>${prelimHtml}<div style="display:flex;align-items:flex-start;"><div style="flex-shrink:0;"><div style="height:${HDR}px;display:flex;align-items:flex-end;padding-bottom:3px;"><span style="width:${NUM_W}px;"></span><div style="width:${NAME_W}px;font-size:7px;font-weight:700;text-transform:uppercase;color:#999;letter-spacing:0.08em;padding-left:3px;">Player</div></div>${nameRows}</div>${bracketCols}</div><div style="margin-top:7px;font-size:8px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:5px;">Irvine Park Bowling Club · IPBC Bowls App</div></body></html>`;
  const w = window.open("","_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

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
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F_UI, fontSize: "15px", fontWeight: "700", color: TEXT }}>{draw.tournament_name}</div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{draw.season_year} season · {draw.published_at ? `Published ${new Date(draw.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</div>
          </div>
          <button onClick={() => printTieSheet(draw, slots, prelims, roundDates)}
            style={{ padding: "7px 12px", background: GREEN, border: "none", borderRadius: "8px", color: "#fff", fontFamily: F_UI, fontSize: "12px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>
            🖨️ Print
          </button>
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
