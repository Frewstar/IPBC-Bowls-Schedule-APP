# IPBC Bowls — SQL migrations

Every migration that lives in this repository, in the order it should be applied.
Each one is written to be safe to run more than once.

## What is and isn't here

These are the migrations written alongside the app code. **The earlier schema work is not in the repo** — `001` (the `player_data` rework that added `id`, `name_key` and `pin_hash`, the `player_data_backfill_keys` trigger, and `bowls_is_admin` / `bowls_name_key` / `bowls_sign_in` / `bowls_register` / `bowls_save_player`), the planned `002` / `002b` lockdown, `members.linked_player_id`, and this morning's `club_id` columns were all applied directly in the Supabase SQL editor. If you want those in version control too, export them and they can be added here.

## Order and status

| # | Migration | What it does | Status |
|---|---|---|---|
| 1 | `20260722_live_games.sql` | Live games | Applied — live games are working |
| 2 | `20260723_live_games_players_location.sql` | Disciplines, location and players | Applied — live games are working |
| 3 | `20260829_live_games_scheduled.sql` | Scheduled fixtures | Check — needed for the Upcoming section |
| 4 | `20260830_admin_reset_pin.sql` | Admin PIN reset | Check — needed for the Reset PIN screen |
| 5 | `20260830_live_games_ends.sql` | Games played over set ends | **Not yet applied** — written today |

Status is my best understanding from our sessions — worth confirming against the database rather than taking on trust.

---

## 1. Live games

**File:** `supabase/migrations/20260722_live_games.sql`  
**Status:** Applied — live games are working

Creates `live_games`, its RLS policies and the realtime publication. This is the base — everything below assumes it has run.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  live score updates for representative / club matches
--  Run this once in the Supabase SQL editor for the app's project.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.live_games (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  title             text,                              -- occasion / competition, e.g. "Ayrshire Cup"
  home_team         text not null default 'IPBC',
  away_team         text not null default '',
  venue             text default '',                   -- 'home' | 'away' | ''
  format            text not null default 'rinks',     -- 'rinks' | 'single'
  status            text not null default 'live',      -- 'live' | 'finished'
  rinks             jsonb not null default '[]'::jsonb, -- [{ "id":"r1", "label":"Rink 1", "home":0, "away":0 }]
  home_score        integer not null default 0,        -- used when format = 'single'
  away_score        integer not null default 0,
  creator_cloudkey  text,                              -- who set the game up (NAME-PIN)
  creator_name      text,
  last_updated_by   text                               -- name of the last person to change the score
);

-- Keep results sorted with the newest activity first.
create index if not exists live_games_updated_idx on public.live_games (updated_at desc);

-- ── Access ────────────────────────────────────────────────────────────────
-- The app talks to Supabase with the publishable (anon) key, exactly like the
-- other tables in this project (members, draws, tournaments …). Edit rights are
-- enforced in the app (creator + admins only); these policies simply let the
-- anon key read/write the row like everything else.
alter table public.live_games enable row level security;

drop policy if exists "live_games public read"   on public.live_games;
drop policy if exists "live_games public insert" on public.live_games;
drop policy if exists "live_games public update" on public.live_games;
drop policy if exists "live_games public delete" on public.live_games;

create policy "live_games public read"   on public.live_games for select using (true);
create policy "live_games public insert" on public.live_games for insert with check (true);
create policy "live_games public update" on public.live_games for update using (true) with check (true);
create policy "live_games public delete" on public.live_games for delete using (true);

-- ── Realtime ──────────────────────────────────────────────────────────────
-- Stream row changes to every connected phone (this is what makes it "live").
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'live_games'
  ) then
    alter publication supabase_realtime add table public.live_games;
  end if;
end $$;
```

---

## 2. Disciplines, location and players

**File:** `supabase/migrations/20260723_live_games_players_location.sql`  
**Status:** Applied — live games are working

Adds `discipline`, `location`, `home_players` and `away_players`.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  add discipline, location and player selections
--  Run this once in the Supabase SQL editor (after 20260722_live_games.sql).
-- ════════════════════════════════════════════════════════════════════════

-- What kind of game: 'singles' | 'pairs' | 'triples' | 'rinks' | 'team'
alter table public.live_games add column if not exists discipline text not null default 'team';

-- Where it's being played (free text — e.g. "Saltcoats BC, Ardrossan").
alter table public.live_games add column if not exists location text default '';

-- Who's playing (arrays of member names), e.g. ["A FREW", "T SMITH"].
alter table public.live_games add column if not exists home_players jsonb not null default '[]'::jsonb;
alter table public.live_games add column if not exists away_players jsonb not null default '[]'::jsonb;
```

