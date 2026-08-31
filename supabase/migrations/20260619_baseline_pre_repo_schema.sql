-- ════════════════════════════════════════════════════════════════════════
--  BASELINE  —  the schema that was never written down
--
--  Everything below already exists in the live database. None of it was
--  ever in this repository. It was applied directly in the Supabase SQL
--  editor between 19 June and 30 August, in the twenty-seven ledger
--  entries listed at the foot of this file, and the README said so in
--  plain words: "The earlier schema work is not in the repo."
--
--  That sentence was survivable while there was one club. It stops being
--  survivable the day there are two, because at that point the ledger IS
--  the build. A second club running the migrations in this folder in
--  order would have got, before this file existed, a database with no
--  members table, no player_data, no admins, no draws — and then eight
--  migrations that all fail on the first line that references one.
--
--  So this is not a new migration in the sense of changing anything. It
--  is the missing first chapter, reconstructed from the live database by
--  introspection (information_schema, pg_constraint, pg_indexes,
--  pg_policies, pg_get_functiondef) on 31 August 2026, so that an empty
--  Supabase project can reach the same place production is.
--
--  WHAT IS DELIBERATELY NOT HERE
--
--  * Seed data. Ledger entries 20260619094840 seed_tournaments,
--    20260619094849 seed_roll_of_honour, 20260620151449
--    seniors_tournaments and 20260829214411
--    load_roll_of_honour_from_clubhouse_boards insert Irvine Park's
--    tournaments and Irvine Park's roll of honour. Those are this club's
--    records, not schema. A new club starts with empty tables and fills
--    them in, which is correct.
--
--  * The ad-hoc backup tables — admins_backup_20260830,
--    club_fixtures_backup_20260829, login_lockouts_cleared_20260829,
--    members_backup_20260829, player_data_backup_20260829,
--    player_data_deleted_20260830, roll_of_honour_backup_20260829. They
--    exist in production and hold real rows, and they are the residue of
--    this club's data repairs. A new club has nothing to have backed up.
--    They are listed here so that a future diff between this file and
--    production explains itself rather than looking like fresh drift.
--
--  * Anything one of the nine existing migration files already creates.
--    live_games belongs to 20260722_live_games.sql, club_events to
--    20260830_club_events.sql, bowls_admin_reset_pin to
--    20260830_admin_reset_pin.sql, bowls_is_super_admin /
--    bowls_grant_admin / bowls_revoke_admin / bowls_approve_admin_request
--    and the admin_requests reshaping to 20260831_grant_admin.sql, and
--    bowls_admin_role plus the admins.role check to
--    20260901_admin_role_layers.sql. This file stops exactly where they
--    start, so each change still has one owner.
--
--  Every statement is idempotent, so running this against the live
--  database is a no-op — which is the point: it registers in the ledger
--  without touching a single row.
-- ════════════════════════════════════════════════════════════════════════


-- ── Extensions ────────────────────────────────────────────────────────────
-- crypt() and gen_salt() are pgcrypto, and every SECURITY DEFINER function
-- below reaches them through "set search_path = public, extensions". A
-- Supabase project ships these installed; the guard is for a bare Postgres.
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;


-- ── Clubs, and the one row the schema cannot do without ───────────────────
-- Ledger: 20260830093855 add_club_id_tenancy_groundwork.
--
-- Fifteen tables below carry "club_id uuid not null default
-- '61f82a8a-09cf-4385-874b-1741925bebe7'" with a foreign key to this table.
-- That default is Irvine Park's id, hardcoded. It means the clubs row is not
-- optional seed data: without it every insert into every one of those tables
-- fails the foreign key, and the app does not start.
--
-- READ THIS BEFORE ONBOARDING CLUB TWO. A second club's database wants its
-- OWN id in that default, not Irvine Park's. Reproducing the hardcoded
-- default here is faithful to production and is what this file is for; it is
-- not an endorsement. See the note in supabase/migrations/README.md.
create table if not exists public.clubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  short_name text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

insert into public.clubs (id, name, short_name, slug)
values ('61f82a8a-09cf-4385-874b-1741925bebe7',
        'Irvine Park Bowling Club', 'IPBC', 'irvine-park')
on conflict (id) do nothing;


-- ── player_data — an app account ──────────────────────────────────────────
-- Ledger: 20260619094827 create_core_tables, 20260620093541
-- add_ties_to_player_data, 20260620095415 add_profile_to_player_data,
-- 20260829174351 secure_player_auth (id, name_key, pin_hash).
--
-- player_name is the legacy "NAME-PIN" sign-in key and is still the primary
-- key. name_key + pin_hash are what the auth functions actually match on:
-- the PIN is bcrypt-hashed and never compared in the clear. id is the stable
-- identity everything added since refers to.
create table if not exists public.player_data (
  player_name text primary key,
  entries     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  ties        jsonb default '{}'::jsonb,
  profile     jsonb default '{}'::jsonb,
  id          uuid not null default gen_random_uuid(),
  display_name text,
  name_key    text not null,
  pin_hash    text not null,
  club_id     uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                references public.clubs(id)
);

