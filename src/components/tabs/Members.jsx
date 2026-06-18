import { useState } from "react";
import { Search, Download, Upload, Plus, Phone, Pencil, X, Check } from "lucide-react";
import BottomSheet from "../BottomSheet.jsx";
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
}) {
  const [reqId, setReqId] = useState(null);
  const [reqPhone, setReqPhone] = useState("");
  const [reqSent, setReqSent] = useState(null); // member_id of last sent request

  async function submitRequest(m) {
    if (!reqPhone.trim()) return;
    await requestPhoneChange(m.id, m.name, m.phone || "", reqPhone.trim());
    setReqSent(m.id);
    setReqId(null);
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

      {/* ── Member list with sticky letter index ── */}
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
              {groupedMembers[letter].map((m, i) => (
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
                    <div style={{ padding: "16px 16px", borderBottom: i < groupedMembers[letter].length - 1 ? `1px solid ${BORDER}` : "none", display: "flex", alignItems: "center", gap: "12px", minHeight: "58px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                          <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "600", color: GREEN, lineHeight: 1.2 }}>
                            {getSurname(m.name)}
                            <span style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "400", color: TEXT2, marginLeft: "6px" }}>{m.name.replace(getSurname(m.name), "").trim()}</span>
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
                            <>
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
                            </>
                          );
                        })()}
                      </div>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                          <button onClick={() => startEdit(m)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "10px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}><Pencil size={11} strokeWidth={1.75} />Edit</button>
                          {isSuperAdmin && (
                            <button onClick={() => setConfirmDelete(m.id)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT3, padding: "10px 10px", fontSize: "10px", cursor: "pointer", fontFamily: F_UI, minHeight: "44px", display: "inline-flex", alignItems: "center" }}><X size={13} strokeWidth={1.75} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

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
