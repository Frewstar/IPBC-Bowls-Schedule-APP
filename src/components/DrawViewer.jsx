import { Fragment } from "react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, BORDER, TEXT, TEXT2, TEXT3, F_UI } from "../lib/theme.js";

export const BRACKET_SIZE = 64;

export function bracketPairs(slots) {
  const pairs = [];
  for (let i = 0; i < BRACKET_SIZE; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a?.name || b?.name) pairs.push({ slotA: a, slotB: b });
  }
  return pairs;
}

export function rowsToDisplay(rows) {
  const mainRows = rows.filter(r => r.round_type === 'main');
  const slots = Array(BRACKET_SIZE).fill(null).map((_, i) => {
    const row = mainRows.find(r => r.slot_index === i + 1);
    return { slotIndex: i + 1, name: row?.player_name || null, handicap: row?.handicap || null };
  });
  const seenIdx = new Set();
  const prelims = [];
  rows.filter(r => r.round_type === 'prelim').forEach(r => {
    if (seenIdx.has(r.pairing_index)) return;
    seenIdx.add(r.pairing_index);
    const mirror = rows.find(x => x.round_type === 'prelim' && x.pairing_index === r.pairing_index && x.player_name !== r.player_name);
    prelims.push({
      p1: { name: r.player_name, handicap: r.handicap },
      p2: mirror ? { name: mirror.player_name, handicap: mirror.handicap } : null,
    });
  });
  prelims.sort((a, b) => a.p1.name.localeCompare(b.p1.name));
  return { slots, prelims };
}

