// ════════════════════════════════════════════════════════════════════════════
//  Record Winner — the button reads the status, not the absence of an error
//
//  roll_of_honour is SELECT-only to the app's key, so the old PATCH from the
//  client had been failing with "permission denied" while the button said
//  nothing. bowls_admin_record_winner is the way in now, and the way it
//  refuses is the case worth testing: PostgREST answers a refusal with HTTP
//  200 carrying {status:"not_allowed"}. Any check written against `error`
//  passes on a refusal, which is how a button comes to congratulate someone
//  for a write that never happened.
//
//  So the assertions here are on what the club would see: the words the server
//  sent, the form still holding what was typed, and the board unchanged.
//
//  Drives the built bundle in Chromium with Supabase intercepted.
//  Run:  npx vite build && node test/recordWinner.e2e.mjs
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const PORT = 4372;
const CLUB = "61f82a8a-09cf-4385-874b-1741925bebe7";

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

const SEASONS = [{ year: 2025, winner: "A SMITH" }, { year: 2024, winner: "B JONES" }];

// `reply` decides what bowls_admin_record_winner answers — a refusal is a 200
// like any other, which is the whole point.
async function run({ reply, role = "admin" }) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 420, height: 2400 } });

  const seen = { rpc: 0, rohPatch: 0, reread: 0 };
  let payload = null;                       // what the client sent the RPC
  let winners = SEASONS.slice();            // what the table "holds"

  await page.route("**://fonts.g*/**", r => r.abort());
  await page.route("**supabase.co**", async route => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const wantsObject = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/rpc/bowls_admin_role")) return json(role);

    if (url.includes("/rpc/bowls_admin_record_winner")) {
      seen.rpc++;
      payload = JSON.parse(req.postData() || "{}");
      // A real "ok" means the row changed underneath, so the re-read must see
      // it — otherwise the test would pass on a board that never updated.
      if (reply.status === "ok") {
        winners = [{ year: payload.p_year, winner: payload.p_winner },
                   ...SEASONS.filter(w => w.year !== payload.p_year)];
      }
      return json(reply);
    }
    if (url.includes("/rpc/")) return json({ status: "ok" });

    if (url.includes("roll_of_honour")) {
      // The write must never come back as a direct table request. If it does,
      // the grant refuses it in production and nobody is told.
      if (method === "PATCH" || method === "POST" || method === "DELETE") { seen.rohPatch++; return json([]); }
      const row = { id: "roh-gents-singles", name: "Gents Singles", color: "#c9a84c", sort_order: 1, club_id: CLUB, winners };
      if (url.includes("select=winners")) { seen.reread++; return json(wantsObject ? { winners } : [{ winners }]); }
      return json([row]);
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

  const tap = async (src, label) => {
    const ok = await page.evaluate(s => {
      const rx = new RegExp(s, "i");
      const b = [...document.querySelectorAll("button")].find(x => rx.test((x.innerText || "").trim()));
      if (!b) return false;
      b.click();
      return true;
    }, src);
    if (!ok) console.log(`      (could not find button: ${label || src})`);
    return ok;
  };

  await page.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find(b => (b.textContent || "").trim().toLowerCase() === "club");
    if (x) x.click();
  });
  await page.waitForTimeout(900);

  const buttonShown = await tap("^Record Winner$", "Record Winner");
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const year = document.querySelector('input[type="number"]');
    if (year) set(year, "2026");
    const name = document.querySelector('input[placeholder="Member name"]');
    if (name) set(name, "C NEWMAN");
  });
  await page.waitForTimeout(300);

  await tap("^Save$", "Save");
  await page.waitForTimeout(2000);

  const after = await page.evaluate(() => ({
    text: document.body.innerText,
    formOpen: !!document.querySelector('input[placeholder="Member name"]'),
    typedName: document.querySelector('input[placeholder="Member name"]')?.value || null,
  }));

  // Read the years back off the board itself. The Past Winners panel is
  // hidden while the form is open, so close the form first — reading
  // document.body.innerText instead would have been measuring the page around
  // the list rather than the list.
  if (after.formOpen) { await tap("^Cancel$", "Cancel"); await page.waitForTimeout(300); }
  await tap("^Gents Singles", "Gents Singles");
  await page.waitForTimeout(600);
  const board = await page.evaluate(() => {
    const label = [...document.querySelectorAll("div")].find(d => (d.textContent || "").trim() === "Past Winners");
    return label ? label.parentElement.innerText : null;
  });

  await browser.close();
  return { seen, payload, buttonShown, ...after, board };
}

