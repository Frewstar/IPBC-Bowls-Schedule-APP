-- ════════════════════════════════════════════════════════════════════════
--  20260925_keep_existing_pin_1_functions.sql
--
--  STATUS: NOT YET APPLIED to the live database.
--
--  Joseph's decision, 25 Sep: members sign in with the 4-digit PIN they
--  already have. No forced "choose a new PIN" step, and a member may set
--  their PIN back to their old one. Stronger sign-in (a code sent to the
--  email on file) comes next, in its own brief.
--
--  Requires 20260923_directory_lockdown_1_functions.sql (the columns
--  must_change_pin, pin_set_at and account_name, and bowls_auth,
--  bowls_session_caller and bowls_change_pin). Safe before or after
--  20260923_directory_lockdown_2_close_tables.sql, and safe with the client
--  that is live today (that client simply never meets must_change_pin).
--
--  What changes, and only this:
--
--   1. must_change_pin is no longer enforced anywhere. bowls_sign_in and
--      bowls_register issue a token for the right PIN whatever the flag
--      says; bowls_auth (the admin checks) and bowls_session_caller (every
--      token-keyed function) stop refusing a flagged account. The column
--      stays, and bowls_change_pin still clears it, so nothing that reads it
--      breaks. Clearing the flag on existing accounts is the job of
--      20260925_keep_existing_pin_2_clear_flag.sql, kept separate so that
--      file touches the flag and nothing else.
--   2. Changing a PIN accepts the PIN the member has now or had before:
--      no "different from your old one" rule (the weak-PIN list in 5 still
--      applies). New: bowls_change_my_pin(token, new PIN), so a
--      signed-in member can change it without typing the current one
--      (bowls_set_pin holds the shared body and is closed to the key).
--   3. Sessions last 12 months (365 days) instead of 90, still rolling: every
--      use pushes the expiry out again. They still end on sign-out, on a PIN
--      change (bowls_change_pin), on an admin PIN reset
--      (bowls_admin_reset_pin) and when the account locks
--      (login_lockouts_end_sessions) — none of those are touched.
--
--   4. A stepped lock (Joseph, 25 Sep, follow-up). Per name, in a rolling
--      24-hour window: the 5th wrong PIN locks it for 15 minutes; the 10th
--      locks it for 24 hours. Was: the 5th locked for 24 hours. An admin
--      unlock clears it at once, as before. Only a lock of an hour or more
--      (the 24-hour lock, or an admin's lock) ends the account's sessions;
--      a 15-minute lock no longer signs the member out on their own phone.
--   5. Weak PINs are refused when a PIN is SET or CHANGED (bowls_register
--      creating an account, bowls_change_pin, bowls_change_my_pin): 0000,
--      1111 … 9999, 1234, 4321, 1212, 2580 — status 'weak_pin'. Years are
--      allowed. Existing PINs still sign in and nobody is asked to change.
--      bowls_admin_reset_pin is not touched: an admin choosing a PIN for a
--      member is left to the admin.
--   6. A spray guard. Every wrong PIN for a name that has an account is
--      recorded against the caller's IP (bowls_client_ip). If one IP gets
--      wrong PINs on 5 different names within 10 minutes, that IP is paused
--      for 15 minutes: sign-in, registration and the name-and-PIN checks
--      answer 'paused' without looking at the PIN or counting anything.
--      Club-wide: when 20 or more different names in the club have had a
--      wrong PIN within 10 minutes (from any IPs), the per-IP limit drops
--      to 3 names. A member getting their own PIN wrong is one name, so it
--      never trips this on its own. IP records are kept 24 hours.
--
--  Unchanged: table grants (part 2 of the lockdown), admin grants, and every
--  signature and status string the client relies on (two statuses are new:
--  'weak_pin' and 'paused'). bowls_sign_in still answers 'must_change_pin'
--  in principle — nothing sets it any more.
--
--  Idempotent: create or replace throughout. EXECUTE grants are kept by
--  create or replace, so bowls_auth and bowls_session_* stay closed to the
--  publishable key exactly as they are.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Re-run the function bodies from 20260923_directory_lockdown_1_functions.sql
--  (sections 2, 3 and 5) and 20260901163342_bowls_sessions.sql (sections 2
--  and 3), then:
--    drop function if exists public.bowls_change_my_pin(text, text);
--    drop function if exists public.bowls_set_pin(uuid, text);
--    drop function if exists public.bowls_count_wrong_pin(text, uuid);
--    drop function if exists public.bowls_spray_record(text, uuid);
--    drop function if exists public.bowls_ip_paused_until();
--    drop function if exists public.bowls_client_ip();
--    drop function if exists public.bowls_pin_is_weak(text);
--    drop function if exists public.bowls_tries_left(integer);
--    drop function if exists public.bowls_auth_refusal(text, text);  -- then re-run its lockdown_1 body
--    drop table if exists public.bowls_signin_failures, public.bowls_ip_pauses;
--    alter table public.login_lockouts drop column if exists window_started_at;
--  and restore login_lockouts_end_sessions from
--  20260901181006_sessions_can_be_ended.sql. Nobody's PIN or session is
--  changed by this file, so the revert loses nothing.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_data'
                    and column_name = 'must_change_pin')
     or to_regprocedure('public.bowls_change_pin(text, text, text)') is null then
    raise exception 'Apply 20260923_directory_lockdown_1_functions.sql first.';
  end if;