export function fmtRoundDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ViewToggle({ viewMode, setViewMode }) {
  const btn = (mode, label) => (
    <button onClick={() => setViewMode(mode)} style={{ flex: 1, padding: "7px", fontFamily: F_UI, fontSize: "12px", fontWeight: "600", border: `1px solid ${BORDER}`, borderRadius: "6px", cursor: "pointer", background: viewMode === mode ? MID : SURFACE, color: viewMode === mode ? "#fff" : TEXT2 }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
      {btn("list", "☰  List")}
      {btn("bracket", "⎇  Bracket")}
    </div>
  );
}

export function BracketDisplay({ slots, prelims = [] }) {
  const pairs = bracketPairs(slots);
  const isMitchell = slots.some(s => s.handicap);

  function playerLabel(s) {
    if (!s?.name) return null;
    return s.handicap ? `${s.name}  ${s.handicap}` : s.name;
  }

  return (
    <div>
      {prelims.length > 0 && (
        <div style={{ marginBottom: "18px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Preliminary Round</div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginBottom: "8px", lineHeight: 1.5 }}>Play these matches first. Winners enter the main draw.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {prelims.map((match) => (
              <div key={match.p1?.name || match.p2?.name} style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}33`, borderRadius: "8px", padding: "9px 13px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{match.p1?.name}{match.p1?.handicap ? <span style={{ color: GOLD_MUTED, fontWeight: "400", marginLeft: "6px" }}>{match.p1.handicap}</span> : null}</div>
                <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>vs</div>
                <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: match.p2 ? "600" : "500", color: match.p2 ? TEXT : GOLD_MUTED, textAlign: "right" }}>
                  {match.p2 ? <>{match.p2.name}{match.p2.handicap ? <span style={{ color: GOLD_MUTED, fontWeight: "400", marginLeft: "6px" }}>{match.p2.handicap}</span> : null}</> : "BYE"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
        Main Draw {isMitchell && <span style={{ color: GOLD_MUTED, fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>— handicaps shown</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {pairs.map(({ slotA, slotB }, i) => {
          const aName = playerLabel(slotA);
          const bName = playerLabel(slotB);
          const isBye = aName && !bName;
          return (
            <div key={i} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "9px 13px", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "26px", textAlign: "right", fontFamily: F_UI, fontSize: "10px", color: TEXT3, flexShrink: 0 }}>{slotA?.slotIndex}</div>
              <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: aName ? "600" : "400", color: aName ? TEXT : TEXT3 }}>{aName || "—"}</div>
              <div style={{ fontFamily: F_UI, fontSize: "10px", color: isBye ? GOLD_MUTED : TEXT3, fontWeight: isBye ? "600" : "400" }}>{isBye ? "BYE" : "vs"}</div>
              <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: bName ? "600" : "400", color: bName ? TEXT : TEXT3, textAlign: "right" }}>{bName || (isBye ? "" : "—")}</div>
              <div style={{ width: "26px", fontFamily: F_UI, fontSize: "10px", color: TEXT3, flexShrink: 0 }}>{slotB?.slotIndex}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BracketTreeView({ slots, prelims = [], roundDates = [] }) {
  const ROW_H   = 20;
  const N       = BRACKET_SIZE;
  const ROUNDS  = 6;
  const HDR     = 22;
  const NUM_W   = 24;
  const NAME_W  = 138;
  const BRACE_W = 22;
  const LINE_W  = 82;
  const TOTAL_H = N * ROW_H;
  const LABELS  = ["1st Round", "2nd Round", "3rd Round", "4th Round", "Semi-Final", "Final"];

  const nameMap = {};
  (slots || []).forEach(s => { if (s?.name) nameMap[s.slotIndex] = s.name; });

  const ply  = i         => (i + 1) * ROW_H;
  const rly  = (ri, g)   => (2 * g + 1) * Math.pow(2, ri) * ROW_H + ROW_H * 0.5;
  const bTop = (ri, g)   => ri === 0 ? ply(2 * g)     : rly(ri - 1, 2 * g);
  const bBot = (ri, g)   => ri === 0 ? ply(2 * g + 1) : rly(ri - 1, 2 * g + 1);

  return (
    <div>
      {prelims.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Preliminary Round</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {prelims.map((m) => (
              <div key={m.p1?.name || m.p2?.name} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: `${GOLD}08`, border: `1px solid ${GOLD}33`, borderRadius: "7px", fontFamily: F_UI, fontSize: "12px" }}>
                <span style={{ flex: 1, fontWeight: "600", color: TEXT }}>{m.p1?.name}</span>
                <span style={{ color: TEXT3, fontSize: "10px" }}>vs</span>
                <span style={{ flex: 1, fontWeight: m.p2 ? "600" : "400", color: m.p2 ? TEXT : GOLD_MUTED, textAlign: "right" }}>{m.p2?.name || "BYE"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "72vh", border: `1px solid ${BORDER}`, borderRadius: "8px", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: "fit-content", padding: "0 6px 6px" }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ height: HDR }} />
            {Array.from({ length: N }, (_, i) => {
              const name = nameMap[i + 1];
              return (
                <div key={i} style={{ height: ROW_H, display: "flex", alignItems: "flex-end" }}>
                  <span style={{ width: NUM_W, fontFamily: F_UI, fontSize: "9px", color: TEXT3, textAlign: "right", paddingRight: "4px", paddingBottom: "3px", flexShrink: 0, lineHeight: 1 }}>{i + 1}</span>
                  <div style={{ width: NAME_W, borderBottom: `1px solid ${name ? TEXT3 : BORDER}`, fontFamily: F_UI, fontSize: "11px", color: name ? TEXT : "transparent", paddingLeft: "3px", paddingBottom: "2px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {name || "."}
                  </div>
                </div>
              );
            })}
          </div>
          {Array.from({ length: ROUNDS }, (_, ri) => {
            const gc     = N / Math.pow(2, ri + 1);
            const isLast = ri === ROUNDS - 1;
            const colW   = isLast ? LINE_W + 20 : LINE_W;
            return (
              <Fragment key={ri}>
                <svg width={BRACE_W} height={TOTAL_H + HDR} style={{ display: "block", flexShrink: 0 }}>
                  {Array.from({ length: gc }, (_, g) => {
                    const tY = bTop(ri, g) + HDR;
                    const bY = bBot(ri, g) + HDR;
                    const mY = rly(ri, g)  + HDR;
                    const x  = BRACE_W / 2;
                    return (
                      <g key={g}>
                        <line x1={0} y1={tY} x2={x} y2={tY} stroke={BORDER} strokeWidth={0.8} />
                        <line x1={x} y1={tY} x2={x} y2={bY} stroke={BORDER} strokeWidth={0.8} />
                        <line x1={0} y1={bY} x2={x} y2={bY} stroke={BORDER} strokeWidth={0.8} />
                        <line x1={x} y1={mY} x2={BRACE_W} y2={mY} stroke={BORDER} strokeWidth={0.8} />
                      </g>
                    );
                  })}
                </svg>
                <div style={{ width: colW, flexShrink: 0, position: "relative", height: TOTAL_H + HDR }}>
                  <div style={{ height: HDR, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: "3px", whiteSpace: "nowrap" }}>
                    <div style={{ fontFamily: F_UI, fontSize: "9px", color: GOLD_MUTED, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em" }}>{LABELS[ri]}</div>
                    {roundDates[ri] && <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, marginTop: "1px" }}>{fmtRoundDate(roundDates[ri])}</div>}
                  </div>
                  {Array.from({ length: gc }, (_, g) => (
                    <div key={g} style={{ position: "absolute", top: rly(ri, g) + HDR, left: 0, right: isLast ? 10 : 0, height: 1, background: isLast ? MID : BORDER }} />
                  ))}
                  {isLast && (
                    <div style={{ position: "absolute", top: rly(ROUNDS - 1, 0) + HDR + 4, left: 3, fontFamily: F_UI, fontSize: "9px", color: MID, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Winner
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
