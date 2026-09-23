import { useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { GREEN, MID, SURFACE, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../lib/theme.js";

// ─────────────────────────────────────────────────────────────────────────────
// "Choose a new PIN". Shown over everything when the server answers
// must_change_pin: every PIN set before the directory lockdown sat in a table
// anyone could read, so every account chooses a new one. Nothing else works
// with the old PIN — the server refuses the directory, saving, linking and
// every admin function — so this is not a prompt that can be put off, only
// one that can be left by signing out.
//
// bowls_change_pin checks the current PIN and sets the new one. onDone gets
// its answer and the new PIN; onSignOut leaves without changing.
// ─────────────────────────────────────────────────────────────────────────────
export default function ChangePinSheet({ name, pin, onDone, onSignOut }) {
  const [newPin, setNewPin]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  const mismatch = confirm.length === 4 && confirm !== newPin;
  const ready = /^\d{4}$/.test(newPin) && confirm === newPin && !busy;

  async function submit() {
    if (!ready) return;
    if (newPin === pin) { setError("Choose a PIN different from your old one."); return; }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("bowls_change_pin", { p_name: name, p_pin: pin, p_new_pin: newPin });
    setBusy(false);
    if (err || !data) { setError("Can't reach the club server. Check your connection and try again."); return; }
    if (data.status === "ok") { onDone(data, newPin); return; }
    if (data.status === "denied") { setError("Your old PIN no longer works on this phone. Sign out, then sign in again or ask an admin to reset it."); return; }
    if (data.status === "locked") { setError("This account is locked after too many wrong PINs. Ask an admin to unlock it."); return; }
    setError(data.message || "That PIN can't be used. Choose a different one.");
  }

  const pinBox = (value, set, extra = {}) => (
    <input value={value} onChange={e => { set(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(null); }}
      type="password" inputMode="numeric" maxLength={4} autoComplete="new-password"
      onKeyDown={e => e.key === "Enter" && submit()}
      style={{ width: "100%", boxSizing: "border-box", padding: "13px", fontSize: "22px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, textAlign: "center", letterSpacing: "8px", ...extra }} />
  );
  const label = text => (
    <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{text}</div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="change-pin-title"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: SURFACE, borderRadius: "16px", padding: "28px 22px", width: "100%", maxWidth: "400px", boxSizing: "border-box", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <Lock size={20} strokeWidth={2} color={GREEN} />
          <div id="change-pin-title" style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "600", color: GREEN }}>Choose a new PIN</div>
        </div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.55, marginBottom: "18px" }}>
          To keep members' phone numbers safe, everyone is choosing a new PIN. Your old PIN stops working once you've chosen one, and nothing else in the app will work for <strong>{name}</strong> until you have.
        </div>

        <div style={{ marginBottom: "12px" }}>
          {label("New 4-digit PIN")}
          {pinBox(newPin, setNewPin)}
        </div>
        <div style={{ marginBottom: "6px" }}>
          {label("Confirm new PIN")}
          {pinBox(confirm, setConfirm, mismatch ? { border: `1px solid ${LOSS_RED}` } : {})}
        </div>
        {mismatch && <div style={{ fontFamily: F_UI, fontSize: "12px", color: LOSS_RED, marginBottom: "6px" }}>PINs don't match — try again</div>}
        {error && <div style={{ fontFamily: F_UI, fontSize: "12px", color: LOSS_RED, lineHeight: 1.5, marginBottom: "6px" }}>{error}</div>}

        <button onClick={submit} disabled={!ready}
          style={{ width: "100%", marginTop: "12px", background: ready ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "13px", fontSize: "14px", cursor: ready ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
          {busy ? "Saving…" : "Save new PIN"}
        </button>
        <button onClick={onSignOut}
          style={{ width: "100%", marginTop: "8px", background: "none", border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
          Not now — sign out
        </button>
      </div>
    </div>
  );
}
