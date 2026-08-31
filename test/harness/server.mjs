// A stand-in for PostgREST + Realtime, small enough to reason about and — the
// point of it — breakable on demand. The two things the real thing will not
// let me do from a test are (a) hold two independent viewers of one game and
// (b) kill the socket underneath them.
import http from "node:http";

const rows = new Map();
let streams = new Set();
let streamAllowed = true;

// topic -> Map(ref -> res). Membership IS the open connection, which is how
// real presence behaves: close the tab and you leave, with no explicit
// goodbye needed.
const presence = new Map();

function presenceBroadcast(topic) {
  const members = presence.get(topic);
  if (!members) return;
  const refs = [...members.keys()];
  const line = `data: ${JSON.stringify({ type: "sync", refs })}\n\n`;
  for (const res of members.values()) { try { res.write(line); } catch {} }
}

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of streams) { try { res.write(line); } catch {} }
}
function body(req) {
  return new Promise(r => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => r(b ? JSON.parse(b) : {})); });
}
const json = (res, code, data) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
};

let seedRows = [];

export function start(port, seed = []) {
  seedRows = JSON.parse(JSON.stringify(seed));
  rows.clear();
  for (const r of seed) rows.set(r.id, r);
  streamAllowed = true;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
      return res.end();
    }

    if (url.pathname === "/rows") return json(res, 200, [...rows.values()]);

    if (url.pathname === "/update") {
      const { id, patch } = await body(req);
      const cur = rows.get(id);
      if (!cur) return json(res, 404, { error: "no row" });
      const next = { ...cur, ...patch };
      rows.set(id, next);
      broadcast({ eventType: "UPDATE", new: next });
      return json(res, 200, next);
    }

    if (url.pathname === "/insert") {
      const { row } = await body(req);
      rows.set(row.id, row);
      broadcast({ eventType: "INSERT", new: row });
      return json(res, 200, row);
    }

    if (url.pathname === "/delete") {
      const { id } = await body(req);
      rows.delete(id);
      // REPLICA IDENTITY DEFAULT: the primary key and nothing else, exactly as
      // Postgres sends it. If the client reads any other column off `old`, it
      // breaks here and not in front of the club.
      broadcast({ eventType: "DELETE", old: { id } });
      return json(res, 200, { ok: true });
    }

    // ── the controls that make this worth having ──────────────────────────
    if (url.pathname === "/control/kill-stream") {
      streamAllowed = false;
      for (const r of streams) { try { r.end(); } catch {} }
      streams = new Set();
      // Presence rides the same socket in the real thing, so it dies here too.
      for (const [topic, members] of presence) {
        for (const r of members.values()) { try { r.end(); } catch {} }
        presence.set(topic, new Map());
      }
      return json(res, 200, { killed: true });
    }
    if (url.pathname === "/control/revive-stream") { streamAllowed = true; return json(res, 200, { revived: true }); }

    // Put the world back to the seed. Specs mutate rows and one of them
    // deletes the game outright, so without this whichever spec runs second
    // fails for reasons that have nothing to do with the code under test.
    if (url.pathname === "/control/reset") {
      rows.clear();
      for (const r of JSON.parse(JSON.stringify(seedRows))) rows.set(r.id, r);
      streamAllowed = true;
      return json(res, 200, { reset: true, rows: rows.size });
    }
    if (url.pathname === "/control/streams") return json(res, 200, { open: streams.size, allowed: streamAllowed });

    // ── presence ──────────────────────────────────────────────────────────
    // Joining is opening the stream. Leaving is closing it — including by
    // closing the tab, which is the case that matters and the one an explicit
    // leave endpoint would not cover.
    if (url.pathname === "/presence/stream") {
      if (!streamAllowed) { res.writeHead(503, { "access-control-allow-origin": "*" }); return res.end(); }
      const topic = url.searchParams.get("topic") || "";
      const ref = url.searchParams.get("ref") || Math.random().toString(36).slice(2);
      res.writeHead(200, {
        "content-type": "text/event-stream", "cache-control": "no-cache",
        connection: "keep-alive", "access-control-allow-origin": "*",
      });
      if (!presence.has(topic)) presence.set(topic, new Map());
      presence.get(topic).set(ref, res);
      presenceBroadcast(topic);
      req.on("close", () => {
        const m = presence.get(topic);
        if (m) { m.delete(ref); presenceBroadcast(topic); }
      });
      return;
    }

    if (url.pathname === "/presence/count") {
      const topic = url.searchParams.get("topic") || "";
      return json(res, 200, { count: (presence.get(topic) || new Map()).size });
    }

    if (url.pathname === "/stream") {
      if (!streamAllowed) { res.writeHead(503, { "access-control-allow-origin": "*" }); return res.end(); }
      res.writeHead(200, {
        "content-type": "text/event-stream", "cache-control": "no-cache",
        connection: "keep-alive", "access-control-allow-origin": "*",
      });
      res.write("data: {\"eventType\":\"__open\"}\n\n");
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }

    json(res, 404, { error: "not found" });
  });

  return new Promise(r => server.listen(port, () => r(server)));
}

if (process.argv[2] === "run") {
  const seed = JSON.parse(process.env.SEED || "[]");
  start(Number(process.argv[3] || 4599), seed).then(() => console.log("mock backend up"));
}
