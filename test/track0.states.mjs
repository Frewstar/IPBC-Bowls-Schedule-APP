// ════════════════════════════════════════════════════════════════════════════
//  Track 0 — proof that "empty" and "unreachable" now say different things,
//  and that neither one shows another club's data.
//
//  Drives the real built bundle in Chromium with every Supabase request
//  intercepted, so the two states can be produced on demand:
//
//    EMPTY        every table answers 200 [] — a brand-new club
//    UNREACHABLE  every request is aborted — a phone with no signal
//
//  Run:  node test/track0.states.mjs
//  Needs: npx vite build  (serves ./dist)
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const PORT = 4317;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  let file = path.join(DIST, url === "/" ? "index.html" : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

const IRVINE_PARK_DATA = [
  // If any of these reach the screen, a hardcoded fallback is still alive.
  "ADRAIN", "ZIKMANN", "KINNIBURGH", "07881 785136",
  "Camphill", "Saltcoats", "Bellahouston",
  "T. Shields", "J B Muir", "Jenny Brown", "Marion Carroll",
];

async function run(mode, tabs) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  let supabaseCalls = 0;
  await page.route("**://*.supabase.co/**", route => {
    supabaseCalls++;
    if (mode === "unreachable") return route.abort("failed");
    // Empty club: every table answers with no rows.
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  // Fonts would just add noise and latency.
  await page.route("**://fonts.g*/**", r => r.abort());

  const results = {};
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  // Sign in so the members tab is reachable: name + PIN live in localStorage.
  await page.evaluate(() => {
    localStorage.setItem("bowls_myname", JSON.stringify("TEST USER"));
    localStorage.setItem("bowls_mypin", JSON.stringify("1234"));
    localStorage.setItem("ipbc_welcome_seen", JSON.stringify(true));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  // postgrest-js retries a failed request 3 times with 1s/2s/4s backoff, so a
  // genuinely unreachable server takes ~7s to be reported as unreachable. That
  // is correct behaviour — a flaky connection deserves a retry before the app
  // gives up — but the test has to outwait it.
  await page.waitForTimeout(mode === "unreachable" ? 11000 : 1500);

  for (const [tab, label] of tabs) {
    const clicked = await page.evaluate(t => {
      const btn = [...document.querySelectorAll("button")]
        .find(b => (b.textContent || "").trim().toLowerCase() === t);
      if (!btn) return false;
      btn.click();
      return true;
    }, tab);
    if (!clicked) { results[label] = "__TAB_NOT_FOUND__"; continue; }
    await page.waitForTimeout(mode === "unreachable" ? 1200 : 700);
    results[label] = await page.evaluate(() => document.body.innerText);
  }

  await browser.close();
  return { results, supabaseCalls };
}

function report(mode, results, supabaseCalls) {
  console.log(`\n${"═".repeat(72)}\n  ${mode.toUpperCase()}  (${supabaseCalls} Supabase requests intercepted)\n${"═".repeat(72)}`);
  let leaks = 0, ok = 0;

  for (const [label, text] of Object.entries(results)) {
    if (text === "__TAB_NOT_FOUND__") { console.log(`  ✗ ${label.padEnd(14)} → tab button not found`); continue; }
    const found = IRVINE_PARK_DATA.filter(p => text.includes(p));
    if (found.length) { leaks += found.length; console.log(`  ✗ ${label}: LEAKED ${found.join(", ")}`); }

    // What did the screen actually say?
    const said =
      /Couldn[’']t load/i.test(text)        ? "couldn't load + retry"
      : /Couldn[’']t refresh/i.test(text)   ? "stale banner"
      : /No .* yet|No members match|not yet assigned|No competitions/i.test(text) ? "empty state"
      : /Loading /i.test(text)              ? "still loading"
      : "— (neither)";
    const want = mode === "unreachable" ? "couldn't load + retry" : "empty state";
    const pass = said === want;
    if (pass) ok++;
    console.log(`  ${pass ? "✓" : "✗"} ${label.padEnd(14)} → ${said}${pass ? "" : `   (expected: ${want})`}`);
  }
  return { leaks, ok, total: Object.keys(results).length };
}

const tabs = [["club", "Club"], ["fixtures", "Fixtures"], ["members", "Members"]];

server.listen(PORT, async () => {
  let leaks = 0, ok = 0, total = 0;
  for (const mode of ["empty", "unreachable"]) {
    const { results, supabaseCalls } = await run(mode, tabs);
    const r = report(mode, results, supabaseCalls);
    leaks += r.leaks; ok += r.ok; total += r.total;
  }
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  Irvine Park data leaked to screen: ${leaks}   ${leaks === 0 ? "✓" : "✗"}`);
  console.log(`  Surfaces saying the right thing:   ${ok}/${total}`);
  console.log(`${"═".repeat(72)}\n`);
  server.close();
  process.exit(leaks === 0 && ok === total ? 0 : 1);
});
