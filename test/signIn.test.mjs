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

import { signInOutcome, registerOutcome, changePinMessage, lockedMessage, LOCKED_SHORT_MESSAGE, LOCKED_LONG_MESSAGE, OFFLINE_MESSAGE, PAUSED_MESSAGE, WEAK_PIN_MESSAGE, isWeakPin } from "../src/lib/signIn.js";

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

check("must_change_pin asks for a new PIN, and is not a sign-in",
  signInOutcome({ data: { status: "must_change_pin", account_name: "J FREW" }, error: null }),
  { action: "change-pin" });

check("must_change_pin carrying a token still does not sign in",
  signInOutcome({ data: { status: "must_change_pin", token: "x" }, error: null }),
  { action: "change-pin" });

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

// The right PIN for an account that already has this name.
check("existing signs in",
  registerOutcome({ data: { ...session, status: "existing" }, error: null }),
  { action: "signed-in", payload: { ...session, status: "existing" } });

check("invalid does not sign in, and is said as invalid (not 'offline')",
  registerOutcome({ data: { status: "invalid" }, error: null }),
  { action: "invalid" });

// Since 20260923_directory_lockdown_1: a wrong PIN for an existing name is
// counted, not turned into a second account.
check("wrong_pin is the screen's wrong-pin, with the count",
  registerOutcome({ data: { status: "wrong_pin", attempts: 1, remaining: 4 }, error: null }),
  { action: "wrong-pin", lockout: { attempts: 1, remaining: 4 } });

check("locked is locked",
  registerOutcome({ data: { status: "locked", locked_until: "2026-09-24T10:00:00Z" }, error: null }),
  { action: "locked", lockout: { locked_until: "2026-09-24T10:00:00Z" } });

check("must_change_pin asks for a new PIN",
  registerOutcome({ data: { status: "must_change_pin" }, error: null }),
  { action: "change-pin" });

check("an error does not sign in",
  registerOutcome({ data: null, error: { message: "Failed to fetch" } }),
  { action: "offline" });

// Registration is a write. An answer we do not understand must not be read as
// "the account was created" — the member would be signed in against a row
// that may not exist.
check("an unrecognised status does not sign in",
  registerOutcome({ data: { status: "done" }, error: null }),
  { action: "offline" });

check("the wrong PIN that locks the account reads as locked, not '0 left'",
  signInOutcome({ data: { status: "wrong_pin", attempts: 5, remaining: 0, locked_until: "2026-09-26T20:00:00Z" }, error: null }),
  { action: "locked", lockout: { locked_until: "2026-09-26T20:00:00Z" } });
check("register: the wrong PIN that locks reads as locked",
  registerOutcome({ data: { status: "wrong_pin", attempts: 5, remaining: 0, locked_until: "2026-09-26T20:00:00Z" }, error: null }),
  { action: "locked", lockout: { locked_until: "2026-09-26T20:00:00Z" } });

// ── changePinMessage: every refusal has words ─────────────────────────────
console.log("\nchangePinMessage");
check("wrong current PIN says so", /doesn't match/.test(changePinMessage({ data: { status: "denied" } })), true);
const NOW = Date.parse("2026-09-25T20:00:00Z");
check("short lock: Joseph's wording", LOCKED_SHORT_MESSAGE, "Too many tries. Try again in 15 minutes, or ask a club admin to unlock you now.");
check("long lock: 24h wording", LOCKED_LONG_MESSAGE, "Too many tries. Try again in 24 hours, or ask a club admin to unlock you now.");
check("a lock ending in 14 minutes reads as the 15-minute lock", lockedMessage("2026-09-25T20:14:00Z", NOW), LOCKED_SHORT_MESSAGE);
check("a lock ending in 23 hours reads as the 24-hour lock", lockedMessage("2026-09-26T19:00:00Z", NOW), LOCKED_LONG_MESSAGE);
check("an admin's lock (2099) reads as the long lock", lockedMessage("2099-01-01T00:00:00Z", NOW), LOCKED_LONG_MESSAGE);
check("no time: the short message", lockedMessage(null, NOW), LOCKED_SHORT_MESSAGE);
check("change PIN, locked, uses the lock's end", changePinMessage({ data: { status: "locked", locked_until: "2099-01-01T00:00:00Z" } }), LOCKED_LONG_MESSAGE);
check("change PIN, paused", changePinMessage({ data: { status: "paused" } }), PAUSED_MESSAGE);
check("change PIN, weak", changePinMessage({ data: { status: "weak_pin" } }), WEAK_PIN_MESSAGE);
check("weak message is Joseph's wording", WEAK_PIN_MESSAGE, "That one's too easy to guess — try a year or house number you'll remember.");

console.log("\nisWeakPin");
for (const p of ["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1212", "2580"])
  check(`weak: ${p}`, isWeakPin(p), true);
for (const p of ["1967", "2024", "1950", "0042", "2468", "1357", "9090", "1122", "1233"])
  check(`allowed: ${p}`, isWeakPin(p), false);

console.log("\npaused / weak_pin");
check("sign-in paused", signInOutcome({ data: { status: "paused", paused_until: "x" }, error: null }), { action: "paused", lockout: { paused_until: "x" } });
check("register paused", registerOutcome({ data: { status: "paused", paused_until: "x" }, error: null }), { action: "paused", lockout: { paused_until: "x" } });
check("register weak_pin", registerOutcome({ data: { status: "weak_pin" }, error: null }), { action: "weak-pin" });
check("no connection says so", changePinMessage({ data: null, error: { message: "Failed to fetch" } }), OFFLINE_MESSAGE);
check("bad PIN says 4 digits", /4 digits/.test(changePinMessage({ data: { status: "bad_pin" } })), true);
check("an old server's own message is used", changePinMessage({ data: { status: "same_pin", message: "Choose a PIN different from your old one." } }), "Choose a PIN different from your old one.");
for (const status of ["denied", "locked", "bad_pin", "must_change_pin", "expired", "whatever", undefined]) {
  const m = changePinMessage({ data: status ? { status } : {} });
  check(`never empty: ${status}`, typeof m === "string" && m.length > 10, true);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
