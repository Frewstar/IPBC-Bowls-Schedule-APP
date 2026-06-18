import { useState } from "react";
import { Trophy, Phone, ChevronDown, Shield, Users, Star } from "lucide-react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_UI } from "../../lib/theme.js";

export const COMMITTEE = [
  { role: "President",           name: "George Mathieson",         phone: "" },
  { role: "Vice President",      name: "Freddie Bigham",           phone: "" },
  { role: "Secretary",           name: "Iain McClymont",           phone: "07769675933" },
  { role: "Treasurer",           name: "Scott Williamson",         phone: "07498308270" },
  { role: "Bar Convenor",        name: "Warren Brown",             phone: "07971405588" },
  { role: "Match Secretary",     name: "George Mathieson",         phone: "07715303749" },
  { role: "Social Convenor",     name: "Brian Kirkpatrick",        phone: "07928912407" },
  { role: "Past President",      name: "Brian Kirkpatrick",        phone: "" },
  { role: "Building Convenor",   name: "Brian Kirkpatrick / Warren Brown", phone: "" },
  { role: "Honorary President",  name: "Jackie Brown",             phone: "" },
];

export const MANAGEMENT_COMMITTEE = [
  "William McCann", "Scott McLymont", "Lorraine Brown", "Lorraine Mair",
  "Matt Kirkland", "Stephen Wells", "David Hargreaves", "Wilma Simpson",
  "Andrena Scott", "Suzie Currie", "Christine Pipe",
];

export const HONORARY_MEMBERS = [
  "T. Shields", "K. Houston", "W. Reid", "J B Muir",
];

export const ROLL_OF_HONOUR = [
  { id: "championship",   name: "Championship",     color: "#ef4444", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "presidents",     name: "Presidents",       color: "#f59e0b", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "morton",         name: "Morton",           color: "#06b6d4", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "donaldson",      name: "Donaldson",        color: "#ec4899", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "mitchell",       name: "Mitchell Handicap",color: "#84cc16", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "pairs",          name: "Pairs",            color: "#f97316", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "triples",        name: "Triples",          color: "#10b981", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "rinks",          name: "Rinks",            color: "#8b5cf6", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "mixed-pairs",    name: "Mixed Pairs",      color: "#a78bfa", winners: [{ year: 2024, winner: "TBC" }] },
  { id: "balloted-pairs", name: "Balloted Pairs",   color: "#c084fc", winners: [{ year: 2024, winner: "TBC" }] },
];

function SectionHeader({ icon: Icon, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", marginTop: "4px" }}>
      <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: `${GREEN}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} strokeWidth={2} color={GREEN} />
      </div>
      <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: GREEN }}>{label}</div>
    </div>
  );
}

export default function ClubTab() {
  const [expandedComp, setExpandedComp] = useState(null);

  return (
    <div style={{ maxWidth: "520px", margin: "0 auto" }}>

      {/* Hero */}
      <div style={{ background: GREEN, borderRadius: "12px", padding: "20px", marginBottom: "20px", boxShadow: "0 4px 16px rgba(74,14,31,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
          <Shield size={24} strokeWidth={1.5} color={GOLD} />
          <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: "#fff" }}>Irvine Park BC</div>
        </div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: "rgba(255,255,255,0.75)" }}>Club information, roll of honour &amp; committee</div>
      </div>

      {/* ── Roll of Honour ── */}
      <SectionHeader icon={Trophy} label="Roll of Honour" />
      <div style={{ marginBottom: "24px" }}>
        {ROLL_OF_HONOUR.map(comp => {
          const isOpen = expandedComp === comp.id;
          const latest = comp.winners[0];
          return (
            <div key={comp.id} style={{ marginBottom: "8px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
              <button
                onClick={() => setExpandedComp(isOpen ? null : comp.id)}
                style={{ width: "100%", background: SURFACE, border: "none", cursor: "pointer", padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: comp.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F_DISPLAY, fontSize: "15px", fontWeight: "600", color: TEXT }}>{comp.name}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "1px" }}>
                    {latest.year} · <span style={{ color: latest.winner === "TBC" ? TEXT3 : GOLD_MUTED, fontWeight: "600" }}>{latest.winner}</span>
                  </div>
                </div>
                <ChevronDown size={15} strokeWidth={2} color={TEXT3} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
              </button>
              {isOpen && (
                <div style={{ background: SURFACE2, borderTop: `1px solid ${BORDER}`, padding: "10px 14px" }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Past Winners</div>
                  {comp.winners.map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "7px", marginBottom: "7px", borderBottom: i < comp.winners.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, fontWeight: "500" }}>{w.year}</div>
                      <div style={{ fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: w.winner === "TBC" ? TEXT3 : TEXT }}>{w.winner}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Committee ── */}
      <SectionHeader icon={Star} label="Committee 2024" />
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", marginBottom: "16px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
        {COMMITTEE.map((m, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: i < COMMITTEE.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1px" }}>{m.role}</div>
              <div style={{ fontFamily: F_DISPLAY, fontSize: "15px", fontWeight: "600", color: TEXT }}>{m.name}</div>
            </div>
            {m.phone ? (
              <a href={`tel:${m.phone.replace(/\s/g, "")}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontSize: "13px", fontWeight: "600" }}>
                <Phone size={13} strokeWidth={1.75} />{m.phone}
              </a>
            ) : null}
          </div>
        ))}
      </div>

      {/* ── Management Committee ── */}
      <SectionHeader icon={Users} label="Management Committee" />
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {MANAGEMENT_COMMITTEE.map((name, i) => (
            <div key={i} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "20px", padding: "5px 12px", fontFamily: F_UI, fontSize: "13px", color: TEXT2 }}>{name}</div>
          ))}
        </div>
      </div>

      {/* ── Honorary ── */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", marginBottom: "24px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
        <div style={{ background: SURFACE2, padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>Honorary Members</div>
        </div>
        <div style={{ padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {HONORARY_MEMBERS.map((name, i) => (
            <div key={i} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "20px", padding: "5px 12px", fontFamily: F_UI, fontSize: "13px", color: TEXT2 }}>{name}</div>
          ))}
        </div>
      </div>

    </div>
  );
}
