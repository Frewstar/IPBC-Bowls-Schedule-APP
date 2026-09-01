// ════════════════════════════════════════════════════════════════════════
//  What anyone holding the publishable key can read today.
//
//  The key below is the one that ships in the bundle — it is in
//  src/lib/supabase.js and in every deployed build. This script uses
//  nothing else: no service key, no session, no login. It is what an
//  attacker runs.
//
//  It is committed so that the SAME FILE, UNCHANGED, can be run after the
//  Step 4 revoke. A check that only runs after the fix proves nothing, so
//  the "before" run is the point of it. Expected results:
//
//    before Step 4 : player_data 200, 92 rows, 92 PINs recovered
//    after  Step 4 : player_data 401/permission denied, 0 rows
//
//  NOT YET RUN. The session this was written in had no network route to the
//  project — the environment's egress policy does not allow the Supabase
//  host — so the "before" numbers above are the expectation, not an
//  observation, and this file has never executed against anything. Run it
//  once now, from a machine that can reach the project, so there is a real
//  "before" to compare against. Until then the recorded before/after
//  evidence is test/track2.verify.sql, which exercises the same grants and
//  RLS through a database role and HAS been run — see check 8 there, which
//  performs the lockout-row delete and reports which side of the revoke it
//  is on.
//
//  Run:  node test/anon-pin-dump.mjs
//  Exit: 0 always — this reports, it does not assert.
// ════════════════════════════════════════════════════════════════════════

const URL  = "https://pjszrcaikpxdasknwyjb.supabase.co";
const KEY  = "sb_publishable_uxYyWwgMqVG-lButlv7ymg_zXRoHm29";

async function get(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch { /* not json — an error page */ }
  return { status: res.status, json, body };
}

// A NAME-PIN value yields its PIN as the last four characters. No cracking
// involved: the credential is stored in a readable column in plain text.
const pinOf = v => (/-[0-9]{4}$/.test(v || "") ? v.slice(-4) : null);

const targets = [
  { label: "player_data.player_name",    path: "player_data?select=player_name",              field: "player_name" },
  { label: "members.linked_cloudkey",    path: "members?select=linked_cloudkey",              field: "linked_cloudkey" },
  { label: "admins.cloud_key",           path: "admins?select=cloud_key,role",                field: "cloud_key" },
  { label: "login_lockouts (all rows)",  path: "login_lockouts?select=name,attempts",         field: "name" },
];

console.log(`\nAnonymous read with the publishable key — ${new Date().toISOString()}`);
console.log("─".repeat(72));

for (const t of targets) {
  const { status, json } = await get(t.path);
  if (!Array.isArray(json)) {
    // The revoked case. Report the code and the message verbatim — the
    // point of the "after" run is this line.
    console.log(`${t.label.padEnd(28)} HTTP ${status}  ${JSON.stringify(json)}`);
    continue;
  }
  const pins = json.map(r => pinOf(r[t.field])).filter(Boolean);
  console.log(`${t.label.padEnd(28)} HTTP ${status}  rows=${json.length}  PINs recovered=${pins.length}`);
}

console.log("─".repeat(72));
// Deliberately prints no PIN and no name. The counts are the finding; the
// values are the thing we are trying to stop being readable, and printing
// them into a terminal log would be doing the attacker's filing for them.
console.log("Values withheld by design — counts are the finding.\n");
