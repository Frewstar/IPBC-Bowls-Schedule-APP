import { Search, Download, Upload, Plus, Phone, Pencil, X } from "lucide-react";
import BottomSheet from "../BottomSheet.jsx";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../../lib/theme.js";
import { getSurname } from "../../lib/utils.js";

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
  saveEdit,
  startEdit,
  confirmDelete, setConfirmDelete,
  deleteMember,
  showAddMemberSheet, setShowAddMemberSheet,
  newName, setNewName,
  newPhone, setNewPhone,
  newSection, setNewSection,
  addMember,
}) {
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
          <button onClick={downloadCSV} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "11px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}>
            <Download size={12} strokeWidth={1.75} /> CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "11px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}>
            <Upload size={12} strokeWidth={1.75} /> Upload
          </button>
          <button onClick={() => { setShowAddMemberSheet(true); setNewName(""); setNewPhone(""); setNewSection(activeSection); }}
            style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "7px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <Plus size={14} strokeWidth={2.5} /> Add
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />

      {uploadMsg && (
        <div style={{ background: uploadMsg.startsWith("Error") ? "#fdf5f5" : "#f0fdf4", border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: uploadMsg.startsWith("Error") ? LOSS_RED : "#2d6a4f", marginBottom: "12px" }}>
          {uploadMsg}
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
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <input value={editName} onChange={e => setEditName(e.target.value.toUpperCase())}
                          style={{ flex: 2, minWidth: "120px", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                        <input value={editPhone} onChange={e => setEditPhone(e.target.value)} type="tel"
                          style={{ flex: 2, minWidth: "110px", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }} />
                        <select value={editSection} onChange={e => setEditSection(e.target.value)}
                          style={{ padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", background: SURFACE, color: TEXT }}>
                          <option value="gents">Gents</option>
                          <option value="ladies">Ladies</option>
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
                        <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "600", color: GREEN, lineHeight: 1.2 }}>
                          {getSurname(m.name)}
                          <span style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "400", color: TEXT2, marginLeft: "6px" }}>{m.name.replace(getSurname(m.name), "").trim()}</span>
                        </div>
                        {m.phone
                          ? <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", minHeight: "30px" }}><Phone size={13} strokeWidth={1.75} />{m.phone}</a>
                          : <span style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>No number</span>}
                      </div>
                      <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                        <button onClick={() => startEdit(m)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "10px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px" }}><Pencil size={11} strokeWidth={1.75} />Edit</button>
                        <button onClick={() => setConfirmDelete(m.id)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT3, padding: "10px 10px", fontSize: "10px", cursor: "pointer", fontFamily: F_UI, minHeight: "44px", display: "inline-flex", alignItems: "center" }}><X size={13} strokeWidth={1.75} /></button>
                      </div>
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
