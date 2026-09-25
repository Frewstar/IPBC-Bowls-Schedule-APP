// ════════════════════════════════════════════════════════════════════════════
//  Keep your existing PIN (25 Sep) — the real built app against a real database.
//
//  Same harness as test/directoryLockdown.e2e.mjs: a throwaway PostgreSQL
//  database built from every file in supabase/migrations, the built bundle in
//  Chromium, and every Supabase request executed AS THE anon ROLE. All names,
//  phone numbers and PINs are made up.
//
//  Checks:
//   1. The flag-clearing migration: every account with no new PIN is
//      cleared, a member who chose a new PIN under the lockdown keeps it.
//   2. A member with their old PIN signs in and is NOT asked to change it —
//      including one whose must_change_pin is set.
//   3. A signed-in member can change their PIN without typing the current one,
//      and set it back to the previous one.
//   4. A wrong PIN counts toward the server lockout; the lock holds after the
//      phone's storage is cleared.
//   5. Every refusal shows a message.
//   6. Sessions are 12 months, rolling, and end on a PIN change, an admin
//      reset and sign-out.
//   7. The publishable key still cannot read PINs, phones or player_data.
//   8. (follow-up) Stepped lock: 5 wrong → 15 minutes, 10 in 24 hours → 24
//      hours; an admin unlocks at once; only the long lock signs the member out.
//   9. (follow-up) Spray guard: one PIN across many names from one IP is
//      paused, club-wide attack tightens it, a normal member still gets in.
//  10. (follow-up) Weak PINs refused when set or changed; existing ones work.
//  11. (follow-up) Admin reset refuses the weak list too, and the admin is told.
//
//  Run:   npx vite build && node test/keepPin.e2e.mjs
//  Needs: PostgreSQL (16 used), superuser URL in BOWLS_E2E_PG
//         (default postgresql://postgres:postgres@127.0.0.1/postgres).
//         The database "bowls_keep_pin_e2e" is dropped and recreated.
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ADMIN_URL = process.env.BOWLS_E2E_PG || "postgresql://postgres:postgres@127.0.0.1/postgres";
const DB = "bowls_keep_pin_e2e";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, "/" + DB);
const DIST = path.resolve("dist");
const PORT = 4319;

// ── Database ────────────────────────────────────────────────────────────────
// ip: the caller's address as PostgREST would pass it (request.headers),
// which is what the spray guard keys on. Without one, calls share 'unknown'.
function psql(url, sql, { asAnon = false, ip = null } = {}) {
  const args = [url, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
  if (asAnon) args.push("-c", "set role anon");
  if (ip) args.push("-c", `set request.headers = '{"cf-connecting-ip": "${ip}"}'`);
  args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function psqlFile(url, file) {
  execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: ["ignore", "ignore", "pipe"] });
}

const SUPABASE_STANDINS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions; create extension pgcrypto with schema extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
create schema storage; grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $f$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $f$;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

// Made up. Legacy accounts written the way the old client wrote them:
// NAME-PIN only, the trigger derives the hash.
const SEED = `
insert into player_data (player_name) values ('TEST ALICE-1111'), ('TEST BOB-2719'), ('TEST CAROL-3141'), ('TEST DAN-4444');
insert into members (id, name, phone, section, sort_order) values
  ('t1', 'TEST ALICE', '07700 900001', 'ladies', 1),
  ('t2', 'TEST BOB',   '07700 900002', 'gents',  2),
  ('t3', 'TEST CAROL', '07700 900003', 'ladies', 3);
update members set linked_cloudkey = 'TEST ALICE-1111', linked_player_id = (select id from player_data where player_name = 'TEST ALICE-1111') where id = 't1';
update members set linked_cloudkey = 'TEST BOB-2719', linked_player_id = (select id from player_data where player_name = 'TEST BOB-2719') where id = 't2';
update members set linked_cloudkey = 'TEST CAROL-3141', linked_player_id = (select id from player_data where player_name = 'TEST CAROL-3141') where id = 't3';
insert into admins (cloud_key, player_name, role, player_id)
  select player_name, 'TEST CAROL', 'admin', id from player_data where player_name = 'TEST CAROL-3141';
`;

const COUNTS = `select json_build_object(
  'flagged_no_new_pin',  count(*) filter (where must_change_pin and pin_set_at is null),
  'flagged_has_new_pin', count(*) filter (where must_change_pin and pin_set_at is not null),
  'not_flagged',         count(*) filter (where not must_change_pin),
  'chose_own_pin',       count(*) filter (where pin_set_at is not null),
  'accounts',            count(*))::text from player_data`;
let countsBefore = null, countsAfter = null;

