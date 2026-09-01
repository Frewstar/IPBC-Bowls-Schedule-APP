// ════════════════════════════════════════════════════════════════════════════
//  The diary, September 2026, against the real production rows
//
//  35 club_fixtures and 16 club_events as they stand on 1 Sep 2026, replayed
//  into the built bundle. September is the month that proves the design: 6
//  fixtures, 8 events, a 4-week karaoke series, and three dates carrying one
//  of each.
//
//  Asserts PRESENCE by name — the rows that must be there, in the order they
//  must be in. It never checks that an empty state is missing.
//
//  Run:  npx vite build && node test/diary.e2e.mjs
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const PORT = 4351;
const FIXTURES = JSON.parse(fs.readFileSync("/tmp/fixtures_live.json", "utf8"));
const EVENTS   = JSON.parse(fs.readFileSync("/tmp/events_live.json", "utf8"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  let f = path.join(DIST, u === "/" ? "index.html" : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

// What September must contain, in order. Times are the merged rendering:
// fixtures and events both go through the diary formatter.
const SEPTEMBER = [
  ["2",  "Charity Day",                   "2pm",          "match"],
  ["5",  "Ruth McNab Pairs",              "9.30am",       "match"],
  ["5",  "Live music George Hoffin",      "8pm–midnight", "social"],
  ["6",  "Karaoke",                       "4–9pm",        "social"],
  ["11", "Gents Trials",                  "6.30pm",       "match"],
  ["12", "Ladies/Gents",                  "1.30pm",       "match"],
  ["12", "Ladies v Gents",                "2pm",          "social"],
  ["13", "Karaoke",                       "4–9pm",        "social"],
  ["19", "Glasgow Ayrshire Presentation", "2pm",          "match"],
  ["19", "Glasgow/Ayrshire Presention",   "2pm",          "social"],
  ["20", "Karaoke",                       "4–9pm",        "social"],
  ["26", "Closing Day",                   "1.30pm",       "match"],
  ["26", "Mens Closing Day",              "2pm",          "social"],
  ["27", "Karaoke",                       "4–9pm",        "social"],
];

let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "✓" : "✗"} ${msg}`); };

server.listen(PORT, async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await b.newPage({ viewport: { width: 420, height: 3000 } });
  await p.route("**://fonts.g*/**", r => r.abort());
  await p.route("**supabase.co**", r => {
    const u = r.request().url();
    const body = u.includes("club_fixtures") ? JSON.stringify(FIXTURES)
               : u.includes("club_events")   ? JSON.stringify(EVENTS)
               : "[]";
    return r.fulfill({ status: 200, contentType: "application/json", body });
  });

  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("ipbc_welcome_seen", JSON.stringify(true)));
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2200);

  const openWhatsOn = () => p.evaluate(() => {
    const x = [...document.querySelectorAll("button")].find(b => (b.textContent || "").trim().toLowerCase() === "what's on");
    if (x) x.click();
  });
  await openWhatsOn();
  await p.waitForTimeout(1200);

  // ── The month list, in render order ───────────────────────────────────────
  // Read the cards, not the whole page, so the calendar grid above doesn't
  // pollute the text.
  const rows = await p.evaluate(() => {
    // A diary row is the only thing with a 4px left accent and a 12px radius.
    // Read it off the computed style: React writes the style attribute without
    // the spacing a literal string match would expect.
    const cards = [...document.querySelectorAll("div")].filter(d => {
      const cs = getComputedStyle(d);
      return cs.borderLeftWidth === "4px" && cs.borderTopLeftRadius === "12px";
    });
    return cards.map(c => (c.innerText || "").split("\n").map(t => t.trim()).filter(Boolean));
  });

  console.log(`\n═══ SEPTEMBER — ${rows.length} rows rendered ═══`);
  for (const r of rows) console.log("   " + r.join(" · "));

  console.log("\n═══ every September row present, in order ═══");
  check(rows.length === SEPTEMBER.length, `${SEPTEMBER.length} rows expected, ${rows.length} rendered`);
  SEPTEMBER.forEach(([day, title, time, kind], i) => {
    const r = rows[i] || [];
    const joined = r.join(" · ");
    // The Social chip is CSS-uppercased to "SOCIAL"; the Home/Away pills are
    // not transformed. Compare case-insensitively so the assertion tests the
    // badge being there, not how the stylesheet cases it.
    const badge = kind === "match"
      ? /\b(home|away)\b/i.test(joined)
      : /\bsocial\b/i.test(joined);
    check(r[0] === day && joined.includes(title) && joined.includes(time) && badge,
      `#${String(i + 1).padStart(2)} ${day} ${title} — ${time} [${kind}]${r.length ? "" : "  (nothing rendered)"}`);
  });

  // ── The karaoke series shows every occurrence ─────────────────────────────
  const karaoke = rows.filter(r => r.join(" ").includes("Karaoke"));
  check(karaoke.length === 4, `all 4 karaoke nights present (6, 13, 20, 27) — found ${karaoke.length}`);
  check(["6", "13", "20", "27"].every(d => karaoke.some(r => r[0] === d)), "karaoke on each of its own dates");

  // ── The three same-day pairs both appear ──────────────────────────────────
  for (const [day, a, bTitle] of [["12", "Ladies/Gents", "Ladies v Gents"],
                                  ["19", "Glasgow Ayrshire Presentation", "Glasgow/Ayrshire Presention"],
                                  ["26", "Closing Day", "Mens Closing Day"]]) {
    const onDay = rows.filter(r => r[0] === day).map(r => r.join(" · "));
    check(onDay.some(t => t.includes(a)) && onDay.some(t => t.includes(bTitle)),
      `${day} Sep carries both the fixture and the event`);
  }

  // ── Poster thumbnail carried over from What's On ──────────────────────────
  const posters = await p.evaluate(() =>
    [...document.querySelectorAll("img")].filter(i => /storage\/v1|render\/image/.test(i.src)).length);
  check(posters >= 1, `George Hoffin poster thumbnail rendered (${posters} poster image(s))`);

  // ── Filter chips ──────────────────────────────────────────────────────────
  const chip = async label => {
    await p.evaluate(l => {
      const x = [...document.querySelectorAll("button")].find(b => (b.textContent || "").trim().startsWith(l));
      if (x) x.click();
    }, label);
    await p.waitForTimeout(500);
    return p.evaluate(() => {
      const cards = [...document.querySelectorAll("div")].filter(d => {
        const cs = getComputedStyle(d);
        return cs.borderLeftWidth === "4px" && cs.borderTopLeftRadius === "12px";
      });
      return cards.map(c => (c.innerText || "").replace(/\n/g, " · "));
    });
  };

  const matches = await chip("Matches");
  check(matches.length === 6, `Matches chip → 6 September fixtures (got ${matches.length})`);
  check(matches.every(t => /\b(home|away)\b/i.test(t)), "every row under Matches carries a Home/Away pill");
  check(matches.some(t => t.includes("Charity Day")) && matches.some(t => t.includes("Closing Day")),
    "Matches includes Charity Day and Closing Day by name");

  const socials = await chip("Socials");
  check(socials.length === 8, `Socials chip → 8 September events (got ${socials.length})`);
  check(socials.filter(t => t.includes("Karaoke")).length === 4, "Socials keeps all 4 karaoke nights");
  check(socials.some(t => t.includes("Live music George Hoffin")), "Socials includes the George Hoffin night by name");

  const all = await chip("Everything");
  check(all.length === 14, `Everything chip → 14 September rows (got ${all.length})`);

  await b.close();
  server.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
});
