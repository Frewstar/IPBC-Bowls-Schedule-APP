// Stands in for src/lib/supabase.js when the harness mounts the real App.jsx.
//
// THE BUILDERS ARE REAL. This is a genuine PostgrestClient with only `fetch`
// replaced, so `supabase.from(...)` and `supabase.rpc(...)` return actual
// PostgrestFilterBuilders — thenables with no `.catch`, exactly as in
// production. That is not incidental: the sign-out bug was `.catch` on a
// builder, and a hand-rolled mock returning Promise.resolve() would have
// swallowed it. A mock that accepts what the real client rejects is a stub
// that hides the bug.
//
// The session RPCs are implemented for real against an in-memory store, close
// enough to the SQL that the client cannot tell: a token is issued, resolving
// one bumps last_seen_at, signing out deletes the row. The store is exposed on
// window.__sessions so a test can assert row counts the way it would against
// the database.
//
// Everything else answers empty. This harness is for the sign-in and sign-out
// paths; it is not a second implementation of the app's data.
import { PostgrestClient } from "@supabase/postgrest-js";

// Backed by localStorage under a key the app never touches, so it survives a
// page reload the way a database does. Without that, a reload would wipe the
// store and "is the session still there after a reload" could not be asked —
// which is the exact question the sign-out bug turns on.
const STORE = "__harness_sessions";
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const writeStore = o => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch {} };

const sessions = {
  get: t => readStore()[t],
  set(t, v) { const o = readStore(); o[t] = v; writeStore(o); },
  delete(t) { const o = readStore(); delete o[t]; writeStore(o); },
  clear() { writeStore({}); },
  get size() { return Object.keys(readStore()).length; },
  values() { return Object.values(readStore()); },
  entries() { return Object.entries(readStore()); },
  [Symbol.iterator]() { return Object.entries(readStore())[Symbol.iterator](); },
};

const accounts = new Map();       // name_key -> { id, pin, player_name, account_name }
let seq = 0;

const nameKey = n => (n || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// One real account, so a test can sign in as somebody.
accounts.set("JFREW", {
  id: "player-jfrew",
  pin: "1234",
  player_name: "J FREW-1234",
  account_name: "J FREW",
  display_name: "J FREW",
});

function issue(account) {
  const token = `tok-${++seq}-${Math.random().toString(36).slice(2)}`;
  sessions.set(token, { id: token, player_id: account.id, last_seen_at: Date.now() });
  return token;
}

function payload(account, token, status) {
  return {
    status,
    id: account.id,
    cloud_key: account.player_name,
    display_name: account.display_name,
    account_name: account.account_name,
    entries: [], ties: {}, profile: {},
    updated_at: new Date().toISOString(),
    token,
    club_id: "club-1",
    member_id: null,
    member_name: null,
  };
}

const rpcs = {
  bowls_sign_in({ p_name, p_pin }) {
    const acct = accounts.get(nameKey(p_name));
    if (!acct) return { status: "not_found" };
    if (acct.pin !== p_pin) return { status: "wrong_pin", attempts: 1, remaining: 4 };
    return payload(acct, issue(acct), "ok");
  },
  bowls_register({ p_name, p_pin }) {
    const key = nameKey(p_name);
    let acct = accounts.get(key);
    if (acct && acct.pin === p_pin) return payload(acct, issue(acct), "existing");
    acct = { id: `player-${key}`, pin: p_pin, player_name: `uuid-${key}`, account_name: p_name, display_name: p_name };
    accounts.set(key, acct);
    return payload(acct, issue(acct), "created");
  },
  bowls_session_state({ p_token }) {
    const s = sessions.get(p_token);
    if (!s) return { status: "expired" };
    s.last_seen_at = Date.now();          // the sliding refresh, as in SQL
    sessions.set(p_token, s);
    const acct = [...accounts.values()].find(a => a.id === s.player_id);
    return {
      status: "ok",
      id: acct.id,
      cloud_key: acct.player_name,
      display_name: acct.display_name,
      account_name: acct.account_name,
      club_id: "club-1",
      member_id: null,
      member_name: null,
    };
  },
  bowls_sign_out({ p_token }) {
    sessions.delete(p_token);
    return null;
  },
  bowls_sign_out_all({ p_token }) {
    const s = sessions.get(p_token);
    if (s) for (const [t, v] of sessions.entries()) if (v.player_id === s.player_id) sessions.delete(t);
    return null;
  },
  bowls_request_unlock() { return null; },
  bowls_admin_role() { return null; },
};

// Every call the page makes, so a test can assert that a request happened at
// all — which is the thing the sign-out bug got wrong.
const calls = [];

async function harnessFetch(url, init = {}) {
  const path = new URL(String(url)).pathname;
  const body = init.body ? JSON.parse(init.body) : {};
  const json = v => new Response(JSON.stringify(v), {
    status: 200, headers: { "content-type": "application/json" },
  });

  const rpc = path.match(/\/rpc\/([a-z0-9_]+)$/i);
  if (rpc) {
    const name = rpc[1];
    calls.push({ rpc: name, body });
    const fn = rpcs[name];
    return json(fn ? fn(body) : null);
  }

  calls.push({ table: path.split("/").pop(), method: init.method || "GET" });
  // maybeSingle()/single() ask for an object; everything else gets a list.
  const accept = (init.headers && (init.headers.Accept || init.headers.accept)) || "";
  return json(String(accept).includes("pgrst.object") ? null : []);
}

const pg = new PostgrestClient("http://harness.invalid/rest/v1", { fetch: harnessFetch });

const noopChannel = () => {
  const ch = { on: () => ch, subscribe: () => ch, track: async () => "ok", untrack: async () => "ok", unsubscribe: async () => "ok" };
  return ch;
};

export const supabase = {
  from: (...a) => pg.from(...a),
  rpc: (...a) => pg.rpc(...a),
  channel: noopChannel,
  removeChannel: () => {},
  getChannels: () => [],
  storage: {
    from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      upload: async () => ({ error: null }),
      remove: async () => ({ data: [], error: null }),
    }),
  },
};

// What the test reads instead of querying the database.
if (typeof window !== "undefined") {
  window.__harness = {
    sessionCount: () => sessions.size,
    sessionIds: () => sessions.values().map(s => s.id),
    lastSeen: () => sessions.values().map(s => ({ id: s.id, last_seen_at: s.last_seen_at })),
    calls: () => calls.slice(),
    rpcCalls: name => calls.filter(c => c.rpc === name),
    reset: () => { sessions.clear(); calls.length = 0; },
  };
}