end $$;


-- ── 0. Tables and helpers for the lock, the weak-PIN list and the guard ───

-- The start of the 24-hour window the stepped lock counts in.
alter table public.login_lockouts
  add column if not exists window_started_at timestamptz;

-- One row per wrong PIN on a name that has an account: who (IP), which
-- club, which name. Nothing else — no PIN. Swept after 24 hours.
create table if not exists public.bowls_signin_failures (
  id        bigserial   primary key,
  ip        text        not null,
  club_id   uuid,
  name_key  text        not null,
  at        timestamptz not null default now()
);
create index if not exists bowls_signin_failures_ip_at_idx   on public.bowls_signin_failures (ip, at);
create index if not exists bowls_signin_failures_club_at_idx on public.bowls_signin_failures (club_id, at);

-- IPs that are paused, and until when.
create table if not exists public.bowls_ip_pauses (
  ip           text        primary key,
  paused_until timestamptz not null,
  updated_at   timestamptz not null default now()
);

alter table public.bowls_signin_failures enable row level security;
alter table public.bowls_ip_pauses       enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.bowls_signin_failures from %I', r);
      execute format('revoke all on table public.bowls_ip_pauses from %I', r);
      execute format('revoke all on sequence public.bowls_signin_failures_id_seq from %I', r);
    end if;
  end loop;
end $$;

