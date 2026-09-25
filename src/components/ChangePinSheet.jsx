import { useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { changePinMessage } from "../lib/signIn.js";
import { GREEN, MID, SURFACE, BORDER, TEXT, TEXT2, TEXT3, LOSS_RED, F_SANS, F_UI } from "../lib/theme.js";

// ─────────────────────────────────────────────────────────────────────────────
// Change your PIN.
//
// Two ways in:
//   * From the profile sheet ("Change my PIN"), when the member wants to.
//     Being signed in is enough (25 Sep): no current PIN, just the new one
//     twice, through bowls_change_my_pin with the session token. Any 4 digits
//     are accepted — including the PIN they have now or had before.
//   * required: the server answered must_change_pin. Since
//     20260925_keep_existing_pin_1 nothing does; this stays only so a phone
//     that meets a server without that file is not left with no way in. The
//     current PIN is the one just typed at sign-in, so it is not asked again.
//
// Either function sets the new PIN, ends every other session and hands back a
// fresh one for this device. onDone gets its answer and the new PIN; onCancel
// leaves without changing anything.
// ─────────────────────────────────────────────────────────────────────────────
export default function ChangePinSheet({ name, pin = "", token = "", required = false, onDone, onCancel }) {
  const [newPin, setNewPin]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  const mismatch = confirm.length === 4 && confirm !== newPin;
  const ready = /^\d{4}$/.test(newPin) && confirm === newPin && !busy;

  async function submit() {
    if (busy) return;
    if (!/^\d{4}$/.test(newPin))  { setError("Your new PIN must be exactly 4 digits."); return; }
    if (confirm !== newPin)       { setError("The two new PINs don't match. Type the same 4 digits in both boxes."); return; }
    setBusy(true);
    setError(null);
    let res;
    try {
      res = required
        ? await supabase.rpc("bowls_change_pin", { p_name: name, p_pin: pin, p_new_pin: newPin })
        : await supabase.rpc("bowls_change_my_pin", { p_token: token, p_new_pin: newPin });
    }
    catch (e) { res = { data: null, error: e }; }
    setBusy(false);
    if (!res.error && res.data?.status === "ok") { onDone(res.data, newPin); return; }
    setError(changePinMessage(res));
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
          <div id="change-pin-title" style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "600", color: GREEN }}>
            {required ? "Set your PIN" : "Change your PIN"}
          </div>
        </div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.55, marginBottom: "18px" }}>
          {required
            ? <>Please set a 4-digit PIN for <strong>{name}</strong> to carry on.</>
            : <>Choose any 4 digits for <strong>{name}</strong>. You can go back to a PIN you've used before. Your other phones and tablets will need the new PIN.</>}
        </div>

        <div style={{ marginBottom: "12px" }}>
          {label("New 4-digit PIN")}
          {pinBox(newPin, setNewPin)}
        </div>
        <div style={{ marginBottom: "6px" }}>
          {label("Type the new PIN again")}
          {pinBox(confirm, setConfirm, mismatch ? { border: `1px solid ${LOSS_RED}` } : {})}
        </div>
        {mismatch && !error && <div role="alert" style={{ fontFamily: F_UI, fontSize: "12px", color: LOSS_RED, marginBottom: "6px" }}>The two new PINs don't match — try again</div>}
        {error && <div role="alert" style={{ fontFamily: F_UI, fontSize: "12px", color: LOSS_RED, lineHeight: 1.5, marginBottom: "6px" }}>{error}</div>}

        <button onClick={submit} disabled={busy}
          style={{ width: "100%", marginTop: "12px", background: ready ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "13px", fontSize: "14px", cursor: busy ? "default" : "pointer", fontFamily: F_UI, fontWeight: "700" }}>
          {busy ? "Saving…" : "Save PIN"}
        </button>
        <button onClick={onCancel}
          style={{ width: "100%", marginTop: "8px", background: "none", border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
          {required ? "Not now — sign out" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
