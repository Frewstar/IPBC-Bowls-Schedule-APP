import { useState, useMemo } from "react";
import { Trophy, Phone, ChevronDown, Shield, MapPin, Star, Clock, Plus, X } from "lucide-react";
import { GREEN, GOLD, GOLD_LIGHT, GOLD_MUTED, MID, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_DISPLAY, F_SANS, F_UI } from "../../lib/theme.js";
import { CLUB_POSITIONS } from "./Members.jsx";
import LoadNotice from "../LoadNotice.jsx";

const OFFICER_POSITIONS = CLUB_POSITIONS.filter(p => p && p !== "Management Committee");
const POSITION_ORDER = Object.fromEntries(OFFICER_POSITIONS.map((p, i) => [p, i]));

// Irvine Park's ten competitions and four honorary members used to be declared
// here and used as this component's default props, so any club whose own rows
// had not loaded was shown Irvine Park's. They now live, structure only, in
// seed/club-template.seed.json — input for onboarding, not a runtime fallback.
// Both lists arrive as props from Supabase or they do not arrive at all.

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

export default function ClubTab({ members = [], rollOfHonour = [], honoraryMembers = [], rollOfHonourLoad, honoraryLoad, isAdmin = false, recordWinner, addHonoraryMember, removeHonoraryMember, showPhones = false }) {
  const [expandedComp, setExpandedComp] = useState(null);
  // "all" (each competition expandable, as before) or a single year across the
  // whole board. 68 seasons are on record, 1958 to 2026, and until now the only
  // way to read 1975 was to open every competition in turn.
  const [rohYear, setRohYear] = useState("all");
  const [committeeOpen, setCommitteeOpen] = useState(false);

  // Roll of Honour: recording winner
  const [recordingComp, setRecordingComp] = useState(null);
  const [winnerYear, setWinnerYear] = useState(String(new Date().getFullYear()));
  const [winnerName, setWinnerName] = useState("");
  const [savingWinner, setSavingWinner] = useState(false);
  // What the server said, and which competition it said it about.
  const [winnerMsg, setWinnerMsg] = useState(null);

  // Honorary Members: adding
  const [addingHon, setAddingHon] = useState(false);
  const [newHonName, setNewHonName] = useState("");

  // Every year anyone won anything, newest first.
  const rohYears = useMemo(() => {
    const seen = new Set();
    for (const c of rollOfHonour) for (const w of (c.winners || [])) {
      if (w && w.year != null) seen.add(Number(w.year));
    }
    return [...seen].sort((a, b) => b - a);
  }, [rollOfHonour]);

  // One year picked: who won what. Competitions with nothing recorded for that
  // year are left out rather than listed as blanks — a season the Junior Girls
  // did not run is not a gap to display.
  const rohForYear = useMemo(() => {
    if (rohYear === "all") return null;
    const y = Number(rohYear);
    return rollOfHonour
      .map(c => ({ comp: c, win: (c.winners || []).find(w => Number(w.year) === y) }))
      .filter(x => x.win);
  }, [rollOfHonour, rohYear]);

  function buildSection(section) {
    const officers = members
      .filter(m => m.section === section && m.position && m.position !== "Management Committee")
      .sort((a, b) => (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99));
    const committee = members.filter(m => m.section === section && m.position === "Management Committee");
    return { officers, committee };
  }
  const gents = buildSection("gents");
  const ladies = buildSection("ladies");
  const hasAnyPositions = gents.officers.length > 0 || gents.committee.length > 0 || ladies.officers.length > 0 || ladies.committee.length > 0;

  function openRecord(comp) {
    setRecordingComp(comp.id);
    setWinnerYear(String(new Date().getFullYear()));
    setWinnerName("");
    setWinnerMsg(null);
  }

  // The server decides, and it answers in words. Only its own "ok" closes the
  // form: a refusal leaves the name and year on screen with the reason
  // underneath, because a form that clears itself has said the write went
  // through whatever the reason underneath it says.
  async function saveWinner() {
    if (!winnerName.trim() || savingWinner) return;
    const compId = recordingComp;
    setSavingWinner(true);
    setWinnerMsg(null);
    const res = await recordWinner(compId, parseInt(winnerYear, 10), winnerName.trim());
    setSavingWinner(false);
    setWinnerMsg({ ok: res?.status === "ok", compId, text: res?.message || "Couldn't save — no response from the server." });
    if (res?.status === "ok") setRecordingComp(null);
  }

  async function saveHonMember() {
    if (!newHonName.trim()) return;
    await addHonoraryMember(newHonName.trim());
    setNewHonName("");
    setAddingHon(false);
  }

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

      {rollOfHonour.length > 0 && rohYears.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px", flexWrap: "wrap" }}>
          <label htmlFor="roh-year" style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.09em" }}>
            Season
          </label>
          <select id="roh-year" value={rohYear} onChange={e => { setRohYear(e.target.value); setExpandedComp(null); }}
            style={{ flex: "0 1 auto", minHeight: "40px", padding: "8px 12px", borderRadius: "9px",
                     border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT,
                     fontFamily: F_UI, fontSize: "14px", fontWeight: "600" }}>
            <option value="all">All years</option>
            {rohYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <span style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
            {rohYear === "all"
              ? `${rohYears.length} seasons on record, ${rohYears[rohYears.length - 1]}–${rohYears[0]}`
              : `${rohForYear.length} recorded`}
          </span>
        </div>
      )}

      {rollOfHonour.length > 0 && rohYear === "all" && (
        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px", paddingLeft: "2px" }}>
          Winners will appear here as this season&rsquo;s competitions conclude.
        </div>
      )}

      {/* ── One season, across the board ── */}
      {rohYear !== "all" && (
        rohForYear.length === 0 ? (
          <div style={{ background: SURFACE, border: `1px dashed ${BORDER}`, borderRadius: "12px", padding: "22px 18px", marginBottom: "16px", textAlign: "center", fontFamily: F_UI, fontSize: "13px", color: TEXT3, lineHeight: 1.5 }}>
            Nothing recorded for {rohYear}.
          </div>
        ) : (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", marginBottom: "16px", boxShadow: "0 1px 4px rgba(74,14,31,0.07)" }}>
            {rohForYear.map(({ comp, win }, idx) => (
              <div key={comp.id} style={{ display: "flex", alignItems: "center", borderBottom: idx < rohForYear.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ width: "3px", alignSelf: "stretch", background: comp.color || GOLD, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: "13px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "600", color: TEXT }}>{comp.name}</span>
                  <span style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "700", color: GOLD_MUTED, textAlign: "right" }}>
                    {win.winner || "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <LoadNotice
        status={rollOfHonourLoad?.status || "ready"}
        hasData={rollOfHonour.length > 0}
        onRetry={rollOfHonourLoad?.reload}
        noun="the roll of honour"
        emptyTitle="No competitions on the roll of honour"
        emptyHint="Once this club's competitions are set up they'll be listed here, and winners can be recorded against them."
      />

      {rollOfHonour.length > 0 && rohYear === "all" && (
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", marginBottom: "16px", boxShadow: "0 1px 4px rgba(74,14,31,0.07)" }}>
        {rollOfHonour.map((comp, idx) => {
          const isOpen = expandedComp === comp.id;
          const isRecording = recordingComp === comp.id;
          const latest = comp.winners[0];
          const isPending = !latest || latest.winner === "TBC";
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
                  {isAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); isRecording ? setRecordingComp(null) : openRecord(comp); }}
                      style={{ background: isRecording ? SURFACE2 : `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: "6px", color: GOLD_MUTED, padding: "4px 10px", fontSize: "11px", fontFamily: F_UI, fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {isRecording ? "Cancel" : "Record Winner"}
                    </button>
                  )}
                  <ChevronDown size={13} strokeWidth={2} color={TEXT3}
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                </div>
              </button>

              {/* Record winner inline form */}
              {isRecording && (
                <div style={{ background: `${GOLD}0a`, borderTop: `1px solid ${GOLD}33`, padding: "12px 14px 14px 17px" }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Record {comp.name} Winner</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Year</div>
                      <input value={winnerYear} onChange={e => setWinnerYear(e.target.value)} type="number" min="1900" max="2100"
                        style={{ width: "80px", padding: "9px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "14px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", minWidth: "140px" }}>
                      <div style={{ fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Winner</div>
                      <input placeholder="Member name" value={winnerName} onChange={e => setWinnerName(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "14px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                    </div>
                    <button onClick={saveWinner} disabled={!winnerName.trim() || savingWinner}
                      style={{ background: winnerName.trim() && !savingWinner ? MID : BORDER, border: "none", borderRadius: "7px", color: winnerName.trim() && !savingWinner ? "#fff" : TEXT3, padding: "9px 14px", fontSize: "13px", fontFamily: F_UI, fontWeight: "700", cursor: winnerName.trim() && !savingWinner ? "pointer" : "default", whiteSpace: "nowrap" }}>
                      {savingWinner ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* What the server said — the refusal as well as the save. */}
              {winnerMsg?.compId === comp.id && (
                <div style={{
                  padding: "9px 14px 11px 17px",
                  background: winnerMsg.ok ? `${GOLD}0a` : `${LOSS_RED}0d`,
                  borderTop: `1px solid ${winnerMsg.ok ? `${GOLD}33` : `${LOSS_RED}33`}`,
                  fontFamily: F_UI, fontSize: "12px",
                  color: winnerMsg.ok ? GOLD_MUTED : LOSS_RED,
                }}>
                  {winnerMsg.text}
                </div>
              )}

              {isOpen && !isRecording && (
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
      )}

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
              {[{ label: "Gents Section", data: gents }, { label: "Ladies Section", data: ladies }].map(({ label, data }) => {
                if (data.officers.length === 0 && data.committee.length === 0) return null;
                return (
                  <div key={label} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ padding: "8px 16px", background: SURFACE2, fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
                    {data.officers.slice(0, 4).length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: BORDER, borderBottom: data.officers.length > 4 || data.committee.length > 0 ? `1px solid ${BORDER}` : "none" }}>
                        {data.officers.slice(0, 4).map(m => (
                          <div key={m.id} style={{ background: SURFACE, padding: "12px 14px" }}>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: "700", marginBottom: "3px" }}>{m.position}</div>
                            <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "600", color: TEXT }}>{m.name}</div>
                            {showPhones && m.phone ? <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, textDecoration: "none", fontWeight: "600" }}>{m.phone}</a> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {data.officers.slice(4).map((m, i) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: i < data.officers.slice(4).length - 1 || data.committee.length > 0 ? `1px solid ${BORDER}` : "none" }}>
                        <div>
                          <div style={{ fontFamily: F_UI, fontSize: "10px", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: "700" }}>{m.position}</div>
                          <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "600", color: TEXT }}>{m.name}</div>
                        </div>
                        {showPhones && m.phone ? (
                          <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: `${GOLD}12`, border: `1px solid ${GOLD}33`, borderRadius: "20px", padding: "4px 10px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "11px", fontWeight: "600" }}>
                            <Phone size={10} strokeWidth={2} />{m.phone}
                          </a>
                        ) : null}
                      </div>
                    ))}
                    {data.committee.length > 0 && (
                      <div style={{ background: SURFACE2, padding: "12px 16px" }}>
                        <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Management Committee</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {data.committee.map(m => (
                            <div key={m.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "3px 10px", fontFamily: F_UI, fontSize: "12px", color: TEXT2 }}>{m.name}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Honorary Members */}
          <div style={{ background: SURFACE2, borderTop: `1px solid ${BORDER}`, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Honorary Members</div>
              {isAdmin && !addingHon && (
                <button onClick={() => { setAddingHon(true); setNewHonName(""); }}
                  style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "3px 9px", fontSize: "11px", fontFamily: F_UI, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Plus size={11} strokeWidth={2.5} /> Add
                </button>
              )}
            </div>
            {honoraryMembers.length === 0 && (
              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, fontStyle: "italic" }}>
                {honoraryLoad?.status === "failed"
                  ? "Couldn't load honorary members."
                  : "No honorary members recorded."}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {honoraryMembers.map((name, i) => (
                <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: `${GOLD}12`, border: `1px solid ${GOLD}33`, borderRadius: "16px", padding: "3px 10px", fontFamily: F_UI, fontSize: "12px", color: GOLD_MUTED, fontWeight: "600" }}>
                  {name}
                  {isAdmin && (
                    <button onClick={() => removeHonoraryMember(name)} style={{ background: "none", border: "none", padding: "0 0 0 2px", cursor: "pointer", color: GOLD_MUTED, display: "flex", alignItems: "center", lineHeight: 1 }}>
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {addingHon && (
              <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                <input autoFocus placeholder="e.g. A. Smith" value={newHonName} onChange={e => setNewHonName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveHonMember(); if (e.key === "Escape") setAddingHon(false); }}
                  style={{ flex: 1, padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "14px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                <button onClick={saveHonMember} disabled={!newHonName.trim()}
                  style={{ background: newHonName.trim() ? MID : BORDER, border: "none", borderRadius: "7px", color: newHonName.trim() ? "#fff" : TEXT3, padding: "8px 13px", fontSize: "13px", fontFamily: F_UI, fontWeight: "700", cursor: newHonName.trim() ? "pointer" : "default" }}>
                  Add
                </button>
                <button onClick={() => setAddingHon(false)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, padding: "8px 10px", fontSize: "13px", fontFamily: F_UI, cursor: "pointer" }}>
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            )}
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
