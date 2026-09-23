// ════════════════════════════════════════════════════════════════════════════
//  Directory lockdown — the real built app against a real database.
//
//  Builds a throwaway PostgreSQL database from supabase/migrations (with the
//  roles and schemas a Supabase project ships with). That includes the 1 Sep
//  session work, so sign-in issues tokens exactly as production does. Seeds
//  made-up accounts the way production holds them — legacy NAME-PIN keys the
//  old client wrote, plus one bowls_register account with a uuid key — and a
//  session issued before the lockdown. Then applies
//  20260923_directory_lockdown_2, so every session ends and every account
//  has to choose a new PIN.
//
//  The built bundle runs in Chromium. Every Supabase request is intercepted
//  and executed against that database AS THE anon ROLE — the role the
//  publishable key gets — so the grants and policies under test are the real
//  ones. Function calls go to the function; table reads run the SELECT
//  PostgREST would.
//
//  Checks:
//   1. The app never touches player_data, login_lockouts, admins or the
//      request tables directly, and never asks members for a column the
//      publishable key cannot read.
//   2. Signing in with an old PIN leads to "Choose a new PIN", and only then
//      to the directory with phone numbers. A reload stays signed in.
//   3. The new PIN never lands in player_name: the account's key is its uuid.
//   4. A phone from before sessions (name and PIN, no token) is taken to the
//      new-PIN screen.
//   5. A phone holding a token from before the lockdown is signed out and
//      told why.
//   6. An admin gets the new-PIN screen, no admin panel until the PIN is
//      changed, and the panel — with an account list showing no PINs —
//      straight after.
//   7. As anon, members.phone is refused, and live_games holds no keys.
//
//  Run:   npx vite build && node test/directoryLockdown.e2e.mjs
//         PART1_ONLY=1 node test/directoryLockdown.e2e.mjs   (deploy window)
//  Needs: a PostgreSQL server (16 used) and a URL for a superuser, in
//         BOWLS_E2E_PG (default postgresql://postgres:postgres@127.0.0.1/postgres).
//         The database "bowls_lockdown_e2e" is dropped and recreated.
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ADMIN_URL = process.env.BOWLS_E2E_PG || "postgresql://postgres:postgres@127.0.0.1/postgres";
const DB = "bowls_lockdown_e2e";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, "/" + DB);
const DIST = path.resolve("dist");
const PORT = 4318;
// PART1_ONLY=1: the window between the deploy and part 2. Part 1 is applied,
// part 2 is not; the new client has to work as before, with no PIN change
// asked of anyone.
const PART1_ONLY = !!process.env.PART1_ONLY;

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
update members set linked_cloudkey = 'TEST ALICE-1111' where id = 't1';
update members set linked_cloudkey = 'TEST CAROL-3333' where id = 't3';
insert into admins (cloud_key, player_name, role, player_id)
  select player_name, 'TEST CAROL', 'admin', id from player_data where player_name = 'TEST CAROL-3333';
