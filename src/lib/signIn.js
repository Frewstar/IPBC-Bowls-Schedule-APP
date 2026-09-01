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
const SIGN_IN_STATUSES = ["ok", "invalid", "locked", "not_found", "wrong_pin"];

/**
 * @param {{ data: any, error: any }} res — straight from supabase.rpc()
 * @returns {{ action: string, payload?: object, lockout?: object }}
 *   offline    — no usable answer; leave them where they are, cost no attempt
 *   signed-in  — payload is the session
 *   locked     — lockout.locked_until
 *   wrong-pin  — lockout.attempts, lockout.remaining
 *   register   — no account under this name yet
 *   invalid    — the server rejected the name or PIN as malformed
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
      return {
        action: "wrong-pin",
        lockout: { attempts: data.attempts ?? null, remaining: data.remaining ?? null },
      };
    case "not_found":
      return { action: "register" };
    default: // "invalid"
      return { action: "invalid" };
  }
}

/**
 * bowls_register. "existing" is not an error — two members can share a name,
 * so signing in an account that already matches this name and PIN is the
 * correct outcome, not a clash.
 */
export function registerOutcome({ data, error } = {}) {
  if (error || !data || typeof data !== "object") return { action: "offline" };
  if (data.status === "created" || data.status === "existing") {
    return { action: "signed-in", payload: data };
  }
  // "invalid", or anything we do not recognise. Registration is a write, so
  // an unrecognised answer must not be treated as success.
  return { action: "offline" };
}