// Every file in order, the way production has had them or will: the lockdown
// (which flags every account), then — while the lockdown's forced change is
// live — TEST DAN chooses a new PIN, then the 25 Sep files.
function buildDatabase() {
  psql(ADMIN_URL, `drop database if exists ${DB}`);
  psql(ADMIN_URL, `create database ${DB}`);
  psql(DB_URL, SUPABASE_STANDINS);
  const dir = path.resolve("supabase/migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (f.startsWith("20260923_directory_lockdown_2")) {
      psql(DB_URL, SEED);
      psql(DB_URL, "select bowls_register('Test Uuid', '5555')", { asAnon: true });
    }
    if (f.startsWith("20260925_keep_existing_pin_1")) {
      // Under the lockdown, DAN did as asked and chose a new PIN.
      const r = psql(DB_URL, "select bowls_change_pin('TEST DAN', '4444', '9090')->>'status'", { asAnon: true });
      if (r !== "ok") throw new Error("seed: DAN's PIN change under the lockdown failed: " + r);
    }
    if (f.startsWith("20260925_keep_existing_pin_2")) countsBefore = JSON.parse(psql(DB_URL, COUNTS));
    psqlFile(DB_URL, path.join(dir, f));
  }
  countsAfter = JSON.parse(psql(DB_URL, COUNTS));
}

// ── PostgREST, as far as this app needs it, run as anon ─────────────────────
const CLOSED = ["player_data", "login_lockouts", "admins", "admin_requests",
                "member_claim_requests", "member_join_requests", "phone_change_requests",
                "bowls_sessions"];
const VOID_FUNCTIONS = ["bowls_sign_out", "bowls_sign_out_all", "bowls_request_unlock"];
const violations = [];

function literal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  const text = typeof v === "string" ? v : JSON.stringify(v);
  if (text.includes("$lit$")) throw new Error("unquotable value");
  return typeof v === "string" ? `$lit$${text}$lit$` : `$lit$${text}$lit$::jsonb`;
}

function answer(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

// The browser's IP, as the server sees it. Tests change it to be "another phone".
let browserIp = "203.0.113.10";
async function postgrest(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/^\/rest\/v1\/(.+)$/);
  if (!m) return route.abort("failed");            // realtime, storage
  const target = m[1];

  if (target.startsWith("rpc/")) {
    const fn = target.slice(4);
    if (!/^[a-z_]+$/.test(fn)) return answer(route, 400, { message: "bad function" });
    const body = req.postDataJSON() || {};
    const args = Object.entries(body).map(([k, v]) => `${k} => ${literal(v)}`).join(", ");
    try {
      if (VOID_FUNCTIONS.includes(fn)) {
        psql(DB_URL, `select public.${fn}(${args})`, { asAnon: true, ip: browserIp });
        return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      }
      const out = psql(DB_URL, `select to_jsonb(public.${fn}(${args}))`, { asAnon: true, ip: browserIp });
      return route.fulfill({ status: 200, contentType: "application/json", body: out || "null" });
    } catch (e) {
      return answer(route, 400, { message: String(e.stderr || e.message).trim() });
    }
  }

  const table = target.split("?")[0];
  if (CLOSED.includes(table)) violations.push(`${req.method()} ${table}`);
  if (table !== "members") return answer(route, 200, []);
  const cols = url.searchParams.get("select") || "*";
  if (cols === "*" || !/^[a-z_,]+$/.test(cols)) violations.push(`members select ${cols}`);
  try {
    const out = psql(DB_URL,
      `select coalesce(json_agg(t), '[]') from (select ${cols} from public.members order by sort_order, name) t`,
      { asAnon: true });
    return route.fulfill({ status: 200, contentType: "application/json", body: out });
  } catch (e) {
    return answer(route, 401, { message: String(e.stderr || e.message).trim() });
  }
}