create unique index if not exists player_data_id_idx       on public.player_data (id);
create index        if not exists player_data_name_key_idx on public.player_data (name_key);
create index        if not exists player_data_club_id_idx  on public.player_data (club_id);


-- ── members — the club roster ─────────────────────────────────────────────
-- Ledger: 20260619094827 create_core_tables, 20260619230426
-- member_name_linking, 20260830081453 keep_linked_player_id_in_sync,
-- 20260830092607 one_account_per_roster_entry.
--
-- A roster entry exists whether or not the person uses the app. linked_*
-- is how a roster name and an app account become the same person.
create table if not exists public.members (
  id         text primary key default (gen_random_uuid())::text,
  name       text not null,
  phone      text,
  section    text not null default 'gents',
  position   text,
  sort_order integer not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  linked_cloudkey  text,
  linked_player_id uuid,
  club_id    uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
               references public.clubs(id)
);

-- One roster entry per account, both ways round. Partial, because "nobody has
-- claimed this name yet" is null and nulls must not collide with each other.
create unique index if not exists members_linked_cloudkey_uniq
  on public.members (linked_cloudkey)  where linked_cloudkey  is not null;
create unique index if not exists members_linked_player_id_uniq
  on public.members (linked_player_id) where linked_player_id is not null;
create index if not exists members_club_id_idx on public.members (club_id);


-- ── admins ────────────────────────────────────────────────────────────────
-- Ledger: 20260619094827 create_core_tables, plus player_id added by
-- 20260830092607 one_account_per_roster_entry.
--
-- cloud_key is the primary key and is a sign-in key, which is why
-- 20260830095508 had to keep it in step on a PIN reset and why
-- 20260831_grant_admin.sql adds admins_player_id_uniq as the beginning of
-- moving off it. The role CHECK arrives in 20260901_admin_role_layers.sql.
create table if not exists public.admins (
  cloud_key    text primary key,
  player_name  text,
  role         text not null default 'admin',
  display_name text,
  created_at   timestamptz not null default now(),
  player_id    uuid,
  club_id      uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                 references public.clubs(id)
);

create index if not exists admins_club_id_idx on public.admins (club_id);


-- ── admin_requests — "please make me an admin" ────────────────────────────
-- Ledger: 20260619095629 create_admin_requests.
--
-- Created here in its ORIGINAL shape minus cloud_key. 20260831_grant_admin.sql
-- adds player_id and requested_role, adds the unique index, and drops
-- cloud_key. Since cloud_key never survives to production there is nothing to
-- be gained by creating it just to drop it two files later, so it is left out
-- and that migration's "drop column if exists" is simply a no-op here.
create table if not exists public.admin_requests (
  id           uuid primary key default gen_random_uuid(),
  player_name  text not null,
  requested_at timestamptz not null default now(),
  club_id      uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                 references public.clubs(id)
);

create index if not exists admin_requests_club_id_idx on public.admin_requests (club_id);


-- ── login_lockouts — five wrong PINs and you wait ─────────────────────────
-- Ledger: 20260619095221 create_login_lockouts, 20260830085042
-- throttle_admin_pin_guessing.
--
-- Keyed by name, and the name is overloaded on purpose: a bare name_key is a
-- sign-in counter, and 'ADMIN:' || name_key is the admin-check counter that
-- bowls_is_admin and bowls_admin_role write to. The unique index on name is
-- what the "on conflict (name) do update" in those functions needs.
create table if not exists public.login_lockouts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  attempts         integer not null default 1,
  locked_until     timestamptz,
  unlock_requested boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  club_id          uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                     references public.clubs(id)
);

create index if not exists login_lockouts_club_id_idx on public.login_lockouts (club_id);


-- ── member_claim_requests — "that roster entry is me" ─────────────────────
-- Ledger: 20260619230426 member_name_linking, 20260620093944
-- secure_member_claim_requests.
create table if not exists public.member_claim_requests (
  id                      uuid primary key default gen_random_uuid(),
  requester_cloudkey      text not null,
  requester_display_name  text not null,
  target_member_id        text not null,
  target_member_name      text not null,
  current_linked_cloudkey text,
  status                  text not null default 'pending',
  requested_at            timestamptz not null default now(),
  resolved_at             timestamptz,
  club_id                 uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                            references public.clubs(id)
);

create index if not exists member_claim_requests_status_idx  on public.member_claim_requests (status);
create index if not exists member_claim_requests_club_id_idx on public.member_claim_requests (club_id);


-- ── member_join_requests — "I'd like to join the club" ────────────────────
create table if not exists public.member_join_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  section      text not null default 'gents',
  requested_at timestamptz not null default now(),
  status       text not null default 'pending',
  club_id      uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                 references public.clubs(id)
);

create index if not exists member_join_requests_club_id_idx on public.member_join_requests (club_id);


-- ── phone_change_requests — "my number has changed" ───────────────────────
-- A member cannot edit the roster, so a change of number is a request an
-- admin applies with bowls_admin_set_member_phone.
create table if not exists public.phone_change_requests (
  id              uuid primary key default gen_random_uuid(),
  member_id       text,
  member_name     text,
  current_phone   text,
  requested_phone text,
  requested_at    timestamptz not null default now(),
  club_id         uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                    references public.clubs(id)
);

