import { useState, useEffect } from "react";
import { Users, Calendar, Shield, UserCheck, Lock, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronUp, Crown } from "lucide-react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../../lib/theme.js";
import { supabase } from "../../lib/supabase.js";

const SECTIONS = ["Members", "Fixtures", "Club", "Access", "Lockouts"];
const SECTION_ICONS = { Members: Users, Fixtures: Calendar, Club: Shield, Access: Crown, Lockouts: Lock };

export default function AdminPanel({
  // identity
  myName, isSuperAdmin,
  // members
  members, addMember, saveEdit, deleteMember,
  // fixtures
  fixtures, addFixture, editFixture, deleteFixture,
  // club
  rollOfHonour, honoraryMembers, recordWinner, addHonoraryMember, removeHonoraryMember,
  // lockouts
  lockouts = [], clearLockout,
  // admin management
  adminList = [], pendingAdminRequests = [], approveAdminRequest, revokeAdmin, grantAdmin,
  // phone requests
  phoneRequests = [], approvePhoneRequest, declinePhoneRequest,
}) {
  const [section, setSection] = useState("Members");

  return (
    <div>
      {/* Sub-nav */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", overflowX: "auto", paddingBottom: "2px" }}>
        {SECTIONS.map(s => {
          const Icon = SECTION_ICONS[s];
          const active = section === s;
          if (s === "Access" && !isSuperAdmin) return null;
          return (
            <button key={s} onClick={() => setSection(s)}
              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "7px 13px", borderRadius: "20px", border: `1px solid ${active ? MID : BORDER}`, background: active ? MID : SURFACE, color: active ? "#fff" : TEXT2, fontFamily: F_UI, fontSize: "12px", fontWeight: active ? "700" : "400", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              <Icon size={13} strokeWidth={2} />{s}
              {s === "Lockouts" && lockouts.length > 0 && <span style={{ background: LOSS_RED, color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "10px", fontWeight: "700" }}>{lockouts.length}</span>}
              {s === "Access" && pendingAdminRequests.length > 0 && <span style={{ background: GOLD, color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "10px", fontWeight: "700" }}>{pendingAdminRequests.length}</span>}
            </button>
          );
        })}
      </div>

      {section === "Members"  && <AdminMembers members={members} addMember={addMember} saveEdit={saveEdit} deleteMember={deleteMember} phoneRequests={phoneRequests} approvePhoneRequest={approvePhoneRequest} declinePhoneRequest={declinePhoneRequest} />}
      {section === "Fixtures" && <AdminFixtures fixtures={fixtures} addFixture={addFixture} editFixture={editFixture} deleteFixture={deleteFixture} />}
      {section === "Club"     && <AdminClub rollOfHonour={rollOfHonour} honoraryMembers={honoraryMembers} recordWinner={recordWinner} addHonoraryMember={addHonoraryMember} removeHonoraryMember={removeHonoraryMember} />}
      {section === "Access" && isSuperAdmin && <AdminAccess adminList={adminList} pendingAdminRequests={pendingAdminRequests} approveAdminRequest={approveAdminRequest} revokeAdmin={revokeAdmin} grantAdmin={grantAdmin} members={members} myName={myName} />}
      {section === "Lockouts" && <AdminLockouts lockouts={lockouts} clearLockout={clearLockout} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// MEMBERS SECTION
// ─────────────────────────────────────────────
function AdminMembers({ members, addMember, saveEdit, deleteMember, phoneRequests, approvePhoneRequest, declinePhoneRequest }) {
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [adding, setAdding] = useState(false);
  const [newData, setNewData] = useState({ name: "", phone: "", section: "gents", position: "" });
  const [confirmDel, setConfirmDel] = useState(null);

  const filtered = members.filter(m => m.name.toUpperCase().includes(search.toUpperCase()));

  function startEdit(m) { setEditId(m.id); setEditData({ name: m.name, phone: m.phone || "", section: m.section || "gents", position: m.position || "" }); }
  function cancelEdit() { setEditId(null); setEditData({}); }

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px", border: `1px solid ${BORDER}`, borderRadius: "7px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE };
  const labelStyle = { fontFamily: F_UI, fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" };

  return (
    <div>
      {/* Phone change requests */}
      {phoneRequests.length > 0 && (
        <div style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "16px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Pending Number Changes ({phoneRequests.length})</div>
          {phoneRequests.map(req => (
            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", paddingBottom: "10px", marginBottom: "10px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{req.member_name}</div>
                <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginTop: "2px" }}>
                  {req.current_phone ? <><span style={{ textDecoration: "line-through" }}>{req.current_phone}</span> → </> : "New: "}
                  <span style={{ color: GREEN, fontWeight: "600" }}>{req.requested_phone}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => approvePhoneRequest(req)} style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 12px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Approve</button>
                <button onClick={() => declinePhoneRequest(req.id)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "6px 10px", fontSize: "12px", fontFamily: F_UI, cursor: "pointer" }}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members…"
          style={{ flex: 1, padding: "9px 12px", fontSize: "14px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
        <button onClick={() => { setAdding(true); setNewData({ name: "", phone: "", section: "gents", position: "" }); }}
          style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 14px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "flex", alignItems: "center", gap: "5px" }}>
          <Plus size={14} strokeWidth={2.5} /> Add
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}33`, borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: GREEN, marginBottom: "10px" }}>New Member</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div><div style={labelStyle}>Name</div><input value={newData.name} onChange={e => setNewData(p => ({ ...p, name: e.target.value.toUpperCase() }))} style={inputStyle} placeholder="J SMITH" /></div>
            <div><div style={labelStyle}>Phone</div><input value={newData.phone} onChange={e => setNewData(p => ({ ...p, phone: e.target.value }))} style={inputStyle} placeholder="07700 000000" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Section</div>
              <select value={newData.section} onChange={e => setNewData(p => ({ ...p, section: e.target.value }))} style={{ ...inputStyle }}>
                <option value="gents">Gents</option>
                <option value="ladies">Ladies</option>
              </select>
            </div>
            <div>
              <div style={labelStyle}>Position</div>
              <input value={newData.position} onChange={e => setNewData(p => ({ ...p, position: e.target.value }))} style={inputStyle} placeholder="e.g. President" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setAdding(false)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, padding: "8px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
            <button onClick={() => { if (!newData.name.trim()) return; addMember(newData); setAdding(false); }}
              style={{ background: GREEN, border: "none", borderRadius: "7px", color: "#fff", padding: "8px 16px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save</button>
          </div>
        </div>
      )}

      {/* Member list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {filtered.map(m => (
          <div key={m.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 12px" }}>
            {editId === m.id ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div><div style={labelStyle}>Name</div><input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value.toUpperCase() }))} style={inputStyle} /></div>
                  <div><div style={labelStyle}>Phone</div><input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} style={inputStyle} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                  <div>
                    <div style={labelStyle}>Section</div>
                    <select value={editData.section} onChange={e => setEditData(p => ({ ...p, section: e.target.value }))} style={{ ...inputStyle }}>
                      <option value="gents">Gents</option>
                      <option value="ladies">Ladies</option>
                    </select>
                  </div>
                  <div><div style={labelStyle}>Position</div><input value={editData.position} onChange={e => setEditData(p => ({ ...p, position: e.target.value }))} style={inputStyle} /></div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={cancelEdit} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, padding: "7px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                  <button onClick={() => { saveEdit(m.id, editData); cancelEdit(); }}
                    style={{ background: GREEN, border: "none", borderRadius: "7px", color: "#fff", padding: "7px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save</button>
                  {confirmDel === m.id
                    ? <><button onClick={() => { deleteMember(m.id); setConfirmDel(null); }} style={{ background: LOSS_RED, border: "none", borderRadius: "7px", color: "#fff", padding: "7px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Confirm delete</button>
                        <button onClick={() => setConfirmDel(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, padding: "7px 10px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>No</button></>
                    : <button onClick={() => setConfirmDel(m.id)} style={{ marginLeft: "auto", background: SURFACE, border: `1px solid ${LOSS_RED}44`, borderRadius: "7px", color: LOSS_RED, padding: "7px 10px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, display: "flex", alignItems: "center", gap: "4px" }}><Trash2 size={12} /> Delete</button>
                  }
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{m.name}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px" }}>
                    {m.section === "ladies" ? "Ladies" : "Gents"}{m.position ? ` · ${m.position}` : ""}{m.phone ? ` · ${m.phone}` : ""}
                  </div>
                </div>
                <button onClick={() => startEdit(m)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT3, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontFamily: F_UI }}>
                  <Pencil size={12} /> Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FIXTURES SECTION
// ─────────────────────────────────────────────
function AdminFixtures({ fixtures, addFixture, editFixture, deleteFixture }) {
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const blank = { event_date: "", event: "", time: "", venue: "home", rinks: "" };

  function startEdit(f) { setEditId(f.id); setForm({ event_date: f.event_date, event: f.event, time: f.time || "", venue: f.venue || "home", rinks: f.rinks || "" }); }

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px", border: `1px solid ${BORDER}`, borderRadius: "7px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE };
  const labelStyle = { fontFamily: F_UI, fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" };

  function FixtureForm({ data, onChange, onSave, onCancel, onDelete }) {
    return (
      <div style={{ padding: "10px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
          <div><div style={labelStyle}>Date</div><input type="date" value={data.event_date} onChange={e => onChange({ ...data, event_date: e.target.value })} style={inputStyle} /></div>
          <div><div style={labelStyle}>Time</div><input value={data.time} onChange={e => onChange({ ...data, time: e.target.value })} style={inputStyle} placeholder="2:00pm" /></div>
        </div>
        <div style={{ marginBottom: "8px" }}><div style={labelStyle}>Event / Opponent</div><input value={data.event} onChange={e => onChange({ ...data, event: e.target.value })} style={inputStyle} placeholder="vs Ardrossan" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          <div>
            <div style={labelStyle}>Venue</div>
            <select value={data.venue} onChange={e => onChange({ ...data, venue: e.target.value })} style={{ ...inputStyle }}>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </div>
          <div><div style={labelStyle}>Rinks</div><input type="number" value={data.rinks} onChange={e => onChange({ ...data, rinks: e.target.value })} style={inputStyle} placeholder="Optional" /></div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={onCancel} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, padding: "7px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
          <button onClick={onSave} style={{ background: GREEN, border: "none", borderRadius: "7px", color: "#fff", padding: "7px 16px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save</button>
          {onDelete && <button onClick={onDelete} style={{ marginLeft: "auto", background: SURFACE, border: `1px solid ${LOSS_RED}44`, borderRadius: "7px", color: LOSS_RED, padding: "7px 10px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, display: "flex", alignItems: "center", gap: "4px" }}><Trash2 size={12} /> Delete</button>}
        </div>
      </div>
    );
  }

  const sorted = [...fixtures].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  return (
    <div>
      <button onClick={() => { setAdding(true); setForm({ ...blank }); }}
        style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "flex", alignItems: "center", gap: "5px", marginBottom: "14px" }}>
        <Plus size={14} strokeWidth={2.5} /> Add Fixture
      </button>

      {adding && (
        <div style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}33`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: GREEN, marginBottom: "8px" }}>New Fixture</div>
          <FixtureForm data={form} onChange={setForm}
            onSave={() => { addFixture(form); setAdding(false); }}
            onCancel={() => setAdding(false)} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {sorted.map(f => (
          <div key={f.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 12px" }}>
            {editId === f.id ? (
              <FixtureForm data={form} onChange={setForm}
                onSave={() => { editFixture(f.id, form); setEditId(null); }}
                onCancel={() => setEditId(null)}
                onDelete={confirmDel === f.id
                  ? () => { deleteFixture(f.id); setConfirmDel(null); setEditId(null); }
                  : () => setConfirmDel(f.id)} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{f.event}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px" }}>
                    {new Date(f.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {f.time ? ` · ${f.time}` : ""} · {f.venue === "away" ? "Away" : "Home"}{f.rinks ? ` · ${f.rinks} rinks` : ""}
                  </div>
                </div>
                <button onClick={() => startEdit(f)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT3, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontFamily: F_UI }}>
                  <Pencil size={12} /> Edit
                </button>
              </div>
            )}
          </div>
        ))}
        {sorted.length === 0 && <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, textAlign: "center", padding: "20px" }}>No fixtures yet</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CLUB SECTION
// ─────────────────────────────────────────────
function AdminClub({ rollOfHonour, honoraryMembers, recordWinner, addHonoraryMember, removeHonoraryMember }) {
  const [newHon, setNewHon] = useState("");
  const [recordingComp, setRecordingComp] = useState(null);
  const [winnerYear, setWinnerYear] = useState(new Date().getFullYear());
  const [winnerName, setWinnerName] = useState("");

  return (
    <div>
      {/* Honorary Members */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "14px", marginBottom: "14px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Honorary Members</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
          {(honoraryMembers || []).map(n => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: "4px", background: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: "20px", padding: "4px 10px" }}>
              <span style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT }}>{n}</span>
              <button onClick={() => removeHonoraryMember(n)} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT3, padding: "0 0 0 2px", display: "flex", alignItems: "center" }}><X size={12} /></button>
            </div>
          ))}
          {(!honoraryMembers || honoraryMembers.length === 0) && <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>None yet</div>}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input value={newHon} onChange={e => setNewHon(e.target.value)} placeholder="Add name…"
            style={{ flex: 1, padding: "8px 10px", fontSize: "13px", border: `1px solid ${BORDER}`, borderRadius: "7px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
          <button onClick={() => { if (!newHon.trim()) return; addHonoraryMember(newHon.trim()); setNewHon(""); }}
            style={{ background: MID, border: "none", borderRadius: "7px", color: "#fff", padding: "8px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Add</button>
        </div>
      </div>

      {/* Roll of Honour */}
      <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Roll of Honour</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {(rollOfHonour || []).map(comp => (
          <div key={comp.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: recordingComp === comp.id ? "10px" : 0 }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{comp.name}</div>
              <button onClick={() => { setRecordingComp(recordingComp === comp.id ? null : comp.id); setWinnerName(""); setWinnerYear(new Date().getFullYear()); }}
                style={{ background: recordingComp === comp.id ? SURFACE : MID, border: `1px solid ${recordingComp === comp.id ? BORDER : "transparent"}`, borderRadius: "6px", color: recordingComp === comp.id ? TEXT2 : "#fff", padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>
                {recordingComp === comp.id ? "Cancel" : "+ Record"}
              </button>
            </div>
            {recordingComp === comp.id && (
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <div style={{ flex: "0 0 80px" }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginBottom: "3px" }}>Year</div>
                  <input type="number" value={winnerYear} onChange={e => setWinnerYear(Number(e.target.value))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px", fontSize: "13px", border: `1px solid ${BORDER}`, borderRadius: "7px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginBottom: "3px" }}>Winner</div>
                  <input value={winnerName} onChange={e => setWinnerName(e.target.value)} placeholder="Member name"
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px", fontSize: "13px", border: `1px solid ${BORDER}`, borderRadius: "7px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
                </div>
                <button onClick={() => { if (!winnerName.trim()) return; recordWinner(comp.id, winnerYear, winnerName.trim()); setRecordingComp(null); }}
                  style={{ background: GREEN, border: "none", borderRadius: "7px", color: "#fff", padding: "8px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", flexShrink: 0 }}>Save</button>
              </div>
            )}
            {comp.winners?.length > 0 && (
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "3px" }}>
                {comp.winners.slice(0, 3).map(w => (
                  <div key={w.year} style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{w.year} — {w.winner}</div>
                ))}
                {comp.winners.length > 3 && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>+{comp.winners.length - 3} more</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ACCESS SECTION (super admin only)
// ─────────────────────────────────────────────
function AdminAccess({ adminList, pendingAdminRequests, approveAdminRequest, revokeAdmin, grantAdmin, members, myName }) {
  const [grantSearch, setGrantSearch] = useState("");
  const filtered = members.filter(m => m.name.toUpperCase().includes(grantSearch.toUpperCase()) && m.name.toUpperCase() !== myName.toUpperCase());

  return (
    <div>
      {/* Pending requests */}
      {pendingAdminRequests.length > 0 && (
        <div style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Pending Admin Requests ({pendingAdminRequests.length})</div>
          {pendingAdminRequests.map(req => (
            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "8px", marginBottom: "8px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{req.player_name}</div>
              <button onClick={() => approveAdminRequest(req)} style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 12px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Approve</button>
            </div>
          ))}
        </div>
      )}

      {/* Current admins */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Current Admins</div>
        {adminList.filter(a => a.cloud_key !== null).map(a => (
          <div key={a.cloud_key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginBottom: "6px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{a.display_name || a.player_name}</div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: a.role === "super_admin" ? GOLD_MUTED : TEXT3 }}>{a.role === "super_admin" ? "Super Admin" : "Admin"}</div>
            </div>
            {a.role !== "super_admin" && (
              <button onClick={() => revokeAdmin(a.cloud_key)} style={{ background: SURFACE, border: `1px solid ${LOSS_RED}44`, borderRadius: "6px", color: LOSS_RED, padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI }}>Revoke</button>
            )}
          </div>
        ))}
      </div>

      {/* Grant admin */}
      <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Grant Admin Access</div>
      <input value={grantSearch} onChange={e => setGrantSearch(e.target.value)} placeholder="Search member…"
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: "14px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, marginBottom: "8px" }} />
      {grantSearch.length >= 2 && filtered.slice(0, 6).map(m => {
        const alreadyAdmin = adminList.some(a => a.player_name === m.name.toUpperCase() || a.display_name === m.name);
        return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginBottom: "6px" }}>
            <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{m.name}</div>
            {alreadyAdmin
              ? <span style={{ fontFamily: F_UI, fontSize: "11px", color: GREEN }}>Already admin</span>
              : <button onClick={() => grantAdmin(m)} style={{ background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "5px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Grant</button>
            }
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// LOCKOUTS SECTION
// ─────────────────────────────────────────────
function AdminLockouts({ lockouts, clearLockout }) {
  if (lockouts.length === 0) return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <Lock size={32} strokeWidth={1.2} color={TEXT3} style={{ marginBottom: "8px" }} />
      <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3 }}>No locked accounts</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {lockouts.map(l => {
        const lockedUntil = l.locked_until ? new Date(l.locked_until) : null;
        const isLocked = lockedUntil && lockedUntil > new Date();
        const hoursLeft = isLocked ? Math.ceil((lockedUntil - new Date()) / 3600000) : 0;
        return (
          <div key={l.id} style={{ background: SURFACE, border: `1px solid ${isLocked ? LOSS_RED + "55" : BORDER}`, borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Lock size={16} strokeWidth={1.8} color={isLocked ? LOSS_RED : TEXT3} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{l.name}</div>
                <div style={{ fontFamily: F_UI, fontSize: "11px", color: isLocked ? LOSS_RED : TEXT3, marginTop: "2px" }}>
                  {isLocked ? `Locked · ${hoursLeft}h remaining · ${l.attempts} attempts` : `${l.attempts} failed attempts (not locked)`}
                  {l.unlock_requested && <span style={{ marginLeft: "6px", background: `${GOLD}22`, color: GOLD_MUTED, borderRadius: "4px", padding: "1px 6px", fontSize: "10px" }}>Unlock requested</span>}
                </div>
              </div>
              <button onClick={() => clearLockout(l.id)}
                style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>
                Unlock
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
