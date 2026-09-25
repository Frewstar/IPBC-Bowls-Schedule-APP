// ── What the server's answer means ─────────────────────────────────────────
//
// bowls_sign_in and bowls_register answer with a status string. The app has
// its own set of sign-in screen states, and the two vocabularies are not the
// same: the server says "wrong_pin", the screen is in "wrong-pin". Mapping
// one to the other inside a 4,000-line component is how a typo becomes a
// member who cannot get in, so it lives here where it can be tested.
//
// The rule that matters most: NO ANSWER IS NOT A REFUSAL. A dropped
// connection must never come out of here as a wrong PIN, and an unrecognised
// status must never come out as a sign-in.

// Every status bowls_sign_in can return. Anything outside this set is a
// server we do not understand, and the safe reading of that is "no".
// must_change_pin came with 20260923_directory_lockdown. Since
// 20260925_keep_existing_pin_1 the server no longer sends it — members keep
// the PIN they have — but it stays recognised so a server without that file
// still gets the member somewhere rather than nowhere.
const SIGN_IN_STATUSES = ["ok", "invalid", "locked", "not_found", "wrong_pin", "must_change_pin"];

/**
 * @param {{ data: any, error: any }} res — straight from supabase.rpc()
 * @returns {{ action: string, payload?: object, lockout?: object }}
 *   offline    — no usable answer; leave them where they are, cost no attempt
 *   signed-in  — payload is the session
 *   locked     — lockout.locked_until
 *   wrong-pin  — lockout.attempts, lockout.remaining
 *   register   — no account under this name yet
 *   invalid    — the server rejected the name or PIN as malformed
 *   change-pin — right PIN, but a new one must be chosen (bowls_change_pin)
 */
export function signInOutcome({ data, error } = {}) {
  // An error, a null, or a body with no status at all. The last one matters:
  // PostgREST answers a function that raised with an error object, and a
  // half-written client change can hand this an empty object. None of those
  // are permission to sign anybody in, or to spend one of their five attempts.
  if (error || !data || typeof data !== "object" || !SIGN_IN_STATUSES.includes(data.status)) {
    return { action: "offline" };
  }

  switch (data.status) {
    case "ok":
      return { action: "signed-in", payload: data };
    case "locked":
      return { action: "locked", lockout: { locked_until: data.locked_until ?? null } };
    case "wrong_pin":
      // The wrong PIN that uses up the last try comes back as wrong_pin with
      // the lock already set. Say "locked", not "0 attempts left".
      if (data.locked_until) return { action: "locked", lockout: { locked_until: data.locked_until } };
      return {
        action: "wrong-pin",
        lockout: { attempts: data.attempts ?? null, remaining: data.remaining ?? null },
      };
    case "not_found":
      return { action: "register" };
    case "must_change_pin":
      return { action: "change-pin" };
    default: // "invalid"
      return { action: "invalid" };
  }
}

/**
 * bowls_register. "existing" is not an error: it is the right PIN for an
 * account that already has this name, and it signs in.
 *
 * Since 20260923_directory_lockdown_1, a wrong PIN for a name that already
 * has an account is counted and refused, like bowls_sign_in — it no longer
 * makes a second account under that name — and a locked name is refused.
 * Those come back as the same screen states sign-in uses.
 */
export function registerOutcome({ data, error } = {}) {
  if (error || !data || typeof data !== "object") return { action: "offline" };
  switch (data.status) {
    case "created":
    case "existing":
      return { action: "signed-in", payload: data };
    case "must_change_pin":
      return { action: "change-pin" };
    case "locked":
      return { action: "locked", lockout: { locked_until: data.locked_until ?? null } };
    case "wrong_pin":
      if (data.locked_until) return { action: "locked", lockout: { locked_until: data.locked_until } };
      return {
        action: "wrong-pin",
        lockout: { attempts: data.attempts ?? null, remaining: data.remaining ?? null },
      };
    case "invalid":
      return { action: "invalid" };
    default:
      // Anything we do not recognise. Registration is a write, so an
      // unrecognised answer must not be treated as success.
      return { action: "offline" };
  }
}

// ── Words for a refusal ────────────────────────────────────────────────────
// Every place the app refuses a PIN says why, in plain words. These are the
// ones shared between screens, kept here so they can be tested.

export const LOCKED_MESSAGE =
  "Too many tries. Please wait 24 hours, or ask a club admin to unlock your account.";
export const FORGOT_PIN_MESSAGE =
  "Ask a club admin to reset it. They can set a new PIN for you from the admin panel.";
export const OFFLINE_MESSAGE =
  "Can't reach the club server. Check your connection and try again.";

/**
 * bowls_change_pin's or bowls_change_my_pin's answer, for anything but "ok".
 * Never empty.
 * @param {{ data: any, error: any }} res — straight from supabase.rpc()
 */
export function changePinMessage({ data, error } = {}) {
  if (error || !data || typeof data !== "object") return OFFLINE_MESSAGE;
  switch (data.status) {
    case "denied":
      return "That PIN doesn't match your current PIN. Try again — after 5 wrong tries the account locks for 24 hours.";
    case "locked":
      return LOCKED_MESSAGE;
    case "bad_pin":
      return "Your new PIN must be exactly 4 digits.";
    case "expired":
      return "You've been signed out on this phone, so the PIN wasn't changed. Sign in again, then change it.";
    case "must_change_pin":
      // Only from a server without 20260925_keep_existing_pin_1.
      return "The club server needs updating before PINs can be changed. Please ask a club admin.";
    default:
      return data.message || "That PIN couldn't be saved. Please try again, or ask a club admin.";
  }
}