create index if not exists phone_change_requests_club_id_idx on public.phone_change_requests (club_id);


-- ── club_config — loose key/value settings ────────────────────────────────
-- NOTE the primary key is (key) alone and not (club_id, key), so two clubs
-- cannot hold the same setting under different values. Faithful to production;
-- flagged in the README as something to settle before club two.
create table if not exists public.club_config (
  key     text primary key,
  value   jsonb not null default '{}'::jsonb,
  club_id uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
            references public.clubs(id)
);

create index if not exists club_config_club_id_idx on public.club_config (club_id);


-- ── club_fixtures — the match calendar ────────────────────────────────────
-- Distinct from club_events (20260830_club_events.sql): a fixture is a game
-- against another club, an event is a night in the clubhouse.
create table if not exists public.club_fixtures (
  id         uuid primary key default gen_random_uuid(),
  event_date date not null,
  event      text not null,
  time       text,
  venue      text not null default 'home',
  rinks      integer,
  sort_order integer not null default 99,
  club_id    uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
               references public.clubs(id)
);

-- Same night, same fixture name, twice, is a double-entry rather than a real
-- second game. lower() so "Ayr Away" and "Ayr away" collide.
create unique index if not exists club_fixtures_no_dupes
  on public.club_fixtures (event_date, lower(event));
create index if not exists club_fixtures_club_id_idx on public.club_fixtures (club_id);


-- ── tournaments ───────────────────────────────────────────────────────────
-- Ledger: 20260619094827 create_core_tables, 20260620150914
-- ladies_tournaments_and_draws_section.
-- Structure only. Irvine Park's own tournaments are seed data and are not
-- reproduced here.
create table if not exists public.tournaments (
  id          text primary key,
  name        text not null,
  type        text not null default 'knockout',
  color       text,
  rounds      jsonb not null default '[]'::jsonb,
  round_dates jsonb not null default '{}'::jsonb,
  section     text not null default 'gents',
  source      text,
  sort_order  integer not null default 99,
  created_at  timestamptz not null default now(),
  club_id     uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                references public.clubs(id)
);

create index if not exists tournaments_club_id_idx on public.tournaments (club_id);


-- ── roll_of_honour ────────────────────────────────────────────────────────
-- Ledger: 20260619094849 seed_roll_of_honour (structure),
-- 20260829215235 protect_roll_of_honour_writes (the grants further down).
-- Structure only — the winners on the clubhouse boards are this club's.
create table if not exists public.roll_of_honour (
  id         text primary key,
  name       text not null,
  color      text,
  sort_order integer not null default 99,
  winners    jsonb not null default '[]'::jsonb,
  club_id    uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
               references public.clubs(id)
);

create index if not exists roll_of_honour_club_id_idx on public.roll_of_honour (club_id);


-- ── draws, and what comes out of them ─────────────────────────────────────
-- Ledger: 20260619111721 add_round_dates_to_draws, 20260620112351
-- draws_version_history, 20260620112901 draws_is_test, 20260620125947
-- draw_results, 20260620150914 (section), 20260620155448
-- draws_approval_workflow.
create table if not exists public.draws (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    text not null,
  tournament_name  text not null,
  season_year      integer not null,
  generated_by     text not null,
  generated_at     timestamptz default now(),
  published        boolean default false,
  published_at     timestamptz,
  round_dates      jsonb default '[]'::jsonb,
  version          integer not null default 1,
  revision_history jsonb not null default '[]'::jsonb,
  is_test          boolean not null default false,
  section          text not null default 'gents',
  pending_approval boolean not null default false,
  approval_requested_by text,
  approval_requested_at timestamptz,
  approved_by      text,
  approved_at      timestamptz,
  club_id          uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                     references public.clubs(id),
  -- One live draw per tournament per season. A redraw bumps version and
  -- appends to revision_history rather than inserting a second row.
  unique (tournament_id, season_year)
);

create index if not exists draws_club_id_idx on public.draws (club_id);

create table if not exists public.draw_pairings (
  id            uuid primary key default gen_random_uuid(),
  draw_id       uuid not null references public.draws(id) on delete cascade,
  player_name   text not null,
  opponent_name text,
  pairing_index integer not null,
  round_type    text not null default 'main',
  slot_index    integer,
  handicap      text,
  club_id       uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                  references public.clubs(id)
);

create index if not exists draw_pairings_club_id_idx on public.draw_pairings (club_id);

create table if not exists public.draw_results (
  id             uuid primary key default gen_random_uuid(),
  -- NOTE: no foreign key on draw_id, and that is what production has.
  -- draw_pairings.draw_id DOES reference draws(id) on delete cascade; this
  -- one does not, so deleting a draw cascades away its pairings and leaves
  -- its results behind as orphans. Almost certainly an oversight in
  -- 20260620125947 draw_results rather than a decision — but production is
  -- the truth this file records, and adding a constraint that production has
  -- never had would be a behaviour change on a table with live rows in it.
  -- Raised in the report; not fixed here.
  draw_id        uuid not null,
  round_num      integer not null,
  player_slot    integer not null,
  player_name    text not null,
  opponent_name  text,
  player_score   integer,
  opponent_score integer,
  result         text not null,
  date_played    date,
  created_at     timestamptz default now(),
  club_id        uuid not null default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid
                   references public.clubs(id),
  -- One result per player per round of a draw; a re-entered score updates.
  unique (draw_id, round_num, player_slot)
);

