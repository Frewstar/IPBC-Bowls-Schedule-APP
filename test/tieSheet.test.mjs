// ════════════════════════════════════════════════════════════════════════════
//  The tie sheet does not let a name out of its cell
//
//  buildTieSheetHtml assembles a whole HTML document as a string, and that
//  document is then handed to window.document.write() (Print) or read back as
//  a blob: URL (Preview). Both run in the app's own origin — the one holding
//  the member's PIN in localStorage — so a `<` in a player name is not just a
//  broken printout.
//
//  The everyday case matters more than the alarming one: O'Brien and
//  "Gents Pairs & Triples" are ordinary club names, and unescaped they render
//  as mojibake on a sheet pinned to the clubhouse wall.
//
//  buildTieSheetHtml is exported from AdminPanel.jsx, which imports React and
//  lucide-react, so it cannot be imported from plain node. This parses the
//  builder out and runs it in a Function instead — clumsy, but it exercises
//  the real template rather than a copy of it that can drift.
// ════════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { escapeHtml } from "../src/lib/html.js";

const src = fs.readFileSync(path.resolve("src/components/tabs/AdminPanel.jsx"), "utf8");
const start = src.indexOf("export function buildTieSheetHtml");
assert.ok(start > -1, "buildTieSheetHtml not found — this test needs updating, not deleting");
const end = src.indexOf("\nfunction printTieSheet", start);
assert.ok(end > start, "could not find the end of buildTieSheetHtml");
const body = src.slice(start, end).replace("export function", "function");

// The builder's own dependencies, stubbed to the shapes it actually uses.
const build = new Function("BRACKET_SIZE", "fmtRoundDate", "escapeHtml", `
  ${body}
  return buildTieSheetHtml;
`)(64, d => String(d), escapeHtml);

const NASTY   = `<script>alert(1)</script>`;
const ORDINARY = `O'Brien & Sons "Jim"`;

const draw = (name, year) => ({ tournament_name: name, season_year: year });
const slot = name => [{ slotIndex: 1, name, handicap: NASTY }];
const prelim = name => [{ p1: { name, handicap: NASTY }, p2: { name, handicap: NASTY } }];

test("the builder still produces a document — a passing suite over an empty string proves nothing", () => {
  const html = build(draw("Championship", 2026), slot("A SMITH"), [], []);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /A SMITH/);
  assert.match(html, /Championship/);
});

test("a script tag in a player name does not survive as a tag", () => {
  const html = build(draw("Championship", 2026), slot(NASTY), [], []);
  assert.ok(!html.includes("<script>alert(1)</script>"), "raw script tag reached the document");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("a script tag in a prelim name, and in a handicap, does not survive either", () => {
  const html = build(draw("Championship", 2026), [], prelim(NASTY), []);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("a script tag in the tournament name does not survive, in title or heading", () => {
  const html = build(draw(NASTY, 2026), [], [], []);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  // Both places it appears, not just the first.
  assert.equal((html.match(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/g) || []).length >= 2, true);
});

test("the only <script> in the document is the one this file writes", () => {
  const html = build(draw(NASTY, NASTY), slot(NASTY), prelim(NASTY), [NASTY]);
  const opens = html.match(/<script[\s>]/g) || [];
  assert.equal(opens.length, 1, `found ${opens.length} opening script tags`);
  assert.match(html, /function doPrint\(\)/);
  // And exactly one close. The HTML parser ends a script element at the first
  // `</script`, whether or not JavaScript considers it inside a comment or a
  // string — writing that sequence in a comment in the template silently
  // truncates the script and the Print buttons stop working. Which is what
  // happened while this fix was being written.
  const closes = html.match(/<\/script/g) || [];
  assert.equal(closes.length, 1, `found ${closes.length} closing script tags`);
});

test("the pdf filename is carried on the body, not spliced into the script", () => {
  const html = build(draw(NASTY, 2026), [], [], []);
  assert.match(html, /<body data-pdf-name="/);
  assert.match(html, /document\.body\.dataset\.pdfName/);
  // The nasty name must not appear inside the script element at all.
  const script = html.slice(html.indexOf("<script>"));
  assert.ok(!script.includes("alert(1)"), "the name reached the script element");
});

test("an ordinary club name renders as itself, not as mojibake", () => {
  const html = build(draw(ORDINARY, 2026), slot(ORDINARY), [], []);
  // Escaped in the source...
  assert.ok(html.includes("O&#039;Brien &amp; Sons &quot;Jim&quot;"));
  // ...and there is no half-escaped &amp;amp; from double-escaping.
  assert.ok(!html.includes("&amp;amp;"), "double-escaped");
  assert.ok(!html.includes("&amp;#039;"), "double-escaped");
});

test("a quote in the name cannot break out of the data-pdf-name attribute", () => {
  const html = build(draw(`" onload="alert(1)`, 2026), [], [], []);
  const tag = html.match(/<body[^>]*>/)[0];
  // The text `onload=` does appear — as escaped data inside the value, which
  // is inert. What must not appear is a bare quote closing the attribute
  // early, so count them: exactly the two that delimit the value.
  assert.equal((tag.match(/"/g) || []).length, 2, `attribute broken out of: ${tag}`);
  assert.match(tag, /&quot; onload=&quot;alert\(1\)/);
});

test("escapeHtml handles null, undefined and numbers without throwing", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(12), "12");
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml("<&>"), "&lt;&amp;&gt;");
});