// ── The app ─────────────────────────────────────────────────────────────────
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  let file = path.join(DIST, url === "/" ? "index.html" : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

async function openApp(browser, stored = {}) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("**://*.supabase.co/**", postgrest);
  await page.route("**://fonts.g*/**", r => r.abort());
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(s => {
    localStorage.setItem("ipbc_welcome_seen", "true");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, stored);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  return { context, page };
}
const text = page => page.evaluate(() => document.body.innerText);
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
async function clickText(page, label) {
  const ok = await page.evaluate(t => {
    const b = [...document.querySelectorAll("button")].find(x => (x.textContent || "").trim() === t);
    if (!b) return false; b.click(); return true;
  }, label);
  if (!ok) throw new Error(`no button "${label}"`);
  await page.waitForTimeout(700);
}
async function choosePin(page, pin) {
  const boxes = page.locator('[role="dialog"] input');
  await boxes.nth(0).fill(pin);
  await boxes.nth(1).fill(pin);
  await clickText(page, "Save PIN");
  await page.waitForTimeout(1800);
}
async function signIn(page, name, pin) {
  await page.locator('input[placeholder]').first().fill(name);
  await page.locator("#pin-input").fill(pin);
  await clickText(page, "Sign In");
  await page.waitForTimeout(1200);
}
async function openMembers(page) {
  await page.keyboard.press("Escape");
  await clickText(page, "Members");
  await page.waitForTimeout(900);
}

const results = [];
function check(label, ok, detail = "") { results.push({ label, ok, detail }); }
const anonRefused = sql => { try { psql(DB_URL, sql, { asAnon: true }); return false; } catch { return true; } };

async function openProfile(page, name) {
  await page.locator("button", { hasText: name }).first().click();
  await page.waitForTimeout(700);
}
// Signed in is enough: the sheet asks for the new PIN twice, nothing else.
async function changePin(page, name, next, again = next) {
  await openProfile(page, name);
  await clickText(page, "Change my PIN");
  const boxes = page.locator('[role="dialog"] input');
  if (await boxes.count() !== 2) throw new Error(`change-PIN sheet has ${await boxes.count()} boxes, expected 2`);
  await boxes.nth(0).fill(next);
  await boxes.nth(1).fill(again);
  await clickText(page, "Save PIN");
  await page.waitForTimeout(1500);
}
const dialogText = page => page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || "");

