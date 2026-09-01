# IPBC Bowls — SQL migrations

Every migration that lives in this repository, in the order it should be applied.
Each one is written to be safe to run more than once.

## What is and isn't here

**Everything is here now.** Until 31 August this said the opposite: the earlier
schema work — `001` (the `player_data` rework that added `id`, `name_key` and
`pin_hash`, the `player_data_backfill_keys` trigger, and `bowls_is_admin` /
`bowls_name_key` / `bowls_sign_in` / `bowls_register` / `bowls_save_player`),
`members.linked_player_id`, the `club_id` columns, and the core tables
themselves — had only ever been applied in the Supabase SQL editor, in
twenty-seven ledger entries with no file behind any of them.

`20260619_baseline_pre_repo_schema.sql` closes that. It was reconstructed from
the live database by introspection and it runs first, so an empty Supabase
project can be taken to exactly what production has by running this folder in
filename order. That claim is tested rather than asserted — see **Rebuilding
from scratch** at the foot of this file.

Two things stay deliberately outside the folder, and both are correct: the
planned `002` / `002b` lockdown (not written yet), and this club's own data —
the tournaments, the roll of honour, the roster, the admin rows. A new club
starts with empty tables and fills them in.

## Order and status

Run them in filename order. Every one is idempotent.

| # | Migration | What it does | Status |
|---|---|---|---|
| 1 | `20260619_baseline_pre_repo_schema.sql` | **The schema that was never written down** — core tables, `members_public`, ten functions, both triggers, RLS and grants | Applied 31 Aug, and a no-op against production by construction |
| 2 | `20260722_live_games.sql` | Live games | Applied — live games are working |
| 3 | `20260723_live_games_players_location.sql` | Disciplines, location and players | Applied — live games are working |
| 4 | `20260829_live_games_scheduled.sql` | Scheduled fixtures | Applied — `starts_at` and its index are on `live_games` |
| 5 | `20260830_admin_reset_pin.sql` | Admin PIN reset | Applied — but see #9, which supersedes the function this file creates |
| 6 | `20260830_club_events.sql` | What's On — club social events | Applied — table, columns, duplicate guard and policies all confirmed against the database |
| 7 | `20260830_club_id_on_live_games.sql` | `club_id` on `live_games`, the one table the baseline cannot reach | Applied 31 Aug — found by the rebuild test, not by looking |
| 8 | `20260830_live_games_ends.sql` | Games played over set ends | Applied — the columns and the check constraint are on `live_games` |
| 9 | `20260830_reset_pin_keeps_admin_row_in_step.sql` | Brings `bowls_admin_reset_pin` up to the live body — the `admins.cloud_key` update that #5 is missing | Was already live (ledger `20260830095508`); the **file** was missing until 31 Aug |
| 10 | `20260831_club_events_end_time.sql` | The time an event finishes | Applied — and registered in the ledger on 31 Aug, which it never had been |
| 11 | `20260831_grant_admin.sql` | Granting **and approving** admin actually work; `admins_player_id_uniq`; `admin_requests` stops carrying a PIN | Applied — verified live: five functions, the oracle closed to `anon`, `admin_requests` reshaped, both indexes, demotion guard refusing |
| 12 | `20260901_admin_role_layers.sql` | Admin role layers — `bowls_admin_role`, a CHECK on `admins.role`, `events_admin` | Applied 31 Aug, 17:04 UTC as `admin_role_layers` — verified live: the four roles in the CHECK, `anon` can execute `bowls_admin_role` and still cannot execute `bowls_is_super_admin`, lockout counting increments and clears |
| 13 | `20260902_event_posters.sql` | Posters on What's On — `club_events.poster_path`, the `event-posters` bucket, ticketed writes, the Open Graph share link | Applied 31 Aug, 20:20 UTC as `event_posters`, plus `20260831205042 event_posters_revoke_ticket_grants` at 20:50 — verified live: the column, the bucket with its limits, an upload round-trip, and an upload without a ticket refused |
| 14 | `20260903_live_games_creator_member_id.sql` | The sign-in PIN comes out of `live_games` — `creator_member_id`, backfilled, and `creator_cloudkey` cleared on finished games | Applied 31 Aug, 21:59 UTC as `live_games_creator_member_id` — ledger 43 rows before, 44 after |
| 15 | `20260904_poster_path_club_prefix.sql` | Poster objects get the club in front — `<club_id>/<event_id>/<file>.jpg`, club derived from the account; `bowls_poster_remove_ticket` taught both shapes | Applied 1 Sep, 09:31 UTC as `poster_path_club_prefix` — ledger 44 rows before, 45 after. Storage policies deliberately unchanged |

Status is no longer "my best understanding from our sessions". Every row above was
checked against `information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies`,
`pg_get_functiondef`, `pg_trigger`, `storage.buckets` and `storage.objects` on
31 August 2026, and the whole folder was replayed into an empty database and
diffed against production object by object.

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
**Status:** Applied — and superseded by
`20260830_reset_pin_keeps_admin_row_in_step.sql`, which runs after it

> **This file is one statement behind the live function, and that is now
> handled.** It used to say "STALE, do not re-run it", which protected a human
> reading the README and did nothing for anyone replaying the folder. The
> missing statement is:
>
> ```
> update public.admins set cloud_key = v_new_key where player_id = v_account.id;
> ```
>
> `admins_pkey` is on `cloud_key`, so resetting an admin's PIN changes their
> primary key. Without that line the admins row is left on the old key and they
> silently lose admin.
>
> `20260830_reset_pin_keeps_admin_row_in_step.sql` sorts immediately after this
> file and re-creates the function with the live body, so running the folder in
> order now ends up correct whether or not anyone reads this box. The database
> has recorded that fix since 30 August (ledger `20260830095508`); it was the
> *file* that was missing. This one is left as it was written, on purpose — it
> is the history, and the next file is the correction.


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
**Status:** Applied — `ends_total` and `ends_played` are on `live_games`

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

## 6. What's On — club social events

**File:** `supabase/migrations/20260830_club_events.sql`  
**Status:** Applied — checked against the database, not assumed: the table exists with
all ten columns, `club_events_no_dupes` is on `(club_id, event_date, lower(title))`,
`club_id` defaults to IPBC, the `start_time` format check is in place, RLS is on with
the four `using(true)` policies, and the table is correctly *not* in the realtime
publication.

Creates `club_events`: one row per night, for the band, the karaoke and one-off
socials. A weekly run is generated into ordinary rows by the app when an admin
sets it up — there is no recurrence rule in this table and nothing is expanded
on read, which is what makes cancelling a single night an edit to one row.

Three things worth knowing before you run it:

- **`event_date` is a `date` and `start_time` is `text`.** Not a `timestamptz`.
  The clocks change on the last Sunday in March, inside the season, so adding a
  week to an instant puts every night after that Sunday an hour out. "Saturday,
  8pm" is 8pm on the clock in November and in April alike.
- **`cancelled` is a column, not a delete.** A cancelled night stays in the
  table and stays on the screen with a line through it. Removing the row tells a
  member expecting a band nothing at all.
- **`club_events_no_dupes`** — unique on `(club_id, event_date, lower(title))`.
  Generating a run is one tap and one tap is easy to make twice; `club_fixtures`
  carries a duplicate row from exactly that.

Applied against a scratch Postgres 16 before being handed over: the DDL runs
clean, `club_id` defaults to IPBC without the client supplying it, a repeated
`(date, title)` is refused case-insensitively, `'8pm'` and `'25:00'` are refused
by the time check, and cancelling leaves the row in place.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  CLUB EVENTS  —  What's On: the band, the karaoke, and one-off nights
--  Run this once in the Supabase SQL editor.
--
--  One row per night. A weekly series is generated into ordinary rows when
--  the admin sets it up — there is no recurrence rule stored here and
--  nothing is expanded on read. That is the point: cancelling Christmas Eve
--  is then an edit to one row rather than a feature nobody built.
--
--  This is deliberately NOT club_fixtures. That table is match-shaped —
--  Fixtures.jsx renders a Home/Away pill from `venue` and "{n} rinks" from
--  `rinks` — so a band night listed there would carry an "Away" badge and a
--  blank rink count.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.club_events (
  id          uuid primary key default gen_random_uuid(),

  -- Every table in this database carries club_id, defaulted to IPBC so the
  -- client never has to supply it. Same shape as members, live_games and the
  -- rest, so this table doesn't have to be retrofitted when the app goes
  -- multi-club.
  club_id     uuid not null references public.clubs(id)
                default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid,

  title       text not null,                    -- "Band", "Karaoke", "Christmas Party"
  detail      text,                             -- optional line under it — who's playing, ticket price

  -- A DATE and a local clock time held as TEXT ("20:00"). Deliberately not a
  -- timestamptz.
  --
  -- The clocks go forward on the last Sunday in March, which is inside the
  -- season. Generating a series by adding 7 * 86400 seconds to a timestamptz
  -- puts every date after that Sunday an hour out — a band advertised at 9pm
  -- because the app did the arithmetic in UTC. "Saturday, 8pm" means 8pm on
  -- the clock on the wall, in March and in July alike, so that is what is
  -- stored. Nothing here is ever converted between zones.
  event_date  date not null,
  start_time  text,

  -- A cancelled night stays in the table and stays on the screen, struck
  -- through. Deleting it tells a member expecting a band precisely nothing;
  -- they turn up to a shut club. This is why cancellation is a column and not
  -- a delete.
  cancelled   boolean not null default false,

  -- Ties the generated rows of one series together, so "every Saturday from
  -- November to March" can be removed or re-priced in one go. Null on a
  -- one-off. Not a foreign key — there is no series table, and there is not
  -- meant to be one.
  series_id   uuid,

  created_by  text,                             -- display name of the admin who set it up
  created_at  timestamptz not null default now()
);