alter table public.draw_results drop constraint if exists draw_results_result_check;
alter table public.draw_results add  constraint draw_results_result_check
  check (result = any (array['W'::text, 'L'::text, 'BYE'::text]));

create index if not exists draw_results_club_id_idx on public.draw_results (club_id);


-- ── members_public — the roster without the phone numbers ─────────────────
-- Ledger: 20260829210509 additive_prep_members_public_and_gated_writes.
--
-- members carries phone numbers and an ALL/using(true) policy, so anything
-- holding the publishable key can read them. This view is the column subset
-- the app is supposed to read instead.
--
-- security_invoker = off deliberately: the view runs as its owner, which is
-- how it can show roster rows without the caller needing rights on members.
-- That is only a boundary once members itself is locked down; today it is
-- preparation, and the README is honest that the lockdown is still owed.
create or replace view public.members_public
with (security_invoker = off) as
  select id,
         name,
         section,
         "position",
         sort_order,
         linked_player_id,
         linked_player_id is not null as is_linked
    from public.members;


-- ════════════════════════════════════════════════════════════════════════
--  FUNCTIONS
--
--  Bodies taken verbatim from the live database with pg_get_functiondef on
--  31 August 2026 — not reconstructed from memory or from the client. Where
--  a body and a repo file disagree, the database is what 89 accounts are
--  signing in against tonight.
-- ════════════════════════════════════════════════════════════════════════

-- ── bowls_name_key — one name, one key ────────────────────────────────────
-- "J. Frew", "j frew" and "JFREW" are the same person to a bowls club and
-- have to be the same person to a unique index. Upper, strip everything that
-- is not A-Z0-9. IMMUTABLE because player_data_name_key_idx depends on it.
create or replace function public.bowls_name_key(p_name text)
returns text
language sql
immutable
as $function$
  select regexp_replace(upper(coalesce(p_name, '')), '[^A-Z0-9]', '', 'g');
$function$;


-- ── player_data_backfill_keys — no account without a hashed PIN ───────────
-- Ledger: 20260829175010 player_data_backfill_keys_trigger, 20260829210344
-- backfill_trigger_security_definer.
--
-- The legacy write path inserts player_name as "NAME-PIN" and nothing else.
-- This derives name_key and a bcrypt pin_hash from it, so a row can never
-- land with a null hash and become an account nobody can authenticate. A
-- player_name that is not in NAME-PIN form and supplies neither is refused
-- outright rather than written half-formed.
create or replace function public.player_data_backfill_keys()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if new.player_name !~ '-[0-9]{4}$' and (new.name_key is null or new.pin_hash is null) then
    raise exception 'player_data.player_name % does not match NAME-PIN and no name_key/pin_hash was supplied', new.player_name;
  end if;

  if new.name_key is null then
    new.name_key := public.bowls_name_key(regexp_replace(new.player_name, '-[0-9]{4}$', ''));
  end if;

  if new.pin_hash is null then
    new.pin_hash := extensions.crypt(substring(new.player_name from '([0-9]{4})$'), extensions.gen_salt('bf', 10));
  end if;

  if new.display_name is null then
    new.display_name := coalesce(
      nullif(new.profile->>'displayName', ''),
      regexp_replace(new.player_name, '-[0-9]{4}$', '')
    );
  end if;

  return new;
end $function$;

create or replace trigger player_data_backfill_keys
  before insert or update on public.player_data
  for each row execute function public.player_data_backfill_keys();


-- ── members_sync_linked_player_id — one link, kept in two places ──────────
-- Ledger: 20260830081453 keep_linked_player_id_in_sync.
--
-- linked_cloudkey is what the old client writes; linked_player_id is what
-- everything written since reads. Deriving the second from the first in a
-- trigger is what stops them drifting apart — and drifting apart is exactly
-- the class of bug this whole migration set is about.
create or replace function public.members_sync_linked_player_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.linked_cloudkey is null then
    new.linked_player_id := null;
  else
    select d.id into new.linked_player_id
      from public.player_data d
     where d.player_name = new.linked_cloudkey
     limit 1;
  end if;
  return new;
end $function$;

create or replace trigger members_sync_linked_player_id
  before insert or update of linked_cloudkey on public.members
  for each row execute function public.members_sync_linked_player_id();


