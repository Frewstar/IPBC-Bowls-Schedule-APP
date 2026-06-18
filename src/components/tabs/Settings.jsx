import { useState, useEffect } from "react";
import { Settings, User, Shield, Info, Type, Download, Upload, Check, Trophy, Plus, Pencil, Calendar, Crown, Lock, ChevronLeft, Trash2, UserCheck } from "lucide-react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_SANS, F_UI, LOSS_RED } from "../../lib/theme.js";
import { save } from "../../lib/storage.js";
import { supabase } from "../../lib/supabase.js";

export default function SettingsTab({ settings, updateSetting, myName, setMyName, nameInput, setNameInput, setActiveSection, exportBackup, backupFileRef, handleBackupImport, backupMsg, tournaments = [], defaultTournamentIds = [], compOverrides = {}, onAddComp, onAddPersonalComp, onEditComp, onEditCompDates, masterRoundDates = {}, isSuperAdmin = false, isAdmin = false, cloudKey = null, superAdminName = "", makeMeSuperAdmin, claimSuperAdmin, adminClaimMsg, onBack }) {
  const [savedMsg, setSavedMsg] = useState(false);

  // Admin request state (any member)
  const [requestRoleInput, setRequestRoleInput] = useState("");
  const [requestMsg, setRequestMsg] = useState(null);

  async function submitAdminRequest() {
    const name = myName?.toUpperCase().trim();
    if (!name || !requestRoleInput.trim()) return;
    const { error } = await supabase.from("admin_requests")
      .upsert({ player_name: name, role_title: requestRoleInput.trim(), requested_at: new Date().toISOString() }, { onConflict: "player_name" });
    if (!error) {
      setRequestMsg("Request sent — the super admin will review it shortly.");
      setRequestRoleInput("");
    } else {
      setRequestMsg("Something went wrong. Please try again.");
    }
    setTimeout(() => setRequestMsg(null), 5000);
  }

  // Admin management state (super admin only)
  const [adminList, setAdminList] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [adminMgmtMsg, setAdminMgmtMsg] = useState(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from("admins").select("*").then(({ data }) => { if (data) setAdminList(data); });
    supabase.from("admin_requests").select("*").order("requested_at")
      .then(({ data }) => { if (data) setPendingRequests(data); });
  }, [isSuperAdmin]);

  async function acceptRequest(req) {
    const name = req.player_name;
    const cloudKeyForGrant = `GRANTED-${name}`;
    const { error } = await supabase.from("admins")
      .upsert({ cloud_key: cloudKeyForGrant, player_name: name, role: "admin", display_name: name }, { onConflict: "cloud_key" });
    if (!error) {
      await supabase.from("admin_requests").delete().eq("player_name", name);
      setAdminList(prev => [...prev.filter(a => a.player_name !== name), { cloud_key: cloudKeyForGrant, player_name: name, role: "admin", display_name: name }]);
      setPendingRequests(prev => prev.filter(r => r.player_name !== name));
      setAdminMgmtMsg(`${name} is now an admin.`);
    } else {
      setAdminMgmtMsg("Error granting admin.");
    }
    setTimeout(() => setAdminMgmtMsg(null), 4000);
  }

  async function declineRequest(playerName) {
    await supabase.from("admin_requests").delete().eq("player_name", playerName);
    setPendingRequests(prev => prev.filter(r => r.player_name !== playerName));
    setAdminMgmtMsg("Request declined.");
    setTimeout(() => setAdminMgmtMsg(null), 3000);
  }

  async function revokeAdmin(a) {
    if (a.cloud_key === cloudKey || a.player_name === myName?.toUpperCase()) return;
    const { error } = await supabase.from("admins").delete().eq("cloud_key", a.cloud_key);
    if (!error) {
      setAdminList(prev => prev.filter(x => x.cloud_key !== a.cloud_key));
      setAdminMgmtMsg("Admin revoked.");
    } else {
      setAdminMgmtMsg("Error revoking admin.");
    }
    setTimeout(() => setAdminMgmtMsg(null), 3500);
  }

  function handleSaveAll() {
    // Persist name if there's a pending nameInput
    if (nameInput && nameInput.trim()) {
      save("bowls_myname", nameInput.trim());
      setMyName(nameInput.trim());
      setNameInput("");
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }
  const FONT_OPTIONS = [
    { label: "Normal",      scale: 1,    desc: "Default size"          },
    { label: "Large",       scale: 1.15, desc: "Easier to read"        },
    { label: "Extra Large", scale: 1.3,  desc: "Best for small screens"},
  ];

  function SecHeader({ icon: Icon, label }) {
    return (
      <div style={{ padding: "16px 16px 12px", fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px", borderBottom: `1px solid ${BORDER}` }}>
        <Icon size={13} strokeWidth={2} /> {label}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "520px", margin: "0 auto" }}>
      {/* Page heading */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        {onBack && (
          <button onClick={onBack} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", color: TEXT2, fontFamily: F_UI, fontSize: "13px", fontWeight: "500", flexShrink: 0 }}>
            <ChevronLeft size={16} strokeWidth={2} /> Back
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `${GREEN}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Settings size={16} strokeWidth={2} color={GREEN} />
          </div>
          <div>
            <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "600", color: GREEN }}>Settings</div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>Personalise your app experience</div>
          </div>
        </div>
      </div>

      {/* Display */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
        <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Type size={13} strokeWidth={2} /> Display
        </div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT, marginBottom: "6px", fontWeight: "500" }}>Text Size</div>
        <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginBottom: "12px" }}>Larger text makes the app easier to read.</div>
        <div style={{ display: "flex", gap: "8px" }}>
          {FONT_OPTIONS.map(opt => {
            const active = Math.abs((settings.fontScale || 1) - opt.scale) < 0.05;
            return (
              <button key={opt.scale} onClick={() => updateSetting("fontScale", opt.scale)} style={{
                flex: 1, padding: "12px 6px", borderRadius: "10px", cursor: "pointer",
                border: `2px solid ${active ? GREEN : BORDER}`,
                background: active ? `${GREEN}08` : SURFACE, textAlign: "center",
              }}>
                <div style={{ fontFamily: F_SANS, fontSize: `${14 * opt.scale}px`, fontWeight: "700", color: active ? GREEN : TEXT, lineHeight: 1, marginBottom: "4px" }}>Aa</div>
                <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: active ? GREEN : TEXT2, letterSpacing: "0.04em" }}>{opt.label}</div>
                <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, marginTop: "2px" }}>{opt.desc}</div>
              </button>
            );
          })}
        </div>
        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: "16px", paddingTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: "2px" }}>Show tie reminders</div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>Amber banner when a round needs attention</div>
          </div>
          <button
            onClick={() => updateSetting("showReminders", !(settings.showReminders ?? true))}
            style={{ width: "46px", height: "27px", borderRadius: "14px", border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
              background: (settings.showReminders ?? true) ? GREEN : BORDER, position: "relative", transition: "background 0.2s" }}>
            <div style={{ width: "21px", height: "21px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              position: "absolute", top: "3px", transition: "left 0.15s",
              left: (settings.showReminders ?? true) ? "22px" : "3px" }} />
          </button>
        </div>
      </div>

      {/* Account */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", overflow: "hidden" }}>
        <SecHeader icon={User} label="Account" />
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: "2px" }}>Your Name</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px" }}>Used on your tournament tie cards</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              value={nameInput || myName}
              onChange={e => setNameInput(e.target.value.toUpperCase())}
              placeholder="e.g. J FREW"
              style={{ flex: 1, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "14px", fontFamily: F_UI, color: TEXT, background: SURFACE, letterSpacing: "1px", outline: "none" }}
            />
            <button onClick={() => { if (nameInput.trim()) { save("bowls_myname", nameInput.trim()); setMyName(nameInput.trim()); setNameInput(""); } }}
              style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", whiteSpace: "nowrap", minHeight: "44px" }}>
              Save
            </button>
          </div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: "2px" }}>Default Section</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px" }}>Which section to show when you open the app</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {["gents","ladies"].map(s => {
              const active = (settings.defaultSection || "gents") === s;
              return (
                <button key={s} onClick={() => { updateSetting("defaultSection", s); setActiveSection(s); }}
                  style={{ flex: 1, padding: "10px", borderRadius: "8px", border: `2px solid ${active ? GREEN : BORDER}`, background: active ? `${GREEN}08` : SURFACE, cursor: "pointer", fontFamily: F_UI, fontSize: "13px", fontWeight: active ? "600" : "400", color: active ? GREEN : TEXT2, minHeight: "44px" }}>
                  {s === "gents" ? "Gents" : "Ladies"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Data & Backup */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", overflow: "hidden" }}>
        <SecHeader icon={Shield} label="Data & Backup" />
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: "2px" }}>Save a copy to your phone</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px" }}>Downloads your tournament ties as a file. Keep it somewhere safe — like your Downloads folder or iCloud.</div>
          <button onClick={exportBackup} style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 20px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
            <Download size={15} strokeWidth={2} /> Save a Copy
          </button>
        </div>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: "2px" }}>Load a saved copy</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px" }}>Got a copy from a previous backup? Load it here to restore your data.</div>
          <button onClick={() => backupFileRef.current?.click()} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, padding: "10px 20px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "500", display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
            <Upload size={15} strokeWidth={2} /> Load a Saved Copy
          </button>
          <input ref={backupFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleBackupImport} />
          {backupMsg && (
            <div style={{ marginTop: "8px", fontFamily: F_UI, fontSize: "12px", color: GREEN, display: "flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} strokeWidth={2} /> {backupMsg}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: "2px" }}>Storage Info</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>All data is stored locally on this device. It won't be shared or uploaded anywhere.</div>
        </div>
      </div>

      {/* Competitions */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "16px" }}>
        <div style={{ padding: "16px 16px 12px", fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><Trophy size={13} strokeWidth={2} /> Competitions</div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {onAddPersonalComp && (
              <button onClick={onAddPersonalComp} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Plus size={11} strokeWidth={2.5} /> Add Personal
              </button>
            )}
            {isSuperAdmin ? (
              <button onClick={onAddComp} style={{ background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Plus size={11} strokeWidth={2.5} /> Add IPBC
              </button>
            ) : (
              <div style={{ fontSize: "10px", color: TEXT3, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Lock size={11} strokeWidth={1.75} /> IPBC admin only
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${BORDER}`, background: SURFACE2, fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>
          <strong style={{ color: TEXT2 }}>IPBC</strong> competitions are shared club-wide. <strong style={{ color: TEXT2 }}>Personal</strong> competitions are only for your own tracking.
        </div>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, background: `${isSuperAdmin ? GOLD + "10" : SURFACE2}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: isSuperAdmin ? GOLD_MUTED : TEXT3, display: "flex", alignItems: "center", gap: "6px" }}>
              <Crown size={12} strokeWidth={1.8} />
              {isSuperAdmin ? `Super Admin: ${myName}` : `Super Admin: ${superAdminName || "Not set"}`}
            </div>
            {!isSuperAdmin && claimSuperAdmin && myName && cloudKey && (
              <button onClick={claimSuperAdmin} style={{ background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>
                Claim Super Admin
              </button>
            )}
            {adminClaimMsg && (
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, marginTop: "6px" }}>{adminClaimMsg}</div>
            )}
          </div>
          {isSuperAdmin && (
            <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, whiteSpace: "nowrap" }}>Season Year</label>
              <input
                type="number"
                min={2020}
                max={2100}
                value={settings.seasonYear || new Date().getFullYear()}
                onChange={e => {
                  const raw = parseInt(e.target.value, 10);
                  if (!isNaN(raw)) updateSetting("seasonYear", Math.min(2100, Math.max(2020, raw)));
                }}
                style={{ width: "90px", padding: "6px 8px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none" }}
              />
            </div>
          )}
        </div>
        <div>
          {tournaments.map((t, i) => {
            const isCustom = !defaultTournamentIds.includes(t.id);
            const isOverridden = !isCustom && compOverrides[t.id];
            const source = t.source || (isCustom ? "ipbc" : "ipbc");
            const isPersonal = source === "personal";
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px", borderBottom: i < tournaments.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: t.color || GREEN, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "600", color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>
                    {t.type || "Singles"} · {isPersonal ? "Personal" : "IPBC"}{isCustom ? " · Custom" : ""}{isOverridden ? " · Edited" : ""}
                  </div>
                </div>
                {(isSuperAdmin || isPersonal) ? (
                  <div style={{ display: "flex", gap: "6px" }}>
                    {!isPersonal && <button onClick={() => onEditCompDates && onEditCompDates(t)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "5px 8px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <Calendar size={11} strokeWidth={1.75} /> Dates
                    </button>}
                    <button onClick={() => onEditComp(t)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "5px 9px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <Pencil size={11} strokeWidth={1.75} /> Edit
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: "10px", color: TEXT3, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Lock size={11} strokeWidth={1.75} /> Locked
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Request Admin Access — non-admins with a name set */}
      {myName && !isAdmin && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "14px" }}>
          <SecHeader icon={UserCheck} label="Admin Access" />
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "12px" }}>If you need to manage member records or tournament details, request access below. The super admin will review it.</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
              <div style={{ flex: 1, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "13px", fontFamily: F_UI, color: TEXT2, background: SURFACE2 }}>{myName.toUpperCase()}</div>
            </div>
            <input
              value={requestRoleInput}
              onChange={e => setRequestRoleInput(e.target.value)}
              placeholder="Your role, e.g. Match Secretary"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "13px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none", marginBottom: "8px" }}
            />
            <button
              onClick={submitAdminRequest}
              disabled={!requestRoleInput.trim()}
              style={{ background: requestRoleInput.trim() ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 18px", fontSize: "13px", cursor: requestRoleInput.trim() ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700", minHeight: "44px" }}>
              Send Request
            </button>
            {requestMsg && <div style={{ marginTop: "8px", fontFamily: F_UI, fontSize: "12px", color: GREEN, lineHeight: 1.5 }}>{requestMsg}</div>}
          </div>
        </div>
      )}

      {/* Admin Management — super admin only */}
      {isSuperAdmin && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "14px" }}>
          <SecHeader icon={UserCheck} label="Admin Access" />

          {/* Pending requests */}
          <div style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ padding: "10px 16px 8px", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT2, letterSpacing: "0.04em" }}>
              Pending Requests {pendingRequests.length > 0 && <span style={{ background: MID, color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "10px", marginLeft: "6px" }}>{pendingRequests.length}</span>}
            </div>
            {pendingRequests.length === 0 ? (
              <div style={{ padding: "8px 16px 12px", fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>No pending requests.</div>
            ) : pendingRequests.map((req, i) => (
              <div key={req.player_name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderTop: `1px solid ${BORDER}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{req.player_name}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{req.role_title}</div>
                </div>
                <button onClick={() => acceptRequest(req)}
                  style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", whiteSpace: "nowrap" }}>
                  Accept
                </button>
                <button onClick={() => declineRequest(req.player_name)}
                  style={{ background: "none", border: "none", borderRadius: "6px", color: LOSS_RED, padding: "6px 8px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", whiteSpace: "nowrap" }}>
                  Decline
                </button>
              </div>
            ))}
          </div>

          {/* Current admins list */}
          <div style={{ padding: "10px 16px 8px", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT2, letterSpacing: "0.04em" }}>Current Admins</div>
          {adminMgmtMsg && <div style={{ padding: "0 16px 8px", fontFamily: F_UI, fontSize: "12px", color: GOLD_MUTED }}>{adminMgmtMsg}</div>}
          <div>
            {adminList.filter(a => a.cloud_key !== "SUPER_ADMIN_BOOTSTRAP").length === 0 ? (
              <div style={{ padding: "4px 16px 12px", fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>No admins yet.</div>
            ) : adminList.filter(a => a.cloud_key !== "SUPER_ADMIN_BOOTSTRAP").map((a, i, arr) => {
              const isSelf = a.cloud_key === cloudKey || a.player_name === myName?.toUpperCase();
              return (
                <div key={a.cloud_key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderTop: `1px solid ${BORDER}` }}>
                  <Crown size={13} strokeWidth={1.75} color={a.role === "super_admin" ? GOLD_MUTED : TEXT3} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>{a.display_name || a.player_name}</div>
                    <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>{a.role === "super_admin" ? "Super Admin" : "Admin"}</div>
                  </div>
                  {!isSelf && (
                    <button onClick={() => revokeAdmin(a)}
                      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: LOSS_RED, padding: "5px 9px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <Trash2 size={11} strokeWidth={1.75} /> Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* About */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "20px" }}>
        <SecHeader icon={Info} label="About" />
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: GREEN, marginBottom: "4px" }}>Irvine Park Bowling Club</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginBottom: "10px" }}>Tournament Tracker · {settings.seasonYear || new Date().getFullYear()} Season</div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, lineHeight: 1.6 }}>
            Built by <strong style={{ color: TEXT2 }}>Frewstar</strong> for the members of IPBC. All data stays on your device.
          </div>
        </div>
      </div>

      {/* Save button */}
      <button onClick={handleSaveAll} style={{
        width: "100%", padding: "15px", borderRadius: "10px",
        background: savedMsg ? GREEN : MID,
        border: "none", cursor: "pointer",
        fontFamily: F_UI, fontSize: "15px", fontWeight: "700", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        transition: "background 0.3s",
        marginBottom: "8px",
        minHeight: "52px",
      }}>
        {savedMsg ? <><Check size={18} strokeWidth={2.5} /> Settings Saved</> : "Save Settings"}
      </button>
      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textAlign: "center", marginBottom: "4px" }}>
        All changes are kept on this device
      </div>
      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textAlign: "center", marginBottom: "8px" }}>
        Powered by <a href="https://frewstar.co.uk" target="_blank" rel="noreferrer" style={{ color: GOLD_MUTED, fontWeight: "700", textDecoration: "none" }}>Frewstar</a>
        {" · "}
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSdElbpgUQRg4kpT2gAECgv50vnX299yrLGgUSyIShMa1bc9pg/viewform" target="_blank" rel="noreferrer" style={{ color: GOLD_MUTED, fontWeight: "700", textDecoration: "none" }}>Send feedback</a>
      </div>
    </div>
  );
}