insert into live_games (creator_cloudkey) values ('TEST BOB-2222');
`;

let preLockdownToken = null;

function buildDatabase() {
  psql(ADMIN_URL, `drop database if exists ${DB}`);
  psql(ADMIN_URL, `create database ${DB}`);
  psql(DB_URL, SUPABASE_STANDINS);
  const dir = path.resolve("supabase/migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const lockdown2 = files.find(f => f.startsWith("20260923_directory_lockdown_2"));
  for (const f of files) {
    if (f === lockdown2) {
      // The live state part 2 meets: legacy accounts, a live session, and
      // an account bowls_register made since 1 Sep.
      psql(DB_URL, SEED);
      psql(DB_URL, "select bowls_register('Test Uuid', '5555')", { asAnon: true });
      preLockdownToken = psql(DB_URL, "select bowls_sign_in('TEST DAN', '4444')->>'token'", { asAnon: true });
      if (PART1_ONLY) continue;
    }
    psqlFile(DB_URL, path.join(dir, f));
  }
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
  await clickText(page, "Save new PIN");
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

async function afterLockdown(browser) {
  // 2 + 3. Old PIN → new PIN → directory.
  {
    const { context, page } = await openApp(browser);
    await signIn(page, "test alice", "1111");
    check("old PIN leads to 'Choose a new PIN'", (await text(page)).includes("Choose a new PIN"));
    check("no token for the old PIN", !(await stored(page, "bowls_session_token")));
    await choosePin(page, "2468");
    check("new-PIN screen closes after saving", !(await text(page)).includes("Choose a new PIN"));
    check("device holds a token and the new PIN",
      !!(await stored(page, "bowls_session_token")) && (await stored(page, "bowls_mypin")) === "2468");
    check("signed in under the same name", (await stored(page, "bowls_myname")) === "TEST ALICE");
    await openMembers(page);
    check("directory shows phone numbers after the change", (await text(page)).includes("07700 900002"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    check("reload: no new-PIN screen", !(await text(page)).includes("Choose a new PIN"));
    await openMembers(page);
    check("reload: still in the directory", (await text(page)).includes("07700 900002"));
    await context.close();
    const key = psql(DB_URL, "select player_name = id::text and player_name !~ '2468' from player_data where name_key = 'TESTALICE'");
    check("the new PIN is not in player_name (it is the uuid)", key === "t", key);
    const link = psql(DB_URL, "select linked_player_id = (select id from player_data where name_key = 'TESTALICE') from members where id = 't1'");
    check("the roster link followed the key change", link === "t", link);
  }

  // 4. A phone from before sessions: name and PIN, no token.
  {
    const { context, page } = await openApp(browser, { bowls_myname: "TEST BOB", bowls_mypin: "2222" });
    await page.waitForTimeout(1200);
    check("pre-session phone is shown 'Choose a new PIN'", (await text(page)).includes("Choose a new PIN"));
    await choosePin(page, "8642");
    check("and signs in once it has", !!(await stored(page, "bowls_session_token")));
    await context.close();
  }

  // 5. A phone holding a token from before the lockdown.
  {
    const { context, page } = await openApp(browser, {
      bowls_myname: "TEST DAN", bowls_mypin: "4444", bowls_session_token: preLockdownToken });
    await page.waitForTimeout(1500);
    check("pre-lockdown token: signed out", !(await stored(page, "bowls_session_token")));
    check("and told why", (await text(page)).includes("signed out on this phone"));
    await context.close();
  }

  // 6. An admin, from a phone that was signed in before sessions.
  {
    const { context, page } = await openApp(browser, { bowls_myname: "TEST CAROL", bowls_mypin: "3333" });
    await page.waitForTimeout(1500);
    check("admin sees 'Choose a new PIN' on open", (await text(page)).includes("Choose a new PIN"));
    check("no admin panel before the change", (await page.locator('button[title="Admin"]').count()) === 0);
    await choosePin(page, "1357");
    await page.waitForTimeout(1500);
    const panel = await page.locator('button[title="Admin"]').count();
    check("admin panel straight after the change", panel === 1);
    if (panel === 1) {
      await page.locator('button[title="Admin"]').click();
      await page.waitForTimeout(800);
      // "Members" is both a bottom-nav tab and an admin section; the section
      // is the one that reveals "App Accounts".
      const membersButtons = page.getByRole("button", { name: "Members", exact: true });
      for (let i = 0; i < await membersButtons.count(); i++) {
        await membersButtons.nth(i).click();
        await page.waitForTimeout(500);
        if (await page.getByRole("button", { name: /^App Accounts/ }).count()) break;
        await page.locator('button[title="Admin"]').click();
        await page.waitForTimeout(500);
      }
      await page.getByRole("button", { name: /^App Accounts/ }).click();
      await page.waitForTimeout(900);
      const t = await text(page);
      check("admin account list loads through the server", t.includes("TEST BOB") && t.includes("New PIN needed"));
      check("admin account list shows no PIN digits or keys",
        !/••••|\b(1111|2222|2468|1357|4444|8642)\b|[0-9a-f]{8}-[0-9a-f]{4}-/.test(t));
    }
    await context.close();
  }

  // 7.
  let phoneReadable = false;
  try { psql(DB_URL, "select phone from public.members limit 1", { asAnon: true }); phoneReadable = true; } catch {}
  check("members.phone refused to the publishable key", !phoneReadable);
  const liveKeys = psql(DB_URL, "select count(*) from live_games where creator_cloudkey is not null and creator_cloudkey !~ '^id:'");
  check("no account keys left in live_games", liveKeys === "0", `${liveKeys} left`);
  const pinKeys = psql(DB_URL, "select count(*) from player_data where player_name ~ '-(2468|8642|1357)$'");
  check("no new PIN written into any player_name", pinKeys === "0", `${pinKeys} found`);
}

async function part1Only(browser) {
  const { context, page } = await openApp(browser);
  await signIn(page, "test alice", "1111");
  check("part 1 only: signs in with the existing PIN, no new-PIN screen", !(await text(page)).includes("Choose a new PIN"));
  check("part 1 only: holds a token", !!(await stored(page, "bowls_session_token")));
  await openMembers(page);
  check("part 1 only: directory through the server", (await text(page)).includes("07700 900002"));
  await context.close();
  const admin = await openApp(browser, { bowls_myname: "TEST CAROL", bowls_mypin: "3333" });
  await admin.page.waitForTimeout(1800);
  check("part 1 only: a pre-session admin phone gets a token", !!(await stored(admin.page, "bowls_session_token")));
  check("part 1 only: admin panel as before", (await admin.page.locator('button[title="Admin"]').count()) === 1);
  await admin.context.close();
  const still = psql(DB_URL, `select bowls_session_state('${preLockdownToken}')->>'status'`, { asAnon: true });
  check("part 1 only: an existing session is untouched", still === "ok", still);
}

async function main() {
  buildDatabase();
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  if (PART1_ONLY) await part1Only(browser);
  else await afterLockdown(browser);
  // 1.
  check("no direct call to a closed table", violations.length === 0, violations.join(", "));
  await browser.close();
  server.close();

  console.log(`\n  Directory lockdown, end to end${PART1_ONLY ? " — part 1 only" : ""}\n`);
  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}${r.ok || !r.detail ? "" : `   (${r.detail})`}`);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); server.close(); process.exit(1); });