---

## 3. Scheduled fixtures

**File:** `supabase/migrations/20260829_live_games_scheduled.sql`  
**Status:** Check — needed for the Upcoming section

Adds `starts_at` and an index. `status` gains a third value, `'scheduled'` — no DDL for that, the column is plain text with no check constraint.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  scheduled fixtures
--  Run this once in the Supabase SQL editor (after 20260723_…_location.sql).
-- ════════════════════════════════════════════════════════════════════════

-- When the game is due to start. Null means "no start time" — which is what
-- every game created before this migration has, and what the app shows for a
-- game started on the spot.
alter table public.live_games add column if not exists starts_at timestamptz;

-- status gains a third value, 'scheduled', alongside 'live' and 'finished'.
-- The column is plain text with no check constraint, so there is no DDL for
-- the value itself. Existing rows keep status = 'live' (not null default).
--
-- 'scheduled' → the fixture is announced but not under way. The app shows it
--               in an Upcoming section and never renders it as live, however
--               long ago starts_at passed. Only a person moves it on: the
--               "Go live" button, or the first change to the score.
-- 'live'      → under way, score is being kept.
-- 'finished'  → played out.

-- Upcoming games are listed soonest-first, unlike live and finished games
-- which are listed by most recent activity.
create index if not exists live_games_starts_at_idx
  on public.live_games (starts_at)
  where starts_at is not null;
```

---

## 4. Admin PIN reset

**File:** `supabase/migrations/20260830_admin_reset_pin.sql`  
**Status:** Check — needed for the Reset PIN screen

Adds `bowls_admin_reset_pin`, a SECURITY DEFINER function that moves `player_data.player_name` and `player_data.pin_hash` together, repoints `members.linked_cloudkey` and clears any lockout.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  ADMIN PIN RESET
--  Run this once in the Supabase SQL editor (after migration 001).
--
--  A member who forgets their PIN currently has no way back in. This adds a
--  single SECURITY DEFINER function so an admin can set a new one without the
--  PIN ever passing through the client's hands, and without anyone reading the
--  old one out of the table.
--
--  The PIN lives in two places and they must move together:
--    player_data.player_name  — "NAME-PIN" in clear, the sign-in key
--    player_data.pin_hash     — bcrypt, added by 001
--  Updating one without the other locks the member out of their own account.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.bowls_admin_reset_pin(
  p_admin_name text,
  p_admin_pin  text,
  p_member_id  text,
  p_new_pin    text
)
returns jsonb
language plpgsql
security definer
-- Explicit search_path: a SECURITY DEFINER function must not resolve names
-- through the caller's. extensions is where Supabase keeps pgcrypto (crypt,
-- gen_salt).
set search_path = public, extensions
as $$
declare
  v_member    record;
  v_account   record;
  v_name_part text;
  v_new_key   text;
begin
  -- ── 1. the new PIN has to be a PIN ──────────────────────────────────────
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'status',  'bad_pin',
      'message', 'A PIN must be exactly 4 digits.');
  end if;

  -- ── 2. the caller proves who they are, on every reset ───────────────────
  -- Deliberately not a trusted flag from the client: the admin re-enters
  -- their own PIN and it is checked here.
  if coalesce(p_admin_name, '') = ''
     or coalesce(p_admin_pin, '') = ''
     or not public.bowls_is_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_admin',
      'message', 'That name and PIN did not match an admin account.');
  end if;

  -- ── 3. find the member on the roster ────────────────────────────────────
  -- id is cast to text so this works whether members.id is uuid or text.
  select m.id, m.name, m.linked_player_id
    into v_member
    from public.members m
   where m.id::text = p_member_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_member',
      'message', 'That member is not on the roster.');
  end if;

  if v_member.linked_player_id is null then
    return jsonb_build_object(
      'status',  'no_account',
      'message', v_member.name || ' has not set up an app account yet, so there is no PIN to reset.');
  end if;

  -- ── 4. find their account and hold the row ──────────────────────────────
  select d.id, d.player_name
    into v_account
    from public.player_data d
   where d.id = v_member.linked_player_id
   for update;

  if not found then
    return jsonb_build_object(
      'status',  'no_account',
      'message', 'The account linked to ' || v_member.name || ' no longer exists.');
  end if;

  -- ── 5. build the new key ────────────────────────────────────────────────
  -- Keep the name exactly as the member typed it when they signed up — the
  -- brief is that nothing changes except the PIN, and rebuilding the name from
  -- the roster row could change the key they sign in with. Strips the last
  -- "-nnnn" only, so a hyphenated name survives.
  v_name_part := regexp_replace(v_account.player_name, '-[^-]*$', '');

  if v_name_part = '' or v_name_part = v_account.player_name then
    return jsonb_build_object(
      'status',  'bad_account',
      'message', 'That account key is not in NAME-PIN form and needs fixing by hand.');
  end if;

  v_new_key := v_name_part || '-' || p_new_pin;

  -- ── 6. refuse a collision rather than trampling another account ─────────
  -- Excludes the target row itself, so re-issuing the same PIN is allowed.
  if exists (
    select 1 from public.player_data d
     where d.player_name = v_new_key
       and d.id <> v_account.id
  ) then
    return jsonb_build_object(
      'status',  'collision',
      'message', 'Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end if;

  -- ── 7. move both copies of the PIN in one statement ─────────────────────
  -- name_key is deliberately not set: it derives from the NAME, and the name
  -- is not changing. Leaving it alone is correct whether the
  -- player_data_backfill_keys trigger fills these only when absent or
  -- recomputes them on every write — in the latter case it derives the same
  -- values from the new player_name anyway.
  begin
    update public.player_data
       set player_name = v_new_key,
           pin_hash    = crypt(p_new_pin, gen_salt('bf')),
           updated_at  = now()
     where id = v_account.id;
  exception
    -- Belt and braces for the gap between the check above and this write.
    when unique_violation then
      return jsonb_build_object(
        'status',  'collision',
        'message', 'Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end;

  -- ── 8. keep the roster link pointing at the renamed account ─────────────
  -- A trigger on members maintains linked_player_id from linked_cloudkey.
  update public.members
     set linked_cloudkey = v_new_key
   where id = v_member.id;

  -- ── 9. a reset clears the slate: failed attempts and any lockout go ─────
  delete from public.login_lockouts
   where upper(name) in (upper(v_name_part), upper(v_member.name));

  -- ── 10. hand the new PIN back so the admin can read it out ──────────────
  return jsonb_build_object(
    'status',       'ok',
    'member_name',  v_member.name,
    'account_name', v_name_part,
    'new_key',      v_new_key,
    'new_pin',      p_new_pin);
end;
$$;

-- The app calls this with the publishable (anon) key, exactly like the other
-- RPCs. It authorises itself in step 2 — being able to call it is not being
-- allowed to use it.
revoke all on function public.bowls_admin_reset_pin(text, text, text, text) from public;
grant execute on function public.bowls_admin_reset_pin(text, text, text, text) to anon, authenticated;

comment on function public.bowls_admin_reset_pin(text, text, text, text) is
  'Admin-authorised PIN reset. Verifies the caller with bowls_is_admin, then '
  'moves player_data.player_name and player_data.pin_hash together, repoints '
  'members.linked_cloudkey and clears any lockout. Returns a jsonb status.';
```

