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

function channel(topic) {
  let es = null, handler = null, statusCb = null, closed = false;
  // presence
  let presenceEs = null, presenceHandler = null, presenceState = {};
  const ref = Math.random().toString(36).slice(2);

  const ch = {
    on(evt, _opts, cb) {
      if (evt === "presence") { presenceHandler = cb; return ch; }
      handler = cb;
      return ch;
    },
    // Opening the presence stream IS joining, matching the server.
    track() {
      if (closed || presenceEs) return Promise.resolve("ok");
      presenceEs = new EventSource(`${BASE}/presence/stream?topic=${encodeURIComponent(topic)}&ref=${ref}`);
      // In the real client presence and row changes ride ONE socket, so a
      // socket that dies takes the channel status down with it. Without this
      // the presence-only channel would never learn it had been cut and the
      // "dead socket hides the count" test would pass without testing
      // anything.
      presenceEs.onerror = () => { statusCb && statusCb("CHANNEL_ERROR"); };
      presenceEs.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.type !== "sync") return;
        // Same shape supabase-js hands back: key -> array of entries.
        presenceState = Object.fromEntries(msg.refs.map(r => [r, [{}]]));
        presenceHandler && presenceHandler();
      };
      return Promise.resolve("ok");
    },
    untrack() { if (presenceEs) { presenceEs.close(); presenceEs = null; presenceState = {}; } return Promise.resolve("ok"); },
    presenceState: () => presenceState,
    subscribe(cb) {
      statusCb = cb;
      // A presence-only channel has no row handler and must not open the row
      // stream — it still has to report SUBSCRIBED so the caller can track.
      if (!handler) {
        fetch(BASE + "/rows")
          .then(() => statusCb && statusCb("SUBSCRIBED"))
          .catch(() => statusCb && statusCb("CHANNEL_ERROR"));
        return ch;
      }
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
    __close() { closed = true; if (es) es.close(); if (presenceEs) presenceEs.close(); },
  };
  return ch;
}

export const supabase = {
  from: () => table(),
  channel: topic => channel(topic),
  removeChannel: ch => ch && ch.__close && ch.__close(),
};
