// ════════════════════════════════════════════════════════════════════════════
//  The tie sheet, rendered by a real HTML parser
//
//  test/tieSheet.test.mjs checks the string. This checks what a browser does
//  with it, which is not the same question: an HTML parser ends a <script>
//  element at the first `</script` whatever the JavaScript around it thinks,
//  and an onerror attribute needs no script tag at all.
//
//  Against the code as it was before escaping, this reports: window.PWNED = 2
//  set from a PLAYER NAME, two script elements, and the sheet's own script
//  truncated so the Print buttons were dead. The sheet is opened with
//  window.open() + document.write and read back as a blob: URL, both of which
//  run in the app's origin — the one with the member's PIN in localStorage.
//
//  Run:  node test/tieSheet.e2e.mjs
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { escapeHtml } from "../src/lib/html.js";

// buildTieSheetHtml lives in AdminPanel.jsx, which imports React — parse the
// builder out and run it, so this exercises the shipping template itself.
const src = fs.readFileSync(path.resolve("src/components/tabs/AdminPanel.jsx"), "utf8");
const s = src.indexOf("export function buildTieSheetHtml");
const e = src.indexOf("\nfunction printTieSheet", s);
const build = new Function("BRACKET_SIZE", "fmtRoundDate", "escapeHtml",
  `${src.slice(s, e).replace("export function", "function")}\nreturn buildTieSheetHtml;`)(64, d => String(d), escapeHtml);

const html = build(
  { tournament_name: `Gents & Ladies "Open" <script>window.PWNED=1</script>`, season_year: 2026 },
  [{ slotIndex: 1, name: `O'Brien & Sons`, handicap: "+2" },
   { slotIndex: 2, name: `<img src=x onerror=window.PWNED=2>`, handicap: "" }],
  [{ p1: { name: "C NEWMAN" }, p2: { name: "D BROWN" } }],
  ["2026-05-01"]);

let failures = 0;
const check = (ok, m) => { if (!ok) failures++; console.log(`  ${ok ? "✓" : "✗"} ${m}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", err => errors.push(String(err)));
await page.setContent(html, { waitUntil: "load" });

const r = await page.evaluate(() => ({
  pwned:    typeof window.PWNED !== "undefined" ? window.PWNED : null,
  scripts:  document.querySelectorAll("script").length,
  imgs:     document.querySelectorAll("img").length,
  hasPrint: typeof window.doPrint === "function" && typeof window.doSavePdf === "function",
  pdfName:  document.body.dataset.pdfName,
  text:     document.body.innerText,
}));
// Drive the Save-as-PDF path, since it is the one that used to splice a name
// into the script.
await page.evaluate(() => { window.print = () => {}; if (window.doSavePdf) window.doSavePdf(); });

console.log("\n═══ the sheet in a real browser ═══");
check(r.pwned === null, `no injected script ran (window.PWNED = ${r.pwned})`);
check(r.scripts === 1,  `exactly one script element survives (${r.scripts})`);
check(r.imgs === 0,     `no injected <img> element (${r.imgs})`);
check(r.hasPrint,       "doPrint and doSavePdf are both defined — the script was not truncated");
// The heading is CSS-uppercased, so these read case-insensitively.
check(/O'Brien & Sons/i.test(r.text),          "an ordinary name reads correctly on the sheet");
check(/Gents & Ladies "Open"/i.test(r.text),   "the tournament name reads correctly in the heading");
check(!/&amp;|&#039;|&quot;/.test(r.text),     "no half-escaped entities visible to the reader");
check(/<script>window\.PWNED=1<\/script>/i.test(r.text), "the hostile text shows as text, on the sheet");
check(!!r.pdfName && r.pdfName.endsWith("_2026.pdf"), `the pdf filename is on the body (${r.pdfName})`);
check(errors.length === 0, `no page errors (${errors.join("; ") || "none"})`);
console.log(`      heading as rendered: ${r.text.split("\n").filter(l => /gents/i.test(l)).join(" · ")}`);

await browser.close();
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