-- ── bowls_sign_in — the front door ────────────────────────────────────────
-- Ledger: 20260829174351 secure_player_auth.
--
-- The PIN is compared with crypt() against the stored bcrypt hash, so the
-- client never sends anything the database stores in the clear. Five wrong
-- PINs locks the name for 24 hours. "not_found" and "wrong_pin" are told
-- apart on purpose: a bowls club would rather say "there's no account in
-- that name" than leave a 78-year-old guessing.
create or replace function public.bowls_sign_in(p_name text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_key    text;
  v_row    public.player_data%rowtype;
  v_lock   public.login_lockouts%rowtype;
  v_exists boolean;
  v_max_attempts constant integer := 5;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_lock from public.login_lockouts where name = v_key;
  if found and v_lock.locked_until is not null and v_lock.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_lock.locked_until);
  end if;

  select * into v_row
    from public.player_data
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  if found then
    delete from public.login_lockouts where name = v_key;
    return jsonb_build_object(
      'status',       'ok',
      'id',           v_row.id,
      'cloud_key',    v_row.player_name,
      'display_name', v_row.display_name,
      'entries',      v_row.entries,
      'ties',         v_row.ties,
      'profile',      v_row.profile,
      'updated_at',   v_row.updated_at
    );
  end if;

  select exists(select 1 from public.player_data where name_key = v_key) into v_exists;
  if not v_exists then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.login_lockouts (name, attempts, updated_at)
  values (v_key, 1, now())
  on conflict (name) do update
    set attempts     = public.login_lockouts.attempts + 1,
        updated_at   = now(),
        locked_until = case
                         when public.login_lockouts.attempts + 1 >= v_max_attempts
                         then now() + interval '24 hours'
                         else null
                       end
  returning * into v_lock;

  return jsonb_build_object(
    'status',       'wrong_pin',
    'attempts',     v_lock.attempts,
    'remaining',    greatest(v_max_attempts - v_lock.attempts, 0),
    'locked_until', v_lock.locked_until
  );
end $function$;


