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
  // Read the DAY BLOCKS: each is a heading plus the cards stacked under it.
  const readBlocks = () => p.evaluate(() => {
    const isCard = d => {
      const cs = getComputedStyle(d);
      return cs.borderLeftWidth === "4px" && cs.borderTopLeftRadius === "12px";
    };
    const blocks = [...document.querySelectorAll("div")].filter(d => {
      const kids = [...d.children];
      return kids.length >= 2 && kids.some(isCard) && !isCard(d);
    });
    // Keep only the innermost such wrappers — a day block, not the whole list.
    const inner = blocks.filter(b => !blocks.some(o => o !== b && b.contains(o)));
    return inner.map(b => ({
      heading: (b.firstElementChild && !isCard(b.firstElementChild))
        ? (b.firstElementChild.innerText || "").trim() : "",
      rows: [...b.children].filter(isCard)
        .map(c => (c.innerText || "").split("\n").map(t => t.trim()).filter(Boolean).join(" · ")),
    }));
  });
  const blocks = await readBlocks();
  const rows = blocks.flatMap(b => b.rows.map(r => ({ day: b.heading, text: r })));

  console.log(`\n═══ SEPTEMBER — ${blocks.length} day blocks, ${rows.length} rows ═══`);
  for (const b of blocks) {
    console.log(`   ${b.heading}`);
    for (const r of b.rows) console.log(`      ${r}`);
  }

  console.log("\n═══ every September row present, in order ═══");
  check(blocks.length === 10, `10 day blocks expected (10 distinct dates), got ${blocks.length}`);
  check(rows.length === SEPTEMBER.length, `${SEPTEMBER.length} rows expected, ${rows.length} rendered`);
  SEPTEMBER.forEach(([day, title, time, kind], i) => {
    const r = rows[i] || { day: "", text: "" };
    // The Social chip is CSS-uppercased to "SOCIAL"; the Home/Away pills are
    // not transformed. Compare case-insensitively so the assertion tests the
    // badge being there, not how the stylesheet cases it.
    const badge = kind === "match"
      ? /\b(home|away)\b/i.test(r.text)
      : /\bsocial\b/i.test(r.text);
    // The date now lives in the block heading, e.g. "SAT 5 SEP".
    const onRightDay = new RegExp(`\\b${day}\\b`).test(r.day);
    check(onRightDay && r.text.includes(title) && r.text.includes(time) && badge,
      `#${String(i + 1).padStart(2)} ${day} ${title} — ${time} [${kind}]${r.text ? "" : "  (nothing rendered)"}`);
  });

  // ── The karaoke series shows every occurrence ─────────────────────────────
  const karaoke = rows.filter(r => r.text.includes("Karaoke"));
  check(karaoke.length === 4, `all 4 karaoke nights present (6, 13, 20, 27) — found ${karaoke.length}`);
  check(["6", "13", "20", "27"].every(d => karaoke.some(r => new RegExp(`\\b${d}\\b`).test(r.day))), "karaoke on each of its own dates");

  // ── The three same-day pairs both appear ──────────────────────────────────
  for (const [day, a, bTitle] of [["12", "Ladies/Gents", "Ladies v Gents"],
                                  ["19", "Glasgow Ayrshire Presentation", "Glasgow/Ayrshire Presention"],
                                  ["26", "Closing Day", "Mens Closing Day"]]) {
    const block = blocks.find(bl => new RegExp(`\\b${day}\\b`).test(bl.heading));
    const inBlock = block ? block.rows : [];
    check(inBlock.length === 2 && inBlock[0].includes(a) && inBlock[1].includes(bTitle),
      `${day} Sep is ONE block: ${a} then ${bTitle}`);
  }

  // ── Poster thumbnail carried over from What's On ──────────────────────────
  const posters = await p.evaluate(() =>
    [...document.querySelectorAll("img")].filter(i => /storage\/v1|render\/image/.test(i.src)).length);
  check(posters >= 1, `George Hoffin poster thumbnail rendered (${posters} poster image(s))`);

  // ── Filter chips: the NUMBER ON THE CHIP, and the rows it yields ──────────
  // The previous version of this only counted rows and never read the chip's
  // own label, which is how "Matches 35" shipped over a six-row September.
  const readChips = () => p.evaluate(() => {
    const out = {};
    for (const btn of document.querySelectorAll("button")) {
      const t = (btn.innerText || "").replace(/\s+/g, " ").trim();
      const m = t.match(/^(Everything|Matches|Socials)\s+(\d+)$/);
      if (m) out[m[1].toLowerCase()] = Number(m[2]);
    }
    return out;
  });
  const monthShown = () => p.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find(d => /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/.test((d.innerText || "").trim()));
    return el ? el.innerText.trim() : "(unknown)";
  });
  const countCards = () => p.evaluate(() => [...document.querySelectorAll("div")]
    .filter(d => { const cs = getComputedStyle(d); return cs.borderLeftWidth === "4px" && cs.borderTopLeftRadius === "12px"; }).length);
  const tapChip = async label => {
    await p.evaluate(l => {
      const x = [...document.querySelectorAll("button")].find(b => new RegExp(`^${l}\\s+\\d+$`).test((b.innerText || "").replace(/\s+/g, " ").trim()));
      if (x) x.click();
    }, label);
    await p.waitForTimeout(450);
  };

  console.log("\n═══ chip counts describe the month on screen ═══");
  // September is where the tab opens (today is 1 Sep 2026). The UI disables
  // paging back, so August is unreachable here and is covered by unit test.
  for (const [month, want] of [["September 2026", { everything: 14, matches: 6, socials: 8 }],
                               ["October 2026",   { everything: 8,  matches: 0, socials: 8 }]]) {
    if ((await monthShown()) !== month) {
      await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Next month"); if (x) x.click(); });
      await p.waitForTimeout(700);
    }
    check((await monthShown()) === month, `showing ${month}`);
    await tapChip("Everything");
    const chips = await readChips();
    console.log(`   ${month}: Everything ${chips.everything} · Matches ${chips.matches} · Socials ${chips.socials}`);
    check(chips.everything === want.everything, `${month} chip reads "Everything ${want.everything}" (read ${chips.everything})`);
    check(chips.matches   === want.matches,     `${month} chip reads "Matches ${want.matches}" (read ${chips.matches})`);
    check(chips.socials   === want.socials,     `${month} chip reads "Socials ${want.socials}" (read ${chips.socials})`);

    // The invariant: the number on the chip is the number of rows it yields.
    for (const [label, key] of [["Everything", "everything"], ["Matches", "matches"], ["Socials", "socials"]]) {
      await tapChip(label);
      const rendered = await countCards();
      check(rendered === want[key], `${month} · ${label}: chip says ${want[key]}, list renders ${rendered}`);
    }
    await tapChip("Everything");
  }

  // ── October Matches 0: the chip is there, and says so ─────────────────────
  check((await monthShown()) === "October 2026", "still on October for the zero case");
  await tapChip("Matches");
  const zeroChips = await readChips();
  check(zeroChips.matches === 0, `Matches chip still rendered, reading 0 (read ${zeroChips.matches})`);
  const emptyText = await p.evaluate(() => document.body.innerText);
  check(/No matches this month/i.test(emptyText),
    "tapping Matches on October gives a worded empty state, not a blank area");
  console.log(`   October · Matches → "${(emptyText.match(/No matches[^\n]*/i) || ["(none)"])[0]}"`);

  // ── A tapped day scopes the chips to that day ─────────────────────────────
  // Beyond the literal instruction ("scope to the month"), but it follows the
  // rule: a count describes what the filter will show, and when one day is the
  // subject that is the day. 12 September carries a fixture and a social.
  await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Previous month"); if (x) x.click(); });
  await p.waitForTimeout(700);
  await tapChip("Everything");
  await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find(b => /Sat 12 Sep/i.test(b.getAttribute("aria-label") || "")); if (x) x.click(); });
  await p.waitForTimeout(600);
  const dayChips = await readChips();
  console.log(`   12 Sep selected: Everything ${dayChips.everything} · Matches ${dayChips.matches} · Socials ${dayChips.socials}`);
  check(dayChips.everything === 2 && dayChips.matches === 1 && dayChips.socials === 1,
    `a tapped day scopes the chips to it — 2 / 1 / 1 (read ${dayChips.everything} / ${dayChips.matches} / ${dayChips.socials})`);
  await tapChip("Matches");
  check((await countCards()) === 1, "12 Sep · Matches: chip says 1, list renders 1");

  await b.close();
  server.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
});
