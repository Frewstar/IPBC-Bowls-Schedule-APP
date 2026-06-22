import { useState } from "react";
import { Settings, User, Shield, Info, Type, Download, Upload, Check, Trophy, Plus, Pencil, Calendar, Lock, ChevronLeft, UserCheck, Link } from "lucide-react";
import { GREEN, MID, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_SANS, F_UI } from "../../lib/theme.js";
import { save } from "../../lib/storage.js";
import { supabase } from "../../lib/supabase.js";

export default function SettingsTab({ settings, updateSetting, myName, setMyName, nameInput, setNameInput, setActiveSection, activeSection = "gents", exportBackup, backupFileRef, handleBackupImport, backupMsg, tournaments = [], onAddComp, onAddPersonalComp, onEditComp, onEditCompDates, isSuperAdmin = false, isAdmin = false, cloudKey = null, superAdminName = "", makeMeSuperAdmin, claimSuperAdmin, adminClaimMsg, onBack, linkedMemberName = "", onLinkName, onUnlinkName }) {
  const [compSectionFilter, setCompSectionFilter] = useState("all");

  // Admin request state (non-admins only)
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

  const FONT_OPTIONS = [
    { label: "Normal",      scale: 1,    desc: "Default"        },
    { label: "Large",       scale: 1.15, desc: "Easier to read" },
    { label: "Extra Large", scale: 1.3,  desc: "Small screens"  },
  ];

  function SecHeader({ icon: Icon, label }) {
    return (
      <div style={{ padding: "14px 16px 10px", fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px", borderBottom: `1px solid ${BORDER}` }}>
        <Icon size={13} strokeWidth={2} /> {label}
      </div>
    );
  }

  function Row({ label, hint, last, children }) {
    return (
      <div style={{ padding: "14px 16px", borderBottom: last ? "none" : `1px solid ${BORDER}` }}>
        {label && <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "500", color: TEXT, marginBottom: hint ? "2px" : "10px" }}>{label}</div>}
        {hint  && <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "10px" }}>{hint}</div>}
        {children}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", paddingBottom: "32px" }}>

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

      {/* Account */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", overflow: "hidden" }}>
        <SecHeader icon={User} label="Account" />

        <Row label="Your Name" hint="Used on your tournament tie cards">
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
        </Row>

        {myName && (
          <Row label="Linked Member Name" hint="Links your account to the members list so draws auto-populate on your home page">
            {linkedMemberName ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ flex: 1, padding: "10px 12px", border: `1px solid ${GREEN}44`, borderRadius: "8px", fontSize: "14px", fontFamily: F_UI, color: GREEN, background: `${GREEN}08`, fontWeight: "600" }}>
                  {linkedMemberName}
                </div>
                <button onClick={onLinkName} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "10px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, whiteSpace: "nowrap" }}>Change</button>
                <button onClick={onUnlinkName} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT3, padding: "10px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Unlink</button>
              </div>
            ) : (
              <button onClick={onLinkName} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", width: "100%", background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>
                <Link size={14} strokeWidth={2} /> Link My Name
              </button>
            )}
          </Row>
        )}

        <Row label="Default Section" hint="Which section to show when you open the app" last>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {[["gents","Gents"],["ladies","Ladies"],["gents-senior","Gents Senior"],["ladies-senior","Ladies Senior"]].map(([s, label]) => {
              const active = (settings.defaultSection || "gents") === s;
              return (
                <button key={s} onClick={() => { updateSetting("defaultSection", s); setActiveSection(s); }}
                  style={{ flex: "1 1 calc(50% - 4px)", padding: "10px 6px", borderRadius: "8px", border: `2px solid ${active ? GREEN : BORDER}`, background: active ? `${GREEN}08` : SURFACE, cursor: "pointer", fontFamily: F_UI, fontSize: "12px", fontWeight: active ? "600" : "400", color: active ? GREEN : TEXT2, minHeight: "44px", textAlign: "center" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </Row>
      </div>

      {/* Display */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", overflow: "hidden" }}>
        <SecHeader icon={Type} label="Display" />
        <Row label="Text Size" hint="Larger text makes the app easier to read">
          <div style={{ display: "flex", gap: "8px" }}>
            {FONT_OPTIONS.map(opt => {
              const active = Math.abs((settings.fontScale || 1) - opt.scale) < 0.05;
              return (
                <button key={opt.scale} onClick={() => updateSetting("fontScale", opt.scale)} style={{ flex: 1, padding: "12px 6px", borderRadius: "10px", cursor: "pointer", border: `2px solid ${active ? GREEN : BORDER}`, background: active ? `${GREEN}08` : SURFACE, textAlign: "center" }}>
                  <div style={{ fontFamily: F_SANS, fontSize: `${14 * opt.scale}px`, fontWeight: "700", color: active ? GREEN : TEXT, lineHeight: 1, marginBottom: "4px" }}>Aa</div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: active ? GREEN : TEXT2 }}>{opt.label}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "9px", color: TEXT3, marginTop: "2px" }}>{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </Row>
        <Row label="Tie Reminders" hint="Amber banner when a round needs attention" last>
          <button
            onClick={() => updateSetting("showReminders", !(settings.showReminders ?? true))}
            style={{ width: "46px", height: "27px", borderRadius: "14px", border: "none", cursor: "pointer", padding: 0, background: (settings.showReminders ?? true) ? GREEN : BORDER, position: "relative", transition: "background 0.2s" }}>
            <div style={{ width: "21px", height: "21px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", position: "absolute", top: "3px", transition: "left 0.15s", left: (settings.showReminders ?? true) ? "22px" : "3px" }} />
          </button>
        </Row>
      </div>

      {/* Competitions */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "14px" }}>
        <div style={{ padding: "14px 16px 10px", fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: GOLD_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}><Trophy size={13} strokeWidth={2} /> Competitions</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {onAddPersonalComp && (
              <button onClick={onAddPersonalComp} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Plus size={11} strokeWidth={2.5} /> Personal
              </button>
            )}
            {isSuperAdmin && (
              <button onClick={onAddComp} style={{ background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Plus size={11} strokeWidth={2.5} /> IPBC
              </button>
            )}
          </div>
        </div>
        {isSuperAdmin && (
          <>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, background: `${GOLD}10`, display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontFamily: F_UI, fontSize: "11px", color: GOLD_MUTED, flex: 1 }}>Season Year</div>
              <input
                type="number" min={2020} max={2100}
                value={settings.seasonYear || new Date().getFullYear()}
                onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) updateSetting("seasonYear", Math.min(2100, Math.max(2020, v))); }}
                style={{ width: "80px", padding: "5px 8px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none" }}
              />
            </div>
            <div style={{ padding: "8px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[["all","All"],["gents","Gents"],["ladies","Ladies"],["seniors","Seniors"],["mixed","Mixed"]].map(([f, label]) => (
                <button key={f} onClick={() => setCompSectionFilter(f)} style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontFamily: F_UI, fontWeight: compSectionFilter === f ? "700" : "400", border: `1px solid ${compSectionFilter === f ? GREEN : BORDER}`, background: compSectionFilter === f ? `${GREEN}10` : "transparent", color: compSectionFilter === f ? GREEN : TEXT3, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <div>
          {tournaments.filter(t => compSectionFilter === "all" || (t.section || "gents") === compSectionFilter).map((t, i, arr) => {
            const isPersonal = t.source === "personal";
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: t.color || GREEN, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3 }}>{t.type || "Singles"} · {isPersonal ? "Personal" : "IPBC"} · {(t.section || "gents").charAt(0).toUpperCase() + (t.section || "gents").slice(1)}</div>
                </div>
                {(isSuperAdmin || isPersonal) ? (
                  <div style={{ display: "flex", gap: "5px" }}>
                    {!isPersonal && (
                      <button onClick={() => onEditCompDates && onEditCompDates(t)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "5px 8px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <Calendar size={11} strokeWidth={1.75} /> Dates
                      </button>
                    )}
                    <button onClick={() => onEditComp(t)} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "5px 9px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <Pencil size={11} strokeWidth={1.75} /> Edit
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: "10px", color: TEXT3, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <Lock size={11} strokeWidth={1.75} /> Locked
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Data & Backup */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", overflow: "hidden" }}>
        <SecHeader icon={Shield} label="Data & Backup" />
        <Row label="Save a copy to your phone" hint="Downloads your tournament ties as a file — keep it in Downloads, iCloud, or Google Drive">
          <button onClick={exportBackup} style={{ background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 20px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
            <Download size={15} strokeWidth={2} /> Save a Copy
          </button>
        </Row>
        <Row label="Load a saved copy" hint="Got a backup file? Load it here to restore your data" last>
          <button onClick={() => backupFileRef.current?.click()} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT, padding: "10px 20px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "500", display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px" }}>
            <Upload size={15} strokeWidth={2} /> Load a Saved Copy
          </button>
          <input ref={backupFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleBackupImport} />
          {backupMsg && (
            <div style={{ marginTop: "8px", fontFamily: F_UI, fontSize: "12px", color: GREEN, display: "flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} strokeWidth={2} /> {backupMsg}
            </div>
          )}
        </Row>
      </div>

      {/* Request Admin Access — non-admins with a name set */}
      {myName && !isAdmin && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "14px" }}>
          <SecHeader icon={UserCheck} label="Request Admin Access" />
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginBottom: "12px", lineHeight: 1.5 }}>Need to manage members or tournament details? Request access — the super admin will review it.</div>
            <input
              value={requestRoleInput}
              onChange={e => setRequestRoleInput(e.target.value)}
              placeholder="Your role, e.g. Match Secretary"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "13px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none", marginBottom: "8px" }}
            />
            <button onClick={submitAdminRequest} disabled={!requestRoleInput.trim()}
              style={{ background: requestRoleInput.trim() ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 18px", fontSize: "13px", cursor: requestRoleInput.trim() ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700", minHeight: "44px" }}>
              Send Request
            </button>
            {requestMsg && <div style={{ marginTop: "8px", fontFamily: F_UI, fontSize: "12px", color: GREEN, lineHeight: 1.5 }}>{requestMsg}</div>}
          </div>
        </div>
      )}

      {/* About */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)", marginBottom: "20px" }}>
        <SecHeader icon={Info} label="About" />
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: GREEN, marginBottom: "4px" }}>Irvine Park Bowling Club</div>
          <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginBottom: "8px" }}>Tournament Tracker · {settings.seasonYear || new Date().getFullYear()} Season</div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, lineHeight: 1.6 }}>Built by <strong style={{ color: TEXT2 }}>Frewstar</strong> for the members of IPBC. All data stays on your device.</div>
        </div>
      </div>

      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textAlign: "center", marginBottom: "4px" }}>
        Powered by <a href="https://frewstar.co.uk" target="_blank" rel="noreferrer" style={{ color: GOLD_MUTED, fontWeight: "700", textDecoration: "none" }}>Frewstar</a>
        {" · "}
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSdElbpgUQRg4kpT2gAECgv50vnX299yrLGgUSyIShMa1bc9pg/viewform" target="_blank" rel="noreferrer" style={{ color: GOLD_MUTED, fontWeight: "700", textDecoration: "none" }}>Send feedback</a>
      </div>
    </div>
  );
}
