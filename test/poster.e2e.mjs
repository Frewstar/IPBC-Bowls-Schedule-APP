// ════════════════════════════════════════════════════════════════════════════
//  Adding an event with its poster — one tap, and the event survives a failed
//  upload.
//
//  bowls_poster_ticket(p_name, p_pin, p_event_id) needs an event id, so the
//  poster cannot go first. The sequence is hidden, not removed, and the thing
//  that must hold is: if the upload fails AFTER the event saved, the event
//  stays, the screen says so, and the poster can be retried.
//
//  Drives the built bundle in Chromium with Supabase intercepted, so the
//  upload can be made to fail on demand — which is the case that cannot be
//  produced by hand on a good connection.
//
//  Run:  npx vite build && node test/poster.e2e.mjs
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const PORT = 4361;
const CLUB = "61f82a8a-09cf-4385-874b-1741925bebe7";
const NEW_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  let f = path.join(DIST, u === "/" ? "index.html" : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "✓" : "✗"} ${msg}`); };

// A tiny real JPEG, so the client-side resize has something to decode.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABkAGQBAREA/8QAHwAAAQUBAQEB" +
  "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
  "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
  "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
  "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z", "base64");

async function run({ uploadFails }) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 420, height: 2400 } });

  const seen = { insert: 0, ticket: 0, upload: 0, patch: 0 };
  let stored = null;                       // poster_path the client set on the row

  await page.route("**://fonts.g*/**", r => r.abort());
  await page.route("**supabase.co**", async route => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    // Storage upload — the step that is made to fail.
    if (url.includes("/storage/v1/")) {
      // Only a write is an upload. The same prefix serves the public GET the
      // poster thumbnail makes once poster_path is set, and counting that as
      // an upload made the happy path report two.
      const isWrite = method === "POST" || method === "PUT";
      if (!isWrite) return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
      seen.upload++;
      if (uploadFails) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "network hiccup" }) });
      return json({ Key: "event-posters/x" });
    }
    // The ticket. Mirrors the live shape: club first, then event, then file.
    if (url.includes("/rpc/bowls_poster_ticket")) {
      seen.ticket++;
      return json({ status: "ok", path: `${CLUB}/${NEW_ID}/ffffffff-1111-2222-3333-444444444444.jpg` });
    }
    if (url.includes("/rpc/bowls_admin_role")) return json("super_admin");
    if (url.includes("/rpc/")) return json({ status: "ok" });

    if (url.includes("club_events")) {
      if (method === "POST") {
        seen.insert++;
        const body = JSON.parse(req.postData() || "{}");
        const row = Array.isArray(body) ? body[0] : body;
        const saved = { id: NEW_ID, club_id: CLUB, cancelled: false, series_id: null, poster_path: null, created_at: new Date().toISOString(), ...row };
        // .single() sends Accept: application/vnd.pgrst.object+json and
        // PostgREST answers with a BARE OBJECT. Returning an array here made
        // data.id undefined, so the optimistic row never reached the list —
        // and the ticket/upload assertions still passed, because the mocked
        // ticket ignored the id it was given.
        const wantsObject = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
        return json(wantsObject ? saved : [saved]);
      }
      if (method === "PATCH") {
        seen.patch++;
        const body = JSON.parse(req.postData() || "{}");
        if ("poster_path" in body) stored = body.poster_path;
        return json([{ id: NEW_ID, ...body }]);
      }
      return json([]);
    }
    return json([]);
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("ipbc_welcome_seen", JSON.stringify(true));
    localStorage.setItem("bowls_myname", JSON.stringify("C PROPHET"));
    localStorage.setItem("bowls_mypin", JSON.stringify("1234"));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const tap = async (re, label) => {
    const ok = await page.evaluate(src => {
      const rx = new RegExp(src, "i");
      const b = [...document.querySelectorAll("button")].find(x => rx.test((x.innerText || "").trim()));
      if (!b) return false;
      b.click();
      return true;
    }, re);
    if (!ok) console.log(`      (could not find button: ${label || re})`);
    return ok;
  };

  await page.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find(b => (b.textContent || "").trim().toLowerCase() === "what's on");
    if (x) x.click();
  });
  await page.waitForTimeout(900);

  // Open the add sheet, fill it in.
  const opened = await tap("^New$|^\\\\+ New$|Add to What", "New");
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const set = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const texts = [...document.querySelectorAll('input[type="text"], input:not([type])')];
    if (texts[0]) set(texts[0], "Tribute act");
    const date = document.querySelector('input[type="date"]');
    if (date) set(date, "2026-09-30");
  });
  await page.waitForTimeout(400);

  // Pick the poster in the SAME form — this is the change.
  const posterFieldPresent = await page.evaluate(() =>
    /Poster \(optional\)/i.test(document.body.innerText));
  await page.setInputFiles('input[type="file"]', { name: "poster.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await page.waitForTimeout(700);
  const stagedNotice = await page.evaluate(() => /Goes on when you save/i.test(document.body.innerText));

  // One tap.
  await tap("Add to the diary", "Add to the diary");
  await page.waitForTimeout(3500);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("      " + bodyText.replace(/\n+/g, " · ").slice(bodyText.indexOf("SEPTEMBER 2026")).slice(0, 220));
  const storedAfterSave = stored;   // before any retry can change it
  const retryVisible = /didn.{0,3}t upload/i.test(bodyText) && /Try the poster again/i.test(bodyText);

  let retriedOk = null;
  if (uploadFails && retryVisible) {
    // Let the retry succeed, and check it lands.
    await page.unroute("**supabase.co**");
    await page.route("**supabase.co**", route => {
      const url = route.request().url();
      const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
      if (url.includes("/storage/v1/")) {
        const m = route.request().method();
        if (m !== "POST" && m !== "PUT") return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
        seen.upload++; return json({ Key: "ok" });
      }
      if (url.includes("/rpc/bowls_poster_ticket")) { seen.ticket++; return json({ status: "ok", path: `${CLUB}/${NEW_ID}/retry.jpg` }); }
      if (url.includes("/rpc/bowls_admin_role")) return json("super_admin");
      if (url.includes("/rpc/")) return json({ status: "ok" });
      if (url.includes("club_events") && route.request().method() === "PATCH") {
        seen.patch++;
        const b = JSON.parse(route.request().postData() || "{}");
        if ("poster_path" in b) stored = b.poster_path;
        return json([{ id: NEW_ID, ...b }]);
      }
      return json([]);
    });
    await tap("Try the poster again", "retry");
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => document.body.innerText);
    retriedOk = !/Try the poster again/i.test(after) && stored != null;
  }

  await browser.close();
  return { seen, stored, storedAfterSave, posterFieldPresent, stagedNotice, retryVisible, retriedOk, bodyText, opened };
}

server.listen(PORT, async () => {
  console.log("\n═══ HAPPY PATH — one tap creates the event and puts the poster on ═══");
  const ok = await run({ uploadFails: false });
  check(ok.opened, "the add sheet opens");
  check(ok.posterFieldPresent, "the poster field is on the CREATE form, not only on edit");
  check(ok.stagedNotice, "a picked poster says it goes on when you save");
  check(ok.seen.insert === 1, `the event is inserted once (${ok.seen.insert})`);
  check(ok.seen.ticket === 1, `a ticket is minted after the event exists (${ok.seen.ticket})`);
  check(ok.seen.upload >= 1, `the poster is uploaded (${ok.seen.upload})`);
  check(ok.stored != null && ok.stored.startsWith(`${CLUB}/${NEW_ID}/`),
    `poster_path is set to the club-prefixed path (${ok.stored})`);

  console.log("\n═══ UPLOAD FAILS — the event must survive ═══");
  const bad = await run({ uploadFails: true });
  check(bad.seen.insert === 1, `the event is still inserted once (${bad.seen.insert})`);
  check(bad.storedAfterSave == null, "poster_path was NOT set, because nothing uploaded");
  // The event must not be rolled back. A DELETE would show as a supabase call
  // we never make; the visible proof is that it is on screen and named.
  check(/Tribute act/.test(bad.bodyText), "the event is on screen by name after the poster failed");
  check(bad.retryVisible, "the screen says the event saved and the poster did not, with a retry");
  check(/is in the diary, but its poster/i.test(bad.bodyText),
    "the message names both halves rather than leaving her guessing");
  check(bad.retriedOk === true, `retrying the poster lands it (poster_path ${bad.stored})`);

  console.log("\n═══ COPY ═══");
  const copy = await run({ uploadFails: false });
  check(!/Share this night/i.test(copy.bodyText), "'Share this night' is gone");

  server.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
});
