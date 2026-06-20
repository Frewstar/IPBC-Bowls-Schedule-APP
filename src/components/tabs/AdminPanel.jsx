import { useState, useEffect } from "react";
import { BRACKET_SIZE, bracketPairs, rowsToDisplay, fmtRoundDate, ViewToggle, BracketDisplay, BracketTreeView } from "../DrawViewer.jsx";
import { Users, Calendar, Shield, Lock, Plus, Pencil, Trash2, Crown, Trophy, Shuffle, X } from "lucide-react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../../lib/theme.js";
import { supabase } from "../../lib/supabase.js";

function printTieSheet(draw, slots, prelims, roundDates) {
  const LABELS  = ["1st Round", "2nd Round", "3rd Round", "4th Round", "Semi-Final", "Final"];
  const ROW_H   = 13;
  const N       = BRACKET_SIZE; // 64
  const ROUNDS  = 6;
  const HDR     = 26;
  const NUM_W   = 22;
  const NAME_W  = 138;
  const BRACE_W = 20;
  const LINE_W  = 88;
  const TOTAL_H = N * ROW_H;

  const nameMap = {};
  (slots || []).forEach(s => { if (s?.name) nameMap[s.slotIndex] = s; });

  const ply  = i       => (i + 1) * ROW_H;
  const rly  = (ri, g) => (2 * g + 1) * Math.pow(2, ri) * ROW_H + ROW_H * 0.5;
  const bTop = (ri, g) => ri === 0 ? ply(2 * g)     : rly(ri - 1, 2 * g);
  const bBot = (ri, g) => ri === 0 ? ply(2 * g + 1) : rly(ri - 1, 2 * g + 1);

  // ── Name column ──
  let nameRows = "";
  for (let i = 0; i < N; i++) {
    const s = nameMap[i + 1];
    const filled = !!s?.name;
    nameRows += `<div style="height:${ROW_H}px;display:flex;align-items:flex-end;">
      <span style="width:${NUM_W}px;font-size:8px;color:#999;text-align:right;padding-right:3px;flex-shrink:0;padding-bottom:1px;">${i + 1}</span>
      <div style="width:${NAME_W}px;border-bottom:1px solid ${filled ? "#333" : "#bbb"};font-size:${filled ? "10" : "9"}px;font-weight:${filled ? "600" : "400"};color:${filled ? "#111" : "#ccc"};padding-left:3px;padding-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s?.name ? s.name + (s.handicap ? ` (${s.handicap})` : "") : ""}</div>
    </div>`;
  }

  // ── Bracket columns ──
  let bracketCols = "";
  for (let ri = 0; ri < ROUNDS; ri++) {
    const gc    = N / Math.pow(2, ri + 1);
    const isLast = ri === ROUNDS - 1;
    const colW   = isLast ? LINE_W + 24 : LINE_W;

    let svgLines = "";
    let resultLines = "";
    for (let g = 0; g < gc; g++) {
      const tY = bTop(ri, g) + HDR;
      const bY = bBot(ri, g) + HDR;
      const mY = rly(ri, g)  + HDR;
      const x  = BRACE_W / 2;
      svgLines += `<line x1="0" y1="${tY}" x2="${x}" y2="${tY}" stroke="#aaa" stroke-width="0.7"/>
<line x1="${x}" y1="${tY}" x2="${x}" y2="${bY}" stroke="#aaa" stroke-width="0.7"/>
<line x1="0" y1="${bY}" x2="${x}" y2="${bY}" stroke="#aaa" stroke-width="0.7"/>
<line x1="${x}" y1="${mY}" x2="${BRACE_W}" y2="${mY}" stroke="#aaa" stroke-width="0.7"/>`;
      resultLines += `<div style="position:absolute;top:${mY}px;left:0;right:${isLast ? 12 : 0}px;height:1px;background:${isLast ? "#333" : "#aaa"};"></div>`;
    }

    const dateStr  = roundDates[ri] ? fmtRoundDate(roundDates[ri]) : "";
    const hdrHtml  = `<div style="height:${HDR}px;padding-left:2px;display:flex;flex-direction:column;justify-content:center;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#444;">${LABELS[ri]}</div>
      ${dateStr ? `<div style="font-size:7px;color:#888;margin-top:1px;">${dateStr}</div>` : ""}
    </div>`;
    const winnerHtml = isLast ? `<div style="position:absolute;top:${rly(ROUNDS - 1, 0) + HDR + 4}px;left:2px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#333;">Winner</div>` : "";

    bracketCols += `<svg width="${BRACE_W}" height="${TOTAL_H + HDR}" style="display:block;flex-shrink:0;overflow:visible;">${svgLines}</svg>
<div style="width:${colW}px;flex-shrink:0;position:relative;height:${TOTAL_H + HDR}px;">${hdrHtml}${resultLines}${winnerHtml}</div>`;
  }

  // ── Prelim section ──
  const prelimHtml = prelims.length > 0 ? `<div style="margin-bottom:10px;">
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1.5px solid #333;padding-bottom:3px;margin-bottom:5px;">Preliminary Round</div>
    <p style="font-size:8px;color:#666;margin-bottom:5px;">Play these matches first — winners enter the main draw.</p>
    <table style="border-collapse:collapse;font-size:10px;">
      ${prelims.map(m => `<tr>
        <td style="padding:3px 8px 3px 0;font-weight:600;">${m.p1?.name || ""}${m.p1?.handicap ? ` (${m.p1.handicap})` : ""}</td>
        <td style="padding:3px 8px;color:#888;font-size:8px;">vs</td>
        <td style="padding:3px 8px 3px 0;font-weight:600;">${m.p2 ? m.p2.name + (m.p2.handicap ? ` (${m.p2.handicap})` : "") : "BYE"}</td>
        <td style="padding:3px 0;color:#666;font-size:9px;">Score _____ – _____</td>
      </tr>`).join("")}
    </table>
  </div>` : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${draw?.tournament_name || "Draw"} ${draw?.season_year || ""}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;color:#111;padding:10px 14px;}
  @page{size:A4 landscape;margin:8mm;}
  @media print{body{padding:0;}.toolbar{display:none!important;}}
</style>
</head>
<body>
  <div class="toolbar" style="display:flex;gap:8px;padding:10px 14px;background:#f5f5f5;border-bottom:1px solid #ddd;margin:-10px -14px 12px;">
    <button onclick="doPrint()" style="flex:1;padding:9px 16px;background:#1a5e35;color:#fff;border:none;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">🖨️ Print</button>
    <button onclick="doSavePdf()" style="flex:1;padding:9px 16px;background:#fff;color:#1a5e35;border:2px solid #1a5e35;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">💾 Save as PDF</button>
    <button onclick="window.close()" style="padding:9px 14px;background:#fff;color:#888;border:1px solid #ccc;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;cursor:pointer;">✕ Close</button>
  </div>
  <div style="font-family:Arial,sans-serif;font-size:11px;color:#666;padding:0 14px 8px;background:#fffbe6;border-bottom:1px solid #e8d88a;margin:-12px -14px 12px;padding:6px 14px;" class="toolbar">
    💡 To save a PDF: tap <strong>Save as PDF</strong> above, then in the print dialog change the destination to <strong>Save as PDF</strong>.
  </div>
  <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:7px;margin-bottom:8px;">
    <div style="font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:#777;">Irvine Park Bowling Club</div>
    <div style="font-size:17px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;margin-top:2px;">${draw?.tournament_name || "Competition"}</div>
    <div style="font-size:9px;color:#666;margin-top:2px;">${draw?.season_year || ""} Season</div>
  </div>
  ${prelimHtml}
  <div style="display:flex;align-items:flex-start;">
    <div style="flex-shrink:0;">
      <div style="height:${HDR}px;display:flex;align-items:flex-end;padding-bottom:3px;">
        <span style="width:${NUM_W}px;"></span>
        <div style="width:${NAME_W}px;font-size:7px;font-weight:700;text-transform:uppercase;color:#999;letter-spacing:0.08em;padding-left:3px;">Player</div>
      </div>
      ${nameRows}
    </div>
    ${bracketCols}
  </div>
  <div style="margin-top:7px;font-size:8px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:5px;">Irvine Park Bowling Club · IPBC Bowls App</div>
  <script>
    function doPrint() { window.print(); }
    function doSavePdf() {
      // Suggest PDF filename via document title, then open print dialog
      // (user picks "Save as PDF" in the print destination)
      var orig = document.title;
      document.title = "${(draw?.tournament_name || "Draw").replace(/"/g, "")}_${draw?.season_year || ""}.pdf";
      window.print();
      document.title = orig;
    }
  <\/script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