server.listen(PORT, async () => {
  console.log("\n═══ REFUSED — a 200 carrying status:\"not_allowed\" ═══");
  const no = await run({ reply: { status: "not_allowed", message: "Only a club admin can change the Roll of Honour." } });
  check(no.buttonShown, "the Record Winner button is there for an admin");
  check(no.seen.rpc === 1, `the RPC is called once (${no.seen.rpc})`);
  check(no.seen.rohPatch === 0, `roll_of_honour is never written directly (${no.seen.rohPatch} table writes)`);
  check(/Only a club admin can change the Roll of Honour\./.test(no.text),
    "the server's own words are on screen");
  check(no.formOpen && no.typedName === "C NEWMAN",
    `the form stays open holding what was typed (${no.typedName})`);
  // Presence first: prove the list is actually on screen, then that 2026 is
  // not in it. An absence check against a panel that never rendered passes
  // for the wrong reason.
  check(no.board != null && /2025/.test(no.board) && /A SMITH/.test(no.board),
    `the board is on screen and still headed 2025 · A SMITH (${(no.board || "").split("\n").slice(1, 3).join(" · ")})`);
  check(no.board != null && !/2026/.test(no.board) && !/C NEWMAN/.test(no.board),
    "no 2026 winner on the board, because none was written");
  check(no.seen.reread === 0, "nothing is re-read, because nothing was saved");

  console.log("\n═══ SAVED — status:\"ok\" ═══");
  const yes = await run({ reply: { status: "ok", action: "added", year: 2026, winner: "C NEWMAN", previous_winner: null, total: 3, message: "C NEWMAN recorded as 2026 winner." } });
  check(yes.seen.rpc === 1, `the RPC is called once (${yes.seen.rpc})`);
  check(yes.seen.rohPatch === 0, `roll_of_honour is never written directly (${yes.seen.rohPatch} table writes)`);
  check(yes.payload?.p_category_id === "roh-gents-singles" && yes.payload?.p_year === 2026 && yes.payload?.p_winner === "C NEWMAN",
    `the RPC gets the category, the year and the name (${JSON.stringify(yes.payload && { c: yes.payload.p_category_id, y: yes.payload.p_year, w: yes.payload.p_winner })})`);
  // The tenancy rule: the club is derived from the account on the server. A
  // club id in this payload would mean the client had chosen the tenant.
  check(!Object.keys(yes.payload || {}).some(k => /club/i.test(k)),
    `no club is passed (${Object.keys(yes.payload || {}).join(", ")})`);
  check(/C NEWMAN recorded as 2026 winner\./.test(yes.text), "the server's confirmation is on screen");
  check(!yes.formOpen, "the form closes on the server's own ok");
  check(yes.seen.reread === 1, `the board is re-read from the server (${yes.seen.reread})`);
  check(yes.board != null && /2026/.test(yes.board) && /C NEWMAN/.test(yes.board),
    `2026 · C NEWMAN is on the board (${(yes.board || "").split("\n").slice(1, 3).join(" · ")})`);
  check(yes.board != null && /A SMITH/.test(yes.board) && /B JONES/.test(yes.board),
    "the seasons already there are still there");

  console.log("\n═══ NO DIRECT WRITES LEFT IN THE SOURCE ═══");
  // The Final-win prompt used to PATCH the table on a member's own say-so.
  // Every write must now go through the RPC, so there should be no writing
  // call on roll_of_honour anywhere in src/.
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name)) files.push(p);
    }
  })(path.resolve("src"));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const rx = /from\(\s*["']roll_of_honour["']\s*\)\s*\.\s*(update|insert|upsert|delete)/g;
    let m;
    while ((m = rx.exec(src))) offenders.push(`${path.relative(".", f)}: .${m[1]}()`);
  }
  check(offenders.length === 0, `no direct writes to roll_of_honour in src/ (${offenders.join("; ") || "none"})`);
  const rpcUses = files.filter(f => /bowls_admin_record_winner/.test(fs.readFileSync(f, "utf8")));
  check(rpcUses.length >= 1, `the RPC is what writes it (${rpcUses.map(f => path.basename(f)).join(", ")})`);

  server.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
});
