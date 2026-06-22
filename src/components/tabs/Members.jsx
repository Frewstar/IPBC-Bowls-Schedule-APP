import { useState } from "react";
import { Search, Download, Upload, Plus, Phone, Pencil, X, Check } from "lucide-react";
import BottomSheet from "../BottomSheet.jsx";
import AvatarBubble from "../AvatarBubble.jsx";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../../lib/theme.js";
import { getSurname } from "../../lib/utils.js";

export const CLUB_POSITIONS = [
  "",
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Match Secretary",
  "Bar Convenor",
  "Social Convenor",
  "Building Convenor",
  "Past President",
  "Honorary President",
  "Management Committee",
];

export default function MembersTab({
  filteredMembers,
  groupedMembers,
  memberSearch, setMemberSearch,
  activeSection,
  fileInputRef, handleFileChange,
  downloadCSV,
  uploadMsg,
  editingId, setEditingId,
  editName, setEditName,
  editPhone, setEditPhone,
  editSection, setEditSection,
  editPosition, setEditPosition,
  saveEdit,
  startEdit,
  confirmDelete, setConfirmDelete,
  deleteMember,
  showAddMemberSheet, setShowAddMemberSheet,
  newName, setNewName,
  newPhone, setNewPhone,
  newSection, setNewSection,
  addMember,
  isAdmin = false,
  isSuperAdmin = false,
  myName = "",
  requestPhoneChange,
  phoneRequests = [],
  approvePhoneRequest,
  declinePhoneRequest,
  memberProfiles = {},
}) {
  const [reqId, setReqId] = useState(null);
  const [reqPhone, setReqPhone] = useState("");
  const [reqSent, setReqSent] = useState(null);
  const [viewMember, setViewMember] = useState(null); // member being viewed in profile card

  async function submitRequest(m) {
    if (!reqPhone.trim()) return;
    await requestPhoneChange(m.id, m.name, m.phone || "", reqPhone.trim());
    setReqSent(m.id);
    setReqId(null);
  }

  function getMemberProfile(m) {
    if (!m.linked_cloudkey) return null;
    return memberProfiles[m.linked_cloudkey] || null;
  }

  return (
    <div style={{ position: "relative" }}>
      {/* ── Search-first header ── */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ position: "relative" }}>
          <Search size={16} strokeWidth={1.75} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: TEXT3, pointerEvents: "none" }} />
          <input type="text" placeholder="Search by name…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} autoFocus
            style={{ width: "100%", boxSizing: "border-box", paddingLeft: "42px", paddingRight: "14px", paddingTop: "13px", paddingBottom: "13px", fontSize: "16px", border: `1px solid ${BORDER}`, borderRadius: "10px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
        </div>
      </div>

      {/* ── Toolbar: add + count ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
          {filteredMembers.length} {activeSection} members
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {isAdmin && (<>
            <button onClick={downloadCSV} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "11px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}>
              <Download size={12} strokeWidth={1.75} /> CSV
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "11px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}>
              <Upload size={12} strokeWidth={1.75} /> Import
            </button>
            <button onClick={() => { setShowAddMemberSheet(true); setNewName(""); setNewPhone(""); setNewSection(activeSection); }}
              style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "7px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Plus size={14} strokeWidth={2.5} /> Add
            </button>
          </>)}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />

      {uploadMsg && (
        <div style={{ background: uploadMsg.startsWith("Error") ? "#fdf5f5" : "#f0fdf4", border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: uploadMsg.startsWith("Error") ? LOSS_RED : "#2d6a4f", marginBottom: "12px" }}>
          {uploadMsg}
        </div>
      )}

      {/* ── Admin: pending phone change requests ── */}
      {isAdmin && phoneRequests.length > 0 && (
        <div style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
            Pending Number Changes ({phoneRequests.length})
          </div>
          {phoneRequests.map(req => (
            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", paddingBottom: "10px", marginBottom: "10px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{req.member_name}</div>
                <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginTop: "2px" }}>
                  {req.current_phone ? <><span style={{ textDecoration: "line-through" }}>{req.current_phone}</span> → </> : "New: "}
                  <span style={{ color: GREEN, fontWeight: "600" }}>{req.requested_phone}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button onClick={() => approvePhoneRequest(req)} style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 12px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Approve</button>
                <button onClick={() => declinePhoneRequest(req.id)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "6px 10px", fontSize: "12px", fontFamily: F_UI, cursor: "pointer" }}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Member list ── */}
      <div style={{ position: "relative" }}>
        {!memberSearch && (
          <div style={{ position: "fixed", right: "0px", top: "50%", transform: "translateY(-50%)", zIndex: 50, display: "flex", flexDirection: "column" }}>
            {Object.keys(groupedMembers).sort().map(letter => (
              <button key={letter} onClick={() => {
                const el = document.getElementById(`member-letter-${letter}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F_UI, fontSize: "9px", fontWeight: "700", color: TEXT3, padding: "3px 8px", lineHeight: 1, letterSpacing: "0.02em", minWidth: "28px", textAlign: "center" }}>
                {letter}
              </button>
            ))}
          </div>
        )}

        {Object.keys(groupedMembers).sort().map(letter => (
          <div key={letter} id={`member-letter-${letter}`} style={{ marginBottom: "14px" }}>
            <div style={{ background: SURFACE2, padding: "7px 14px", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>{letter}</div>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
              {groupedMembers[letter].map((m, i) => {
                const mp = getMemberProfile(m);
                const showAvatar = !!(mp?.displayName || mp?.avatar);

                return (
                  <div key={m.id}>
                    {editingId === m.id ? (
                      <div style={{ padding: "12px 14px", background: SURFACE2, borderBottom: `1px solid ${BORDER}` }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                          <input value={editName} onChange={e => setEditName(e.target.value.toUpperCase())}
                            style={{ flex: 2, minWidth: "120px", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                          <input value={editPhone} onChange={e => setEditPhone(e.target.value)} type="tel"
                            style={{ flex: 2, minWidth: "110px", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                          <select value={editSection} onChange={e => setEditSection(e.target.value)}
                            style={{ padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }}>
                            <option value="gents">Gents</option>
                            <option value="ladies">Ladies</option>
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, whiteSpace: "nowrap", paddingTop: "2px" }}>Club Position:</div>
                          <select value={editPosition} onChange={e => setEditPosition(e.target.value)}
                            style={{ flex: 1, minWidth: "160px", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }}>
                            {CLUB_POSITIONS.map(p => <option key={p} value={p}>{p || "— None —"}</option>)}
                          </select>
                          <button onClick={saveEdit} style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, padding: "8px 10px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                        </div>
                      </div>
                    ) : confirmDelete === m.id ? (
                      <div style={{ padding: "12px 14px", background: "#fef2f2", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontFamily: F_UI, fontSize: "12px", color: "#e07070" }}>Delete <strong>{m.name}</strong>?</span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => deleteMember(m.id)} style={{ background: "#6b1010", border: "none", borderRadius: "6px", color: LOSS_RED, padding: "5px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>Delete</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT, padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI }}>Keep</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => { if (!editingId) setViewMember(m); }}
                        style={{ padding: "14px 16px", borderBottom: i < groupedMembers[letter].length - 1 ? `1px solid ${BORDER}` : "none", display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", cursor: "pointer" }}
                      >
                        {/* Avatar or initials */}
                        {showAvatar ? (
                          <AvatarBubble displayName={mp.displayName || m.name} avatar={mp?.avatar} size={40} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: "50%", background: SURFACE2, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: TEXT3 }}>
                              {m.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                            </span>
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {mp?.displayName && (
                            <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "700", color: TEXT, lineHeight: 1.2, marginBottom: "1px" }}>{mp.displayName}</div>
                          )}
                          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                            <div style={{ fontFamily: F_SANS, fontSize: mp?.displayName ? "12px" : "16px", fontWeight: mp?.displayName ? "400" : "600", color: mp?.displayName ? TEXT3 : GREEN, lineHeight: 1.2 }}>
                              {getSurname(m.name)}
                              <span style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "400", color: TEXT3, marginLeft: "4px" }}>{m.name.replace(getSurname(m.name), "").trim()}</span>
                            </div>
                            {m.position && (
                              <span style={{ display: "inline-block", background: `${GOLD}18`, border: `1px solid ${GOLD}55`, borderRadius: "10px", padding: "1px 8px", fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: GOLD_MUTED, whiteSpace: "nowrap" }}>
                                {m.position}
                              </span>
                            )}
                          </div>
                          {(() => {
                            const isMe = myName && m.name === myName && !isAdmin;
                            const requesting = reqId === m.id;
                            const sent = reqSent === m.id;
                            return (
                              <div onClick={e => e.stopPropagation()}>
                                {m.phone
                                  ? <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", minHeight: "30px" }}><Phone size={13} strokeWidth={1.75} />{m.phone}</a>
                                  : <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>No number</span>}
                                {isMe && sent && (
                                  <div style={{ fontFamily: F_UI, fontSize: "11px", color: "#2d6a4f", marginTop: "4px" }}>Request sent — awaiting admin approval.</div>
                                )}
                                {isMe && !sent && !requesting && (
                                  <button onClick={() => { setReqId(m.id); setReqPhone(m.phone || ""); }} style={{ background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontFamily: F_UI, fontSize: "11px", color: TEXT3, display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                                    <Pencil size={10} strokeWidth={1.75} /> {m.phone ? "Request number change" : "Add my number"}
                                  </button>
                                )}
                                {isMe && requesting && (
                                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                                    <input autoFocus type="tel" value={reqPhone} onChange={e => setReqPhone(e.target.value)}
                                      placeholder="07xxx xxxxxx"
                                      style={{ flex: 1, padding: "7px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "14px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT, minWidth: 0 }} />
                                    <button onClick={() => submitRequest(m)} disabled={!reqPhone.trim()} style={{ background: reqPhone.trim() ? GREEN : BORDER, border: "none", borderRadius: "7px", color: "#fff", padding: "7px 10px", cursor: reqPhone.trim() ? "pointer" : "default", display: "flex", alignItems: "center" }}>
                                      <Check size={14} strokeWidth={2.5} />
                                    </button>
                                    <button onClick={() => setReqId(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT3, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                                      <X size={14} strokeWidth={2} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {isAdmin && (
                          <div style={{ display: "flex", gap: "5px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => startEdit(m)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "10px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}><Pencil size={11} strokeWidth={1.75} />Edit</button>
                            {isSuperAdmin && (
                              <button onClick={() => setConfirmDelete(m.id)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT3, padding: "10px 10px", fontSize: "10px", cursor: "pointer", fontFamily: F_UI, minHeight: "44px", display: "inline-flex", alignItems: "center" }}><X size={13} strokeWidth={1.75} /></button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Member profile card ── */}
      {viewMember && (() => {
        const mp = getMemberProfile(viewMember);
        const recordShared = mp && (mp.shareProfile ?? false);
        const memberEntries = recordShared ? (mp?.entries || []) : [];
        const activeEntries = memberEntries.filter(e => e.ties?.length > 0 || e.status === "active");
        const currentYear = new Date().getFullYear();
        const byYear = {};
        activeEntries.forEach(e => {
          const yr = e.year || currentYear;
          if (!byYear[yr]) byYear[yr] = [];
          byYear[yr].push(e);
        });
        const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

        return (
          <BottomSheet open={!!viewMember} onClose={() => setViewMember(null)} title="">
            {/* Identity */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", paddingBottom: "12px" }}>
              <AvatarBubble displayName={mp?.displayName || viewMember.name} avatar={mp?.avatar} size={80} />
              {mp?.displayName && (
                <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: TEXT, marginTop: "8px", textAlign: "center" }}>{mp.displayName}</div>
              )}
              <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, letterSpacing: "0.05em" }}>{viewMember.name}</div>
              {viewMember.position && (
                <span style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}55`, borderRadius: "12px", padding: "3px 12px", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED }}>
                  {viewMember.position}
                </span>
              )}
            </div>

            {/* Phone */}
            {viewMember.phone ? (
              <a href={`tel:${viewMember.phone.replace(/\s/g,"")}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: `${GOLD}12`, border: `1px solid ${GOLD}40`, borderRadius: "12px", padding: "14px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "16px", fontWeight: "700" }}>
                <Phone size={18} strokeWidth={1.75} /> {viewMember.phone}
              </a>
            ) : (
              <div style={{ textAlign: "center", fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>No phone number on record</div>
            )}

            {/* Season history */}
            {recordShared && years.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                {years.map(yr => {
                  const yEntries = byYear[yr];
                  const yWins   = yEntries.reduce((s, e) => s + (e.ties || []).filter(t => t.result === "W").length, 0);
                  const yLosses = yEntries.reduce((s, e) => s + (e.ties || []).filter(t => t.result === "L").length, 0);
                  return (
                    <div key={yr} style={{ marginBottom: "16px" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{yr} Season</div>
                      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                        <div style={{ flex: 1, background: `${GREEN}10`, border: `1px solid ${GREEN}30`, borderRadius: "10px", padding: "10px 8px", textAlign: "center" }}>
                          <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: GREEN, lineHeight: 1 }}>{yWins}</div>
                          <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginTop: "4px" }}>Wins</div>
                        </div>
                        <div style={{ flex: 1, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 8px", textAlign: "center" }}>
                          <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: TEXT2, lineHeight: 1 }}>{yLosses}</div>
                          <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginTop: "4px" }}>Losses</div>
                        </div>
                        <div style={{ flex: 1, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 8px", textAlign: "center" }}>
                          <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: TEXT2, lineHeight: 1 }}>{yEntries.length}</div>
                          <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginTop: "4px" }}>Comps</div>
                        </div>
                      </div>
                      {yEntries.map(e => {
                        const ew = (e.ties || []).filter(t => t.result === "W").length;
                        const el = (e.ties || []).filter(t => t.result === "L").length;
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.tournamentColor || GREEN, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", color: TEXT }}>{e.tournamentName}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>{ew}W {el}L</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </BottomSheet>
        );
      })()}

      {/* ── Add Member BottomSheet ── */}
      <BottomSheet open={showAddMemberSheet} onClose={() => setShowAddMemberSheet(false)} title="New Member">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Full Name</div>
            <input placeholder="e.g. J SMITH" value={newName} onChange={e => setNewName(e.target.value.toUpperCase())}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "16px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT, letterSpacing: "1px" }} />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Phone</div>
            <input placeholder="07xxx xxxxxx" value={newPhone} onChange={e => setNewPhone(e.target.value)} type="tel"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "16px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Section</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["gents","ladies"].map(s => (
                <button key={s} onClick={() => setNewSection(s)} style={{ flex: 1, background: newSection === s ? MID : SURFACE2, border: `1px solid ${newSection === s ? MID : BORDER}`, borderRadius: "8px", color: newSection === s ? "#fff" : TEXT, padding: "10px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: newSection === s ? "600" : "400", textTransform: "capitalize" }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button onClick={() => { addMember(); setShowAddMemberSheet(false); }} disabled={!newName.trim()}
              style={{ flex: 1, background: newName.trim() ? MID : BORDER, border: "none", borderRadius: "8px", color: newName.trim() ? "#fff" : TEXT3, padding: "13px", fontSize: "14px", cursor: newName.trim() ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
              Save Member
            </button>
            <button onClick={() => setShowAddMemberSheet(false)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "13px 18px", fontSize: "14px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
