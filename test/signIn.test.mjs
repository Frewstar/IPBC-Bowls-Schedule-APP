// ── The sign-in decision ───────────────────────────────────────────────────
//
//   node test/signIn.test.mjs
//
// Every case here is one the app can actually be handed by bowls_sign_in or
// bowls_register. The statuses are not invented for the test: they are the
// five the function returns, checked against pg_get_functiondef.
//
// The point of the file is the failure directions, not the happy path:
//
//   * a dropped connection must never read as a wrong PIN — it would cost a
//     member one of their five attempts for something that was not their
//     fault, five times over on a bad train journey
//   * a body the client does not understand must never read as a sign-in
//   * "wrong_pin" (server) and "wrong-pin" (screen) are different strings and
//     always will be; the mapping between them is the thing being tested

import { signInOutcome, registerOutcome } from "../src/lib/signIn.js";

let failures = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ok   ${name}`); return; }
  failures++;
  console.log(`  FAIL ${name}\n       expected ${w}\n       got      ${g}`);
}

console.log("\nsignInOutcome");

// ── the answers ───────────────────────────────────────────────────────────
const session = {
  status: "ok", id: "c0ffee", cloud_key: "J FREW-1234", account_name: "J FREW",
  display_name: "J FREW", token: "t".repeat(43), club_id: "club", member_id: "m1",
  member_name: "JOSEPH FREW", entries: [], ties: {}, profile: {},
};
check("ok signs in and carries the payload through",
  signInOutcome({ data: session, error: null }),
  { action: "signed-in", payload: session });

check("locked reports when it lifts",
  signInOutcome({ data: { status: "locked", locked_until: "2026-09-02T10:00:00Z" }, error: null }),
  { action: "locked", lockout: { locked_until: "2026-09-02T10:00:00Z" } });

check("wrong_pin becomes the screen's wrong-pin, with the count",
  signInOutcome({ data: { status: "wrong_pin", attempts: 2, remaining: 3 }, error: null }),
  { action: "wrong-pin", lockout: { attempts: 2, remaining: 3 } });

check("not_found offers registration",
  signInOutcome({ data: { status: "not_found" }, error: null }),
  { action: "register" });

check("invalid is neither a sign-in nor a wrong PIN",
  signInOutcome({ data: { status: "invalid" }, error: null }),
  { action: "invalid" });

// ── the non-answers. These are the ones worth having. ─────────────────────
console.log("\n  no answer must never look like a refusal");

check("a transport error is offline, not wrong-pin",
  signInOutcome({ data: null, error: { message: "Failed to fetch" } }),
  { action: "offline" });

check("null data is offline",
  signInOutcome({ data: null, error: null }),
  { action: "offline" });

check("a body with no status at all is offline",
  signInOutcome({ data: {}, error: null }),
  { action: "offline" });

check("a PostgREST error body is offline, not a sign-in",
  signInOutcome({ data: { code: "42501", message: "permission denied" }, error: null }),
  { action: "offline" });

check("an unrecognised status is offline, not a sign-in",
  signInOutcome({ data: { status: "ok_probably", token: "x" }, error: null }),
  { action: "offline" });

check("a truthy non-object is offline",
  signInOutcome({ data: "ok", error: null }),
  { action: "offline" });

check("called with nothing at all is offline",
  signInOutcome(),
  { action: "offline" });

// A status of "ok" with an error set is the shape a half-failed request can
// take. The error wins: signing someone in off a request that errored would
// be trusting a body the server may never have finished sending.
check("error wins over a status that says ok",
  signInOutcome({ data: { status: "ok", token: "x" }, error: { message: "aborted" } }),
  { action: "offline" });

console.log("\nregisterOutcome");

check("created signs in",
  registerOutcome({ data: { ...session, status: "created" }, error: null }),
  { action: "signed-in", payload: { ...session, status: "created" } });

// Two members can share a name, so this is a real case rather than a clash.
check("existing signs in — sharing a name is not an error",
  registerOutcome({ data: { ...session, status: "existing" }, error: null }),
  { action: "signed-in", payload: { ...session, status: "existing" } });

check("invalid does not sign in",
  registerOutcome({ data: { status: "invalid" }, error: null }),
  { action: "offline" });

check("an error does not sign in",
  registerOutcome({ data: null, error: { message: "Failed to fetch" } }),
  { action: "offline" });

// Registration is a write. An answer we do not understand must not be read as
// "the account was created" — the member would be signed in against a row
// that may not exist.
check("an unrecognised status does not sign in",
  registerOutcome({ data: { status: "done" }, error: null }),
  { action: "offline" });

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
