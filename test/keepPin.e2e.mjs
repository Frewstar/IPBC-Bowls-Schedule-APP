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
function psql(url, sql, { asAnon = false } = {}) {
  const args = [url, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
  if (asAnon) args.push("-c", "set role anon");
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
insert into player_data (player_name) values ('TEST ALICE-1111'), ('TEST BOB-2222'), ('TEST CAROL-3333'), ('TEST DAN-4444');
insert into members (id, name, phone, section, sort_order) values
  ('t1', 'TEST ALICE', '07700 900001', 'ladies', 1),
  ('t2', 'TEST BOB',   '07700 900002', 'gents',  2),
  ('t3', 'TEST CAROL', '07700 900003', 'ladies', 3);
update members set linked_cloudkey = 'TEST ALICE-1111', linked_player_id = (select id from player_data where player_name = 'TEST ALICE-1111') where id = 't1';
update members set linked_cloudkey = 'TEST CAROL-3333', linked_player_id = (select id from player_data where player_name = 'TEST CAROL-3333') where id = 't3';
insert into admins (cloud_key, player_name, role, player_id)
  select player_name, 'TEST CAROL', 'admin', id from player_data where player_name = 'TEST CAROL-3333';
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
        psql(DB_URL, `select public.${fn}(${args})`, { asAnon: true });
        return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      }
      const out = psql(DB_URL, `select to_jsonb(public.${fn}(${args}))`, { asAnon: true });
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
    check("old PIN signs in with no PIN-change screen", !t.includes("Set your PIN") && !t.includes("Change your PIN"));
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
    await signIn(page, "test bob", "2222");
    check("must_change_pin set: signs in, not asked to change",
      !!(await stored(page, "bowls_session_token")) && !(await text(page)).includes("Set your PIN"));
    await openMembers(page);
    const dir = await text(page);
    check("must_change_pin set: directory works", dir.includes("07700 900002"), dir.slice(0, 300).replace(/\s+/g, " "));
    await context.close();
    const bg = await openApp(browser, { bowls_myname: "TEST BOB", bowls_mypin: "2222" });
    await bg.page.waitForTimeout(1500);
    check("must_change_pin set: a phone from before sessions signs in quietly",
      !!(await stored(bg.page, "bowls_session_token")) && !(await text(bg.page)).includes("Set your PIN"));
    await bg.context.close();
    psql(DB_URL, "update player_data set must_change_pin = false where name_key = 'TESTBOB'");
  }
  {
    // An admin with an old PIN: panel as before, no PIN step.
    const { context, page } = await openApp(browser, { bowls_myname: "TEST CAROL", bowls_mypin: "3333" });
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

    await page.waitForTimeout(3000);
    await changePin(page, "TEST ALICE", "1111");
    check("set back to the previous PIN: accepted", (await text(page)).includes("PIN saved") && (await stored(page, "bowls_mypin")) === "1111");
    await page.waitForTimeout(3000);
    await changePin(page, "TEST ALICE", "1111");
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
    const back = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '1111')->>'status'", { asAnon: true });
    const gone = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '2468')->>'status'", { asAnon: true });
    check("the previous PIN signs in again; the in-between one does not", back === "ok" && gone === "wrong_pin", `${back}/${gone}`);
    const key = psql(DB_URL, "select player_name = id::text from player_data where name_key = 'TESTALICE'");
    check("no PIN written into player_name", key === "t", key);
  }

  // 4. Lockout, and 5. its messages.
  {
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
    check("refusal: fifth wrong PIN: 'Too many tries … 24 hours … club admin'",
      /Too many tries/.test(locked) && /24 hours/.test(locked) && /club admin/.test(locked));
    const row = psql(DB_URL, "select attempts || ':' || (locked_until > now()) from login_lockouts where name = 'TESTBOB'");
    check("the server counted five and locked", row === "5:true", row);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await context.clearCookies();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.setItem("ipbc_welcome_seen", "true"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await signIn(page, "test bob", "2222");
    check("storage cleared, right PIN: still locked", /Too many tries/.test(await text(page)) && !(await stored(page, "bowls_session_token")));
    await context.close();
    const fresh = await openApp(browser);
    await signIn(fresh.page, "test bob", "2222");
    check("a different browser, right PIN: still locked", /Too many tries/.test(await text(fresh.page)));
    await fresh.context.close();
    psql(DB_URL, "delete from login_lockouts where name = 'TESTBOB'");
  }

  // 5. The other refusals.
  {
    const { context, page } = await openApp(browser);
    await page.route("**/rest/v1/rpc/bowls_sign_in", r => r.abort("failed"));
    await signIn(page, "test bob", "2222");
    check("refusal: no connection says 'Can't reach the club server'", (await text(page)).includes("Can't reach the club server"));
    await page.unroute("**/rest/v1/rpc/bowls_sign_in");
    await signIn(page, "!!!", "2222");
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
    const tok = psql(DB_URL, "select bowls_sign_in('TEST BOB', '2222')->>'token'", { asAnon: true });
    const days = psql(DB_URL, "select round(extract(epoch from max(expires_at) - now()) / 86400) from bowls_sessions s join player_data d on d.id = s.player_id where d.name_key = 'TESTBOB'");
    check("a new session lasts 365 days", days === "365", days);
    psql(DB_URL, "update bowls_sessions set expires_at = now() + interval '10 days' where player_id = (select id from player_data where name_key = 'TESTBOB')");
    psql(DB_URL, `select bowls_session_state('${tok}')`, { asAnon: true });
    const slid = psql(DB_URL, "select round(extract(epoch from max(expires_at) - now()) / 86400) from bowls_sessions s join player_data d on d.id = s.player_id where d.name_key = 'TESTBOB'");
    check("using it pushes it back out to 365 days", slid === "365", slid);
    psql(DB_URL, `select bowls_sign_out('${tok}')`, { asAnon: true });
    const out = psql(DB_URL, `select bowls_session_state('${tok}')->>'status'`, { asAnon: true });
    check("sign-out ends it", out === "expired", out);
    const tok2 = psql(DB_URL, "select bowls_sign_in('TEST ALICE', '1111')->>'token'", { asAnon: true });
    const reset = psql(DB_URL, "select bowls_admin_reset_pin('TEST CAROL', '3333', 't1', '8080')->>'status'", { asAnon: true });
    const after = psql(DB_URL, `select bowls_session_state('${tok2}')->>'status'`, { asAnon: true });
    check("an admin PIN reset ends it", reset === "ok" && after === "expired", `${reset}/${after}`);
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
      && anonRefused("select public.bowls_set_pin(gen_random_uuid(), '1234')"));
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
