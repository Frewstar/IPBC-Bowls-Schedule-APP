import { useState } from "react";
import { Trophy, Phone, ChevronDown, Shield, MapPin, Star, Clock } from "lucide-react";
import { GREEN, GOLD, GOLD_LIGHT, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_SANS, F_UI } from "../../lib/theme.js";
import { CLUB_POSITIONS } from "./Members.jsx";

// Position display order for the committee section (Management Committee handled separately)
const OFFICER_POSITIONS = CLUB_POSITIONS.filter(p => p && p !== "Management Committee");
const POSITION_ORDER = Object.fromEntries(OFFICER_POSITIONS.map((p, i) => [p, i]));

export const HONORARY_MEMBERS = [
  "T. Shields", "K. Houston", "W. Reid", "J B Muir",
];

export const ROLL_OF_HONOUR = [
  { id: "championship",   name: "Championship",      color: "#ef4444", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "presidents",     name: "Presidents",        color: "#f59e0b", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "morton",         name: "Morton",            color: "#06b6d4", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "donaldson",      name: "Donaldson",         color: "#ec4899", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "mitchell",       name: "Mitchell Handicap", color: "#84cc16", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "pairs",          name: "Pairs",             color: "#f97316", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "triples",        name: "Triples",           color: "#10b981", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "rinks",          name: "Rinks",             color: "#8b5cf6", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "mixed-pairs",    name: "Mixed Pairs",       color: "#a78bfa", winners: [{ year: 2026, winner: "TBC" }] },
  { id: "balloted-pairs", name: "Balloted Pairs",    color: "#c084fc", winners: [{ year: 2026, winner: "TBC" }] },
];

