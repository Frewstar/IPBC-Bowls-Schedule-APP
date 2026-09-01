// ── Ending a session on the server ─────────────────────────────────────────
//
// This is four lines and it lives in its own file because the version that
// was inlined in App.jsx did not work, and could not be tested where it was:
//
//     await supabase.rpc("bowls_sign_out", { p_token: token }).catch(() => {});
//
// supabase.rpc() does not return a Promise. It returns a PostgrestFilterBuilder
// — a thenable with `then` and NOTHING ELSE. `.catch` is undefined on it, so
// that line threw a TypeError, and because the builder only issues its HTTP
// request when `then()` is called, the request was never sent at all.
//
// The damage was not just the missing sign-out. The throw happened inside
// endSession(), so everything after `await endSession()` in the caller was
// skipped — including the local sign-out — which left the name and PIN in
// localStorage for the upgrade effect to find and sign straight back in with.
// Every tap of "switch account" therefore minted a session and abandoned it:
// a live credential, valid 90 days, that nothing would ever revoke.
//
// So: no .catch on a builder, ever. await inside try/catch, which works
// because awaiting a thenable calls then() and that is what dispatches.

/**
 * Revoke a session token server-side.
 *
 * Never throws. A caller signing a member out must not be left half-done by a
 * dropped connection — but it reports what happened, because "the server was
 * not told" is exactly the state that leaves an orphaned credential behind
 * and the caller needs to know to try again.
 *
 * @returns {{ ok: boolean, called: boolean, error: any }}
 *   ok      — the server has revoked it; the token is dead
 *   called  — a request was actually dispatched (false when there is no token)
 */
export async function endServerSession(supabase, token) {
  if (!token) return { ok: true, called: false, error: null };
  try {
    const { error } = await supabase.rpc("bowls_sign_out", { p_token: token });
    return { ok: !error, called: true, error: error || null };
  } catch (e) {
    return { ok: false, called: true, error: e };
  }
}

// Tokens we failed to revoke, kept so the next load can try again.
//
// Without this, signing out with no signal abandons a live credential
// permanently: the device forgets the token, so nothing can ever revoke it,
// and bowls_session_issue only reaps rows 30 days past a 90-day expiry that
// slides forward on every use. A member on a bad connection at the green
// should not leave a permanent session behind because of it.
export const PENDING_SIGNOUT_KEY = "bowls_pending_signout";

export function queuePendingSignout(pending, token) {
  if (!token) return pending;
  return pending.includes(token) ? pending : [...pending, token];
}

/**
 * Retry the queue. Returns the tokens still outstanding — a token is only
 * dropped once the server has confirmed it is gone, so a failed retry stays
 * queued rather than being quietly forgotten a second time.
 */
export async function flushPendingSignouts(supabase, pending) {
  const left = [];
  for (const token of pending) {
    const { ok } = await endServerSession(supabase, token);
    if (!ok) left.push(token);
  }
  return left;
}