-- Catch a clock time that isn't one, so a typo can't put "8" or "8pm" in a
-- column the app parses as HH:MM. Null is allowed: an all-day or
-- time-unannounced event is a real thing.
alter table public.club_events drop constraint if exists club_events_start_time_format;
alter table public.club_events add constraint club_events_start_time_format check (
  start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- ── The duplicate guard ───────────────────────────────────────────────────
-- Generating a series is one tap, and one tap is easy to make twice — a slow
-- connection, a nervous second press, an admin who isn't sure the first one
-- took. club_fixtures carries a duplicate row from exactly that, so this table
-- refuses it at the database rather than trusting the app to check.
--
-- lower(title) so "Band" and "band" collide, which is what an admin means.
create unique index if not exists club_events_no_dupes
  on public.club_events (club_id, event_date, lower(title));

-- What's On reads a date window for one club, and that is the only read there is.
create index if not exists club_events_club_date_idx
  on public.club_events (club_id, event_date);

-- Editing or removing a whole series.
create index if not exists club_events_series_idx
  on public.club_events (series_id)
  where series_id is not null;

-- ── Access ────────────────────────────────────────────────────────────────
-- Same as every other table in this project: the app talks to Supabase with
-- the publishable (anon) key, which ships inside the JavaScript bundle, and
-- these policies let that key read and write.
--
-- Being plain about it: "admin only" for creating events is enforced in the
-- app's UI and nowhere else. Anyone who reads the bundle can get the key and
-- write to this table directly. That is the same exposure every other table
-- here already has, and it is what the 002b lockdown is for. Do not read
-- these policies as security.
alter table public.club_events enable row level security;

drop policy if exists "club_events public read"   on public.club_events;
drop policy if exists "club_events public insert" on public.club_events;
drop policy if exists "club_events public update" on public.club_events;
drop policy if exists "club_events public delete" on public.club_events;

create policy "club_events public read"   on public.club_events for select using (true);
create policy "club_events public insert" on public.club_events for insert with check (true);
create policy "club_events public update" on public.club_events for update using (true) with check (true);
create policy "club_events public delete" on public.club_events for delete using (true);

-- ── Not added to the realtime publication, on purpose ─────────────────────
-- live_games is in supabase_realtime because a score changes while you are
-- watching it. A Saturday night band does not. What's On refetches whenever
-- the app comes to the foreground, which is the moment a member actually
-- looks — and unlike a socket, that keeps working after the phone has been in
-- a pocket for three days.
```

---

## 7. The time an event finishes

**File:** `supabase/migrations/20260831_club_events_end_time.sql`  
**Status:** **Not yet applied** — written today

Adds `end_time text` to `club_events`. Every flyer the club puts out advertises a
window rather than a start — the Sunday karaoke is "4-9", the Christmas do is
"4-8PM" — and with only `start_time` the app said "Karaoke, 4pm" and left a
member guessing whether it was worth turning up at seven.

Text in the same `HH:MM` form as `start_time`, for the same reason: a time on the
clock, not an instant. Null means the finish isn't advertised, which is what
every row created before this migration has.

There is deliberately **no** constraint that `end_time` be later than
`start_time`. A band on until midnight finishes at `00:00`, and a late one at
`01:00` — both sort *before* an 8pm start. These are wall-clock times with no
date attached, so "later" isn't a comparison this column can make, and requiring
it would reject exactly the nights that run latest.

Applied against a scratch Postgres 16 before being handed over: the DDL runs
clean, a night ending `00:00` after a `20:00` start is accepted, `'9pm'` is
refused by the format check, and a row with no finish time is still valid.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  CLUB EVENTS  —  the time it finishes, as well as the time it starts
--  Run this once in the Supabase SQL editor (after 20260830_club_events.sql).
--
--  Every flyer the club puts out advertises a window, not a start: the
--  Sunday karaoke is "4-9", the Christmas do is "4-8PM". With only a start
--  time the app says "Karaoke, 4pm" and leaves a member guessing whether
--  it is worth turning up at seven.
-- ════════════════════════════════════════════════════════════════════════

-- Text, in the same 24-hour "HH:MM" form as start_time, for the same reason:
-- it is a time on the clock on the wall, not an instant. See the comment on
-- event_date in 20260830_club_events.sql — the clocks change inside the
-- season and 8pm has to stay 8pm either side of it.
--
-- Null means the finish isn't advertised, which is most one-off nights and
-- every event created before this migration.
alter table public.club_events add column if not exists end_time text;

-- Same format guard as start_time, so a typo can't put "9" or "9pm" in a
-- column the app parses as HH:MM.
alter table public.club_events drop constraint if exists club_events_end_time_format;
alter table public.club_events add constraint club_events_end_time_format check (
  end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- Deliberately NO constraint that end_time must be later than start_time.
-- A band on until midnight finishes at 00:00 and a late night at 01:00, both
-- of which sort before an 8pm start. These are wall-clock times with no date
-- attached, so "later" is not a comparison this column can make. Requiring
-- end > start would reject exactly the nights that run latest.

```

---

## 8. Granting admin actually works

**File:** `supabase/migrations/20260831_grant_admin.sql`  
**Status:** **Not yet applied** — written today

The app granted admin by writing `cloud_key = 'PENDING-<name>'` with
`player_id = null`, and nothing ever filled `player_id` in. `bowls_is_admin()`
finds the row **by `player_id`**, so every grant made that way was inert — the
person appeared in the admin list with no rights at all, and nothing said so.

The rows that were in that state have since been repaired by hand, so this
migration has nothing to clean up; it stops the next one being created. The
`PENDING-`/`APPROVED-` clean-up inside the grant is defensive and a no-op when
there is nothing to clear.

Adds three functions and one index. It changes neither `bowls_is_admin` nor the
`admins` table's columns, and it does **not** touch `bowls_admin_reset_pin` —
see the warning on section 4.

- **`bowls_is_super_admin(name, pin)`** — handing out rights is a super admin's
  job, and `bowls_is_admin` returns true for plain admins too.
- **`bowls_grant_admin(admin_name, admin_pin, member_id, role)`** — resolves the
  member through `members.linked_player_id` **only**, never by matching names,
  and writes the real `player_id` and `cloud_key`. Otherwise refuses with a
  plain-English reason — `no_account`, `not_linked`, `ambiguous`, `bad_role`,
  `not_super_admin`, `no_member` — and writes nothing.
- **`bowls_revoke_admin(admin_name, admin_pin, cloud_key)`** — deletes every row
  resolving to the same account, not just the one key. Deleting by `cloud_key`
  alone was the other half of the problem: one person could hold two rows, and
  revoking the visible one left the other granting rights. Won't revoke a super
  admin.
- **`admins_player_id_uniq`** — one account, one admin row, as a rule of the
  table rather than a habit of one function. This is the prerequisite for
  eventually dropping `admins.cloud_key`, which can't go while it is the primary
  key. Partial on `player_id is not null`, so legacy unlinked rows are outside
  the rule. **The primary key is deliberately not moved here** — that is 002b's
  final step and needs its own migration.

Verified against a scratch Postgres 16 with **synthetic** fixtures — not a copy
of the live club, which no longer has any unlinked admin rows, so a
production-shaped fixture would assert a state that no longer exists and would
pass locally then fail after deploy. Every refusal returns its status and writes
nothing; a grant resolves the linked account and not a same-named stray; the
legacy unlinked row is cleared; re-granting changes the role without
duplicating; a second row for one account is refused by the new index while
null-`player_id` rows still coexist; a plain admin can neither grant nor revoke;
and one revoke clears a two-rows-one-person case.

The ambiguity branch is covered only by a synthetic pair sharing a `name_key`.
`player_data_name_key_idx` is non-unique and there are no duplicates live today,
so the branch is correct and currently unreachable with real data — the fixture
is the only thing that exercises it, and is kept for that reason.

### The admin request queue, in the same migration

`approveAdminRequest` had the identical defect — `cloud_key = 'APPROVED-<name>'`
with no `player_id`, so approving a request produced the same inert row.
**`bowls_approve_admin_request`** resolves the account, checks the caller, and
refuses in words: `no_request`, `no_account`, `not_linked`, `not_super_admin`.

The table's shape changes too, while it holds **zero rows** — the cheapest
moment there will ever be:

- **`player_id uuid references player_data(id)`** added, and written at request time.
- **`cloud_key` dropped.** It held the requester's `NAME-PIN` — their sign-in
  credential — in a table that is world-readable *and* world-writable.
- **`requested_role text`** added, and **`admin_requests_player_id_uniq`**.
  The Settings screen has always written this field and always upserted;
  neither a column of that name nor any unique index existed, so **every
  request insert has failed** and the queue has never held a row. That is why
  it is empty, and why nobody ever noticed the approval bug.

  The conflict key is **`player_id`, not `player_name`**. `player_name` arrives
  on an unauthenticated insert, so keying the upsert on it would let anyone
  replace anyone else's pending request by sending the same name — a denial of
  service on the approval queue. `player_id` is the identity that matters and
  the only one a member can clobber for themselves.

#### Who owns a committee title

**`members.position` is the source of truth.** It is what the Club tab reads and
what the committee list is built from, it is set on the roster by an admin, and
it is the only place a person's title lives.

**`admin_requests.requested_role` is not a title.** It is the line a member typed
when asking for access — "the role this person is asking for", nothing more. It
is named `requested_role` rather than `role_title` precisely so the two cannot be
mistaken for each other, and the admin panel renders it as *"asks to help
with: …"* rather than as a badge.

**Approving a request writes nothing to `members.position`.** A committee title
is set on the roster, by hand, deliberately. If approval also stamped a title,
the two would drift the first time somebody was made an admin for a role they
don't formally hold — and a member whose badge says one thing in the Club tab and
another in the admin panel is a support call nobody wants.

There is deliberately **no `ambiguous` branch** on approval, unlike the grant. It
cannot arise: the request names an account by primary key, and
`members_linked_player_id_uniq` (already on the table) allows at most one roster
member per account. Unreachable by construction, not merely absent from today's
data — so there is nothing to cover, and a branch that can never run would be
worse than none.

The names the approver is shown come from the account and the roster, never from
`admin_requests.player_name` — that column arrives on an unauthenticated insert
and must not be able to put one member's name against another's account. That
holds in **both** places it matters: the pending queue resolves each row to the
roster member who owns the account named by `player_id`, and marks a row
*Unverified* when nothing can be resolved; and the approval message names the
account holder. What the approver reads before clicking is what approving will
actually do.

#### Why SQL-then-merge is safe here

Run the migration first, then merge. Dropping `admin_requests.cloud_key` would
normally break the deployed client in the window between the two steps — the
old bundle would still be inserting that column. It doesn't, and the reason is
worth writing down rather than rediscovering: **that insert already fails**, on
the missing `role_title`/`requested_role` column and the missing unique index for
its upsert. There is no working request path to break. Nothing regresses in the
window because nothing in it works today.

That is specific to this table. It is not a general licence to drop columns the
deployed client still writes.

### Guards added late, after review

Six problems were caught reviewing this migration before it ran. Worth listing,
because most of them fail silently:

1. **Super admin self-demotion.** Neither grant nor approve checked whether the
   *target* was a super admin. The delete-then-insert would have stripped the
   `super_admin` row and replaced it with a plain one — silently, reporting
   success, and unrecoverable, since the claim flow only reopens on a deleted
   row. Both now refuse with `is_super_admin`, the guard `bowls_revoke_admin`
   already had.

2. **`bowls_is_super_admin` was a PIN oracle.** A new function is EXECUTE-able
   by PUBLIC, so the bundled key could call it: a name and four digits in, a
   boolean out, no lockout, no failure counting, no delay — against the one
   account that can hand out admin. `admins` is world-readable, so the name to
   try is public too. Its EXECUTE is now revoked from `anon`, `authenticated`
   and `public`; the three SECURITY DEFINER functions call it internally as
   their owner, so nothing legitimate breaks.

   **`bowls_is_admin` deliberately keeps its grant.** The client calls it on
   every sign-in to decide whether to show the panel, so revoking it would lock
   every admin out. It is also the one that counts failed attempts into
   `login_lockouts`. The exposed one has the mitigation; the silent one is now
   closed.

3. **`requested_role` was ignored.** Approval selected it and then hardcoded
   `'admin'`, so someone asking for Draw Admin got full Admin and the approver
   was never told. It is now validated against `('admin','draw_admin')`,
   defaults to `admin` for anything else, and the confirmation says which.

4. **Revoke took a PIN.** `p_cloud_key` is `NAME-PIN`, so the client had to read
   another admin's credential out of the world-readable `admins` table and put
   it in a request payload — the pattern being removed everywhere else here.
   Now `p_player_id uuid`, made unique by `admins_player_id_uniq` in this same
   migration.

5. **A primary key collision.** `admins_pkey` is on `cloud_key`. Both deletes
   matched `player_id` and the two placeholder patterns but not the `cloud_key`
   about to be inserted, so a legacy row holding that key with a null
   `player_id` would survive and the insert would raise — an unhandled error
   rather than a message. Both deletes now clear it.

6. **`club_id` on the inserts.** Checked rather than assumed: `admins.club_id`
   is `NOT NULL` **with** a default, so omitting it is fine.

And one found while testing the fixes: the `revoke execute` statement was
written as `revoke ... from anon, authenticated`, which **raises where those
roles don't exist** and would have aborted the migration in the middle, leaving
the functions created and the `admin_requests` changes and approval function
never applied. It is now a `DO` block that revokes from `public` and then from
each role that actually exists.

### Two things left for 002b

1. **`admin_requests` still has an `open` policy** — `ALL`, `public`,
   `using(true) with check(true)`. Anyone with the publishable key can read the
   queue, add to it, or empty it. **Not tightened here on purpose:** the deployed
   client still writes to this table directly, so closing it needs the same
   client-first ordering as the rest of 002b — ship a client that goes through an
   RPC, wait for the phones to pick it up, then close the policy. Closing it
   first breaks the request button for everyone still on the old bundle.

2. **`bowls_grant_admin` and `bowls_approve_admin_request` are single-club by
   assumption.** Both find a member on id with no `club_id` predicate, and both
   let the inserted `admins` row take `club_id` from the column default, which
   is hardcoded to Irvine Park. Dormant while one club exists; wrong the day a
   second one does — a super admin at one club could grant over another club's
   member, and the row would land under the wrong club silently rather than
   erroring. Marked `TODO(multi-club)` in the file, on both lookups and in its
   own to-do section. Fix when club two is onboarded: resolve the caller's club
   from their own `admins` row, require `members.club_id` to match, and set
   `club_id` explicitly on the insert.

3. **Filing a request is an unauthenticated public insert.** Nothing proves the
   person filing it is who the row says they are. It belongs with the RPC work,
   not with a check in the client — a client-side check is not a control while
   the key ships in the bundle.

**This does not make the `admins` table safe.** Its policies are still
`using (true)`, so anyone with the publishable key from the bundle can write to
it directly and go round these functions. Necessary, not sufficient — the
policies are 002b's job.

```sql
-- ════════════════════════════════════════════════════════════════════════
--  GRANTING AND REVOKING ADMIN
--  Run this once in the Supabase SQL editor (after 001 and the admins table).
--
--  The bug this fixes: the app granted admin by writing a row with
--    cloud_key = 'PENDING-' || <member name>,  player_id = null
--  and nothing ever filled player_id in. bowls_is_admin() finds the admins
--  row BY player_id, so every grant made this way was inert — the person
--  appeared in the admin list and had no rights whatsoever, with nothing
--  shown to anyone to say so. A silent no-op that looks like it worked.
--
--  The rows that were in that state have since been repaired by hand, so
--  this migration has nothing to clean up. It stops the next one being
--  created. The 'PENDING-'/'APPROVED-' clean-up in the grant below is
--  defensive: it clears such a row if one is ever made again, and is a
--  no-op when there is none.
--
--  Two things change here, and neither of them touches bowls_is_admin or
--  the admins table's shape:
--
--  1. The member is resolved to a real account AT GRANT TIME, through the
--     roster link (members.linked_player_id), and the row is written with
--     the real player_id and cloud_key. If they can't be resolved, the
--     grant is REFUSED and says why. Nothing is written.
--
--  2. Both operations are SECURITY DEFINER and check the caller is a
--     super_admin here, on the server. The app's publishable key ships
--     inside the JavaScript bundle, so a check in the client is not a
--     control — anyone with the bundle could write to admins directly.
--     These functions are the control; see the note at the foot about
--     what still needs doing to make that stick.
--
--  Resolution goes through the roster link and NOT through matching names.
--  Name matching is what produced this class of bug in the first place, and
--  bowls_register deliberately allows two accounts under one name with
--  different PINs — that is how two members with the same initials are told
--  apart. Names are used below only to explain a refusal, never to pick.
-- ════════════════════════════════════════════════════════════════════════

-- ── NOT touched here: bowls_admin_reset_pin ───────────────────────────────
-- The live bowls_admin_reset_pin is AHEAD of this repo's copy of it
-- (20260830_admin_reset_pin.sql) by one statement:
--
--     update public.admins set cloud_key = v_new_key where player_id = ...;
--
-- admins_pkey is on cloud_key, so resetting an admin's PIN changes their
-- primary key. Without that line the admins row is left pointing at the old
-- key and they silently lose admin — the same class of failure this file
-- exists to fix. Nothing here creates or replaces that function. If it ever
-- does need replacing, take the definition from the database
-- (pg_get_functiondef) and not from the repo file, which is stale.


-- ── Who is asking ─────────────────────────────────────────────────────────
-- Deliberately NOT bowls_is_admin: that returns true for 'admin' as well as
-- 'super_admin', and handing out admin rights is a super_admin's job. Left
-- bowls_is_admin alone rather than adding a role argument to it, so nothing
-- that already depends on it changes behaviour.
create or replace function public.bowls_is_super_admin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_id  uuid;
begin
  v_key := public.bowls_name_key(p_name);
  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return false;
  end if;

  select d.id into v_id
    from public.player_data d
   where d.name_key = v_key
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_id is null then
    return false;
  end if;

  return exists (
    select 1 from public.admins a
     where a.player_id = v_id and a.role = 'super_admin'
  );
end $$;


-- ── Grant ─────────────────────────────────────────────────────────────────
create or replace function public.bowls_grant_admin(
  p_admin_name text,
  p_admin_pin  text,
  p_member_id  text,
  p_role       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member     record;
  -- Plain variables, not a record: when the member has no roster link the
  -- select below never runs, and touching a field of a never-assigned record
  -- raises rather than returning null. That would have crashed on exactly the
  -- three refusal paths this function exists to report.
  v_account_id      uuid;
  v_account_name    text;
  v_account_display text;
  v_candidates int;
  v_names      text;
begin
  -- 1. the role has to be one we hand out. super_admin is deliberately not
  --    grantable here — there is a separate claim flow for that, and a
  --    super_admin who can mint super_admins is a one-way door.
  if coalesce(p_role, '') not in ('admin', 'draw_admin') then
    return jsonb_build_object(
      'status',  'bad_role',
      'message', 'Admin rights can only be granted as Admin or Draw Admin.');
  end if;

  -- 2. the caller proves who they are, here, on every grant
  if not public.bowls_is_super_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_super_admin',
      'message', 'Only a super admin can grant admin rights.');
  end if;

  -- 3. find the member on the roster
  --
  -- TODO(multi-club): single-club by assumption. The member is found on id
  -- alone, with no club_id predicate, so once a second club exists a super
  -- admin at one club could grant admin over another club's member by passing
  -- their id. The inserted row would also take club_id from the column
  -- default, which is hardcoded to Irvine Park, so it would land under the
  -- wrong club silently rather than erroring.
  -- Fix when club two is onboarded: resolve the caller's club from their own
  -- admins row, require members.club_id to match, and set club_id explicitly
  -- on the insert instead of relying on the default. Same change needed in
  -- bowls_approve_admin_request.
  select m.id, m.name, m.section, m.linked_player_id
    into v_member
    from public.members m
   where m.id::text = p_member_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_member',
      'message', 'That member is not on the roster.');
  end if;

  -- 4. resolve them to an account, through the roster link only
  if v_member.linked_player_id is not null then
    select d.id, d.player_name, d.display_name
      into v_account_id, v_account_name, v_account_display
      from public.player_data d
     where d.id = v_member.linked_player_id;
  end if;

  if v_account_id is null then
    -- Not resolved. Everything from here is about explaining why, so the
    -- person granting knows what to do next. Names are used to count and
    -- describe the candidates; they are never used to pick one.
    select count(*), string_agg(d.player_name, ', ' order by d.player_name)
      into v_candidates, v_names
      from public.player_data d
     where d.name_key = public.bowls_name_key(v_member.name);

    if v_candidates = 0 then
      return jsonb_build_object(
        'status',  'no_account',
        'message', v_member.name || ' hasn''t signed in to the app yet. Ask them to register, then grant admin.');
    elsif v_candidates = 1 then
      return jsonb_build_object(
        'status',  'not_linked',
        'message', v_member.name || ' has an app account but it isn''t linked to their name on the roster. '
                   || 'Ask them to link it when they next open the app, then grant admin.',
        'candidates', v_names);
    else
      return jsonb_build_object(
        'status',  'ambiguous',
        'message', v_candidates || ' accounts could be ' || v_member.name || ': ' || v_names || '. '
                   || 'Link the right one to them on the roster first, then grant admin.',
        'candidates', v_names);
    end if;
  end if;

  -- 5. The super admin's role is not changeable here. Without this the
  --    delete-then-insert below strips their super_admin row and replaces it
  --    with a plain admin one — silently, reporting success, and with no way
  --    back: the claim flow only reopens on a DELETED row. bowls_revoke_admin
  --    has always refused this; grant has to as well.
  if exists (select 1 from public.admins
              where player_id = v_account_id and role = 'super_admin') then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', v_member.name || ' is the super admin. Their role can''t be changed here.');
  end if;

  -- 6. Resolved. Clear anything already standing for this person before
  --    writing, so a re-grant can't leave a second row behind: the inert
  --    'PENDING-' row from the old code, and any earlier row of their own.
  --    cloud_key is the table's primary key, so two rows for one person is
  --    otherwise perfectly possible — and one of them would outlive a revoke.
  -- v_account_name is the cloud_key about to be inserted, and admins_pkey is
  -- on cloud_key: a legacy row already holding that key with a null player_id
  -- would survive a delete keyed only on player_id, and the insert would then
  -- violate the primary key — an unhandled error instead of a message.
  delete from public.admins
   where player_id = v_account_id
      or cloud_key = v_account_name
      or cloud_key = 'PENDING-' || upper(v_member.name)
      or cloud_key = 'APPROVED-' || upper(v_member.name);

  insert into public.admins (cloud_key, player_name, display_name, role, player_id)
  values (v_account_name,
          upper(v_member.name),
          coalesce(v_account_display, v_member.name),
          p_role,
          v_account_id);

  return jsonb_build_object(
    'status',    'granted',
    'message',   v_member.name || ' can now use the admin panel.',
    'cloud_key', v_account_name,
    'player_id', v_account_id,
    'role',      p_role);
end $$;


-- ── Revoke ────────────────────────────────────────────────────────────────
-- Deleting by cloud_key alone was the other half of the problem: a person
-- could hold both a 'PENDING-' row and a real one, and revoking the row you
-- could see left the other in place, still granting rights. This clears every
-- row that resolves to the same account.
--
-- Keyed on player_id and not on cloud_key. cloud_key is NAME-PIN: passing it
-- meant the client had to read another admin's sign-in credential out of the
-- world-readable admins table and put it into a request payload — the exact
-- pattern being removed everywhere else in this migration.
-- admins_player_id_uniq (below) makes player_id a unique lookup, so nothing is
-- lost by keying on it.
--
-- A legacy row with a null player_id cannot be revoked through this, having no
-- id to key on. Such a row grants nothing anyway, and granting that member
-- again clears it — which is what the admin panel tells you to do.
drop function if exists public.bowls_revoke_admin(text, text, text);
create or replace function public.bowls_revoke_admin(
  p_admin_name text,
  p_admin_pin  text,
  p_player_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target  record;
  v_removed int;
begin
  if not public.bowls_is_super_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_super_admin',
      'message', 'Only a super admin can revoke admin rights.');
  end if;

  select a.cloud_key, a.player_id, a.role, coalesce(a.display_name, a.player_name) as who
    into v_target
    from public.admins a
   where a.player_id = p_player_id;

  if not found then
    -- Two different things reach here and this function cannot tell them
    -- apart, so the wording covers both rather than asserting the wrong one.
    --
    -- Distinguishing them was considered and rejected. The target's name is
    -- not among this function's arguments — p_admin_name is the CALLER — and
    -- the legacy rows are keyed 'PENDING-<NAME>', so finding one would mean
    -- matching on a name, which is the practice this whole migration exists
    -- to remove. Checking cloud_key against the account's own player_name
    -- would avoid that but catches only one of the two legacy shapes, which
    -- is worse than a message that is honest about the uncertainty.
    --
    -- It is also not reachable from the panel: the Revoke button is not
    -- rendered for a row with no player_id, and the client refuses before
    -- calling. This wording is for someone calling the function directly.
    return jsonb_build_object(
      'status',  'not_found',
      'message', 'That admin entry could not be found, or is an old-style entry '
                 || 'with no account attached. Granting them admin again will clear it.');
  end if;

  -- The club must not be able to lock itself out of its own admin panel.
  if v_target.role = 'super_admin' then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', 'A super admin can''t be revoked here.');
  end if;

  delete from public.admins
   where player_id = p_player_id
      or cloud_key = v_target.cloud_key;
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'status',  'revoked',
    'message', v_target.who || ' no longer has admin rights.',
    'removed', v_removed);
end $$;


-- ── bowls_is_super_admin is not callable with the anon key ────────────────
-- A new function is EXECUTE-able by PUBLIC by default, which would put this
-- one behind the publishable key in the bundle: a name and four digits in, a
-- boolean out, with no lockout, no failure counting and no delay, against the
-- single account that can hand out admin rights. admins is world-readable, so
-- the name to try is public too. That is a PIN oracle.
--
-- grant, revoke and approve are SECURITY DEFINER and call it internally as
-- their owner, so revoking it from the API roles breaks nothing legitimate —
-- the client has never called it directly and does not need to.
-- Written as a loop over the roles that actually exist. A plain
-- "revoke ... from anon, authenticated" raises if any one of them is missing,
-- and because this statement sits in the middle of the file that would abort
-- the migration here and leave it HALF APPLIED — the functions above created,
-- the admin_requests changes and the approve function below never run. Losing
-- the revoke would be bad; silently applying two thirds of a migration is
-- worse.
do $$
declare r text;
begin
  execute 'revoke execute on function public.bowls_is_super_admin(text, text) from public';
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.bowls_is_super_admin(text, text) from %I', r);
    end if;
  end loop;
end $$;

-- bowls_is_admin deliberately KEEPS its grant to anon. The client calls it on
-- every sign-in to decide whether to show the admin panel at all, so revoking
-- it would lock every admin out of their own panel. It is also the one with a
-- mitigation: a failed call writes to login_lockouts and counts attempts.
-- That asymmetry — the exposed one counting failures, the silent one not — is
-- why the new function is closed rather than the old one left to match it.


-- ── One account, one admin row ────────────────────────────────────────────
-- The grant above deletes before it inserts so a person cannot end up with
-- two rows. This makes that a rule of the table rather than a habit of one
-- function, and it is the prerequisite for eventually dropping
-- admins.cloud_key: that column is currently the primary key, so it cannot
-- go until something else identifies a row uniquely. player_id is that
-- something.
--
-- Partial, on `player_id is not null`: a unique index would otherwise treat
-- the legacy unlinked rows as distinct anyway (nulls never collide in
-- Postgres), so the predicate is about saying plainly that those rows are
-- outside this rule, not about changing behaviour.
--
-- The primary key is deliberately NOT moved here. Repointing a primary key
-- that other rows and code refer to by cloud_key is 002b's final step, and
-- it needs its own migration and its own testing.
create unique index if not exists admins_player_id_uniq
  on public.admins (player_id)
  where player_id is not null;


-- ── What this does and does not close ─────────────────────────────────────
-- These functions are a real server-side check: the caller's PIN is verified
-- against player_data.pin_hash here, and the client cannot talk its way past
-- it. But the admins table itself still carries using(true) policies, so
-- someone with the publishable key out of the bundle can still write to it
-- directly and bypass these functions entirely. Routing the app through them
-- is necessary and not sufficient; the policies are 002b's job. Do not read
-- this migration as making the admins table safe.


-- ════════════════════════════════════════════════════════════════════════
--  THE ADMIN REQUEST QUEUE
--
--  Approving a request had the same defect as granting: it wrote
--    cloud_key = 'APPROVED-' || <name>,  player_id = null
--  and produced the same inert row.
--
--  The table also carried the requester's cloud_key, which is their
--  NAME-PIN — their sign-in credential — in a table that is world-readable
--  AND world-writable. It holds zero rows, so this is the cheapest moment
--  there will ever be to change its shape: no backfill, nothing to
--  preserve, no migration risk.
-- ════════════════════════════════════════════════════════════════════════

-- The account being asked about, by id. Replaces cloud_key entirely.
alter table public.admin_requests add column if not exists player_id uuid
  references public.player_data(id) on delete cascade;

-- What the member is ASKING for, in their words. Named requested_role and not
-- role_title on purpose: members.position is the club's record of who holds
-- which committee post, and is what the Club tab reads. This column is a line
-- in a request, nothing more. Approving a request does NOT write to
-- members.position — a committee title is set on the roster, by hand, and
-- there is exactly one place it lives.
--
-- The Settings screen has always collected and written this field, under the
-- name role_title, and no column of either name has ever existed — so every
-- request insert has failed and the queue has never held a row.
alter table public.admin_requests add column if not exists requested_role text;

-- The client upserts, and there was no unique index for it to conflict
-- against — the second reason no request ever landed. One pending request per
-- person is also the behaviour you want.
--
-- Keyed on player_id and NOT on player_name. player_name arrives on an
-- unauthenticated insert, so conflicting on it would let anyone replace
-- anyone else's pending request by sending the same name: a denial of service
-- on the approval queue. player_id is the identity that matters, and the only
-- one a member can clobber for themselves.
create unique index if not exists admin_requests_player_id_uniq
  on public.admin_requests (player_id);

-- And the credential goes. Nothing reads it after this migration.
alter table public.admin_requests drop column if exists cloud_key;


-- ── Approve a request ─────────────────────────────────────────────────────
-- Parity with bowls_grant_admin: resolves to a real account, refuses in
-- words, writes nothing when it refuses, and checks the caller here.
--
-- There is deliberately no 'ambiguous' branch, unlike the grant. It cannot
-- arise: the request names an account by primary key, and
-- members_linked_player_id_uniq (already on the table) allows at most one
-- roster member per account. Two candidates is unreachable by construction
-- rather than merely absent from today's data — so there is nothing here to
-- cover, and a branch that can never run would be worse than none.
--
-- The names shown to the approver are read from the account and the roster,
-- never from admin_requests.player_name. That column is written by an
-- unauthenticated insert (see the note at the foot) and must not be able to
-- put one member's name against another member's account.
create or replace function public.bowls_approve_admin_request(
  p_admin_name text,
  p_admin_pin  text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_req             record;
  v_account_name    text;
  v_account_display text;
  v_member_name     text;
  v_role            text;
begin
  if not public.bowls_is_super_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_super_admin',
      'message', 'Only a super admin can approve an admin request.');
  end if;

  select r.id, r.player_name, r.player_id, r.requested_role
    into v_req
    from public.admin_requests r
   where r.id::text = p_request_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_request',
      'message', 'That request is no longer in the queue.');
  end if;

  if v_req.player_id is null then
    -- A request filed before this migration, by a client that had no
    -- player_id to give. Nothing to resolve; clear it and ask again.
    delete from public.admin_requests where id = v_req.id;
    return jsonb_build_object(
      'status',  'no_account',
      'message', coalesce(v_req.player_name, 'That request')
                 || ' was sent by an older version of the app and can''t be matched to an account. '
                 || 'It has been cleared — ask them to send it again.');
  end if;

  select d.player_name, d.display_name
    into v_account_name, v_account_display
    from public.player_data d
   where d.id = v_req.player_id;

  if v_account_name is null then
    delete from public.admin_requests where id = v_req.id;
    return jsonb_build_object(
      'status',  'no_account',
      'message', 'The account that sent that request no longer exists. The request has been cleared.');
  end if;

  -- TODO(multi-club): no club_id predicate here either — see the note on the
  -- member lookup in bowls_grant_admin above.
  select m.name into v_member_name
    from public.members m
   where m.linked_player_id = v_req.player_id;

  if v_member_name is null then
    return jsonb_build_object(
      'status',  'not_linked',
      'message', coalesce(v_account_display, v_account_name)
                 || ' has an app account but it isn''t linked to anyone on the roster, '
                 || 'so there is no way to say who they are. Link it on the roster first.');
  end if;

  -- Same guard as the grant: approving must not be able to demote the super
  -- admin by replacing their row with a plain one.
  if exists (select 1 from public.admins
              where player_id = v_req.player_id and role = 'super_admin') then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', v_member_name || ' is the super admin. Their role can''t be changed here.');
  end if;

  -- The role they actually asked for. Selecting requested_role and then
  -- hardcoding 'admin' handed full Admin to someone who asked for Draw Admin,
  -- without telling the approver. Validated the same way the grant validates
  -- its argument; anything else, including null, means plain admin.
  if coalesce(v_req.requested_role, '') not in ('admin', 'draw_admin') then
    v_role := 'admin';
  else
    v_role := v_req.requested_role;
  end if;

  delete from public.admins
   where player_id = v_req.player_id
      or cloud_key = v_account_name
      or cloud_key = 'PENDING-' || upper(v_member_name)
      or cloud_key = 'APPROVED-' || upper(v_member_name);

  insert into public.admins (cloud_key, player_name, display_name, role, player_id)
  values (v_account_name, upper(v_member_name),
          coalesce(v_account_display, v_member_name), v_role, v_req.player_id);

  delete from public.admin_requests where id = v_req.id;

  return jsonb_build_object(
    'status',      'granted',
    'message',     v_member_name || ' can now use the admin panel'
                   || case when v_role = 'draw_admin' then ' as Draw Admin.' else '.' end,
    'member_name', v_member_name,
    'role',        v_role,
    'cloud_key',   v_account_name);
end $$;


-- ── Still to do, and not in this migration ────────────────────────────────
-- TODO(multi-club): bowls_grant_admin and bowls_approve_admin_request both
-- find a member without a club_id predicate, and both let the inserted admins
-- row take club_id from the column default, which is hardcoded to Irvine Park.
-- Dormant while one club exists; wrong the day a second one does. The full
-- note is on the member lookup in bowls_grant_admin.
--
-- admin_requests carries an `open` policy: ALL, public, using(true) with
-- check(true). Anyone with the publishable key can read the queue, add to it
-- or empty it, and the insert is entirely unauthenticated — nothing proves
-- the person filing a request is who the row says they are. That is why the
-- function above takes its names from the account and the roster and never
-- from admin_requests.player_name.
--
-- Tightening that policy is NOT done here on purpose. The deployed client
-- still writes to this table directly, so locking it needs the same
-- client-first ordering as the rest of 002b: ship a client that goes through
-- an RPC, wait for the phones to pick it up, then close the policy. Closing
-- it first would break the request button for everyone still on the old
-- bundle. It belongs with the RPC work, not with a check in the client.
```

---

## 9. Admin role layers

**File:** `supabase/migrations/20260901_admin_role_layers.sql`  
**Status:** **Not yet applied** — written today

The panel was all-or-nothing because the only question the client could ask was
`bowls_is_admin`, which answers yes or no. A boolean can't express layers, so
every screen was gated on the same flag — and a Social Convenor who should only
add events would have got the members' phone numbers and the PIN reset too.

The ladder:

| Role | What it can do |
|---|---|
| `super_admin` | everything, including granting admin |
| `admin` | everything except granting |
| `draw_admin` | draws only |
| `events_admin` | What's On only — **new** |

### The bug this also closes

`bowls_grant_admin` already accepted `draw_admin`, and `bowls_is_admin` answers
only for `('admin','super_admin')`. So a `draw_admin` could be granted and then
got **nothing at all** — no panel, no draws, no error. The same silent no-op the
grant work spent a day removing, still live in the role check. From here the
check constraint and `bowls_admin_role` agree on one list, so the two can't
drift apart again.

### What it adds

- **`bowls_admin_role(name, pin) returns text`** — the role, or null. A *new*
  function: `bowls_is_admin` keeps its name, its boolean and its meaning so the
  bundle already on people's phones carries on working. Same client-first
  ordering as the rest of 002b; retire the old one in a later pass.
  **The `login_lockouts` failure counting is carried over and must stay** —
  without it this is a name and four digits in, a role out, with nothing to
  slow an attempt down. It's called by the client on every sign-in so it can't
  be closed off the way `bowls_is_super_admin` was; counting failures is the
  mitigation.
- **`admins_role_known`** — a CHECK for the four values. `admins.role` was free
  text, which is how a typo in a permission column grants nothing and says
  nothing. All five live rows verified to pass before adding it.
- **`bowls_grant_admin`** accepts `events_admin`. Only the role list changes;
  every guard stays, the super-admin demotion refusal included. `super_admin`
  remains ungrantable.

### Gating in the client, by capability

The panel draws only the sections a role allows rather than showing then
refusing. An `events_admin` gets **no padlock at all** — their rights are
exercised on the What's On tab, and a padlock onto an empty room would be
worse than none.

| Capability | Roles |
|---|---|
| What's On add/edit/cancel | `events_admin`, `admin`, `super_admin` |
| Draws | `draw_admin`, `admin`, `super_admin` |
| Members list, phone numbers, editing | `admin`, `super_admin` only |
| Reset a member's PIN | `admin`, `super_admin` only |
| Grant/revoke admin | `super_admin` only |

**One reading worth stating:** "Members list + phone numbers" is taken as the
*admin panel's* Members section — editing members, their phones, PIN resets. The
main Members tab stays a directory for any signed-in member, as it is today.
Restricting that to admins would remove the roster from all 214 members, which
is a different decision.

### What this is and is not

The role is decided on the server against `player_data.pin_hash` and the client
can't talk it into a different answer. What the client does with it — which
sections to draw — is **a client control over a server-verified fact**. Better
than the flag it replaces; still not a lock. `club_events`, `members` and
`admins` all carry `ALL/public/using(true)`, so anyone with the publishable key
from the bundle can read or write those tables whatever their role.
**The policies are deliberately untouched here** — that's 002b, and it needs the
same client-first ordering.

Nothing is seeded: Christine Pipe gets `events_admin` through the new picker,
which is also the test.

### Why `bowls_admin_role` keeps its `anon` EXECUTE grant

`20260831` closed `bowls_is_super_admin` off from `anon`/`authenticated`/`public`.
This one is the **opposite case on both counts** and must stay open:

| | `bowls_is_super_admin` | `bowls_admin_role` |
|---|---|---|
| called from the client? | never — only other SECURITY DEFINER functions call it, internally, which needs no grant | **on every sign-in**, with the publishable key |
| throttled? | no failure counting, so an open grant was an unthrottled PIN oracle | counts into `login_lockouts` and clears on success, same as `bowls_is_admin` |

Close it and every admin panel in the club goes dark at once, silently, with no
error anyone can report beyond "my admin is gone". So the migration writes the
grant out **explicitly** rather than relying on the `PUBLIC` default — a later
`revoke execute ... from public` sweep then can't take it away as a side effect —
and ends with a `DO` block that raises if `anon` still can't execute it, so a
half-tidied database fails the migration instead of the club.

Post-check:

    select has_function_privilege('anon','public.bowls_admin_role(text, text)','execute')      as want_true,
           has_function_privilege('anon','public.bowls_is_super_admin(text, text)','execute')  as want_false;


```sql
-- ════════════════════════════════════════════════════════════════════════
--  ADMIN ROLE LAYERS
--  Run this once in the Supabase SQL editor (after 20260831_grant_admin.sql).
--
--  The panel is all-or-nothing because the only thing the client can ask
--  is bowls_is_admin, which answers yes or no. A boolean cannot express
--  layers, so every screen is gated on the same flag and a Social Convenor
--  who should only add events would get the members' phone numbers and the
--  PIN reset as well.
--
--  The ladder:
--    super_admin    everything, including granting admin
--    admin          everything except granting
--    draw_admin     draws only
--    events_admin   What's On only                          (new)
--
--  THE BUG THIS ALSO CLOSES
--  bowls_grant_admin already accepted 'draw_admin', and bowls_is_admin
--  answers only for ('admin','super_admin'). So a draw_admin could be
--  granted and then got nothing at all — no panel, no draws, no error.
--  The same silent no-op that grantAdmin had until yesterday, still live
--  in the role check. A role that can be granted must do something, or
--  must not be grantable; from here the check constraint and the new
--  function agree on one list, so the two cannot drift apart again.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. The role, not a yes/no ─────────────────────────────────────────────
-- A NEW function rather than a changed signature. bowls_is_admin keeps its
-- name, its boolean return and its ('admin','super_admin') meaning, so the
-- bundle already on people's phones carries on working while they pick up
-- the new one. Same client-first ordering as the rest of 002b. It can be
-- retired in a later pass, once nothing calls it.
--
-- The failure counting is carried over deliberately and must stay: without
-- it this is a name plus four digits in, a role out, with nothing to slow
-- an attempt down — an unthrottled PIN oracle, which is what the last
-- review caught on bowls_is_super_admin. This one is called by the client
-- on every sign-in so it cannot be closed off in the same way; counting
-- failures into login_lockouts is the mitigation, exactly as bowls_is_admin
-- does it. See part 4: its EXECUTE grant to anon is required, not an
-- oversight.
create or replace function public.bowls_admin_role(p_name text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key  text;
  v_id   uuid;
  v_role text;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return null;
  end if;

  select d.id into v_id
    from public.player_data d
   where d.name_key = v_key
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_id is null then
    insert into public.login_lockouts (name, attempts, updated_at)
    values ('ADMIN:' || v_key, 1, now())
    on conflict (name) do update
      set attempts = login_lockouts.attempts + 1, updated_at = now();
    return null;
  end if;

  delete from public.login_lockouts where name = 'ADMIN:' || v_key;

  -- admins_player_id_uniq means at most one row per account, so no ordering
  -- or precedence is needed here — there is nothing to choose between.
  select a.role into v_role
    from public.admins a
   where a.player_id = v_id;

  -- Null for a member with no admins row, and null for a role outside the
  -- ladder. The check constraint below should make the second impossible;
  -- this is belt and braces, so an unknown role grants nothing rather than
  -- being passed to the client to interpret.
  if v_role not in ('super_admin', 'admin', 'draw_admin', 'events_admin') then
    return null;
  end if;

  return v_role;
end $$;


-- ── 2. Roles are a fixed list, not free text ──────────────────────────────
-- admins.role had no constraint, so a typo in a permission column granted
-- nothing and said nothing. Verified before adding: all five live rows are
-- 'super_admin' or 'admin', so this applies without touching anything.
alter table public.admins drop constraint if exists admins_role_known;
alter table public.admins add constraint admins_role_known
  check (role in ('super_admin', 'admin', 'draw_admin', 'events_admin'));


-- ── 3. Grant can hand out the new tier ────────────────────────────────────
-- Only the role list changes. Every guard from the previous migration stays
-- exactly as it was — the super-admin demotion refusal above all, which is
-- the one that could lock the club out of its own panel.
--
-- super_admin stays ungrantable: there is a separate claim flow, and a
-- super_admin who can mint super_admins is a one-way door.
create or replace function public.bowls_grant_admin(
  p_admin_name text,
  p_admin_pin  text,
  p_member_id  text,
  p_role       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member          record;
  v_account_id      uuid;
  v_account_name    text;
  v_account_display text;
  v_candidates      int;
  v_names           text;
begin
  if coalesce(p_role, '') not in ('admin', 'draw_admin', 'events_admin') then
    return jsonb_build_object(
      'status',  'bad_role',
      'message', 'Pick one of Admin, Draw Admin or Events Admin.');
  end if;

  if not public.bowls_is_super_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_super_admin',
      'message', 'Only a super admin can grant admin rights.');
  end if;

  -- TODO(multi-club): single-club by assumption. The member is found on id
  -- alone, with no club_id predicate, so once a second club exists a super
  -- admin at one club could grant admin over another club's member by passing
  -- their id. The inserted row would also take club_id from the column
  -- default, which is hardcoded to Irvine Park, so it would land under the
  -- wrong club silently rather than erroring.
  -- Fix when club two is onboarded: resolve the caller's club from their own
  -- admins row, require members.club_id to match, and set club_id explicitly
  -- on the insert instead of relying on the default. Same change needed in
  -- bowls_approve_admin_request.
  select m.id, m.name, m.section, m.linked_player_id
    into v_member
    from public.members m
   where m.id::text = p_member_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_member',
      'message', 'That member is not on the roster.');
  end if;

  if v_member.linked_player_id is not null then
    select d.id, d.player_name, d.display_name
      into v_account_id, v_account_name, v_account_display
      from public.player_data d
     where d.id = v_member.linked_player_id;
  end if;

  if v_account_id is null then
    select count(*), string_agg(d.player_name, ', ' order by d.player_name)
      into v_candidates, v_names
      from public.player_data d
     where d.name_key = public.bowls_name_key(v_member.name);

    if v_candidates = 0 then
      return jsonb_build_object(
        'status',  'no_account',
        'message', v_member.name || ' hasn''t signed in to the app yet. Ask them to register, then grant admin.');
    elsif v_candidates = 1 then
      return jsonb_build_object(
        'status',  'not_linked',
        'message', v_member.name || ' has an app account but it isn''t linked to their name on the roster. '
                   || 'Ask them to link it when they next open the app, then grant admin.',
        'candidates', v_names);
    else
      return jsonb_build_object(
        'status',  'ambiguous',
        'message', v_candidates || ' accounts could be ' || v_member.name || ': ' || v_names || '. '
                   || 'Link the right one to them on the roster first, then grant admin.',
        'candidates', v_names);
    end if;
  end if;

  if exists (select 1 from public.admins
              where player_id = v_account_id and role = 'super_admin') then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', v_member.name || ' is the super admin. Their role can''t be changed here.');
  end if;

  delete from public.admins
   where player_id = v_account_id
      or cloud_key = v_account_name
      or cloud_key = 'PENDING-' || upper(v_member.name)
      or cloud_key = 'APPROVED-' || upper(v_member.name);

  insert into public.admins (cloud_key, player_name, display_name, role, player_id)
  values (v_account_name,
          upper(v_member.name),
          coalesce(v_account_display, v_member.name),
          p_role,
          v_account_id);

  return jsonb_build_object(
    'status',    'granted',
    'message',   v_member.name || ' can now use the admin panel'
                 || case p_role
                      when 'draw_admin'   then ' for draws.'
                      when 'events_admin' then ' for What''s On.'
                      else '.' end,
    'cloud_key', v_account_name,
    'player_id', v_account_id,
    'role',      p_role);
end $$;


-- ── 4. bowls_admin_role STAYS EXECUTABLE BY anon — DO NOT CLOSE IT ─────────
-- READ THIS BEFORE TIDYING UP.
--
-- The previous migration revoked EXECUTE on bowls_is_super_admin from
-- public/anon/authenticated. Do NOT give this function the same treatment.
-- They look alike — both take a name and a PIN, both are SECURITY DEFINER,
-- both answer a question about privilege — and they are opposites on the two
-- things that decide it:
--
--   bowls_is_super_admin        bowls_admin_role
--   ------------------------    ----------------------------------------
--   nothing in the client       the client calls it on EVERY sign-in, with
--   calls it; only other        the publishable key. Close it and every
--   SECURITY DEFINER            admin panel in the club goes dark at once,
--   functions do, internally,   silently, for everyone, with no error the
--   which needs no grant.       user can report beyond "my admin is gone".
--
--   no failure counting, so     counts failures into login_lockouts on the
--   an open grant was an        way out and clears them on success (see
--   unthrottled PIN oracle.     part 1) — the same throttle bowls_is_admin
--                               has always had.
--
-- So the reason bowls_is_super_admin was closed does not apply here, and the
-- cost of closing this one is total. The grant below is written out
-- explicitly rather than left to the PUBLIC default so that a later
-- "revoke execute ... from public" sweep does not take it away as a side
-- effect, and so that anyone reading the schema sees the intent.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_admin_role(text, text) to %I', r);
    end if;
  end loop;
end $$;

-- And fail the migration loudly rather than leave a club that cannot
-- administer itself. If anon exists it must be able to execute this.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and not has_function_privilege('anon', 'public.bowls_admin_role(text, text)', 'execute') then
    raise exception
      'bowls_admin_role is not executable by anon; the client cannot read its own role. Do not ship this.';
  end if;
end $$;

-- ── What this is and is not ───────────────────────────────────────────────
-- The role itself is now decided on the server, against player_data.pin_hash,
-- and cannot be talked into a different answer by the client. What the client
-- does with it — which sections of the panel to draw — is a client control
-- over a server-verified fact. That is better than the flag it replaces, and
-- it is still not a lock: club_events, members and admins all carry
-- ALL/public/using(true) policies, so anyone with the publishable key from
-- the bundle can read or write those tables directly whatever their role. The
-- policies are 002b's job and are deliberately untouched here.
```

---

## 10. Posters on What's On

**Status:** Applied 31 August, 20:20 UTC as `event_posters`, with part 8 following
at 20:56 as `event_posters_revoke_ticket_grants` — bucket and column both, before
the client shipped

Christine has the promoter's JPEG; it is what she puts on Facebook. This puts it
on the event, on the card in the diary, and — the part that actually does her
job — on the Open Graph image of the shared link.

### Where the bytes go, and why not in the row

`player_data.profile.avatar` stores base64 `data:` URLs in the jsonb row. Twelve
members have one, 10–17KB each, and at 60px that is fine.

It is the wrong pattern here and would not have been a small mistake. A readable
poster is 300KB–1MB, and base64 adds about a third again. On `club_events` the
row is read by every member on every What's On load, so a season with a dozen
posters would be several megabytes down the wire to open the diary — whether or
not anyone taps a poster. So: **Supabase Storage for the image, and the table
stores the path.**

`club_events.poster_path` holds `<event id>/<uuid>.jpg` — the object path, never
a full URL. The project URL and the CDN in front of it can both change; the path
cannot.

### Storage policies are not table policies

Every table in this app carries `ALL / public / using(true)` and the publishable
key ships inside the JavaScript bundle. On a table that is a data-integrity
problem — the worst case is someone rewriting the club's own rows, which are
backed up.

On a bucket it is a different problem. An open insert policy means anyone who
opens devtools can upload arbitrary files to the club's storage, on the club's
bill, served from the club's domain. That is file hosting for strangers, and
cleaning it up starts with finding out what they put there.

There is no Supabase Auth here — every visitor is `anon`, so "restrict writes to
`authenticated`" restricts them to nobody. What gates the rest of the app is a
name and a PIN checked in a SECURITY DEFINER function, and that is what gates
this, in the only shape a storage policy allows:

1. The client calls `bowls_poster_ticket(name, pin, event_id)`. That verifies the
   PIN through `bowls_admin_role` — the same capability check, and the same
   `login_lockouts` throttle, as adding an event.
2. It returns **one exact object path** and records a ticket for it, valid five
   minutes.
3. The bucket's insert policy allows a write only to a path that has a live
   ticket. Exact match, not a prefix.

`poster_tickets` has RLS on and **no policies at all**, so a ticket cannot be
found by looking — only issued. Checked rather than assumed: `set role anon;
select count(*) from poster_tickets` returns **0** with live tickets in the table.

Supabase grants `anon` table privileges across the `public` schema by default, so
it held SELECT on this table even though RLS reduced that to nothing. Part 8 of
the migration revokes it — not because the tickets were exposed, but because that
grant is what would come back to life the day somebody adds a permissive policy
or turns RLS off while debugging something else, and revoking it also keeps the
table off the PostgREST surface rather than exposing an endpoint that answers
with an empty list.

The policies reach the table through `bowls_poster_ticket_ok()`, which is
SECURITY DEFINER, and has to be: a policy expression runs as the caller, so a
policy naming `poster_tickets` directly would be subject to that table's own RLS
and would see zero rows — every upload would be refused, including the legitimate
ones.

| Operation | Who |
|---|---|
| SELECT | public, and intended — the crawler carries no credentials |
| INSERT | only a path with a live `upload` ticket |
| UPDATE | **no policy at all** — a poster is replaced by a new object, never overwritten |
| DELETE | only a path with a live `delete` ticket |

The bucket also carries `file_size_limit` 2MB and `allowed_mime_types`
`image/jpeg, image/png, image/webp`. Those are enforced by the storage service on
every request whatever the client believes — verified: a `text/plain` body to a
correctly ticketed path is refused with `415 InvalidMimeType`.

### What that is, and what it is not

**Locked: the bytes.** Writing an object requires a name and PIN resolving to
`events_admin` or above. The publishable key alone buys read access and nothing
else. That is a real server-side lock, not a check in the client — verified
against production, with the key from the bundle:

    upload to a ticketed path      200
    upload to an unticketed path   403  new row violates row-level security policy
    delete without a ticket        403  Access denied
    public read, no credentials    200  byte-identical to what went up

**Not locked, and worth saying plainly:**

* `club_events` is still `ALL/public/using(true)`, `poster_path` included. Anyone
  with the key can point an event at a different poster, clear it, or delete the
  event. **The image is gated; the pointer to it is not.** That is 002b's job,
  along with every other table, and is deliberately untouched here.
* A ticket lasts five minutes and is not single-use, so within that window its
  holder could write that one path more than once. Bounded to one path, one
  bucket, and the limits above.
* Public read means public for as long as the object exists. Which is why
  removing a poster **deletes the object** rather than clearing the column.
* The CDN keeps serving a deleted object to anyone holding its exact URL until
  its cache entry expires. Uploads set `cacheControl: 300`, so that window is
  five minutes rather than the default hour — measured, not assumed:
  `cache-control: public, max-age=300` comes back on the object. Once Facebook
  has scraped an image it keeps its own copy indefinitely; that is outside
  anything this app controls.
* Any admin can upload anything the MIME limits allow. This grants the social
  convenor a real capability; it does not police it.

### Thumbnails: the add-on is off

The plan was Supabase image transformations on read — one stored file, resized
per use. **It is a paid add-on and it is off on this project.** Checked rather
than assumed:

    GET /storage/v1/render/image/public/event-posters/<path>?width=128
    403 {"error":"FeatureNotEnabled","message":"feature not enabled for this tenant"}

So the 64px thumbnail is the full object scaled by the browser. That is tolerable
only because the upload path caps a poster at 1400px and under 300KB before it
leaves the phone, most nights have no poster at all, and the same bytes are what
the detail view needs one tap later — the thumbnail is a prefetch, not waste.

`IMAGE_TRANSFORMS` in `src/lib/poster.js` is the single switch. Enable the add-on
on the Supabase dashboard, flip it to `true`, and thumbnails become ~4KB with no
other change. Every `<img>` already falls back to the full object if a render URL
fails, so being wrong in either direction shows a poster rather than a broken
image.

### The resize happens on the phone

A camera shot of a poster on the clubhouse wall is 4MB and 4032px. Uploading that
raw would exceed the bucket limit, cost the uploader their data allowance, and
hand every member a 4MB download.

`shrinkForUpload` draws it to a canvas at a 1400px long edge and steps the JPEG
quality down 0.8 → 0.5 until it is under 300KB, dropping the dimensions only if
quality alone does not get there — a poster gone soft is still readable, one gone
small is not. Measured in the browser: a 2400×3200 noise image of 7.6MB comes out
at 256KB.

Two things it does on the way that are worth knowing:

* `createImageBitmap(file, { imageOrientation: "from-image" })` applies the EXIF
  rotation. Without it a poster photographed in portrait arrives on its side,
  which is the single most likely way this feature looks broken.
* It always re-encodes, even a small file. The result is then known to be JPEG,
  known to be inside the bucket's MIME list, and **stripped of the EXIF the
  camera attached** — which on a phone photo includes where it was taken.

### The share link

`/e/<event id>` is rewritten to `api/share.js`, a serverless function that
answers with real Open Graph tags: the poster as `og:image`, the night as the
title, the date and time as the description, and `CANCELLED — ` on the front of
the title when it is off. A person following the same link is redirected on into
the app, landing on that night.

This needs a server because the app is a single-page bundle: every URL returns
the same `index.html`, and Facebook's crawler runs no JavaScript, so a plain link
to the app shows the club badge and the club's name whatever you linked to.

Three routes, all of which have to work:

| Who follows the link | What answers | How the event is found |
|---|---|---|
| Facebook's crawler | Vercel → `api/share.js` | the OG tags; it stops there |
| Someone without the app installed | Vercel → `api/share.js` → redirect | `/?event=<id>` |
| Someone with the PWA installed | the service worker, from cache | the id read off the `/e/<id>` path |

That third row is why `/e/` is **not** in `navigateFallbackDenylist` — an
installed member should be able to follow a share link with no signal — and why
`readEventParam` in `App.jsx` reads both the query and the path. `/api/` **is** in
the denylist, otherwise the installed shell would answer the crawler's route from
cache and the tags would never be reached.

An event with no poster falls back to `icon-512.png`, so the card still reads as
the club rather than as nothing. Everything taken from the row is HTML-escaped;
if Supabase is slow or down the function still returns a card rather than an
error page.

**Vercel only.** `api/share.js` is a Vercel function and the rewrite is in
`vercel.json`. The Netlify mirror still builds and serves the app, but `/e/<id>`
there falls through to the SPA — the app opens on the right night, and the
Facebook card is the generic one. Production is Vercel, so this is a preview-mirror
gap rather than a member-facing one; it is the second thing the Netlify deploy has
now missed, and retiring it would remove a whole class of "which one am I looking
at".

### Post-checks

Run against production after applying, with the publishable key from the bundle —
not the service key, because the point is what a member's browser can do:

    -- the column
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'club_events' and column_name = 'poster_path';

    -- the bucket and its limits
    select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'event-posters';

    -- the policies: select open, insert and delete ticketed, no update policy at all
    select cmd, policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' order by cmd;

    -- anon can call what the policies call, and still cannot read the tickets
    select has_function_privilege('anon', 'public.bowls_poster_ticket_ok(text, text)', 'execute') as want_true,
           has_table_privilege('anon', 'public.poster_tickets', 'select')                          as want_false;

And the round trip, which is the only one that proves the whole path:

    K=<the publishable key from src/lib/supabase.js>
    B=https://pjszrcaikpxdasknwyjb.supabase.co/storage/v1
    # with a ticket issued by bowls_poster_ticket → 200
    curl -X POST "$B/object/event-posters/$TICKETED_PATH" -H "apikey: $K" -H "Authorization: Bearer $K" \
         -H "Content-Type: image/jpeg" --data-binary @poster.jpg
    # to any other path → 403 new row violates row-level security policy
    curl -X POST "$B/object/event-posters/anything-else.jpg" -H "apikey: $K" -H "Authorization: Bearer $K" \
         -H "Content-Type: image/jpeg" --data-binary @poster.jpg
    # and the bucket serves it to nobody in particular
    curl "$B/object/public/event-posters/$TICKETED_PATH" | md5sum

### The SQL

```sql
-- ════════════════════════════════════════════════════════════════════════
--  EVENT POSTERS
--  Run this once in the Supabase SQL editor (after 20260901_admin_role_layers.sql).
--
--  Christine has the promoter's JPEG — it's what she puts on Facebook. This
--  puts it on the event, and on the Open Graph card of the shared link, which
--  is the part that actually does her job for her.
--
--  WHAT THIS ADDS
--    club_events.poster_path   the object path, not a URL. URLs change.
--    bucket 'event-posters'    public read, size- and type-limited
--    poster_tickets            short-lived permission to write ONE object
--    bowls_poster_ticket()     mints one, PIN-gated, events_admin and up
--    bowls_poster_remove_ticket()  the same for deleting one
--    bowls_poster_ticket_ok()  what the storage policies call
--
--  NOT base64 in the row. player_data.profile stores avatars that way and at
--  60px it is fine; a readable poster is 300KB-1MB and base64 adds a third
--  again. On club_events that would mean all 214 members downloading every
--  poster on every What's On load, whether or not they open one.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. The pointer ────────────────────────────────────────────────────────
alter table public.club_events add column if not exists poster_path text;

comment on column public.club_events.poster_path is
  'Object path in the event-posters bucket, e.g. <event_id>/<uuid>.jpg. Never a full URL: the project URL and the CDN in front of it can both change, the path cannot. Null for the great majority of events.';


-- ── 2. The bucket ─────────────────────────────────────────────────────────
-- public = true so the object URL serves without a token, which is what makes
-- the Open Graph image work: Facebook's crawler carries no credentials.
--
-- file_size_limit and allowed_mime_types are enforced by the storage service
-- itself, on every request, whatever the client believes. The client resizes
-- to under 300KB before upload; this is the backstop for when it doesn't.
-- 2MB rather than 300KB so a legitimate poster from a browser that resizes
-- less aggressively still lands, while a 4MB camera original still cannot.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ── 3. Why this is not "using (true)" ─────────────────────────────────────
-- Every table policy in this app is ALL/public/using(true), and the
-- publishable key is in the JavaScript bundle. On a table that is a
-- data-integrity problem: the worst case is someone rewriting the club's own
-- rows, which are backed up and can be put back.
--
-- On a storage bucket it is a different kind of problem. An open insert
-- policy means anyone on the internet who opens devtools can upload arbitrary
-- files to the club's storage, on the club's bill, served from the club's
-- domain. That is free file hosting for strangers, and taking it down again
-- means finding out what they put there first.
--
-- There is no Supabase Auth in this app — every visitor is the anon role, so
-- "restrict writes to authenticated" restricts them to nobody. What gates the
-- rest of the app is a name and a PIN checked in a SECURITY DEFINER function
-- against player_data.pin_hash. This does the same, in the only shape storage
-- policies allow:
--
--   1. The client asks bowls_poster_ticket(name, pin, event) for permission.
--      That verifies the PIN and the role, exactly as adding an event does.
--   2. It returns ONE exact object path and records a ticket for it, good for
--      five minutes.
--   3. The storage insert policy allows a write only to a path that has a
--      live ticket. No ticket, no upload — the key alone buys nothing.
--
-- The ticket table is not readable by anon (RLS on, no policies), so a ticket
-- cannot be found by looking; it has to be issued. The policies reach it
-- through a SECURITY DEFINER function for that reason — a policy expression
-- runs with the caller's privileges, so referring to the table directly would
-- have required granting anon SELECT on it, which is the whole secret.
create table if not exists public.poster_tickets (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid,
  object_path text not null,
  purpose     text not null check (purpose in ('upload', 'delete')),
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table public.poster_tickets enable row level security;
-- Deliberately no policies: anon and authenticated get nothing. Only the
-- SECURITY DEFINER functions below touch this table.

create index if not exists poster_tickets_path_idx on public.poster_tickets (object_path);


-- ── 4. What the storage policies call ─────────────────────────────────────
-- Exact path match, not a prefix: a ticket authorises one object and only the
-- one it was issued for.
create or replace function public.bowls_poster_ticket_ok(p_path text, p_purpose text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.poster_tickets t
     where t.object_path = p_path
       and t.purpose     = p_purpose
       and t.expires_at  > now()
  );
$$;

-- Must stay executable by anon: the storage policies are evaluated as anon on
-- every upload and delete. Same reasoning as bowls_admin_role in 20260901 —
-- it is reachable with the publishable key but tells an attacker nothing they
-- did not already supply, and it is the thing that makes the lock work.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_poster_ticket_ok(text, text) to %I', r);
    end if;
  end loop;
end $$;


-- ── 5. The policies themselves ────────────────────────────────────────────
drop policy if exists "event posters are public to read"  on storage.objects;
drop policy if exists "event poster writes need a ticket" on storage.objects;
drop policy if exists "event poster deletes need a ticket" on storage.objects;

-- SELECT: public, and intended. The bucket is public so the object URL works
-- for Facebook's crawler and for anyone the link is pasted to.
create policy "event posters are public to read"
  on storage.objects for select
  using (bucket_id = 'event-posters');

-- INSERT: only to a path with a live ticket.
create policy "event poster writes need a ticket"
  on storage.objects for insert
  with check (bucket_id = 'event-posters'
              and public.bowls_poster_ticket_ok(name, 'upload'));

-- DELETE: only a path with a live delete ticket.
create policy "event poster deletes need a ticket"
  on storage.objects for delete
  using (bucket_id = 'event-posters'
         and public.bowls_poster_ticket_ok(name, 'delete'));

-- UPDATE: no policy, so no overwrite. Replacing a poster uploads a new object
-- under a fresh name and deletes the old one, which also sidesteps the CDN
-- serving the previous image from cache under a reused path.


-- ── 6. Minting a ticket ───────────────────────────────────────────────────
-- Same capability as adding an event: events_admin, admin, super_admin. The
-- role comes from bowls_admin_role, which verifies the PIN against
-- player_data.pin_hash and counts failures into login_lockouts, so this
-- inherits the throttle rather than opening a second unthrottled door.
create or replace function public.bowls_poster_ticket(
  p_name     text,
  p_pin      text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
  v_path text;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);

  if coalesce(v_role, '') not in ('events_admin', 'admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only an admin or the social convenor can add a poster.');
  end if;

  if not exists (select 1 from public.club_events where id = p_event_id) then
    return jsonb_build_object(
      'status',  'no_event',
      'message', 'That night is not in the diary any more.');
  end if;

  delete from public.poster_tickets where expires_at < now() - interval '1 day';

  -- A fresh filename every time. Two uploads for the same event never collide,
  -- and a replaced poster is never served stale from the CDN under a path that
  -- now means something else.
  v_path := p_event_id::text || '/' || gen_random_uuid()::text || '.jpg';

  insert into public.poster_tickets (event_id, object_path, purpose, created_by, expires_at)
  values (p_event_id, v_path, 'upload', upper(coalesce(p_name, '')), now() + interval '5 minutes');

  return jsonb_build_object('status', 'ok', 'path', v_path);
end $$;


-- ── 7. And for taking one down ────────────────────────────────────────────
-- Removing has to really remove. Christine will pick the wrong file at some
-- point, and "remove" that only clears poster_path would leave the wrong image
-- sitting on a public URL for as long as the bucket exists.
create or replace function public.bowls_poster_remove_ticket(
  p_name        text,
  p_pin         text,
  p_object_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
  v_head text;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);

  if coalesce(v_role, '') not in ('events_admin', 'admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only an admin or the social convenor can remove a poster.');
  end if;

  -- The path must be shaped like one this app issued: <event id>/<file>. Not a
  -- security boundary on its own — only an admin gets this far — but it keeps a
  -- malformed path from minting a ticket for something unrelated.
  v_head := split_part(coalesce(p_object_path, ''), '/', 1);
  if v_head = '' or v_head !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status', 'bad_path', 'message', 'That is not a poster this app uploaded.');
  end if;

  delete from public.poster_tickets where expires_at < now() - interval '1 day';

  insert into public.poster_tickets (event_id, object_path, purpose, created_by, expires_at)
  values (v_head::uuid, p_object_path, 'delete', upper(coalesce(p_name, '')), now() + interval '5 minutes');

  return jsonb_build_object('status', 'ok');
end $$;


-- ── 8. And take the default grants off the ticket table ───────────────────
-- Supabase grants anon and authenticated table privileges across the public
-- schema by default, so anon holds SELECT on poster_tickets even though nothing
-- should ever read it directly. RLS with no policies already reduces that to
-- zero rows — checked, not assumed: `set role anon; select count(*)` returns 0
-- with live tickets in the table. So this is not what makes the tickets secret.
--
-- It is worth doing anyway. The grant is the thing that would come back to life
-- the day somebody adds a permissive policy or turns RLS off while debugging
-- something else, and it also keeps the table off the PostgREST surface
-- entirely rather than exposing an endpoint that answers with an empty list.
-- The SECURITY DEFINER functions above run as the owner and are unaffected.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.poster_tickets from %I', r);
    end if;
  end loop;
end $$;

-- ── What this is and is not ───────────────────────────────────────────────
-- LOCKED: the bytes. Writing an object into this bucket requires a name and a
-- PIN that resolve to events_admin or above. The publishable key on its own
-- buys read access and nothing else. That is a real server-side lock, not a
-- check in the client.
--
-- NOT LOCKED, and worth being plain about:
--
--   * club_events itself is still ALL/public/using(true), poster_path
--     included. Anyone with the key from the bundle can point an event at a
--     different poster, or clear it, or delete the event. The image is gated;
--     the pointer to it is not. That is 002b's job, along with every other
--     table, and is deliberately not changed here.
--   * A ticket is good for five minutes and is not single-use, so within that
--     window the admin who minted it could write that one path more than once.
--     Bounded to one path, one bucket, and the size and MIME limits above.
--   * Public read means public forever, for as long as the object exists. A
--     poster uploaded by mistake is readable by anyone holding the URL until
--     it is removed — which is why removing really deletes rather than just
--     clearing the column.
--   * Anyone who is an admin can upload anything the MIME limits allow. This
--     grants the social convenor a real capability; it does not police it.
```

## 11. Live scores that update, and the PIN out of `live_games`

**File:** `supabase/migrations/20260903_live_games_creator_member_id.sql`
**Status:** Applied 31 August, 21:59 UTC as `live_games_creator_member_id` —
before the client that depends on it, and with the ledger read either side:
43 rows before, 44 after, tail `20260831215913`.

### The column is TEXT, not `uuid`

This was specified as `creator_member_id uuid references members(id)` and it
cannot be that. `members.id` is:

```
id  text  primary key  default (gen_random_uuid())::text
```

Postgres will not put a foreign key from a `uuid` column onto a `text` one, so
the migration as specified would have failed outright rather than applied
wrongly. The values are uuid-shaped; the column they point at is typed text and
matching it is what makes the reference legal. `draw_pairings`,
`member_claim_requests` and `phone_change_requests` all reference members by
text too — worth knowing before the same assumption is made again.

### What was actually wrong with the live scores

The brief said the client never subscribes. It does, and it has since the
feature shipped in `c9a3c51` — an unfiltered `postgres_changes` subscription on
`live_games`, correct in shape, cleaned up on unmount. The server has been
broadcasting the whole time: `live_games` is in `supabase_realtime` with
`pubinsert`, `pubupdate` and `pubdelete` all true.

So the score reaching 9 while a phone showed 6 was not a missing subscription.
It was a subscription with nothing underneath it:

* `subscribe()` was called with **no status callback**, so a channel that
  failed to join failed silently and the tab went on showing what it had.
* A phone locks, or the browser backgrounds the tab, and the socket is closed
  under it. Nothing noticed, and nothing re-read on the way back.
* There was no second source of truth, so a dead socket took the screen with
  it — which is exactly the reported symptom, including "only caught up on a
  manual pull-to-refresh".
* The screen said "updates automatically" whether or not it was.

The fix is therefore not a subscription. It is one that is watched
(`subscribe()` now reports SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED), a
30-second poll underneath that does not care whether the socket works, a
re-read on `visibilitychange`, `focus` and `online`, a channel rebuilt if we
wake up not live, and a re-read the moment the channel *does* join — which
closes the gap between the first fetch and the socket being ready that the old
code never closed.

### One channel, unfiltered — a deviation, deliberately

The brief asked for a per-game channel filtered on `id=eq.<gameId>`. There is
one unfiltered channel for the whole tab instead. The tab holds every game in
one array and the detail view is a lookup into it, so an unfiltered channel
already feeds both; a filtered one on top would deliver the same row twice and
add a join and a leave on every open and close of a game — more socket churn on
a phone, not less. One channel per tab is strictly fewer than one per
navigation, which is what the requirement was guarding against, and the table
holds single figures of rows so there is no bandwidth case either. Easy to
reverse.

### `updated_at` decides, and that is the whole reconciliation

The client writes `updated_at` on every patch and the server stores exactly
what it is sent, so the row held locally and the row that comes back are
directly comparable. One rule — strictly older loses, equal wins — covers four
things that would otherwise each need a special case: the marker's own `+1`
shown instantly and not snapped back by a poll that was already in flight;
realtime events arriving out of order after a socket reopens; the echo of our
own write; and two phones scoring at once, where last write wins as it always
did.

`REPLICA IDENTITY` is left at DEFAULT, so a DELETE payload carries the primary
key and nothing else. The code reads only `old.id`, and the test harness sends
exactly that shape so a regression breaks in CI rather than in front of the
club.

### Being honest about the permission check

`creator_member_id === myMemberId || isAdmin` is **advisory**, and so was the
check it replaces. `live_games` carries `using (true)` on select, insert,
update and delete, so anyone with the publishable key out of the JavaScript
bundle can update any game whatever the client believes. This change loses no
security that existed. What it does is take a **sign-in credential** out of a
world-readable table that has a share button on it.

The real fix is an RPC — `bowls_update_live_game(name, pin, game_id, patch)` —
verifying the PIN against `player_data.pin_hash` and the caller against
creator, assigned scorers and admins, with the table's write policies then
closed to `anon`. That belongs with the assigned-scorers work and is
deliberately not built here.

**One gap worth naming.** Only 67 of 216 members have linked a roster entry, so
149 signed-in members have no `members.id`. A game created by one of them still
writes `creator_cloudkey`, because the alternative is a game its own marker
cannot score. The credential is gone for linked creators and still written for
unlinked ones. Every signed-in account *does* have a `player_data.id` — keying
on that instead would close the gap completely, and is worth deciding before
`creator_cloudkey` is dropped.

### What the migration did to the three live rows

| Game | Before | After |
|---|---|---|
| `scheduled` / PAMELA | cloudkey | member id **and** cloudkey — in flight, so the old key stays until the fallback goes |
| `finished` / STUART WILLIAMSON | cloudkey | member id, cloudkey **cleared** |
| `finished` / W BROWN | neither | neither — was never linked |

Credentials in the table: 2 before, 1 after, and the one left is deliberate.
`creator_cloudkey` is **not** dropped — it goes when no bundle in the field
reads it, the same client-first ordering as everything else in this folder.

---

## 12. Poster paths get the club in front

**File:** `supabase/migrations/20260904_poster_path_club_prefix.sql`
**Status:** Applied 1 September, 09:31 UTC as `poster_path_club_prefix` —
ledger 44 rows before, 45 after, tail `20260901093137`.

```
was:  <event_id>/<file_uuid>.jpg
now:  <club_id>/<event_id>/<file_uuid>.jpg
```

"The first path segment is always the tenant id" is the convention the rest of
the estate follows, and it is what lets a storage policy read the club off a
path without a join. Bowls did not follow it. Done now because the bucket holds
exactly **one** object; at 200 clubs it is a migration of thousands of files.

The club is **derived, never passed**. `bowls_poster_ticket` reads `club_id`
off the `player_data` row that the caller's name + PIN resolve to. It re-checks
the PIN rather than matching `name_key` alone, because `bowls_register`
deliberately allows two accounts under one name with different PINs — and at
200 clubs those two rows can be in different clubs. That is a second bcrypt on
a path that already does one.

### The delete path had to change with it

`bowls_poster_remove_ticket` read the event id out of the **first** path
segment. Under the new shape that segment is the club, so left alone it would
have written a club id into `poster_tickets.event_id` — silently, because there
is no foreign key on that column to reject it, and the delete itself would
still have worked (`bowls_poster_ticket_ok` matches on `object_path`, not
`event_id`). It now accepts both shapes and takes the event from the right
position:

| path | outcome |
|---|---|
| `<club>/<event>/<file>` | accept, event = segment 2 |
| `<event>/<file>` (legacy) | accept, event = segment 1 |
| `evil.jpg`, `notauuid/…`, `../../…`, 4 segments | `bad_path` |

The legacy branch exists for the one object already in the bucket and can go
once that object has been replaced.

### What this is NOT

Preparation for a club check, not the check. The storage policies are
untouched — they still authorise by matching a live ticket's `object_path`, not
by inspecting the path. Two gaps stay open until the tenancy work:

* An `events_admin` of club A can still mint a ticket for club B's event; it
  would be written under A's prefix. The fix is an
  event-belongs-to-your-club check, and it belongs with tenancy.
* The path prefix alone does not protect anything yet, precisely because
  nothing reads it.

### The existing object was not moved

`062cda9f-…/2922d0b1-….jpg` — the George Hoffin poster, 156 KB — stays on the
old two-segment path. Renaming means moving it through the storage API;
editing `storage.objects.name` in SQL orphans the stored file from its row. It
keeps working (public read is path-agnostic, and `club_events.poster_path`
still matches it) and takes the new shape whenever it is next replaced.

The client needed no change: it round-trips `ticket.path` into `poster_path`
and hands `poster_path` back on removal, and `api/share.js` splits the path on
`/` and re-encodes per segment, so any depth works.

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

-- Does club_events exist yet, and does it have the duplicate guard?
select to_regclass('public.club_events') as club_events_table;
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'club_events';
```


---

## Rebuilding from scratch

The point of all of the above is this: an empty Supabase project, plus this
folder in filename order, should equal production. On 31 August 2026 that was
tested rather than assumed.

An empty PostgreSQL database was given the roles and schemas a Supabase project
ships with (`anon`, `authenticated`, `service_role`; `extensions`, `storage`),
the default privileges Supabase sets on `public`, and stand-ins for
`storage.buckets` and `storage.objects`. All thirteen migrations were then
applied in filename order, and every object in the result was compared against
the live database:

| Compared | Objects | Result |
|---|---|---|
| Columns (name, type, nullability, default) | 188 | identical |
| Constraints (PK, FK, unique, check) | 48 | identical |
| Indexes | 53 | identical |
| RLS policies, `public` and `storage` | 38 | identical |
| Functions (signature, `security definer`, `search_path`, EXECUTE grants) | 19 | identical |
| Function bodies, comments and whitespace normalised | 19 | identical |
| Triggers | 2 | identical |
| Tables and views (RLS flag, grants, `reloptions`) | 20 | identical |
| Storage buckets | 1 | identical |
| Realtime publication membership | 1 | identical |
| Column and object comments | 2 | identical |

Two differences were found and are understood:

* The live bodies of `bowls_revoke_admin` and `bowls_approve_admin_request`
  carry no explanatory comments where `20260831_grant_admin.sql` has 15 and 10
  lines of them. They were applied from a comment-stripped copy. The executable
  code is identical once comments are removed — `932bf29f012bf9fb64beb56a67310b23`
  over all nineteen functions on both sides. Cosmetic, and not worth a migration
  to production to change.
* Table grants read `arwdDxt` locally and `arwdDxtm` live. `m` is `MAINTAIN`,
  which exists in PostgreSQL 17 and not in 16. An artefact of the test rig, not
  of the migrations.

The folder was then applied a **second** time over its own output. Everything
ran clean and the schema fingerprint was unchanged, which is what "idempotent"
has to mean before it is safe to run any of this against a live database.

Finally, all of it was applied to production, where — being idempotent — it
changed nothing. The fingerprint over all 438 objects was
`6036add44f727cccddc567f6ffdac9f7` before and after, with 89 accounts and 216
roster rows untouched. The only thing that changed was the ledger.

### A note on how fast this moved

Production changed **three times while this reconciliation was being written**,
from a session working in parallel on the poster feature:

| Ledger entry | Time (UTC) | What |
|---|---|---|
| `20260831202034 event_posters` | 20:20 | the bucket, the column, the tickets, the functions |
| `20260831204330`–`204448` | 20:43–20:44 | this reconciliation's migrations |
| `20260831205042 event_posters_revoke_ticket_grants` | 20:50 | `revoke all on poster_tickets from anon, authenticated` |

The first landed after this audit had taken its inventory, which is why
`club_events.poster_path` appears in the second read of the schema and not the
first. The third landed after the verification run, which is why the comparison
above had to be done again afterwards — and it is why this folder briefly
carried a duplicate, already-stale copy of the poster migration, which was
caught by diffing rather than by trusting, and removed.

That is not a complaint about anyone's timing. It is the argument for the rule
that came out of the night: **one named owner for the database, with the ledger
read either side of any change.** Three parties wrote to one schema inside an
hour and none could see the others' work. The read afterwards is the half that
does the work — the read before was honest in every case, and still went stale
within minutes.

### What is deliberately NOT reproduced

* **Seed data** — Irvine Park's tournaments, roll of honour, roster, admin
  rows, committee positions, phone numbers. This club's records, not schema.
* **The one row that is not optional** — `clubs`. Fifteen tables default
  `club_id` to Irvine Park's id and carry a foreign key to `clubs`, so without
  that row every insert fails. The baseline inserts it, flagged, because the
  schema does not function without it. A second club needs its own id in those
  defaults; see the note at the head of the baseline.
* **The ad-hoc backup tables** — `admins_backup_20260830`,
  `club_fixtures_backup_20260829`, `login_lockouts_cleared_20260829`,
  `members_backup_20260829`, `player_data_backup_20260829`,
  `player_data_deleted_20260830`, `roll_of_honour_backup_20260829`. They hold
  real rows in production and are the residue of this club's data repairs. A
  new club has nothing to have backed up. Listed here so that a future diff
  against production explains itself instead of looking like fresh drift.

### Known gaps, reported not fixed

* `draw_results.draw_id` has **no foreign key** to `draws`, where
  `draw_pairings.draw_id` does and cascades. Deleting a draw takes its pairings
  and orphans its results. Almost certainly an oversight in `20260620125947`,
  but production is what this folder records.
* The `club_id` default is Irvine Park's UUID, hardcoded on fifteen tables, and
  `club_config`'s primary key is `(key)` alone rather than `(club_id, key)`, so
  two clubs cannot hold the same setting under different values. Both need
  settling before club two.
* `player_data` carries an `ALL / using(true)` policy, so `pin_hash` is readable
  by anything holding the publishable key. That is `002b`'s, and untouched.