const ADMIN_SECTIONS = ["Members", "Fixtures", "Competitions", "Club", "Access", "Lockouts", "Draw"];
const DRAW_SECTIONS  = ["Draw"];
const SECTION_ICONS  = { Members: Users, Fixtures: Calendar, Competitions: Trophy, Club: Shield, Access: Crown, Lockouts: Lock, Draw: Shuffle };

export default function AdminPanel({
  // identity
  myName, isSuperAdmin, isDrawAdmin = false,
  // members
  members, addMember, saveEdit, deleteMember,
  // fixtures
  fixtures, addFixture, editFixture, deleteFixture,
  // competitions
  tournaments = [], onEditCompDates,
  // club
  rollOfHonour, honoraryMembers, recordWinner, addHonoraryMember, removeHonoraryMember,
  // lockouts
  lockouts = [], clearLockout,
  // admin management
  adminList = [], pendingAdminRequests = [], approveAdminRequest, revokeAdmin, grantAdmin,
  // phone requests
  phoneRequests = [], approvePhoneRequest, declinePhoneRequest,
  // app accounts
  registeredUsers = [], lockAppAccount, unlockAppAccount, deleteAppAccount,
  // draws
  seasonYear, allDraws = [], onDrawSaved,
  // claim requests
  claimRequests = [], resolveClaimRequest,
}) {
  const sections = isDrawAdmin ? DRAW_SECTIONS : ADMIN_SECTIONS;
  const [section, setSection] = useState(isDrawAdmin ? "Draw" : "Members");

  return (
    <div>
      {/* Sub-nav */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", overflowX: "auto", paddingBottom: "2px" }}>
        {sections.map(s => {
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

      {section === "Members"      && <AdminMembers members={members} addMember={addMember} saveEdit={saveEdit} deleteMember={deleteMember} phoneRequests={phoneRequests} approvePhoneRequest={approvePhoneRequest} declinePhoneRequest={declinePhoneRequest} registeredUsers={registeredUsers} lockouts={lockouts} lockAppAccount={lockAppAccount} unlockAppAccount={unlockAppAccount} deleteAppAccount={deleteAppAccount} isSuperAdmin={isSuperAdmin} claimRequests={claimRequests} resolveClaimRequest={resolveClaimRequest} />}
      {section === "Fixtures"     && <AdminFixtures fixtures={fixtures} addFixture={addFixture} editFixture={editFixture} deleteFixture={deleteFixture} />}
      {section === "Competitions" && <AdminCompetitions tournaments={tournaments} onEditCompDates={onEditCompDates} />}
      {section === "Club"         && <AdminClub rollOfHonour={rollOfHonour} honoraryMembers={honoraryMembers} recordWinner={recordWinner} addHonoraryMember={addHonoraryMember} removeHonoraryMember={removeHonoraryMember} />}
      {section === "Access" && isSuperAdmin && <AdminAccess adminList={adminList} pendingAdminRequests={pendingAdminRequests} approveAdminRequest={approveAdminRequest} revokeAdmin={revokeAdmin} grantAdmin={grantAdmin} members={members} myName={myName} />}
      {section === "Lockouts"     && <AdminLockouts lockouts={lockouts} clearLockout={clearLockout} />}
      {section === "Draw"         && <AdminDrawGenerator members={members} tournaments={tournaments} seasonYear={seasonYear} allDraws={allDraws} generatedBy={myName} onDrawSaved={onDrawSaved} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPETITIONS SECTION
// ─────────────────────────────────────────────
function AdminCompetitions({ tournaments = [], onEditCompDates }) {
  const SECTION_LABELS = { gents: "Gents", ladies: "Ladies", "gents-seniors": "Gents Seniors", "ladies-seniors": "Ladies Seniors" };
  const grouped = (tournaments || []).filter(t => t && t.source !== "personal")
    .reduce((g, t) => { const s = t.section || "gents"; (g[s] = g[s] || []).push(t); return g; }, {});
  const sectionOrder = ["gents", "ladies", "gents-seniors", "ladies-seniors"];

  return (
    <div>
      <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginBottom: "16px", lineHeight: 1.5 }}>
        Tap a competition to set or edit its round dates. Dates are shown to all members in the Find tab.
      </div>
      {sectionOrder.filter(s => grouped[s]).map(s => (
        <div key={s} style={{ marginBottom: "20px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
            {SECTION_LABELS[s] || s}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {grouped[s].map(t => {
              const dates = (Array.isArray(t.round_dates) ? t.round_dates : []).filter(d => d);
              const rounds = Array.isArray(t.rounds) ? t.rounds : [];
              const hasDates = dates.length > 0;
              return (
                <div key={t.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: t.color || MID, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{t.name}</div>
                    <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px" }}>
                      {hasDates
                        ? rounds.slice(0, dates.length).map((r, i) => `${r.split("\n")[0]}: ${new Date(dates[i] + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`).join(" · ")
                        : rounds.map(r => r.split("\n")[0]).join(" · ")}
                    </div>
                    {hasDates && <div style={{ fontFamily: F_UI, fontSize: "10px", color: GREEN, marginTop: "2px" }}>✓ {dates.length} date{dates.length !== 1 ? "s" : ""} set</div>}
                  </div>
                  <button onClick={() => onEditCompDates(t)}
                    style={{ flexShrink: 0, background: hasDates ? SURFACE : MID, border: `1px solid ${hasDates ? BORDER : "transparent"}`, borderRadius: "7px", color: hasDates ? TEXT2 : "#fff", padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>
                    {hasDates ? "Edit" : "Set Dates"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// MEMBERS SECTION
// ─────────────────────────────────────────────
function AdminMembers({ members = [], addMember, saveEdit, deleteMember, phoneRequests = [], approvePhoneRequest, declinePhoneRequest, registeredUsers = [], lockouts = [], lockAppAccount, unlockAppAccount, deleteAppAccount, isSuperAdmin, claimRequests = [], resolveClaimRequest }) {
  const [view, setView] = useState("club");
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
      {/* View toggle */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {[["club", "Club Members"], ["app", "App Accounts"]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: "6px 14px", borderRadius: "16px", border: `1px solid ${view === v ? MID : BORDER}`, background: view === v ? MID : SURFACE, color: view === v ? "#fff" : TEXT2, fontFamily: F_UI, fontSize: "12px", fontWeight: view === v ? "700" : "400", cursor: "pointer" }}>
            {label}{v === "app" && ` (${registeredUsers.length})`}
          </button>
        ))}
      </div>

      {view === "app" && <AppAccounts registeredUsers={registeredUsers} lockouts={lockouts} lockAppAccount={lockAppAccount} unlockAppAccount={unlockAppAccount} deleteAppAccount={deleteAppAccount} isSuperAdmin={isSuperAdmin} />}

      {view === "club" && <>
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

      {/* Name claim requests */}
      {claimRequests.length > 0 && (
        <div style={{ background: `${MID}0d`, border: `1px solid ${MID}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "16px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: MID, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Name Claim Requests ({claimRequests.length})</div>
          {claimRequests.map(req => (
            <div key={req.id} style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{req.requester_display_name}</div>
              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginTop: "3px", lineHeight: 1.5 }}>
                Requesting to claim <span style={{ color: TEXT, fontWeight: "600" }}>{req.target_member_name}</span>
                {req.current_linked_cloudkey && <span> (currently linked to {req.current_linked_cloudkey.split("-")[0]})</span>}
              </div>
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                <button onClick={() => resolveClaimRequest(req.id, true, req)} style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 14px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Approve</button>
                <button onClick={() => resolveClaimRequest(req.id, false, req)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "6px 10px", fontSize: "12px", fontFamily: F_UI, cursor: "pointer" }}>Reject</button>
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
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────
// APP ACCOUNTS VIEW
// ─────────────────────────────────────────────
function AppAccounts({ registeredUsers, lockouts = [], lockAppAccount, unlockAppAccount, deleteAppAccount, isSuperAdmin }) {
  const [confirmDel, setConfirmDel] = useState(null);

  const lockoutMap = {};
  lockouts.forEach(l => { lockoutMap[l.name] = l; });

  function isLocked(playerName) {
    const parts = playerName.split("-");
    const name = parts.slice(0, -1).join("-");
    const row = lockoutMap[name];
    return row?.locked_until && new Date(row.locked_until) > new Date();
  }

  function getLockoutName(playerName) {
    const parts = playerName.split("-");
    return parts.slice(0, -1).join("-");
  }

  function getLockoutRow(playerName) {
    return lockoutMap[getLockoutName(playerName)];
  }

  if (registeredUsers.length === 0) {
    return <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, padding: "20px 0", textAlign: "center" }}>No app accounts found</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {registeredUsers.map(u => {
        const locked = isLocked(u.player_name);
        const lockRow = getLockoutRow(u.player_name);
        const namePart = getLockoutName(u.player_name);
        const pin = u.player_name.split("-").slice(-1)[0];
        return (
          <div key={u.player_name} style={{ background: SURFACE, border: `1px solid ${locked ? LOSS_RED + "66" : BORDER}`, borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{namePart} <span style={{ color: TEXT3, fontWeight: "400" }}>•••• {pin}</span></div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: locked ? LOSS_RED : TEXT3, marginTop: "2px" }}>
                {locked ? (lockRow?.locked_until === "2099-01-01T00:00:00.000Z" ? "Locked by admin" : "Locked (too many attempts)") : "Active"}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              {locked
                ? <button onClick={() => unlockAppAccount(namePart)} style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 11px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Unlock</button>
                : <button onClick={() => lockAppAccount(namePart)} style={{ background: LOSS_RED, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 11px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Lock</button>
              }
              {isSuperAdmin && (
                confirmDel === u.player_name
                  ? <div style={{ display: "flex", gap: "4px" }}>
                      <button onClick={() => { deleteAppAccount(u.player_name); setConfirmDel(null); }} style={{ background: LOSS_RED, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "12px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Confirm</button>
                      <button onClick={() => setConfirmDel(null)} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "6px 10px", fontSize: "12px", fontFamily: F_UI, cursor: "pointer" }}>Cancel</button>
                    </div>
                  : <button onClick={() => setConfirmDel(u.player_name)} style={{ background: "none", border: `1px solid ${LOSS_RED}44`, borderRadius: "6px", color: LOSS_RED, padding: "6px 10px", fontSize: "12px", fontFamily: F_UI, cursor: "pointer" }}><Trash2 size={13} /></button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// FIXTURES SECTION
// ─────────────────────────────────────────────
function AdminFixtures({ fixtures = [], addFixture, editFixture, deleteFixture }) {
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
const ROLE_LABELS = { admin: "Admin", draw_admin: "Draw Admin", super_admin: "Super Admin" };

function AdminAccess({ adminList = [], pendingAdminRequests = [], approveAdminRequest, revokeAdmin, grantAdmin, members = [], myName }) {
  const [grantSearch, setGrantSearch] = useState("");
  const [grantRole, setGrantRole]     = useState("admin");
  const filtered = members.filter(m => m.name.toUpperCase().includes(grantSearch.toUpperCase()) && m.name.toUpperCase() !== (myName || "").toUpperCase());

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
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: a.role === "super_admin" ? GOLD_MUTED : a.role === "draw_admin" ? MID : TEXT3 }}>{ROLE_LABELS[a.role] || a.role}</div>
            </div>
            {a.role !== "super_admin" && (
              <button onClick={() => revokeAdmin(a.cloud_key)} style={{ background: SURFACE, border: `1px solid ${LOSS_RED}44`, borderRadius: "6px", color: LOSS_RED, padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI }}>Revoke</button>
            )}
          </div>
        ))}
      </div>

      {/* Grant admin */}
      <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: TEXT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Grant Access</div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <input value={grantSearch} onChange={e => setGrantSearch(e.target.value)} placeholder="Search member…"
          style={{ flex: 1, padding: "9px 12px", fontSize: "14px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
        <select value={grantRole} onChange={e => setGrantRole(e.target.value)}
          style={{ padding: "9px 10px", fontSize: "13px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, cursor: "pointer" }}>
          <option value="admin">Admin</option>
          <option value="draw_admin">Draw Admin</option>
        </select>
      </div>
      {grantSearch.length >= 2 && filtered.slice(0, 6).map(m => {
        const alreadyAdmin = adminList.some(a => a.player_name === m.name.toUpperCase() || a.display_name === m.name);
        return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginBottom: "6px" }}>
            <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{m.name}</div>
            {alreadyAdmin
              ? <span style={{ fontFamily: F_UI, fontSize: "11px", color: GREEN }}>Already admin</span>
              : <button onClick={() => grantAdmin(m, grantRole)} style={{ background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "5px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Grant</button>
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

// ─────────────────────────────────────────────
// DRAW GENERATOR SECTION (draw_admin only)
// ─────────────────────────────────────────────
const V1_DRAW_IDS  = new Set(['championship','presidents','morton','donaldson','mitchell','mixed-pairs']);

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// entrants = [{name, handicap}]
// returns { slots: [{slotIndex, name, handicap}] (64 entries, name may be null),
//           prelims: [{p1:{name,handicap}, p2:{name,handicap}|null}] }
function generateBracket(entrants) {
  const shuffled = fisherYates([...entrants]);
  const main     = shuffled.slice(0, BRACKET_SIZE);
  const overflow = shuffled.slice(BRACKET_SIZE);

  const slots = Array(BRACKET_SIZE).fill(null).map((_, i) => ({
    slotIndex: i + 1,
    name:      main[i]?.name      || null,
    handicap:  main[i]?.handicap  || null,
  }));

  const prelims = [];
  for (let i = 0; i < overflow.length; i += 2) {
    prelims.push({ p1: overflow[i], p2: overflow[i + 1] || null });
  }

  return { slots, prelims };
}

// Flatten bracket to DB rows
function bracketToRows(drawId, slots, prelims) {
  const mainRows = slots
    .filter(s => s.name)
    .map(s => ({
      draw_id:       drawId,
      round_type:    'main',
      slot_index:    s.slotIndex,
      player_name:   s.name,
      opponent_name: null,
      handicap:      s.handicap || null,
      pairing_index: s.slotIndex,
    }));

  const prelimRows = [];
  prelims.forEach((match, idx) => {
    const { p1, p2 } = match;
    if (!p1) return;
    prelimRows.push({ draw_id: drawId, round_type: 'prelim', slot_index: null, player_name: p1.name, opponent_name: p2?.name || null, handicap: p1.handicap || null, pairing_index: idx });
    if (p2) prelimRows.push({ draw_id: drawId, round_type: 'prelim', slot_index: null, player_name: p2.name, opponent_name: p1.name, handicap: p2.handicap || null, pairing_index: idx });
  });

  return [...mainRows, ...prelimRows];
}


function AdminDrawGenerator({ members, tournaments, seasonYear, allDraws, generatedBy, onDrawSaved }) {
  const [step, setStep]                 = useState(1);
  const [viewMode, setViewMode]         = useState("list"); // "list" | "bracket"
  const [tournId, setTournId]           = useState("");
  const [selected, setSelected]         = useState(new Set());
  const [handicaps, setHandicaps]       = useState({});
  const [memberSearch, setMemberSearch] = useState("");
  const [result, setResult]             = useState(null);   // {slots, prelims}
  const [saving, setSaving]             = useState(false);
  const [confirmPub, setConfirmPub]     = useState(false);
  const [existingDraw, setExistingDraw] = useState(null);
  const [pubRows, setPubRows]           = useState([]);
  const [roundDates, setRoundDates]     = useState(Array(6).fill(""));

  const tournament    = tournaments.find(t => t.id === tournId);
  const isMitchell    = tournId === 'mitchell';
  const isOutOfScope  = tournId && !V1_DRAW_IDS.has(tournId);
  const isMixedPairs  = tournId === 'mixed-pairs';

  useEffect(() => {
    if (!tournId) return;
    const existing = allDraws.find(d => d.tournament_id === tournId && d.season_year === seasonYear);
    setExistingDraw(existing || null);
    setRoundDates(existing?.round_dates?.length ? existing.round_dates : Array(6).fill(""));
    if (existing) {
      supabase.from("draw_pairings").select("*").eq("draw_id", existing.id).order("pairing_index")
        .then(({ data, error }) => { if (!error) setPubRows(data || []); });
    } else {
      setPubRows([]);
    }
  }, [tournId, allDraws, seasonYear]);

  function reset() { setTournId(""); setStep(1); setSelected(new Set()); setHandicaps({}); setResult(null); setExistingDraw(null); setPubRows([]); setConfirmPub(false); setRoundDates(Array(6).fill("")); }

  async function saveRoundDate(ri, value) {
    const updated = [...roundDates];
    updated[ri] = value;
    setRoundDates(updated);
    if (existingDraw?.id) {
      await supabase.from("draws").update({ round_dates: updated }).eq("id", existingDraw.id);
    }
  }

  function toggleMember(name) {
    setSelected(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  function setHandicap(name, val) {
    setHandicaps(h => ({ ...h, [name]: val }));
  }

  function buildEntrants() {
    return [...selected].map(name => ({ name, handicap: handicaps[name] || null }));
  }

  function runGenerate() {
    setResult(generateBracket(buildEntrants()));
    setStep(3);
  }

  function reshuffle() {
    setResult(generateBracket(buildEntrants()));
  }

  async function saveDraw(publish = false) {
    if (!tournament || !result) return;
    setSaving(true);
    setConfirmPub(false);
    const drawRow = {
      tournament_id: tournId, tournament_name: tournament.name,
      season_year: seasonYear, generated_by: generatedBy,
      published: publish, published_at: publish ? new Date().toISOString() : null,
    };
    const { data: draw, error } = await supabase.from("draws").upsert(drawRow, { onConflict: "tournament_id,season_year" }).select().maybeSingle();
    if (error || !draw) { setSaving(false); alert("Error saving draw. Please try again."); return; }
    const rows = bracketToRows(draw.id, result.slots, result.prelims);
    await supabase.from("draw_pairings").delete().eq("draw_id", draw.id);
    const { error: insertErr } = await supabase.from("draw_pairings").insert(rows);
    if (insertErr) { setSaving(false); alert("Draw saved but pairings failed to write. Please try again."); return; }
    onDrawSaved(draw, rows);
    setExistingDraw(draw);
    setPubRows(rows);
    setSaving(false);
    setStep(4);
  }

  async function publishExistingDraw() {
    if (!existingDraw) return;
    setSaving(true);
    setConfirmPub(false);
    const { data: draw, error } = await supabase.from("draws")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("id", existingDraw.id).select().maybeSingle();
    if (error || !draw) { setSaving(false); alert("Error publishing draw. Please try again."); return; }
    onDrawSaved(draw, null);
    setExistingDraw(draw);
    setSaving(false);
  }

  const filteredMembers = members.filter(m => m.name.toUpperCase().includes(memberSearch.toUpperCase()));
  const entrantCount    = selected.size;
  const overflowCount   = Math.max(0, entrantCount - BRACKET_SIZE);

  // ── Draft / Published view ──────────────────────────────
  if (step === 4 && !existingDraw) {
    return <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, textAlign: "center", padding: "30px" }}>Loading draw…</div>;
  }
  if (step === 4 || (step <= 2 && existingDraw)) {
    const isDraft = existingDraw && !existingDraw.published;
    const { slots, prelims } = pubRows.length ? rowsToDisplay(pubRows) : { slots: Array(BRACKET_SIZE).fill(null).map((_, i) => ({ slotIndex: i+1, name: null, handicap: null })), prelims: [] };
    return (
      <div>
        {/* Status banner */}
        {isDraft ? (
          <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "18px" }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: GOLD_MUTED }}>{existingDraw?.tournament_name} — Draft saved</div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px" }}>Not visible to members yet — publish when ready</div>
            </div>
            {confirmPub ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { publishExistingDraw(); }} disabled={saving}
                  style={{ padding: "8px 12px", background: GREEN, border: "none", borderRadius: "7px", color: "#fff", fontFamily: F_UI, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                  {saving ? "Publishing…" : "Confirm"}
                </button>
                <button onClick={() => setConfirmPub(false)}
                  style={{ padding: "8px 10px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, fontFamily: F_UI, fontSize: "12px", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmPub(true)}
                style={{ padding: "8px 14px", background: GREEN, border: "none", borderRadius: "7px", color: "#fff", fontFamily: F_UI, fontSize: "12px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
                Publish
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "18px" }}>✅</div>
            <div>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: GREEN }}>{existingDraw?.tournament_name} — Published {existingDraw?.season_year}</div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px" }}>Published by {existingDraw?.generated_by} · visible to all members</div>
            </div>
          </div>
        )}
        {/* Round date editor */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Round Dates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {["1st Round","2nd Round","3rd Round","4th Round","Semi-Final","Final"].map((label, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: "90px", fontFamily: F_UI, fontSize: "12px", color: TEXT2, flexShrink: 0 }}>{label}</span>
                <input type="date" value={roundDates[ri] || ""} onChange={e => saveRoundDate(ri, e.target.value)}
                  style={{ flex: 1, padding: "6px 8px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontFamily: F_UI, fontSize: "12px", color: TEXT, background: SURFACE, outline: "none" }} />
                {roundDates[ri] && <span style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, whiteSpace: "nowrap" }}>{fmtRoundDate(roundDates[ri])}</span>}
              </div>
            ))}
          </div>
        </div>
        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        {pubRows.length === 0
          ? <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, textAlign: "center", padding: "20px" }}>Loading…</div>
          : viewMode === "bracket"
            ? <BracketTreeView slots={slots} prelims={prelims} roundDates={roundDates} />
            : <BracketDisplay slots={slots} prelims={prelims} />
        }
        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button
            onClick={() => printTieSheet(existingDraw, slots, prelims, roundDates)}
            style={{ flex: 1, padding: "11px", border: `1px solid ${GREEN}`, borderRadius: "8px", background: GREEN, color: "#fff", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
            🖨️ Print Tie Sheet
          </button>
          <button onClick={reset} style={{ flex: 1, padding: "11px", border: `1px solid ${BORDER}`, borderRadius: "8px", background: SURFACE, color: TEXT2, fontFamily: F_UI, fontSize: "13px", cursor: "pointer" }}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginBottom: "16px", lineHeight: 1.6 }}>
        Generate and publish the first-round draw for each competition. <strong>Published draws are permanent</strong> — double-check before publishing.
      </div>

      {/* ── Step 1: Pick competition ── */}
      {step === 1 && (
        <div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Select Competition</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tournaments.filter(t => t.source !== "personal").map(t => {
              const inScope = V1_DRAW_IDS.has(t.id);
              const pub     = allDraws.find(d => d.tournament_id === t.id && d.season_year === seasonYear);
              return (
                <button key={t.id}
                  onClick={() => { if (!inScope) return; setTournId(t.id); setStep(pub ? 4 : 2); }}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", cursor: inScope ? "pointer" : "default", textAlign: "left", width: "100%", opacity: inScope ? 1 : 0.5 }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: t.color || MID, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{t.name}</div>
                  </div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: !inScope ? TEXT3 : pub?.published ? GREEN : pub ? GOLD_MUTED : TEXT3 }}>
                    {!inScope ? "Coming soon" : pub?.published ? "Published ✓" : pub ? "Draft saved" : "No draw yet"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 2: Select entrants ── */}
      {step === 2 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <button onClick={() => { setStep(1); setTournId(""); setSelected(new Set()); setHandicaps({}); }} style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer", fontFamily: F_UI, fontSize: "13px" }}>← Back</button>
            <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT }}>{tournament?.name}</div>
          </div>

          {isMixedPairs && (
            <div style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}44`, borderRadius: "8px", padding: "9px 12px", marginBottom: "10px", fontFamily: F_UI, fontSize: "12px", color: GOLD_MUTED, lineHeight: 1.5 }}>
              ℹ️ Select each gentleman who has entered. Each man represents himself and his chosen ladies partner — the draw matches pairs against pairs.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontFamily: F_UI, fontSize: "12px", color: entrantCount > 0 ? TEXT : TEXT3 }}>
              {entrantCount === 0 ? "Tick every member who has entered" : `${entrantCount} entrant${entrantCount !== 1 ? "s" : ""} selected`}
            </span>
            {overflowCount > 0 && (
              <span style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, fontWeight: "600" }}>
                {overflowCount} → prelim round
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search surname…"
              style={{ flex: 1, padding: "9px 12px", fontSize: "14px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE }} />
            <button onClick={() => {
              const allFiltered = filteredMembers.map(m => m.name);
              const allSelected = allFiltered.every(n => selected.has(n));
              setSelected(s => {
                const n = new Set(s);
                allSelected ? allFiltered.forEach(name => n.delete(name)) : allFiltered.forEach(name => n.add(name));
                return n;
              });
            }} style={{ padding: "9px 14px", border: `1px solid ${BORDER}`, borderRadius: "8px", background: SURFACE, color: TEXT2, fontFamily: F_UI, fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>
              {filteredMembers.every(m => selected.has(m.name)) ? "Deselect All" : "Select All"}
            </button>
          </div>

          {isMitchell && (
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginBottom: "8px" }}>Enter handicap values (e.g. <strong>+7</strong>) next to each player.</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "360px", overflowY: "auto", marginBottom: "14px" }}>
            {filteredMembers.map(m => {
              const checked = selected.has(m.name);
              return (
                <label key={m.id} onClick={e => { if (e.target.tagName === 'INPUT' && e.target.type === 'text') e.stopPropagation(); }}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: checked ? `${MID}14` : SURFACE, border: `1px solid ${checked ? MID : BORDER}`, borderRadius: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleMember(m.name)} style={{ accentColor: MID, width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: checked ? "600" : "400", color: TEXT }}>{m.name}</span>
                  {isMitchell && checked && (
                    <input type="text" value={handicaps[m.name] || ""} onChange={e => setHandicap(m.name, e.target.value)}
                      placeholder="+0" maxLength={4}
                      style={{ width: "46px", padding: "4px 6px", fontSize: "12px", border: `1px solid ${BORDER}`, borderRadius: "5px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none", textAlign: "center" }} />
                  )}
                </label>
              );
            })}
          </div>

          <button onClick={runGenerate} disabled={entrantCount < 2}
            style={{ width: "100%", padding: "13px", background: entrantCount >= 2 ? MID : BORDER, border: "none", borderRadius: "10px", color: "#fff", fontFamily: F_UI, fontSize: "14px", fontWeight: "700", cursor: entrantCount >= 2 ? "pointer" : "not-allowed" }}>
            Generate Draw ({entrantCount} entrant{entrantCount !== 1 ? "s" : ""})
          </button>
        </div>
      )}

      {/* ── Step 3: Preview & publish ── */}
      {step === 3 && result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer", fontFamily: F_UI, fontSize: "13px" }}>← Back</button>
            <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT }}>{tournament?.name} — Preview</div>
          </div>
          <div style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}44`, borderRadius: "8px", padding: "10px 12px", marginBottom: "14px", fontFamily: F_UI, fontSize: "12px", color: GOLD_MUTED, lineHeight: 1.5 }}>
            ⚠️ Published draws are permanent and visible to all members. Double-check every pairing before publishing.
          </div>

          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
          {viewMode === "bracket"
            ? <BracketTreeView slots={result.slots} prelims={result.prelims} />
            : <BracketDisplay slots={result.slots} prelims={result.prelims} />
          }

          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button onClick={reshuffle}
              style={{ flex: 1, padding: "12px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", color: TEXT2, fontFamily: F_UI, fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Shuffle size={14} strokeWidth={2} /> Re-shuffle
            </button>
            <button onClick={() => saveDraw(false)} disabled={saving}
              style={{ flex: 1, padding: "12px", background: SURFACE, border: `1px solid ${MID}`, borderRadius: "10px", color: MID, fontFamily: F_UI, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
              {saving ? "Saving…" : "Save Draft"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