const FACILITIES = [
  "Two six-rink outdoor bowling greens",
  "Main Hall (seats 140)",
  "Lounge Hall (seats 100)",
  "Main Bar & Lounge Bar",
  "Kitchen",
  "Separate Locker Room",
  "Outdoor Seating Area",
  "PA System & Dart Boards",
  "Pool Table & Juke Box",
  "Car Park (30+ spaces)",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function ClubTab({ members = [], rollOfHonour = ROLL_OF_HONOUR, honoraryMembers = HONORARY_MEMBERS }) {
  const [expandedComp, setExpandedComp] = useState(null);
  const [committeeOpen, setCommitteeOpen] = useState(false);

  // Build committee lists from member positions
  const officers = members
    .filter(m => m.position && m.position !== "Management Committee")
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99));
  const managementCommittee = members.filter(m => m.position === "Management Committee");
  const hasAnyPositions = officers.length > 0 || managementCommittee.length > 0;

  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", paddingBottom: "32px" }}>

      {/* ── Hero ── */}
      <div style={{
        background: `linear-gradient(150deg, ${GREEN} 0%, #3d0f1a 100%)`,
        borderRadius: "16px", padding: "22px 20px 20px",
        boxShadow: "0 6px 24px rgba(74,14,31,0.22)",
        marginBottom: "16px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -16, bottom: -16, opacity: 0.07 }}>
          <Shield size={120} strokeWidth={0.8} color="#fff" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: `${GOLD}25`, border: `1px solid ${GOLD}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Shield size={22} strokeWidth={1.5} color={GOLD} />
          </div>
          <div>
            <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: "#fff", lineHeight: 1.1 }}>Irvine Park</div>
            <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: GOLD, lineHeight: 1.1 }}>Bowling Club</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "20px", padding: "4px 10px", fontFamily: F_UI, fontSize: "11px", color: "rgba(255,255,255,0.85)", fontWeight: "500" }}>
            📍 Woodlands Ave, Irvine KA12 0PZ
          </div>
          <a href="tel:01294272351" style={{ background: `${GOLD}25`, border: `1px solid ${GOLD}50`, borderRadius: "20px", padding: "4px 10px", fontFamily: F_UI, fontSize: "11px", color: GOLD_LIGHT, fontWeight: "600", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Phone size={10} strokeWidth={2} /> 01294 272351
          </a>
        </div>
      </div>

      {/* ── Roll of Honour ── */}
      <div style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: GREEN, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Trophy size={16} strokeWidth={2} color={GOLD_MUTED} /> Roll of Honour
      </div>

      {/* season-pending note */}
      <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px", paddingLeft: "2px" }}>
        Winners will appear here as this season's competitions conclude.
      </div>

      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", marginBottom: "16px", boxShadow: "0 1px 4px rgba(74,14,31,0.07)" }}>
        {rollOfHonour.map((comp, idx) => {
          const isOpen = expandedComp === comp.id;
          const latest = comp.winners[0];
          const isPending = latest.winner === "TBC";
          return (
            <div key={comp.id} style={{ borderBottom: idx < rollOfHonour.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <button
                onClick={() => setExpandedComp(isOpen ? null : comp.id)}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "0", display: "flex", alignItems: "center", textAlign: "left" }}>
                <div style={{ width: "3px", alignSelf: "stretch", background: comp.color, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: "14px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "600", color: TEXT }}>{comp.name}</span>
                    {isPending ? (
                      <span style={{ marginLeft: "8px", display: "inline-flex", alignItems: "center", gap: "3px", fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
                        <Clock size={11} strokeWidth={1.75} /> Pending
                      </span>
                    ) : (
                      <span style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginLeft: "8px" }}>
                        {latest.year} · <span style={{ color: GOLD_MUTED, fontWeight: "700" }}>{latest.winner}</span>
                      </span>
                    )}
                  </div>
                  <ChevronDown size={13} strokeWidth={2} color={TEXT3}
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                </div>
              </button>
              {isOpen && (
                <div style={{ background: SURFACE2, borderTop: `1px solid ${BORDER}`, padding: "10px 14px 10px 17px" }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Past Winners</div>
                  {isPending ? (
                    <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, fontStyle: "italic", padding: "4px 0 6px" }}>No results recorded yet — check back later.</div>
                  ) : comp.winners.map((w, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < comp.winners.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                      <span style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, fontWeight: "600" }}>{w.year}</span>
                      <span style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "700", color: TEXT }}>{w.winner}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Committee (collapsible) ── */}
      <button
        onClick={() => setCommitteeOpen(o => !o)}
        style={{
          width: "100%", background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: committeeOpen ? "12px 12px 0 0" : "12px",
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", marginBottom: "0", boxShadow: "0 1px 4px rgba(74,14,31,0.07)",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Star size={15} strokeWidth={2} color={GOLD_MUTED} />
          <span style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: GREEN }}>Committee 2026</span>
        </div>
        <ChevronDown size={14} strokeWidth={2} color={TEXT3} style={{ transform: committeeOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {committeeOpen && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden", marginBottom: "0", boxShadow: "0 2px 8px rgba(74,14,31,0.08)" }}>
          {!hasAnyPositions ? (
            <div style={{ padding: "16px", fontFamily: F_UI, fontSize: "13px", color: TEXT3, fontStyle: "italic" }}>
              Committee positions not yet assigned for this season.
            </div>
          ) : (
            <>
              {/* Key officers — 2-col grid for first four */}
              {officers.slice(0, 4).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: BORDER, borderBottom: `1px solid ${BORDER}` }}>
                  {officers.slice(0, 4).map((m, i) => (
                    <div key={m.id} style={{ background: SURFACE2, padding: "12px 14px" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "10px", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: "700", marginBottom: "3px" }}>{m.position}</div>
                      <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "600", color: TEXT }}>{m.name}</div>
                      {m.phone ? <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, textDecoration: "none", fontWeight: "600" }}>{m.phone}</a> : null}
                    </div>
                  ))}
                </div>
              )}
              {/* Remaining officers */}
              {officers.slice(4).map((m, i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: i < officers.slice(4).length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <div>
                    <div style={{ fontFamily: F_UI, fontSize: "10px", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: "700" }}>{m.position}</div>
                    <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "600", color: TEXT }}>{m.name}</div>
                  </div>
                  {m.phone ? (
                    <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: `${GOLD}12`, border: `1px solid ${GOLD}33`, borderRadius: "20px", padding: "4px 10px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "11px", fontWeight: "600" }}>
                      <Phone size={10} strokeWidth={2} />{m.phone}
                    </a>
                  ) : null}
                </div>
              ))}
              {/* Management Committee chips */}
              {managementCommittee.length > 0 && (
                <div style={{ background: SURFACE2, borderTop: `1px solid ${BORDER}`, padding: "12px 16px", marginBottom: "0" }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Management Committee</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {managementCommittee.map(m => (
                      <div key={m.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "3px 10px", fontFamily: F_UI, fontSize: "12px", color: TEXT2 }}>{m.name}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {/* Honorary Members — always shown, still hardcoded */}
          <div style={{ background: SURFACE2, borderTop: `1px solid ${BORDER}`, padding: "12px 16px" }}>
            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Honorary Members</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {honoraryMembers.map((name, i) => (
                <div key={i} style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33`, borderRadius: "16px", padding: "3px 10px", fontFamily: F_UI, fontSize: "12px", color: GOLD_MUTED, fontWeight: "600" }}>{name}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Find Us + Facilities ── */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(74,14,31,0.07)", marginTop: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <MapPin size={14} strokeWidth={2} color={GOLD_MUTED} />
          <span style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: GREEN }}>Find Us</span>
        </div>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.9 }}>
            Woodlands Avenue, Irvine &nbsp;<span style={{ fontWeight: "700", color: TEXT, letterSpacing: "0.04em" }}>KA12 0PZ</span>
          </div>
          <a href="tel:01294272351" style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", background: `${GOLD}12`, border: `1px solid ${GOLD}40`, borderRadius: "10px", padding: "8px 14px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "13px", fontWeight: "700" }}>
            <Phone size={13} strokeWidth={2} /> 01294 272351
          </a>
        </div>
        <div style={{ padding: "12px 16px 14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Facilities</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            {FACILITIES.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: "5px" }} />
                <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.4 }}>{item}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
