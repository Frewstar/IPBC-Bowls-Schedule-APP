// Stands in for src/lib/supabase.js in the harness only. It implements exactly
// the surface LiveGames.jsx and useLiveGames.js touch — no more — and talks to
// server.mjs. The component and the hook under test are the real ones.
//
// The "socket" is an EventSource rather than a WebSocket. What matters for
// these tests is that it is a server-push channel that can be severed
// independently of the request/response path, which is precisely the failure
// the poll backstop exists for.
const BASE = "http://127.0.0.1:4599";

const post = (path, payload) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
    .then(r => r.json());

function table() {
  const api = {
    select() { return api; },
    order() {
      return fetch(BASE + "/rows")
        .then(r => r.json())
        .then(data => ({ data, error: null }))
        .catch(e => ({ data: null, error: { message: String(e) } }));
    },
    update(patch) { return { eq: (_c, id) => post("/update", { id, patch }).then(() => ({ error: null })) }; },
    delete() { return { eq: (_c, id) => post("/delete", { id }).then(() => ({ error: null })) }; },
    insert(row) {
      const withId = { id: row.id || crypto.randomUUID(), ...row };
      return { select: () => ({ single: () => post("/insert", { row: withId }).then(data => ({ data, error: null })) }) };
    },
    then(res) { return api.order().then(res); },   // bare select() with no order()
  };
  return api;
}

function channel() {
  let es = null, handler = null, statusCb = null, closed = false;
  const ch = {
    on(_evt, _opts, cb) { handler = cb; return ch; },
    subscribe(cb) {
      statusCb = cb;
      const connect = () => {
        if (closed) return;
        es = new EventSource(BASE + "/stream");
        es.onopen = () => statusCb && statusCb("SUBSCRIBED");
        es.onmessage = e => {
          const payload = JSON.parse(e.data);
          if (payload.eventType === "__open") return;
          handler && handler(payload);
        };
        es.onerror = () => {
          // EventSource retries on its own; the point here is that the client
          // is TOLD, so the screen can stop claiming to be live.
          statusCb && statusCb("CHANNEL_ERROR");
        };
      };
      connect();
      return ch;
    },
    __close() { closed = true; if (es) es.close(); },
  };
  return ch;
}

export const supabase = {
  from: () => table(),
  channel: () => channel(),
  removeChannel: ch => ch && ch.__close && ch.__close(),
};
