// ── Signing out actually signs out ─────────────────────────────────────────
//
//   node test/session.test.mjs
//
// The bug this exists for: endSession called
//
//     supabase.rpc("bowls_sign_out", { p_token: token }).catch(() => {})
//
// which throws, because rpc() returns a PostgrestFilterBuilder and a builder
// has `then` and nothing else. Two consequences, both invisible from the
// component: the HTTP request was never dispatched (a builder only fires when
// then() is called), and the throw skipped the local sign-out that followed
// it — so "switch account" minted a session, abandoned it, and left the
// member signed in as themselves.
//
// THE MOCK IS THE REAL QUERY BUILDER. This matters more than the assertions.
// A hand-written stub returning Promise.resolve() has a .catch, so it would
// have passed the broken code and hidden the bug — the exact "stub that hides
// the bug" the brief warns about. So the client here is a real PostgrestClient
// with only `fetch` replaced, and the first check asserts that the real
// builder still has no .catch. If a future supabase-js grows one, that check
// fails and tells us this file's premise has changed.

import { PostgrestClient } from "@supabase/postgrest-js";
import {
  endServerSession,
  queuePendingSignout,
  flushPendingSignouts,
} from "../src/lib/session.js";

let failures = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ok   ${name}`); return; }
  failures++;
  console.log(`  FAIL ${name}\n       expected ${w}\n       got      ${g}`);
};

// A real client. `calls` records what actually went over the wire, which is
// the whole point: "did the request happen" is the assertion the old code
// would have failed.
function client({ status = 200, body = "null" } = {}) {
  const calls = [];
  const pg = new PostgrestClient("http://postgrest.invalid", {
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body || "{}") });
      return new Response(body, { status, headers: { "content-type": "application/json" } });
    },
  });
  return { supabase: { rpc: (fn, args) => pg.rpc(fn, args) }, calls };
}

console.log("\nthe premise: what supabase.rpc() actually returns");

{
  const pg = new PostgrestClient("http://postgrest.invalid", { fetch: async () => new Response("null") });
  const builder = pg.rpc("bowls_sign_out", { p_token: "x" });
  check("it is a thenable", typeof builder.then, "function");
  // If this ever becomes "function", supabase-js has changed and the original
  // code would no longer throw. The file's reasoning would need revisiting.
  check("and it has NO .catch — a stub with one would hide the bug", typeof builder.catch, "undefined");
  check("and no .finally", typeof builder.finally, "undefined");
}

console.log("\nendServerSession");

{
  const { supabase, calls } = client();
  const res = await endServerSession(supabase, "tok-abc");
  check("it dispatches the request", calls.length, 1);
  check("with the token, to bowls_sign_out",
    { fn: calls[0]?.url.endsWith("/rpc/bowls_sign_out"), body: calls[0]?.body },
    { fn: true, body: { p_token: "tok-abc" } });
  check("and reports success", res, { ok: true, called: true, error: null });
}

{
  const { supabase, calls } = client();
  const res = await endServerSession(supabase, "");
  check("no token: nothing is sent", calls.length, 0);
  check("no token: reported as nothing to do", res, { ok: true, called: false, error: null });
}

{
  // PostgREST refusing the call — e.g. the grant is gone. The member must
  // still be signed out locally, so this resolves rather than throwing, but
  // ok is false so the caller knows to queue the token.
  const { supabase } = client({ status: 401, body: JSON.stringify({ message: "permission denied", code: "42501" }) });
  const res = await endServerSession(supabase, "tok-abc");
  check("a refusal is reported, not thrown", { ok: res.ok, called: res.called, threw: false }, { ok: false, called: true, threw: false });
}

{
  // The offline case: fetch rejects outright.
  const pg = new PostgrestClient("http://postgrest.invalid", {
    fetch: async () => { throw new TypeError("Failed to fetch"); },
  });
  const res = await endServerSession({ rpc: (f, a) => pg.rpc(f, a) }, "tok-abc");
  check("a dropped connection is reported, not thrown", { ok: res.ok, called: res.called }, { ok: false, called: true });
}

console.log("\nthe queue — a sign-out with no signal must not abandon a live token");

check("a failed token is queued", queuePendingSignout([], "tok-1"), ["tok-1"]);
check("queuing is idempotent", queuePendingSignout(["tok-1"], "tok-1"), ["tok-1"]);
check("an empty token is not queued", queuePendingSignout([], ""), []);
check("a second failure joins the first", queuePendingSignout(["tok-1"], "tok-2"), ["tok-1", "tok-2"]);

{
  const { supabase, calls } = client();
  const left = await flushPendingSignouts(supabase, ["tok-1", "tok-2"]);
  check("a successful flush retries every token", calls.length, 2);
  check("and empties the queue", left, []);
}

{
  // Still offline. The token must stay queued — dropping it here is the same
  // permanent orphan by a different route.
  const pg = new PostgrestClient("http://postgrest.invalid", {
    fetch: async () => { throw new TypeError("Failed to fetch"); },
  });
  const left = await flushPendingSignouts({ rpc: (f, a) => pg.rpc(f, a) }, ["tok-1"]);
  check("a failed flush keeps the token queued", left, ["tok-1"]);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