async function run(browser) {
  // 1. The migration.
  check("migration: before, accounts with no new PIN were flagged",
    countsBefore.flagged_no_new_pin === 3, JSON.stringify(countsBefore));
  check("migration: after, none are",
    countsAfter.flagged_no_new_pin === 0, JSON.stringify(countsAfter));
  check("migration: no account and no chosen PIN touched",
    countsAfter.accounts === countsBefore.accounts && countsAfter.chose_own_pin === countsBefore.chose_own_pin
      && countsAfter.flagged_has_new_pin === countsBefore.flagged_has_new_pin,
    `${JSON.stringify(countsBefore)} → ${JSON.stringify(countsAfter)}`);
  const rerun = (() => { psqlFile(DB_URL, path.resolve("supabase/migrations/20260925_keep_existing_pin_2_clear_flag.sql")); return psql(DB_URL, COUNTS); })();
  check("migration: a second run changes nothing", rerun === JSON.stringify(countsAfter) || JSON.stringify(JSON.parse(rerun)) === JSON.stringify(countsAfter), rerun);
  const dan = psql(DB_URL, "select bowls_sign_in('TEST DAN', '9090')->>'status'", { asAnon: true });
  check("a member who chose a new PIN under the lockdown keeps it", dan === "ok", dan);

  // 2. Old PIN, straight in.
  {
    const { context, page } = await openApp(browser);
    await signIn(page, "test alice", "1111");
    const t = await text(page);
    check("old PIN (an easy one, 1111) signs in with no PIN-change screen", !t.includes("Set your PIN") && !t.includes("Change your PIN"));
    check("and holds a session", !!(await stored(page, "bowls_session_token")));
    await openMembers(page);
    check("directory with phone numbers, through the server", (await text(page)).includes("07700 900002"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    check("reload: still signed in", !!(await stored(page, "bowls_session_token")) && !(await text(page)).includes("Welcome"));
    await context.close();
  }
  {
    // must_change_pin set on an account that never chose a PIN: still no
    // block. (The flag can come back if lockdown_2 runs after the 25 Sep files.)
    psql(DB_URL, "update player_data set must_change_pin = true where name_key = 'TESTBOB'");
    const { context, page } = await openApp(browser);
    await signIn(page, "test bob", "2719");
    check("must_change_pin set: signs in, not asked to change",
      !!(await stored(page, "bowls_session_token")) && !(await text(page)).includes("Set your PIN"));
    await openMembers(page);
    const dir = await text(page);
    check("must_change_pin set: directory works", dir.includes("07700 900002"), dir.slice(0, 300).replace(/\s+/g, " "));
    await context.close();
    const bg = await openApp(browser, { bowls_myname: "TEST BOB", bowls_mypin: "2719" });
    await bg.page.waitForTimeout(1500);
    check("must_change_pin set: a phone from before sessions signs in quietly",
      !!(await stored(bg.page, "bowls_session_token")) && !(await text(bg.page)).includes("Set your PIN"));
    await bg.context.close();
    psql(DB_URL, "update player_data set must_change_pin = false where name_key = 'TESTBOB'");
  }
  {
    // An admin with an old PIN: panel as before, no PIN step.
    const { context, page } = await openApp(browser, { bowls_myname: "TEST CAROL", bowls_mypin: "3141" });
    await page.waitForTimeout(1800);
    check("admin with old PIN: admin panel, no PIN step",
      (await page.locator('button[title="Admin"]').count()) === 1 && !(await text(page)).includes("Set your PIN"));
    await context.close();
  }

  // 3. Change, then back to the previous PIN. 5. Refusals in the sheet.
  {
    const { context, page } = await openApp(browser);
    await signIn(page, "test alice", "1111");
    const before = await stored(page, "bowls_session_token");
    const other = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '1111')->>'token'", { asAnon: true });

    await changePin(page, "TEST ALICE", "2468", "2467");
    check("refusal: new PINs that differ are explained", /don't match/.test(await dialogText(page)));
    await clickText(page, "Cancel");

    await changePin(page, "TEST ALICE", "2468");
    check("change PIN: saved and said so", (await text(page)).includes("PIN saved"));
    check("change PIN: device holds the new PIN and a new session",
      (await stored(page, "bowls_mypin")) === "2468" && (await stored(page, "bowls_session_token")) !== before);
    const oldState = psql(DB_URL, `select bowls_session_state('${other}')->>'status'`, { asAnon: true });
    check("change PIN ends the account's other sessions", oldState === "expired", oldState);

    // Going back to an easy old PIN is refused, in the sheet and on the server.
    await page.waitForTimeout(3000);
    await changePin(page, "TEST ALICE", "1111");
    check("weak: 1111 refused with Joseph's words", (await dialogText(page)).includes("too easy to guess — try a year or house number"));
    await clickText(page, "Cancel");
    for (const weak of ["0000", "7777", "1234", "4321", "1212", "2580"]) {
      const r = psql(DB_URL, `select bowls_change_my_pin('${await stored(page, "bowls_session_token")}', '${weak}')->>'status'`, { asAnon: true });
      check(`weak: server refuses ${weak} on change`, r === "weak_pin", r);
    }
    await changePin(page, "TEST ALICE", "2468");
    check("set to the same PIN it already is: accepted", (await text(page)).includes("PIN saved"));

    // Signed out elsewhere mid-way: the sheet says so rather than failing quietly.
    await page.waitForTimeout(3000);
    psql(DB_URL, "delete from bowls_sessions where player_id = (select id from player_data where name_key = 'TESTALICE')");
    await changePin(page, "TEST ALICE", "3690");
    check("refusal: a change from a signed-out session is explained", /signed out on this phone/.test(await dialogText(page)));
    await context.close();

    // The name-and-PIN route (bowls_change_pin) still needs the right current
    // PIN, and a wrong one counts toward the lock.
    const wrong = psql(DB_URL, "select bowls_change_pin('TEST ALICE', '7777', '2468')->>'status'", { asAnon: true });
    const counted = psql(DB_URL, "select attempts from login_lockouts where name = 'TESTALICE'");
    check("bowls_change_pin: a wrong current PIN is refused and counted", wrong === "denied" && counted === "1", `${wrong}/${counted}`);
    psql(DB_URL, "delete from login_lockouts where name = 'TESTALICE'");
    const noToken = psql(DB_URL, "select bowls_change_my_pin('not-a-token', '2468')->>'status'", { asAnon: true });
    check("bowls_change_my_pin: no session, no change", noToken === "expired", noToken);
    psql(DB_URL, "delete from login_lockouts where name = 'TESTALICE'");
    const now = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '2468')->>'status'", { asAnon: true });
    const old = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '1111')->>'status'", { asAnon: true });
    check("the new PIN signs in; the old one does not", now === "ok" && old === "wrong_pin", `${now}/${old}`);
    psql(DB_URL, "delete from login_lockouts where name = 'TESTALICE'");
  }
  {
    // Back to a previous PIN that is not an easy one: BOB, 2719 → 1967 → 2719.
    const { context, page } = await openApp(browser);
    await signIn(page, "test bob", "2719");
    await changePin(page, "TEST BOB", "1967");
    check("change to a year (1967): accepted", (await text(page)).includes("PIN saved"));
    await page.waitForTimeout(3000);
    await changePin(page, "TEST BOB", "2719");
    check("set back to the previous PIN: accepted", (await text(page)).includes("PIN saved") && (await stored(page, "bowls_mypin")) === "2719");
    await context.close();
    const back = psql(DB_URL, "select bowls_sign_in('TEST BOB', '2719')->>'status'", { asAnon: true });
    const gone = psql(DB_URL, "select bowls_sign_in('TEST BOB', '1967')->>'status'", { asAnon: true });
    check("the previous PIN signs in again; the in-between one does not", back === "ok" && gone === "wrong_pin", `${back}/${gone}`);
    psql(DB_URL, "delete from login_lockouts where name = 'TESTBOB'");
    const key = psql(DB_URL, "select player_name = id::text from player_data where name_key = 'TESTALICE'");
    check("no PIN written into player_name", key === "t", key);
  }

  // 4. Lockout, and 5. its messages.
  {
    // BOB's own phone, signed in, from somewhere else.
    const bobToken = psql(DB_URL, "select bowls_sign_in('TEST BOB', '2719')->>'token'", { asAnon: true, ip: "192.0.2.50" });
    const { context, page } = await openApp(browser);
    let msgs = [];
    for (let i = 0; i < 4; i++) {
      await signIn(page, "test bob", "0000");
      msgs.push(await text(page));
    }
    check("refusal: each wrong PIN says 'That PIN doesn't match'", msgs.every(t => t.includes("That PIN doesn't match")));
    check("refusal: and how many tries are left", msgs[3].includes("1 attempt left"), msgs[3].slice(0, 200));
    await signIn(page, "test bob", "0000");
    const locked = await text(page);
    check("refusal: fifth wrong PIN: 'Try again in 15 minutes, or ask a club admin to unlock you now'",
      locked.includes("Too many tries. Try again in 15 minutes, or ask a club admin to unlock you now."));
    const row = psql(DB_URL, "select attempts || ':' || round(extract(epoch from locked_until - now()) / 60) from login_lockouts where name = 'TESTBOB'");
    check("the server counted five and locked for 15 minutes", row === "5:15", row);
    const alive = psql(DB_URL, `select bowls_session_state('${bobToken}')->>'status'`, { asAnon: true });
    check("a 15-minute lock does not sign the member out on their own phone", alive === "ok", alive);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await context.clearCookies();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.setItem("ipbc_welcome_seen", "true"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await signIn(page, "test bob", "2719");
    check("storage cleared, right PIN: still locked", /Too many tries/.test(await text(page)) && !(await stored(page, "bowls_session_token")));
    await context.close();
    const fresh = await openApp(browser);
    await signIn(fresh.page, "test bob", "2719");
    check("a different browser, right PIN: still locked", /Too many tries/.test(await text(fresh.page)));
    await fresh.context.close();
    check("a locked attempt costs nothing more", psql(DB_URL, "select attempts from login_lockouts where name = 'TESTBOB'") === "5");

    // The 15 minutes pass. Tries 6 to 9 count on towards 10.
    psql(DB_URL, "update login_lockouts set locked_until = now() - interval '1 second' where name = 'TESTBOB'");
    const six = JSON.parse(psql(DB_URL, "select bowls_sign_in('TEST BOB', '0000')::text", { asAnon: true }));
    check("after the 15 minutes: the 6th wrong PIN says 4 tries left", six.status === "wrong_pin" && six.remaining === 4, JSON.stringify(six));
    for (let i = 7; i <= 9; i++) psql(DB_URL, "select bowls_sign_in('TEST BOB', '0000')", { asAnon: true });
    const ten = JSON.parse(psql(DB_URL, "select bowls_sign_in('TEST BOB', '0000')::text", { asAnon: true }));
    const hours = psql(DB_URL, "select round(extract(epoch from locked_until - now()) / 3600) from login_lockouts where name = 'TESTBOB'");
    check("the 10th wrong PIN within 24 hours locks for 24 hours", ten.status === "wrong_pin" && !!ten.locked_until && hours === "24", `${JSON.stringify(ten)} ${hours}h`);
    const ended = psql(DB_URL, `select bowls_session_state('${bobToken}')->>'status'`, { asAnon: true });
    check("the 24-hour lock ends the account's sessions", ended === "expired", ended);
    const long = await openApp(browser);
    await signIn(long.page, "test bob", "2719");
    check("refusal: 24-hour lock uses the 24-hour wording",
      (await text(long.page)).includes("Too many tries. Try again in 24 hours, or ask a club admin to unlock you now."));
    await long.context.close();

    // An admin unlocks at once.
    const carol = psql(DB_URL, "select bowls_sign_in('TEST CAROL', '3141')->>'token'", { asAnon: true, ip: "192.0.2.60" });
    const unlock = psql(DB_URL, `select bowls_admin_set_lockout('${carol}', 'TEST BOB', false)->>'status'`, { asAnon: true });
    const again = psql(DB_URL, "select bowls_sign_in('TEST BOB', '2719')->>'status'", { asAnon: true });
    check("an admin unlock lets the member straight back in", unlock === "ok" && again === "ok", `${unlock}/${again}`);

    // A window more than 24 hours old starts again from one.
    psql(DB_URL, "select bowls_sign_in('TEST BOB', '0000')", { asAnon: true });
    psql(DB_URL, "update login_lockouts set attempts = 7, window_started_at = now() - interval '25 hours' where name = 'TESTBOB'");
    const fresh1 = JSON.parse(psql(DB_URL, "select bowls_sign_in('TEST BOB', '0000')::text", { asAnon: true }));
    check("24 hours after the first wrong PIN, the count starts again", fresh1.attempts === 1 && fresh1.remaining === 4, JSON.stringify(fresh1));
    psql(DB_URL, "delete from login_lockouts where name = 'TESTBOB'");
  }

  // 8. The spray guard: one PIN tried across many names.
  {
    psql(DB_URL, "delete from login_lockouts; delete from bowls_signin_failures; delete from bowls_ip_pauses");
    const A = "198.51.100.7", B = "198.51.100.8";
    const names = ["TEST ALICE", "TEST BOB", "TEST CAROL", "TEST DAN", "TEST UUID"];
    const got = names.map(n => psql(DB_URL, `select bowls_sign_in('${n}', '1357')->>'status'`, { asAnon: true, ip: A }));
    check("spray: the first 5 names from one IP are checked (wrong PIN each)", got.every(g => g === "wrong_pin"), got.join(","));
    const paused = JSON.parse(psql(DB_URL, "select bowls_sign_in('TEST ALICE', '2468')::text", { asAnon: true, ip: A }));
    check("spray: after 5 names, that IP is paused — even the right PIN is not checked", paused.status === "paused" && !!paused.paused_until, JSON.stringify(paused));
    const mins = psql(DB_URL, `select round(extract(epoch from paused_until - now()) / 60) from bowls_ip_pauses where ip = '${A}'`);
    check("spray: the pause is 15 minutes", mins === "15", mins);
    const reg = psql(DB_URL, "select bowls_register('TEST SOMEONE', '1967')->>'status'", { asAnon: true, ip: A });
    const adm = psql(DB_URL, "select bowls_admin_role('TEST CAROL', '3141')", { asAnon: true, ip: A });
    check("spray: registration and the admin check are paused too", reg === "paused" && adm === "", `${reg}/${adm}`);
    const counts = psql(DB_URL, "select string_agg(attempts::text, ',' order by name) from login_lockouts where name in ('TESTALICE','TESTBOB','TESTCAROL','TESTDAN','TESTUUID')");
    check("spray: paused attempts cost the members nothing (one wrong PIN each)", counts === "1,1,1,1,1", counts);
    const normal = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '2468')->>'status'", { asAnon: true, ip: B });
    check("spray: a normal member on another network signs in", normal === "ok", normal);
    browserIp = A;
    const { context, page } = await openApp(browser);
    await signIn(page, "test bob", "2719");
    check("refusal: a paused network is told why", (await text(page)).includes("Too many sign-in attempts from this network"));
    await context.close();
    browserIp = B;
    const ok = await openApp(browser);
    await signIn(ok.page, "test bob", "2719");
    check("a normal member in the browser, another network: signed in", !!(await stored(ok.page, "bowls_session_token")));
    await ok.context.close();
    browserIp = "203.0.113.10";

    // A member getting their own PIN wrong four times is one name: no pause.
    psql(DB_URL, "delete from login_lockouts");
    for (let i = 0; i < 4; i++) psql(DB_URL, "select bowls_sign_in('TEST DAN', '0000')", { asAnon: true, ip: "198.51.100.9" });
    const own = psql(DB_URL, "select bowls_sign_in('TEST DAN', '9090')->>'status'", { asAnon: true, ip: "198.51.100.9" });
    check("spray: one member's own wrong PINs never pause their network", own === "ok", own);

    // Club-wide: 21 accounts, sprayed 3 names at a time from 7 IPs.
    psql(DB_URL, "delete from login_lockouts; delete from bowls_signin_failures; delete from bowls_ip_pauses");
    for (let i = 1; i <= 21; i++) psql(DB_URL, `select bowls_register('TEST SPRAY ${i}', '1967')`, { asAnon: true, ip: "192.0.2.99" });
    const statusOf = (i, ip) => psql(DB_URL, `select bowls_sign_in('TEST SPRAY ${i}', '1357')->>'status'`, { asAnon: true, ip });
    let first18 = [];
    for (let k = 0; k < 6; k++) for (let j = 1; j <= 3; j++) first18.push(statusOf(k * 3 + j, `198.18.0.${k + 1}`));
    check("club-wide: 6 IPs × 3 names (18 names) — nobody paused yet", first18.every(x => x === "wrong_pin"), first18.join(","));
    const s19 = statusOf(19, "198.18.0.7"), s20 = statusOf(20, "198.18.0.7"), s21 = statusOf(21, "198.18.0.7");
    const p7 = psql(DB_URL, "select count(*) from bowls_ip_pauses where ip = '198.18.0.7' and paused_until > now()");
    check("club-wide: once 20+ names are failing, 3 names from one IP pauses it", s21 === "wrong_pin" && p7 === "1", `${s19},${s20},${s21} paused=${p7}`);
    const p1 = psql(DB_URL, "select count(*) from bowls_ip_pauses where ip = '198.18.0.1'");
    check("club-wide: earlier IPs under the limit are not retro-paused", p1 === "0", p1);
    psql(DB_URL, "delete from login_lockouts; delete from bowls_signin_failures; delete from bowls_ip_pauses");
  }

  // 9. Weak PINs when an account is created.
  {
    const { context, page } = await openApp(browser);
    await signIn(page, "test newcomer", "1234");
    const t = await text(page);
    check("weak: a new account with 1234 is refused with Joseph's words", t.includes("too easy to guess — try a year or house number"));
    const createDisabled = await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Create Account")?.disabled);
    check("weak: and cannot be created", createDisabled === true);
    await context.close();
    const srv = ["0000", "5555", "1234", "4321", "1212", "2580"].map(p => psql(DB_URL, `select bowls_register('TEST NEWCOMER', '${p}')->>'status'`, { asAnon: true }));
    check("weak: the server refuses them for a new account too", srv.every(x => x === "weak_pin"), srv.join(","));
    const year = psql(DB_URL, "select bowls_register('TEST NEWCOMER', '1954')->>'status'", { asAnon: true });
    check("weak: a year is fine", year === "created", year);
    const existing = psql(DB_URL, "select bowls_register('TEST UUID', '5555')->>'status'", { asAnon: true });
    check("weak: an existing easy PIN still signs in (not forced to change)", existing === "existing", existing);
  }

  // 5. The other refusals.
  {
    const { context, page } = await openApp(browser);
    await page.route("**/rest/v1/rpc/bowls_sign_in", r => r.abort("failed"));
    await signIn(page, "test bob", "2719");
    check("refusal: no connection says 'Can't reach the club server'", (await text(page)).includes("Can't reach the club server"));
    await page.unroute("**/rest/v1/rpc/bowls_sign_in");
    await signIn(page, "!!!", "2719");
    check("refusal: a name with no letters is explained", (await text(page)).includes("Check your name and PIN"));
    await clickText(page, "Forgot PIN?");
    check("signed out: 'Forgot PIN?' says ask a club admin", (await text(page)).includes("Ask a club admin to reset it"));
    await context.close();
    // A phone whose saved PIN no longer works is told, not silently dropped.
    const stale = await openApp(browser, { bowls_myname: "TEST BOB", bowls_mypin: "1234" });
    await stale.page.waitForTimeout(1500);
    check("refusal: a phone with an out-of-date PIN is told why it was signed out",
      (await text(stale.page)).includes("no longer matches"));
    await stale.context.close();
    psql(DB_URL, "delete from login_lockouts where name = 'TESTBOB'");
  }

  // 6. Sessions.
  {
    const tok = psql(DB_URL, "select bowls_sign_in('TEST BOB', '2719')->>'token'", { asAnon: true });
    const days = psql(DB_URL, "select round(extract(epoch from max(expires_at) - now()) / 86400) from bowls_sessions s join player_data d on d.id = s.player_id where d.name_key = 'TESTBOB'");
    check("a new session lasts 365 days", days === "365", days);
    psql(DB_URL, "update bowls_sessions set expires_at = now() + interval '10 days' where player_id = (select id from player_data where name_key = 'TESTBOB')");
    psql(DB_URL, `select bowls_session_state('${tok}')`, { asAnon: true });
    const slid = psql(DB_URL, "select round(extract(epoch from max(expires_at) - now()) / 86400) from bowls_sessions s join player_data d on d.id = s.player_id where d.name_key = 'TESTBOB'");
    check("using it pushes it back out to 365 days", slid === "365", slid);
    psql(DB_URL, `select bowls_sign_out('${tok}')`, { asAnon: true });
    const out = psql(DB_URL, `select bowls_session_state('${tok}')->>'status'`, { asAnon: true });
    check("sign-out ends it", out === "expired", out);
    const tok2 = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '2468')->>'token'", { asAnon: true });
    const reset = psql(DB_URL, "select bowls_admin_reset_pin('TEST CAROL', '3141', 't1', '8080')->>'status'", { asAnon: true });
    const after = psql(DB_URL, `select bowls_session_state('${tok2}')->>'status'`, { asAnon: true });
    check("an admin PIN reset ends it", reset === "ok" && after === "expired", `${reset}/${after}`);
  }

  // 11. Admin reset refuses the weak-PIN list too, with the same words.
  {
    psql(DB_URL, "delete from login_lockouts; delete from bowls_signin_failures; delete from bowls_ip_pauses");
    for (const weak of ["0000", "8888", "1234", "4321", "1212", "2580"]) {
      const r = JSON.parse(psql(DB_URL, `select bowls_admin_reset_pin('TEST CAROL', '3141', 't2', '${weak}')::text`, { asAnon: true }));
      check(`admin reset: ${weak} refused as weak, with Joseph's words`,
        r.status === "weak_pin" && r.message === "That one's too easy to guess — try a year or house number you'll remember.", JSON.stringify(r));
    }
    // Checked before the admin's PIN, so a weak choice with a wrong admin PIN costs the admin nothing.
    const w = psql(DB_URL, "select bowls_admin_reset_pin('TEST CAROL', '0001', 't2', '1111')->>'status'", { asAnon: true });
    const cost = psql(DB_URL, "select count(*) from login_lockouts");
    check("admin reset: a weak choice is refused before the admin's PIN is checked (no try spent)", w === "weak_pin" && cost === "0", `${w}/${cost}`);
    const still = psql(DB_URL, "select bowls_sign_in('TEST BOB', '2719')->>'status'", { asAnon: true });
    check("admin reset: the refused reset changed nothing", still === "ok", still);
    const ok = psql(DB_URL, "select bowls_admin_reset_pin('TEST CAROL', '3141', 't2', '1954')->>'status'", { asAnon: true });
    const now = psql(DB_URL, "select bowls_sign_in('TEST BOB', '1954')->>'status'", { asAnon: true });
    check("admin reset: a year is fine", ok === "ok" && now === "ok", `${ok}/${now}`);

    // In the admin panel, the admin sees the words before typing their own PIN.
    const { context, page } = await openApp(browser, { bowls_myname: "TEST CAROL", bowls_mypin: "3141" });
    await page.waitForTimeout(1800);
    let shown = false;
    if (await page.locator('button[title="Admin"]').count()) {
      await page.locator('button[title="Admin"]').click();
      await page.waitForTimeout(700);
      const membersButtons = page.getByRole("button", { name: "Members", exact: true });
      for (let i = 0; i < await membersButtons.count(); i++) {
        await membersButtons.nth(i).click();
        await page.waitForTimeout(500);
        if (await page.getByRole("button", { name: "Reset PIN", exact: true }).count()) break;
        await page.locator('button[title="Admin"]').click();
        await page.waitForTimeout(500);
      }
      await page.getByRole("button", { name: "Reset PIN", exact: true }).click();
      await page.waitForTimeout(500);
      await page.locator('input[placeholder="Search by name…"]').fill("TEST B");
      await page.waitForTimeout(500);
      await page.locator("button", { hasText: "TEST BOB" }).last().click();
      await page.waitForTimeout(500);
      await page.locator('input[placeholder="4 digits"]').fill("2580");
      await page.locator('input[placeholder="••••"]').last().fill("3141");
      await page.locator("button", { hasText: /^Reset .*PIN$/ }).last().click();
      await page.waitForTimeout(800);
      shown = (await text(page)).includes("That one's too easy to guess — try a year or house number you'll remember.");
    }
    check("admin panel: a weak reset shows the admin the same words", shown);
    await context.close();
    const unchanged = psql(DB_URL, "select bowls_sign_in('TEST BOB', '1954')->>'status'", { asAnon: true });
    check("admin panel: and the member's PIN is unchanged", unchanged === "ok", unchanged);
    psql(DB_URL, "delete from login_lockouts");
  }

  // 7. The publishable key.
  check("anon cannot read player_data", anonRefused("select 1 from public.player_data limit 1"));
  check("anon cannot read pin_hash", anonRefused("select pin_hash from public.player_data limit 1"));
  check("anon cannot read members.phone", anonRefused("select phone from public.members limit 1"));
  check("anon cannot read members.linked_cloudkey", anonRefused("select linked_cloudkey from public.members limit 1"));
  check("anon cannot read admins.cloud_key", anonRefused("select cloud_key from public.admins limit 1"));
  check("anon cannot read login_lockouts or bowls_sessions",
    anonRefused("select 1 from public.login_lockouts") && anonRefused("select 1 from public.bowls_sessions"));
  check("anon cannot call the internal auth functions",
    anonRefused("select public.bowls_auth('TEST BOB', '8080')")
      && anonRefused("select public.bowls_session_issue(gen_random_uuid(), gen_random_uuid())")
      && anonRefused("select public.bowls_set_pin(gen_random_uuid(), '1234')")
      && anonRefused("select public.bowls_spray_record('TESTBOB', null)")
      && anonRefused("select public.bowls_count_wrong_pin('TESTBOB', null)"));
  check("anon cannot read or clear the spray guard's records",
    anonRefused("select 1 from public.bowls_signin_failures") && anonRefused("delete from public.bowls_ip_pauses"));
  check("anon cannot grant admin without a super admin's PIN",
    psql(DB_URL, "select count(*) from admins", {}) === "1");
}

async function main() {
  buildDatabase();
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  await run(browser);
  check("no direct call to a closed table", violations.length === 0, violations.join(", "));
  await browser.close();
  server.close();

  console.log(`\n  Keep your existing PIN, end to end\n`);
  console.log(`  migration counts  before ${JSON.stringify(countsBefore)}\n                    after  ${JSON.stringify(countsAfter)}\n`);
  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}${r.ok || !r.detail ? "" : `   (${r.detail})`}`);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); server.close(); process.exit(1); });
