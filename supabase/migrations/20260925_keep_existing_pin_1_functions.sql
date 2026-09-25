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
--   2. Changing a PIN accepts any 4 digits, including the PIN the member
--      has now or had before. No "different from your old one" rule, no
--      list of refused PINs. New: bowls_change_my_pin(token, new PIN), so a
--      signed-in member can change it without typing the current one
--      (bowls_set_pin holds the shared body and is closed to the key).
--   3. Sessions last 12 months (365 days) instead of 90, still rolling: every
--      use pushes the expiry out again. They still end on sign-out, on a PIN
--      change (bowls_change_pin), on an admin PIN reset
--      (bowls_admin_reset_pin) and when the account locks
--      (login_lockouts_end_sessions) — none of those are touched.
--
--  Unchanged: the five-try server lockout (24 hours) and its counters, the
--  table grants (part 2 of the lockdown), admin grants, and every signature
--  and status string the client relies on. bowls_sign_in still answers
--  'must_change_pin' in principle — nothing sets it any more.
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
--  Nobody's PIN or session is changed by this file, so the revert loses
--  nothing.
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


-- ── 1. bowls_auth: the name-and-PIN check behind the admin functions ──────
-- The lockdown_1 body, less the must_change_pin refusal. p_allow_pending is
-- kept in the signature so nothing that calls it with four arguments breaks;
-- it no longer changes anything.
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
  v_max_attempts constant integer := 5;
begin
  perform set_config('bowls.refusal', '', true);
  v_key := public.bowls_name_key(p_name);
  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
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
    if exists (select 1 from public.player_data where name_key = v_key) then
      insert into public.login_lockouts (name, attempts, updated_at)
      values (v_counter, 1, now())
      on conflict (name) do update
        set attempts     = public.login_lockouts.attempts + 1,
            updated_at   = now(),
            locked_until = case
                             when public.login_lockouts.attempts + 1 >= v_max_attempts
                             then now() + interval '24 hours'
                             else null
                           end;
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
-- The lockdown_1 body, less the must_change_pin branch.
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
  v_max_attempts constant integer := 5;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
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


-- ── 4. bowls_register: the lockdown_1 body, less the must_change_pin branch
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
  v_max_attempts constant integer := 5;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
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
  if exists (select 1 from public.player_data where name_key = v_key) then
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
-- less the 'same_pin' refusal, pulled out so two callers can share it:
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
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  return public.bowls_set_pin(v_id, p_new_pin);
end $function$;

-- Grants: bowls_set_pin closed; bowls_change_my_pin open to the publishable
-- key, like every other token-keyed function.
do $$
declare r text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.bowls_set_pin(uuid, text) from %s', r);
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
    or has_function_privilege('anon', 'public.bowls_set_pin(uuid, text)', 'execute')) then
    raise exception 'anon can execute an internal auth function. Do not ship this.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') and (
       not has_function_privilege('anon', 'public.bowls_sign_in(text, text)', 'execute')
    or not has_function_privilege('anon', 'public.bowls_change_pin(text, text, text)', 'execute')
    or not has_function_privilege('anon', 'public.bowls_change_my_pin(text, text)', 'execute')) then
    raise exception 'anon lost sign-in or change-PIN. Do not ship this.';
  end if;
end $$;