---

## 5. Games played over set ends

**File:** `supabase/migrations/20260830_live_games_ends.sql`  
**Status:** **Not yet applied** — written today

Adds `ends_total` and `ends_played` plus a sanity check constraint. Needed for best-of-15-ends games.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  games played over a set number of ends
--  Run this once in the Supabase SQL editor.
--
--  Singles is normally played to 21 shots. Pairs, triples and rinks are
--  usually played over a fixed number of ends — "best of 15" — and the
--  scoreboard needs to show how far through the game is, not just the shots.
-- ════════════════════════════════════════════════════════════════════════

-- How many ends the game is played over. Null means it isn't limited by ends
-- (play to 21 shots), which is what every game created before this migration
-- is, and what the app assumes when the column is empty.
alter table public.live_games add column if not exists ends_total integer;

-- How many have been played so far. Always present so the scoreboard never has
-- to guard against null when it counts up.
alter table public.live_games add column if not exists ends_played integer not null default 0;

-- Guard against a typo putting the game at end 40 of 15, or at a negative end.
alter table public.live_games drop constraint if exists live_games_ends_sane;
alter table public.live_games add constraint live_games_ends_sane check (
  (ends_total is null or ends_total between 1 and 30)
  and ends_played >= 0
  and (ends_total is null or ends_played <= ends_total)
);
```

---

## Verifying what has actually run

Run these in the SQL editor to check the state rather than guessing:

```sql
-- Which live_games columns exist?
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'live_games'
 order by ordinal_position;

-- Which bowls_* functions exist?
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'bowls%'
 order by p.proname;

-- Constraints on live_games
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.live_games'::regclass
 order by conname;
```