-- The caller's IP, from the headers PostgREST hands every request in
-- request.headers. cf-connecting-ip first (set by Cloudflare in front of
-- Supabase, and not something the caller can choose), then the first
-- x-forwarded-for hop, then x-real-ip. With no headers at all (the SQL
-- editor, a test) every call shares 'unknown' — guarded, not exempt.
create or replace function public.bowls_client_ip()
returns text
language plpgsql
stable
as $function$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  return coalesce(
    nullif(trim(h->>'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
    nullif(trim(h->>'x-real-ip'), ''),
    'unknown');
end $function$;

-- When the caller's IP is paused until, or null.
create or replace function public.bowls_ip_paused_until()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $function$
  select p.paused_until from public.bowls_ip_pauses p
   where p.ip = public.bowls_client_ip() and p.paused_until > now();
$function$;

-- Record a wrong PIN on a name that has an account, and pause the IP if it
-- has now tried too many different names. Thresholds are here and only here.
create or replace function public.bowls_spray_record(p_name_key text, p_club uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ip          text := public.bowls_client_ip();
  v_window      constant interval := interval '10 minutes';
  v_pause       constant interval := interval '15 minutes';
  v_ip_names    constant integer  := 5;   -- different names from one IP
  v_ip_names_hi constant integer  := 3;   -- … while the club is under attack
  v_club_names  constant integer  := 20;  -- different names failing club-wide
  v_names       integer;
  v_club_count  integer;
  v_limit       integer;
begin
  delete from public.bowls_signin_failures where at < now() - interval '24 hours';
  delete from public.bowls_ip_pauses where paused_until < now() - interval '24 hours';

  insert into public.bowls_signin_failures (ip, club_id, name_key)
  values (v_ip, p_club, p_name_key);

  select count(distinct name_key) into v_names
    from public.bowls_signin_failures
   where ip = v_ip and at > now() - v_window;

  select count(distinct name_key) into v_club_count
    from public.bowls_signin_failures
   where club_id is not distinct from p_club and at > now() - v_window;

  v_limit := case when v_club_count >= v_club_names then v_ip_names_hi else v_ip_names end;
  if v_names >= v_limit then
    insert into public.bowls_ip_pauses (ip, paused_until, updated_at)
    values (v_ip, now() + v_pause, now())
    on conflict (ip) do update
      set paused_until = greatest(public.bowls_ip_pauses.paused_until, excluded.paused_until),
          updated_at   = now();
  end if;
end $function$;

-- Count one wrong PIN against a lockout counter (a name key, or
-- 'ADMIN:' || name key) and apply the stepped lock. Returns the row.
--   within 24 hours of the first wrong PIN: 5th → 15 minutes, 10th → 24 hours.
--   24 hours after the first, the count starts again.
create or replace function public.bowls_count_wrong_pin(p_counter text, p_club uuid)
returns public.login_lockouts
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row  public.login_lockouts%rowtype;
  v_n    integer;
  v_win  timestamptz;
begin
  insert into public.login_lockouts (name, attempts, updated_at, window_started_at, club_id)
  values (p_counter, 0, now(), now(),
          coalesce(p_club, '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid))
  on conflict (name) do nothing;

  select * into v_row from public.login_lockouts where name = p_counter for update;

  if v_row.window_started_at is null or v_row.window_started_at < now() - interval '24 hours' then
    v_n := 1;
    v_win := now();
  else
    v_n := v_row.attempts + 1;
    v_win := v_row.window_started_at;
  end if;

  update public.login_lockouts
     set attempts          = v_n,
         window_started_at = v_win,
         updated_at        = now(),
         locked_until      = case
                               when v_n >= 10 then now() + interval '24 hours'
                               when v_n = 5   then now() + interval '15 minutes'
                               else null
                             end
   where name = p_counter
  returning * into v_row;
  return v_row;
end $function$;

-- Tries left before the next lock, for the 'wrong_pin' answer.
create or replace function public.bowls_tries_left(p_attempts integer)
returns integer
language sql
immutable
as $function$
  select case when p_attempts < 5 then 5 - p_attempts
              else greatest(10 - p_attempts, 0) end;
$function$;

-- The PINs refused when a PIN is set or changed. Years and house numbers
-- are fine; these are the ones people guess first.
create or replace function public.bowls_pin_is_weak(p_pin text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_pin, '') ~ '^([0-9])\1{3}$'
      or coalesce(p_pin, '') in ('1234', '4321', '1212', '2580');
$function$;

-- Only a lock of an hour or more ends the account's sessions: the 24-hour
-- lock and an admin's lock. The 15-minute lock does not — five wrong PINs
-- typed by somebody else should not sign the member out on their own phone.
-- Otherwise the 20260901181006 body.
create or replace function public.login_lockouts_end_sessions()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if new.locked_until is null or new.locked_until < now() + interval '1 hour' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.locked_until is not null
     and old.locked_until >= now() + interval '1 hour' then
    return new;
  end if;

  delete from public.bowls_sessions s
   using public.player_data d
   where s.player_id = d.id
     and d.name_key  = public.bowls_name_key(new.name);

  return new;
end $$;


-- ── 1. bowls_auth: the name-and-PIN check behind the admin functions ──────
-- The lockdown_1 body, less the must_change_pin refusal, with the spray guard
-- and the stepped lock. p_allow_pending is kept in the signature so nothing
-- that calls it with four arguments breaks; it no longer changes anything.
create or replace function public.bowls_auth(p_name text, p_pin text, p_scope text default 'member', p_allow_pending boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_key     text;
  v_counter text;
  v_id      uuid;
  v_club    uuid;
begin
  perform set_config('bowls.refusal', '', true);
  v_key := public.bowls_name_key(p_name);
  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return null;
  end if;

  if public.bowls_ip_paused_until() is not null then
    perform set_config('bowls.refusal', 'paused', true);
    return null;
  end if;

  v_counter := case when p_scope = 'admin' then 'ADMIN:' || v_key else v_key end;

  if exists (select 1 from public.login_lockouts l
              where (case when p_scope = 'admin' then l.name = v_counter
                          else public.bowls_name_key(l.name) = v_key end)
                and l.locked_until > now()) then
    return null;
  end if;

  select d.id into v_id
    from public.player_data d
   where d.name_key = v_key
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_id is null then
    select club_id into v_club from public.player_data where name_key = v_key limit 1;
    if found then
      perform public.bowls_count_wrong_pin(v_counter, v_club);
      perform public.bowls_spray_record(v_key, v_club);
    end if;
    return null;
  end if;

  if p_scope = 'admin' then
    delete from public.login_lockouts where name = v_counter;
  else
    delete from public.login_lockouts where public.bowls_name_key(name) = v_key;
  end if;

  return v_id;
end $function$;


-- What to say when bowls_auth returned null. The lockdown_1 body plus
-- 'paused', and locked_until on 'locked' so the app can say 15 minutes or
-- 24 hours.
create or replace function public.bowls_auth_refusal(p_name text, p_scope text default 'member')
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  with lock as (
    select max(l.locked_until) as until
      from public.login_lockouts l
     where (case when p_scope = 'admin'
                 then l.name = 'ADMIN:' || public.bowls_name_key(p_name)
                 else public.bowls_name_key(l.name) = public.bowls_name_key(p_name) end)
       and l.locked_until > now())
  select case
           when coalesce(current_setting('bowls.refusal', true), '') = 'paused'
           then jsonb_build_object('status', 'paused', 'paused_until', public.bowls_ip_paused_until())
           when coalesce(current_setting('bowls.refusal', true), '') = 'must_change_pin'
           then jsonb_build_object('status', 'must_change_pin')
           when (select until from lock) is not null
           then jsonb_build_object('status', 'locked', 'locked_until', (select until from lock))
           else jsonb_build_object('status', 'denied')
         end;
$function$;


-- ── 2. bowls_session_caller: a live token is enough ───────────────────────
create or replace function public.bowls_session_caller(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_id uuid;
begin
  select s.player_id into v_id
    from public.bowls_session_player(p_token) s;
  return v_id;
end $function$;


-- ── 3. bowls_sign_in: the right PIN signs in ──────────────────────────────
-- The lockdown_1 body, less the must_change_pin branch, with the spray guard
-- first and the stepped lock (bowls_count_wrong_pin) on a wrong PIN.
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
  v_member public.members%rowtype;
  v_token  text;
  v_club   uuid;
  v_paused timestamptz;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The spray guard, before anything else: a paused IP learns nothing and
  -- costs nobody a try.
  v_paused := public.bowls_ip_paused_until();
  if v_paused is not null then
    return jsonb_build_object('status', 'paused', 'paused_until', v_paused);
  end if;

  select * into v_lock
    from public.login_lockouts
   where public.bowls_name_key(name) = v_key
   order by locked_until desc nulls last
   limit 1;

  if found and v_lock.locked_until is not null and v_lock.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_lock.locked_until);
  end if;

  select * into v_row
    from public.player_data
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  if found then
    delete from public.login_lockouts where public.bowls_name_key(name) = v_key;

    select * into v_member
      from public.members
     where linked_player_id = v_row.id
     limit 1;

    v_token := public.bowls_session_issue(v_row.id, v_row.club_id);

    return jsonb_build_object(
      'status',       'ok',
      'id',           v_row.id,
      'cloud_key',    v_row.player_name,
      'display_name', v_row.display_name,
      'account_name', public.bowls_account_name(v_row),
      'entries',      v_row.entries,
      'ties',         v_row.ties,
      'profile',      v_row.profile,
      'updated_at',   v_row.updated_at,
      'token',        v_token,
      'club_id',      v_row.club_id,
      'member_id',    v_member.id,
      'member_name',  v_member.name
    );
  end if;

  select club_id into v_club from public.player_data where name_key = v_key limit 1;
  v_exists := found;
  if not v_exists then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_lock := public.bowls_count_wrong_pin(v_key, v_club);
  perform public.bowls_spray_record(v_key, v_club);

  return jsonb_build_object(
    'status',       'wrong_pin',
    'attempts',     v_lock.attempts,
    'remaining',    public.bowls_tries_left(v_lock.attempts),
    'locked_until', v_lock.locked_until
  );
end $function$;


-- ── 4. bowls_register: the lockdown_1 body, less the must_change_pin branch,
--       with the stepped lock, the spray guard and the weak-PIN list
create or replace function public.bowls_register(p_name text, p_pin text, p_display text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_key     text;
  v_row     public.player_data%rowtype;
  v_member  public.members%rowtype;
  v_lock    public.login_lockouts%rowtype;
  v_display text;
  v_id      uuid;
  v_token   text;
  v_club    uuid;
  v_paused  timestamptz;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_paused := public.bowls_ip_paused_until();
  if v_paused is not null then
    return jsonb_build_object('status', 'paused', 'paused_until', v_paused);
  end if;

  v_display := upper(trim(coalesce(nullif(trim(coalesce(p_display, '')), ''), p_name)));

  perform pg_advisory_xact_lock(hashtext('bowls_register:' || v_key));

  select * into v_lock
    from public.login_lockouts
   where public.bowls_name_key(name) = v_key
   order by locked_until desc nulls last
   limit 1;
  if found and v_lock.locked_until is not null and v_lock.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_lock.locked_until);
  end if;

  select * into v_row
    from public.player_data
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  if found then
    delete from public.login_lockouts where public.bowls_name_key(name) = v_key;

    select * into v_member from public.members where linked_player_id = v_row.id limit 1;
    v_token := public.bowls_session_issue(v_row.id, v_row.club_id);

    return jsonb_build_object(
      'status',       'existing',
      'id',           v_row.id,
      'cloud_key',    v_row.player_name,
      'display_name', v_row.display_name,
      'account_name', public.bowls_account_name(v_row),
      'entries',      v_row.entries,
      'ties',         v_row.ties,
      'profile',      v_row.profile,
      'updated_at',   v_row.updated_at,
      'token',        v_token,
      'club_id',      v_row.club_id,
      'member_id',    v_member.id,
      'member_name',  v_member.name
    );
  end if;

  -- An account already exists under this name and this is not its PIN.
  select club_id into v_club from public.player_data where name_key = v_key limit 1;
  if found then
    v_lock := public.bowls_count_wrong_pin(v_key, v_club);
    perform public.bowls_spray_record(v_key, v_club);

    return jsonb_build_object(
      'status',       'wrong_pin',
      'attempts',     v_lock.attempts,
      'remaining',    public.bowls_tries_left(v_lock.attempts),
      'locked_until', v_lock.locked_until
    );
  end if;

  -- A new account: this is setting a PIN, so the weak list applies. Only
  -- here — the right PIN for an existing account above still signs in,
  -- whatever it is.
  if public.bowls_pin_is_weak(p_pin) then
    return jsonb_build_object('status', 'weak_pin',
      'message', 'That one''s too easy to guess — try a year or house number you''ll remember.');
  end if;

  v_id := gen_random_uuid();

  insert into public.player_data (id, player_name, display_name, name_key, pin_hash, entries, ties, profile, updated_at, pin_set_at)
  values (v_id, v_id::text, v_display, v_key,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
          '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, now(), now())
  returning * into v_row;

  delete from public.login_lockouts where public.bowls_name_key(name) = v_key;

  v_token := public.bowls_session_issue(v_row.id, v_row.club_id);

  return jsonb_build_object(
    'status',       'created',
    'id',           v_row.id,
    'cloud_key',    v_row.player_name,
    'display_name', v_row.display_name,
    'account_name', public.bowls_account_name(v_row),
    'entries',      v_row.entries,
    'ties',         v_row.ties,
    'profile',      v_row.profile,
    'updated_at',   v_row.updated_at,
    'token',        v_token,
    'club_id',      v_row.club_id,
    'member_id',    null,
    'member_name',  null
  );
end $function$;


-- ── 5. Changing a PIN: any 4 digits, the old PIN included ────────────────
-- bowls_set_pin is the lockdown_1 bowls_change_pin body after its PIN check,
-- less the 'same_pin' refusal and with the weak-PIN list, pulled out so two
-- callers can share it. Both callers check the list first too, so a weak
-- choice never reaches bowls_auth and costs no try:
--
--   bowls_change_my_pin(token, new)  — "Change my PIN" in the app. Being
--       signed in is enough (Joseph, 25 Sep): the session token is the proof,
--       as it is for everything else a signed-in member does.
--   bowls_change_pin(name, pin, new) — unchanged signature. Needs the current
--       PIN; a wrong one still counts toward the five tries (bowls_auth).
--
-- Either way: the PIN never goes into player_name (a legacy NAME-PIN key
-- becomes the row's uuid and every copy of the key moves with it), every
-- session the account has ends, and a fresh one is issued for this device.
--
-- bowls_set_pin takes an account id, which no caller may choose, so it is
-- NOT callable with the publishable key.
create or replace function public.bowls_set_pin(p_id uuid, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_row     public.player_data%rowtype;
  v_member  public.members%rowtype;
  v_old_key text;
  v_new_key text;
  v_token   text;
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'bad_pin', 'message', 'A PIN must be exactly 4 digits.');
  end if;
  if public.bowls_pin_is_weak(p_new_pin) then
    return jsonb_build_object('status', 'weak_pin',
      'message', 'That one''s too easy to guess — try a year or house number you''ll remember.');
  end if;

  select * into v_row from public.player_data where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'expired');
  end if;
  v_old_key := v_row.player_name;
  v_new_key := p_id::text;

  update public.player_data
     set account_name    = public.bowls_account_name(v_row),
         player_name     = v_new_key,
         pin_hash        = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
         must_change_pin = false,
         pin_set_at      = now(),
         updated_at      = now()
   where id = p_id
  returning * into v_row;

  if v_old_key is distinct from v_new_key then
    update public.members
       set linked_cloudkey = v_new_key, updated_at = now()
     where linked_cloudkey = v_old_key or linked_player_id = p_id;
    update public.admins
       set cloud_key = v_new_key
     where player_id = p_id or cloud_key = v_old_key;
    update public.member_claim_requests
       set requester_cloudkey = v_new_key
     where requester_player_id = p_id or requester_cloudkey = v_old_key;
    update public.member_claim_requests
       set current_linked_cloudkey = v_new_key
     where current_linked_cloudkey = v_old_key;
    update public.live_games
       set creator_cloudkey = 'id:' || p_id
     where creator_cloudkey = v_old_key;
  end if;

  delete from public.bowls_sessions where player_id = p_id;
  delete from public.login_lockouts
   where public.bowls_name_key(name) = v_row.name_key
      or name = 'ADMIN:' || v_row.name_key;

  select * into v_member from public.members where linked_player_id = p_id limit 1;
  v_token := public.bowls_session_issue(p_id, v_row.club_id);

  return jsonb_build_object(
    'status',       'ok',
    'id',           v_row.id,
    'cloud_key',    v_row.player_name,
    'display_name', v_row.display_name,
    'account_name', public.bowls_account_name(v_row),
    'entries',      v_row.entries,
    'ties',         v_row.ties,
    'profile',      v_row.profile,
    'updated_at',   v_row.updated_at,
    'token',        v_token,
    'club_id',      v_row.club_id,
    'member_id',    v_member.id,
    'member_name',  v_member.name
  );
end $function$;

create or replace function public.bowls_change_pin(p_name text, p_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_id uuid;
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'bad_pin', 'message', 'A PIN must be exactly 4 digits.');
  end if;
  if public.bowls_pin_is_weak(p_new_pin) then
    return jsonb_build_object('status', 'weak_pin',
      'message', 'That one''s too easy to guess — try a year or house number you''ll remember.');
  end if;
  v_id := public.bowls_auth(p_name, p_pin, 'member', true);
  if v_id is null then
    return public.bowls_auth_refusal(p_name, 'member');
  end if;
  return public.bowls_set_pin(v_id, p_new_pin);
end $function$;

create or replace function public.bowls_change_my_pin(p_token text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_id uuid;
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'bad_pin', 'message', 'A PIN must be exactly 4 digits.');
  end if;
  if public.bowls_pin_is_weak(p_new_pin) then
    return jsonb_build_object('status', 'weak_pin',
      'message', 'That one''s too easy to guess — try a year or house number you''ll remember.');
  end if;
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  return public.bowls_set_pin(v_id, p_new_pin);
end $function$;

-- Grants: bowls_set_pin and the lock/guard helpers closed; bowls_change_my_pin
-- open to the publishable key, like every other token-keyed function.
do $$
declare
  r text;
  f text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      foreach f in array array[
        'public.bowls_set_pin(uuid, text)',
        'public.bowls_count_wrong_pin(text, uuid)',
        'public.bowls_spray_record(text, uuid)',
        'public.bowls_ip_paused_until()',
        'public.bowls_client_ip()'] loop
        execute format('revoke all on function %s from %s', f, r);
      end loop;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_change_my_pin(text, text) to %I', r);
    end if;
  end loop;
end $$;


-- ── 6. Sessions: 12 months, rolling ───────────────────────────────────────
-- Was 90 days, rolling. Members who only open the app in the outdoor season
-- were signed out over the winter and had to remember their PIN in April.
-- 365 days covers a full close season. The expiry still slides on every use,
-- and every way a session ends early is untouched.
create or replace function public.bowls_session_issue(
  p_player_id uuid,
  p_club_id   uuid
) returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token text;
begin
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  delete from public.bowls_sessions where expires_at < now() - interval '30 days';

  insert into public.bowls_sessions (token_hash, player_id, club_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'),
          p_player_id,
          p_club_id,
          now() + interval '365 days');

  return v_token;
end $$;

create or replace function public.bowls_session_player(p_token text)
returns table (
  player_id    uuid,
  club_id      uuid,
  name_key     text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_hash text;
  v_sess public.bowls_sessions%rowtype;
begin
  if coalesce(p_token, '') = '' then
    return;
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  update public.bowls_sessions s
     set last_seen_at = now(),
         expires_at   = now() + interval '365 days'
   where s.token_hash = v_hash
     and s.expires_at > now()
  returning * into v_sess;

  if not found then
    return;
  end if;

  return query
    select v_sess.player_id, v_sess.club_id, p.name_key, p.display_name
      from public.player_data p
     where p.id = v_sess.player_id;
end $$;


-- ── 7. Check ──────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') and (
       has_function_privilege('anon', 'public.bowls_auth(text, text, text, boolean)', 'execute')
    or has_function_privilege('anon', 'public.bowls_session_issue(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.bowls_session_player(text)', 'execute')
    or has_function_privilege('anon', 'public.bowls_set_pin(uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.bowls_count_wrong_pin(text, uuid)', 'execute')
    or has_function_privilege('anon', 'public.bowls_spray_record(text, uuid)', 'execute')) then
    raise exception 'anon can execute an internal auth function. Do not ship this.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') and (
       not has_function_privilege('anon', 'public.bowls_sign_in(text, text)', 'execute')
    or not has_function_privilege('anon', 'public.bowls_change_pin(text, text, text)', 'execute')
    or not has_function_privilege('anon', 'public.bowls_change_my_pin(text, text)', 'execute')) then
    raise exception 'anon lost sign-in or change-PIN. Do not ship this.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') and (
       has_table_privilege('anon', 'public.bowls_signin_failures', 'select')
    or has_table_privilege('anon', 'public.bowls_signin_failures', 'insert')
    or has_table_privilege('anon', 'public.bowls_ip_pauses', 'select')
    or has_table_privilege('anon', 'public.bowls_ip_pauses', 'delete')) then
    raise exception 'anon can reach the sign-in guard tables. Do not ship this.';
  end if;
  if not public.bowls_pin_is_weak('0000') or not public.bowls_pin_is_weak('7777')
     or not public.bowls_pin_is_weak('2580') or public.bowls_pin_is_weak('1967') then
    raise exception 'weak-PIN list is wrong.';
  end if;
end $$;
