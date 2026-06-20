import { useRef, useState, useEffect } from "react";
import BottomSheet from "./BottomSheet.jsx";
import AvatarBubble from "./AvatarBubble.jsx";
import { Camera } from "lucide-react";
import { GREEN, MID, BORDER, SURFACE, SURFACE2, TEXT, TEXT2, TEXT3, F_SANS, F_UI } from "../lib/theme.js";

async function compressImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 150;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileSheet({ open, onClose, profile, setProfile, myName, myEntries = [], settings = {}, linkedPhone = "", onUpdatePhone, onSwitchAccount }) {
  const fileRef = useRef(null);
  const currentSeason = settings.seasonYear || new Date().getFullYear();
  const [phoneInput, setPhoneInput] = useState(linkedPhone);
  const [phoneSaved, setPhoneSaved] = useState(false);

  useEffect(() => { setPhoneInput(linkedPhone); setPhoneSaved(false); }, [linkedPhone]);

  const activeEntries = myEntries.filter(e => e.ties?.length > 0 || e.status === "active");

  // Group by year; entries without a year default to current season
  const byYear = {};
  activeEntries.forEach(e => {
    const yr = e.year || currentSeason;
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(e);
  });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setProfile(prev => ({ ...prev, avatar: compressed }));
    e.target.value = "";
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Your Profile">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Avatar picker */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ position: "relative", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
            <AvatarBubble displayName={profile.displayName || myName} avatar={profile.avatar} size={88} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: "50%", background: MID, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
              <Camera size={13} color="#fff" strokeWidth={2} />
            </div>
          </div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>Tap to {profile.avatar ? "change" : "add a"} photo</div>
          {profile.avatar && (
            <button onClick={() => setProfile(prev => ({ ...prev, avatar: null }))}
              style={{ background: "none", border: "none", fontFamily: F_UI, fontSize: "11px", color: TEXT3, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Remove photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
        </div>

        {/* Display name */}
        <div>
          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Full Name</div>
          <input
            value={profile.displayName || ""}
            onChange={e => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder={`e.g. Joseph Frew`}
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", border: `1px solid ${BORDER}`, borderRadius: "10px", fontSize: "16px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none" }}
          />
          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px", lineHeight: 1.4 }}>
            Helps other members identify who <strong>{myName}</strong> is in the members list
          </div>
        </div>

        {/* Phone number */}
        {onUpdatePhone && (
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>My Phone Number</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="tel"
                value={phoneInput}
                onChange={e => { setPhoneInput(e.target.value); setPhoneSaved(false); }}
                placeholder="e.g. 07700 900123"
                style={{ flex: 1, padding: "12px 14px", border: `1px solid ${BORDER}`, borderRadius: "10px", fontSize: "16px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none", boxSizing: "border-box" }}
              />
              <button
                onClick={async () => { await onUpdatePhone(phoneInput); setPhoneSaved(true); }}
                disabled={phoneInput === linkedPhone}
                style={{ padding: "12px 18px", background: phoneInput === linkedPhone ? SURFACE2 : GREEN, color: phoneInput === linkedPhone ? TEXT3 : "#fff", border: `1px solid ${phoneInput === linkedPhone ? BORDER : GREEN}`, borderRadius: "10px", fontFamily: F_UI, fontSize: "14px", fontWeight: "700", cursor: phoneInput === linkedPhone ? "default" : "pointer", whiteSpace: "nowrap" }}>
                {phoneSaved ? "Saved ✓" : "Save"}
              </button>
            </div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px", lineHeight: 1.4 }}>
              Updates your number in the members list for everyone to see
            </div>
          </div>
        )}

        {/* Sharing toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: SURFACE2, borderRadius: "10px", border: `1px solid ${BORDER}` }}>
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT }}>Share my win/loss record</div>
            <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px", lineHeight: 1.4 }}>Show your season results to other members</div>
          </div>
          <button onClick={() => setProfile(prev => ({ ...prev, shareProfile: !(prev.shareProfile ?? true) }))}
            style={{ width: "46px", height: "27px", borderRadius: "14px", border: "none", cursor: "pointer", padding: 0, background: (profile.shareProfile ?? true) ? GREEN : BORDER, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ width: "21px", height: "21px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", position: "absolute", top: "3px", transition: "left 0.15s", left: (profile.shareProfile ?? true) ? "22px" : "3px" }} />
          </button>
        </div>

        {/* Season history */}
        {years.length > 0 && years.map(yr => {
          const yEntries = byYear[yr];
          const yWins   = yEntries.reduce((s, e) => s + (e.ties || []).filter(t => t.result === "W").length, 0);
          const yLosses = yEntries.reduce((s, e) => s + (e.ties || []).filter(t => t.result === "L").length, 0);
          return (
            <div key={yr}>
              <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{yr} Season</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <div style={{ flex: 1, background: `${GREEN}10`, border: `1px solid ${GREEN}30`, borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: GREEN, lineHeight: 1 }}>{yWins}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginTop: "4px" }}>Wins</div>
                </div>
                <div style={{ flex: 1, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: TEXT2, lineHeight: 1 }}>{yLosses}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginTop: "4px" }}>Losses</div>
                </div>
                <div style={{ flex: 1, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: TEXT2, lineHeight: 1 }}>{yEntries.length}</div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, marginTop: "4px" }}>Comps</div>
                </div>
              </div>
              {yEntries.map(e => {
                const ew = (e.ties || []).filter(t => t.result === "W").length;
                const el = (e.ties || []).filter(t => t.result === "L").length;
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.tournamentColor || GREEN, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", color: TEXT }}>{e.tournamentName}</div>
                    <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>{ew}W {el}L</div>
                  </div>
                );
              })}
              <div style={{ height: "16px" }} />
            </div>
          );
        })}

        {/* Switch account */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "14px" }}>
          <button onClick={onSwitchAccount}
            style={{ background: "none", border: "none", fontFamily: F_UI, fontSize: "12px", color: TEXT3, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
            Switch account / update PIN
          </button>
        </div>

      </div>
    </BottomSheet>
  );
}