-- ── bowls_register — a new account, or the one you already had ────────────
-- The advisory lock serialises two taps on a slow phone so the same person
-- cannot create two accounts. Returning 'existing' rather than an error for a
-- correct name+PIN is what makes a re-register on a new phone just work.
create or replace function public.bowls_register(p_name text, p_pin text, p_display text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_key     text;
  v_row     public.player_data%rowtype;
  v_display text;
  v_legacy  text;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_display := upper(trim(coalesce(nullif(trim(coalesce(p_display, '')), ''), p_name)));
  v_legacy  := v_display || '-' || p_pin;

  perform pg_advisory_xact_lock(hashtext('bowls_register:' || v_key || ':' || p_pin));

  select * into v_row
    from public.player_data
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  if found then
    return jsonb_build_object(
      'status',       'existing',
      'id',           v_row.id,
      'cloud_key',    v_row.player_name,
      'display_name', v_row.display_name,
      'entries',      v_row.entries,
      'ties',         v_row.ties,
      'profile',      v_row.profile,
      'updated_at',   v_row.updated_at
    );
  end if;

  insert into public.player_data (player_name, display_name, name_key, pin_hash, entries, ties, profile, updated_at)
  values (v_legacy, v_display, v_key,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
          '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, now())
  on conflict (player_name) do update set updated_at = now()
  returning * into v_row;

  delete from public.login_lockouts where name = v_key;

  return jsonb_build_object(
    'status',       'created',
    'id',           v_row.id,
    'cloud_key',    v_row.player_name,
    'display_name', v_row.display_name,
    'entries',      v_row.entries,
    'ties',         v_row.ties,
    'profile',      v_row.profile,
    'updated_at',   v_row.updated_at
  );
end $function$;


-- ── bowls_save_player — write your own row and nobody else's ──────────────
-- The name+PIN is re-checked in the UPDATE's WHERE clause, so an unmatched
-- credential updates zero rows and returns 'denied' rather than trusting a
-- caller who says who they are.
create or replace function public.bowls_save_player(p_name text, p_pin text, p_entries jsonb default null, p_ties jsonb default null, p_profile jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_key text;
  v_row public.player_data%rowtype;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.player_data
     set entries    = coalesce(p_entries, entries),
         ties       = coalesce(p_ties, ties),
         profile    = coalesce(p_profile, profile),
         updated_at = now()
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
  returning * into v_row;

  if not found then
    return jsonb_build_object('status', 'denied');
  end if;

  return jsonb_build_object('status', 'ok', 'updated_at', v_row.updated_at);
end $function$;


-- ── bowls_is_admin — is this name and PIN an admin? ───────────────────────
-- Ledger: 20260830085042 throttle_admin_pin_guessing, 20260830085433
-- remove_pg_sleep_from_admin_check.
--
-- Keeps its anon grant, unlike bowls_is_super_admin: the client calls it on
-- every sign-in to decide whether to draw the admin panel, and revoking it
-- would lock every admin out. The mitigation is the 'ADMIN:' lockout counter
-- — a wrong guess is counted, which is why this one can stay exposed and the
-- silent super-admin oracle cannot. See 20260831_grant_admin.sql.
create or replace function public.bowls_is_admin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $function$
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
    insert into public.login_lockouts (name, attempts, updated_at)
    values ('ADMIN:' || v_key, 1, now())
    on conflict (name) do update
      set attempts = login_lockouts.attempts + 1, updated_at = now();
    return false;
  end if;

  delete from public.login_lockouts where name = 'ADMIN:' || v_key;

  return exists (
    select 1 from public.admins a
     where a.player_id = v_id and a.role in ('admin', 'super_admin')
  );
end $function$;


-- ── bowls_link_member — claim your name on the roster ─────────────────────
-- Refuses when the roster entry is already linked to somebody else, so
-- claiming is first-come and a second claimant is told rather than silently
-- taking the entry over.
create or replace function public.bowls_link_member(p_name text, p_pin text, p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare v_id uuid; v_key text; v_taken uuid;
begin
  select d.id, d.player_name into v_id, v_key
    from public.player_data d
   where d.name_key = public.bowls_name_key(p_name)
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_id is null then
    return jsonb_build_object('status', 'denied');
  end if;

  select linked_player_id into v_taken from public.members where id = p_member_id;
  if v_taken is not null and v_taken <> v_id then
    return jsonb_build_object('status', 'already_linked');
  end if;

  update public.members
     set linked_player_id = v_id,
         linked_cloudkey  = v_key,
         updated_at       = now()
   where id = p_member_id;

  return jsonb_build_object('status', 'ok');
end $function$;


-- ── bowls_admin_set_member_phone — an admin applies a number change ───────
create or replace function public.bowls_admin_set_member_phone(p_name text, p_pin text, p_member_id text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if not public.bowls_is_admin(p_name, p_pin) then
    return jsonb_build_object('status', 'denied');
  end if;
  update public.members set phone = p_phone, updated_at = now() where id = p_member_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end $function$;


-- ── claim_super_admin_tx — the very first admin ───────────────────────────
-- Ledger: 20260626134531 claim_super_admin_function_and_rls.
--
-- A brand new club has nobody who can grant anybody else admin, so the first
-- person to claim it becomes super admin and the door then shuts: 'EXISTS'
-- for everyone after. The advisory lock makes two simultaneous claims
-- resolve to one winner rather than two super admins.
create or replace function public.claim_super_admin_tx(p_cloud_key text, p_player_name text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  already_me  boolean;
  existing_ct integer;
BEGIN
  -- Advisory lock serialises concurrent claims at the DB level
  PERFORM pg_advisory_xact_lock(hashtext('claim_super_admin'));

  SELECT EXISTS(
    SELECT 1 FROM admins
    WHERE role = 'super_admin'
      AND (cloud_key = p_cloud_key OR player_name = p_player_name)
  ) INTO already_me;

  IF already_me THEN
    RETURN 'RESTORED';
  END IF;

  SELECT COUNT(*) INTO existing_ct FROM admins WHERE role = 'super_admin';

  IF existing_ct > 0 THEN
    RETURN 'EXISTS';
  END IF;

  INSERT INTO admins (cloud_key, player_name, role, display_name)
  VALUES (p_cloud_key, p_player_name, 'super_admin', p_player_name)
  ON CONFLICT (cloud_key) DO UPDATE
    SET role         = 'super_admin',
        player_name  = p_player_name,
        display_name = p_player_name;

  RETURN 'CLAIMED';
END;
$function$;


-- ════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
--
--  Reproduced exactly as production has it, INCLUDING the parts that are
--  not much of a boundary. players_data, members, admins, tournaments and
--  the request queues all carry ALL / using(true) / with check(true), so
--  anything holding the publishable key out of the JS bundle can read and
--  write them directly. That is what the README calls "002b's job" and it
--  is deliberately NOT changed here — this file is bookkeeping, and
--  tightening a policy is a behaviour change that deserves its own
--  migration, its own testing and its own night that is not this one.
--
--  It is written down rather than left implicit precisely so that the gap
--  is visible to whoever picks 002b up.
-- ════════════════════════════════════════════════════════════════════════

alter table public.clubs                 enable row level security;
alter table public.player_data           enable row level security;
alter table public.members               enable row level security;
alter table public.admins                enable row level security;
alter table public.admin_requests        enable row level security;
alter table public.login_lockouts        enable row level security;
alter table public.member_claim_requests enable row level security;
alter table public.member_join_requests  enable row level security;
alter table public.phone_change_requests enable row level security;
alter table public.club_config           enable row level security;
alter table public.club_fixtures         enable row level security;
alter table public.tournaments           enable row level security;
alter table public.roll_of_honour        enable row level security;
alter table public.draws                 enable row level security;
alter table public.draw_pairings         enable row level security;
alter table public.draw_results          enable row level security;

-- Drop-then-create throughout: "create policy" has no IF NOT EXISTS, and a
-- bare create against a policy that is already there aborts the migration.

drop policy if exists "clubs public read" on public.clubs;
create policy "clubs public read" on public.clubs
  for select to anon, authenticated using (true);

drop policy if exists "public_read_write" on public.player_data;
create policy "public_read_write" on public.player_data
  for all using (true) with check (true);

drop policy if exists "open" on public.members;
create policy "open" on public.members for all using (true) with check (true);

-- admins: readable by anyone (the client reads it to draw the panel), and
-- writable by anyone EXCEPT for super_admin rows. That carve-out is the only
-- thing standing between the publishable key and a self-granted super admin,
-- which is why the role is checked in both USING and WITH CHECK on update —
-- you can neither escape a super_admin row nor promote yourself into one.
drop policy if exists "public_read"            on public.admins;
drop policy if exists "anon_insert_non_super"  on public.admins;
drop policy if exists "anon_update_non_super"  on public.admins;
drop policy if exists "anon_delete_non_super"  on public.admins;
create policy "public_read" on public.admins
  for select using (true);
create policy "anon_insert_non_super" on public.admins
  for insert with check (role <> 'super_admin'::text);
create policy "anon_update_non_super" on public.admins
  for update using (role <> 'super_admin'::text) with check (role <> 'super_admin'::text);
create policy "anon_delete_non_super" on public.admins
  for delete using (role <> 'super_admin'::text);

drop policy if exists "open" on public.admin_requests;
create policy "open" on public.admin_requests for all using (true) with check (true);

drop policy if exists "open" on public.login_lockouts;
create policy "open" on public.login_lockouts for all using (true) with check (true);

drop policy if exists "anyone can insert claim requests" on public.member_claim_requests;
drop policy if exists "anyone can update claim requests" on public.member_claim_requests;
drop policy if exists "requester can read own requests"  on public.member_claim_requests;
create policy "anyone can insert claim requests" on public.member_claim_requests
  for insert with check (true);
create policy "anyone can update claim requests" on public.member_claim_requests
  for update using (true) with check (true);
-- Named for an intention it does not yet enforce: the predicate is true, so
-- it reads every request, not the caller's own. Left exactly as production
-- has it. Renaming or narrowing it is 002b's, not tonight's.
create policy "requester can read own requests" on public.member_claim_requests
  for select using (true);

drop policy if exists "open" on public.member_join_requests;
create policy "open" on public.member_join_requests for all using (true) with check (true);

drop policy if exists "open" on public.phone_change_requests;
create policy "open" on public.phone_change_requests for all using (true) with check (true);

drop policy if exists "open" on public.club_config;
create policy "open" on public.club_config for all using (true) with check (true);

drop policy if exists "open" on public.club_fixtures;
create policy "open" on public.club_fixtures for all using (true) with check (true);

drop policy if exists "open" on public.tournaments;
create policy "open" on public.tournaments for all using (true) with check (true);

-- roll_of_honour is read-only to the app. The boards in the clubhouse are the
-- record; the app shows them and must not be able to rewrite them. Enforced
-- twice over — by having no write policy, and by the revoked grants below.
drop policy if exists "public_read" on public.roll_of_honour;
create policy "public_read" on public.roll_of_honour
  for select to anon, authenticated using (true);

-- Ledger: 20260626134751 rls_draws_draw_results_draw_pairings.
--
-- A draw is only readable once it is published, so an unpublished or test
-- draw is not visible to the club while it is being worked on. Writes are
-- gated on the writer's name appearing in admins with a drawing role.
--
-- NOTE the 'draw_admin' in these three predicates. That role is not in any
-- migration file in this repository — the June ledger entry predates the role
-- existing, and it reached the live policies by hand at some point after.
-- Recorded here for the first time, as production has it.
drop policy if exists "public read published draws" on public.draws;
drop policy if exists "admin_insert_draws"          on public.draws;
drop policy if exists "admin_update_draws"          on public.draws;
create policy "public read published draws" on public.draws
  for select using (published = true);
create policy "admin_insert_draws" on public.draws
  for insert with check (exists (
    select 1 from public.admins
     where admins.role = any (array['admin'::text, 'super_admin'::text, 'draw_admin'::text])
       and admins.player_name = draws.generated_by));
create policy "admin_update_draws" on public.draws
  for update using (exists (
    select 1 from public.admins
     where admins.role = any (array['admin'::text, 'super_admin'::text, 'draw_admin'::text])
       and admins.player_name = draws.generated_by))
  with check (exists (
    select 1 from public.admins
     where admins.role = any (array['admin'::text, 'super_admin'::text, 'draw_admin'::text])
       and admins.player_name = draws.generated_by));

drop policy if exists "public read pairings"   on public.draw_pairings;
drop policy if exists "admin_insert_pairings"  on public.draw_pairings;
drop policy if exists "anon_delete_pairings"   on public.draw_pairings;
create policy "public read pairings" on public.draw_pairings
  for select using (true);
create policy "admin_insert_pairings" on public.draw_pairings
  for insert with check (exists (
    select 1 from public.draws d
      join public.admins a on a.player_name = d.generated_by
     where d.id = draw_pairings.draw_id
       and a.role = any (array['admin'::text, 'super_admin'::text, 'draw_admin'::text])));
-- Asymmetric on purpose: regenerating a draw deletes the old pairings first,
-- and the delete runs before the new draw row that would authorise it exists.
create policy "anon_delete_pairings" on public.draw_pairings
  for delete using (true);

-- Results are entered by the players themselves off the sheet on the wall,
-- not by an admin, so writes here are open where the draw itself is not.
drop policy if exists "public_read_results" on public.draw_results;
drop policy if exists "anon_write_results"  on public.draw_results;
drop policy if exists "anon_update_results" on public.draw_results;
create policy "public_read_results" on public.draw_results
  for select using (true);
create policy "anon_write_results" on public.draw_results
  for insert with check (true);
create policy "anon_update_results" on public.draw_results
  for update using (true);


-- ════════════════════════════════════════════════════════════════════════
--  GRANTS
--
--  Looped over the roles that actually exist rather than named directly.
--  "grant ... to anon, authenticated" raises if any one of them is missing,
--  and a raise in the middle of a file this long would leave it HALF
--  APPLIED — the same reasoning, and the same shape, as the loop in
--  20260831_grant_admin.sql.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  r text;
  t text;
  tables text[] := array[
    'clubs', 'player_data', 'members', 'admins', 'admin_requests',
    'login_lockouts', 'member_claim_requests', 'member_join_requests',
    'phone_change_requests', 'club_config', 'club_fixtures', 'tournaments',
    'roll_of_honour', 'draws', 'draw_pairings', 'draw_results',
    'members_public'
  ];
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach t in array tables loop
        execute format('grant all on table public.%I to %I', t, r);
      end loop;
    end if;
  end loop;

  -- ...and then take the writes on the roll of honour back off the two
  -- browser-facing roles. service_role keeps them: loading the boards is a
  -- maintenance job run with the secret key, not something the app does.
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke insert, update, delete on table public.roll_of_honour from %I', r);
    end if;
  end loop;
end $$;

-- Function EXECUTE.
--
-- Two groups, and the difference matters. The first group is revoked from
-- PUBLIC and granted back only to the named roles — these take a name and a
-- PIN and act on it, so PUBLIC holding EXECUTE by default is a wider door
-- than anyone chose. The second group keeps the PUBLIC default: bowls_name_key
-- is a pure string function an index depends on, the two trigger functions are
-- only ever reached through their triggers, and claim_super_admin_tx is
-- self-closing after the first claim.
do $$
declare
  r text;
  f text;
  closed text[] := array[
    'public.bowls_sign_in(text, text)',
    'public.bowls_register(text, text, text)',
    'public.bowls_save_player(text, text, jsonb, jsonb, jsonb)',
    'public.bowls_is_admin(text, text)',
    'public.bowls_link_member(text, text, text)',
    'public.bowls_admin_set_member_phone(text, text, text, text)'
  ];
  open_default text[] := array[
    'public.bowls_name_key(text)',
    'public.claim_super_admin_tx(text, text)',
    'public.player_data_backfill_keys()',
    'public.members_sync_linked_player_id()'
  ];
begin
  foreach f in array closed loop
    execute format('revoke execute on function %s from public', f);
  end loop;

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach f in array closed loop
        execute format('grant execute on function %s to %I', f, r);
      end loop;
      foreach f in array open_default loop
        execute format('grant execute on function %s to %I', f, r);
      end loop;
    end if;
  end loop;
end $$;


-- ════════════════════════════════════════════════════════════════════════
--  THE LEDGER ENTRIES THIS FILE STANDS IN FOR
--
--  These ran against production between 19 June and 30 August and had no
--  file in this repository until now. Listed so the correspondence between
--  supabase_migrations.schema_migrations and this folder can be checked by
--  eye rather than assumed.
--
--    20260619094827  create_core_tables
--    20260619094840  seed_tournaments                         (data — omitted)
--    20260619094849  seed_roll_of_honour                      (data — omitted)
--    20260619095221  create_login_lockouts
--    20260619095629  create_admin_requests
--    20260619111721  add_round_dates_to_draws
--    20260619230426  member_name_linking
--    20260620093541  add_ties_to_player_data
--    20260620093944  secure_member_claim_requests
--    20260620095415  add_profile_to_player_data
--    20260620112351  draws_version_history
--    20260620112901  draws_is_test
--    20260620125947  draw_results
--    20260620150914  ladies_tournaments_and_draws_section
--    20260620151449  seniors_tournaments                      (data — omitted)
--    20260620155448  draws_approval_workflow
--    20260626134531  claim_super_admin_function_and_rls
--    20260626134751  rls_draws_draw_results_draw_pairings
--    20260829174351  secure_player_auth
--    20260829175010  player_data_backfill_keys_trigger
--    20260829210344  backfill_trigger_security_definer
--    20260829210509  additive_prep_members_public_and_gated_writes
--    20260829214411  load_roll_of_honour_from_clubhouse_boards (data — omitted)
--    20260829215235  protect_roll_of_honour_writes
--    20260830081453  keep_linked_player_id_in_sync
--    20260830085042  throttle_admin_pin_guessing
--    20260830085433  remove_pg_sleep_from_admin_check
--    20260830092607  one_account_per_roster_entry
--    20260830093855  add_club_id_tenancy_groundwork
--
--  Plus 20260830095508 reset_pin_keeps_admin_row_in_step, which has its own
--  file now: 20260830_reset_pin_keeps_admin_row_in_step.sql.
-- ════════════════════════════════════════════════════════════════════════
