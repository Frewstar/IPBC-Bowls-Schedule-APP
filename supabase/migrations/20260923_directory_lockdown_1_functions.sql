-- ════════════════════════════════════════════════════════════════════════
--  20260923_directory_lockdown_1_functions.sql
--
--  STATUS: NOT YET APPLIED to the live database.
--
--  PART 1 OF 2. ADDITIVE. APPLY BEFORE THE CLIENT DEPLOY.
--
--  Written against production as of the 1 Sep session work (ledger
--  20260901163342 … 20260901181531, the seven files before this one). Every
--  function that file set touched is either left exactly as it is live or
--  re-created here from its live body with the changes named below.
--
--  Track 2, Steps 3b–3e: the server half of taking the app off the tables.
--  Every function the client needs in order to stop reading or writing
--  player_data, members, admins, login_lockouts and the four request tables
--  directly, keyed on the session token the way 20260901163342 intended —
--  player_id and club_id come from bowls_session_player, never from the
--  caller. Nothing here closes a table, so the client that is live today
--  keeps working. Part 2 closes them and must not run until the new client
--  is live.
--
--  What changes for the client that is live today (and only this):
--
--   * bowls_admin_role and bowls_is_super_admin now honour a lock. They
--     counted wrong PINs into 'ADMIN:<name>' (bowls_is_super_admin did not
--     even count) but never acted on the count, so an admin's PIN could be
--     guessed without limit — through bowls_admin_role, and through
--     bowls_grant_admin, which checks with bowls_is_super_admin. Five wrong
--     PINs now lock the admin check for 24 hours. It is a separate counter
--     from sign-in, so a phone still holding an old PIN can lock someone's
--     admin panel but not their sign-in. An admin clears it from the panel.
--   * bowls_register refuses a locked account, and stops creating a second
--     account under a name that already has one. Both were ways round the
--     five-try lock: a locked account's right PIN got a token from
--     bowls_register, and a wrong PIN made a new account instead of counting,
--     so the PIN could be walked from 0000 to 9999 until 'existing' came back
--     with a token. The client that is live today only reaches
--     bowls_register after bowls_sign_in has said not_found, so neither
--     change is visible to it.
--   * bowls_is_admin, bowls_save_player, bowls_link_member,
--     bowls_admin_set_member_phone and claim_super_admin_tx stop being
--     callable with the publishable key. No client calls any of them — not
--     the one that is live, not the one before it — and each was a PIN check
--     with no limit on guesses (claim_super_admin_tx had no PIN at all). The
--     SECURITY DEFINER functions that use them internally need no grant.
--
--  The forced PIN change is built here and switched on by part 2.
--  player_data.must_change_pin is added false for everyone, so nothing is
--  asked of anybody until part 2 sets it.
--
--  bowls_admin_reset_pin, bowls_request_unlock, bowls_session_*,
--  bowls_sign_out(_all) and the login_lockouts_end_sessions trigger are NOT
--  touched: their live behaviour is what this builds on.
--
--  Idempotent: create or replace throughout, add column if not exists.
-- ════════════════════════════════════════════════════════════════════════


-- ── 0. Columns ────────────────────────────────────────────────────────────

-- member_claim_requests identified the requester only by cloud key. Claims
-- now go by account id; the resolver falls back to the key for old rows.
alter table public.member_claim_requests
  add column if not exists requester_player_id uuid;

-- must_change_pin: the account can prove its PIN, but the only thing that
-- PIN can do is choose a new one (bowls_change_pin). No session is issued
-- until it has. Part 2 sets it on every account.
-- pin_set_at: when the member last chose their own PIN (bowls_register,
-- bowls_change_pin). A record for the admin panel; nothing depends on it.
-- account_name: the name the account signs in under, frozen when
-- bowls_change_pin takes the PIN out of player_name. See bowls_account_name.
alter table public.player_data
  add column if not exists must_change_pin boolean not null default false;
alter table public.player_data
  add column if not exists pin_set_at timestamptz;
alter table public.player_data
  add column if not exists account_name text;


-- ── 1. bowls_account_name keeps working once player_name is a uuid ────────
-- Live, this reads the name part out of NAME-PIN, and falls back to
-- display_name for any other key. That fallback is right for an account
-- bowls_register made (display_name is what they typed) and wrong for a
-- legacy account whose player_name bowls_change_pin has just replaced: on 6
-- of the 92 legacy accounts display_name came from profile.displayName and
-- differs from the name they sign in under, and myName is string-matched
-- against ties, pairings and honours. So bowls_change_pin records the name
-- in account_name first, and this reads it first. For every row that exists
-- today account_name is null and the answer is unchanged.
create or replace function public.bowls_account_name(p_row public.player_data)
returns text
language sql
immutable
as $function$
  select case
           when p_row.account_name is not null
           then p_row.account_name
           when p_row.player_name ~ '-[0-9]{4}$'
           then regexp_replace(p_row.player_name, '-[0-9]{4}$', '')
           else p_row.display_name
         end;
$function$;


-- ── 2. bowls_auth — one place a name and PIN are checked ──────────────────
-- For the functions that still authorise by name and PIN: the admin checks
-- and bowls_change_pin. Everything new in this file takes a session token.
--
-- Returns the account id, or null. Null for a wrong PIN, and null for the
-- right PIN while the counter is locked.
--
-- Two counters, matched the way bowls_sign_in matches them live:
--   'member' — any row whose squashed name is the name key (a lock written
--              under the raw name by the old admin panel still locks). The
--              same counter bowls_sign_in uses, so five wrong PINs anywhere
--              is five. A lock here ends the account's sessions, through
--              login_lockouts_end_sessions.
--   'admin'  — 'ADMIN:' || name key, exactly. The admin checks run on every
--              app open with whatever PIN the phone has; keeping them apart
--              means a stale phone can lock an admin panel but not a sign-in,
--              and does not end anybody's session.
--
-- Wrong PINs against a name with no account are not counted.
--
-- The right PIN on an account with must_change_pin set is refused too,
-- without counting, leaving 'must_change_pin' in the transaction-local
-- setting bowls.refusal for bowls_auth_refusal. Only bowls_change_pin passes
-- p_allow_pending.
--
-- NOT callable with the publishable key.
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
  v_pending boolean;
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

  select d.id, d.must_change_pin into v_id, v_pending
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

  if v_pending and not p_allow_pending then
    perform set_config('bowls.refusal', 'must_change_pin', true);
    return null;
  end if;
  return v_id;
end $function$;


-- What to say when bowls_auth returned null.
create or replace function public.bowls_auth_refusal(p_name text, p_scope text default 'member')
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select case
           when coalesce(current_setting('bowls.refusal', true), '') = 'must_change_pin'
           then jsonb_build_object('status', 'must_change_pin')
           when exists (select 1 from public.login_lockouts l
                         where (case when p_scope = 'admin'
                                     then l.name = 'ADMIN:' || public.bowls_name_key(p_name)
                                     else public.bowls_name_key(l.name) = public.bowls_name_key(p_name) end)
                           and l.locked_until > now())
           then jsonb_build_object('status', 'locked')
           else jsonb_build_object('status', 'denied')
         end;
$function$;


-- The caller by name and PIN, if they hold one of p_roles. Admin counter.
create or replace function public.bowls_admin_caller(p_name text, p_pin text, p_roles text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_id uuid;
begin
  v_id := public.bowls_auth(p_name, p_pin, 'admin');
  if v_id is null then
    return null;
  end if;
  if exists (select 1 from public.admins a
              where a.player_id = v_id and a.role = any (p_roles)) then
    return v_id;
  end if;
  return null;
end $function$;


-- ── 3. The caller by session token ────────────────────────────────────────
-- bowls_session_player (live, unchanged) turns a token into a player and
-- slides its expiry. This adds one refusal: an account that must choose a
-- new PIN has no session worth honouring. Part 2 ends every session when it
-- sets the flag and bowls_sign_in issues none while it is set, so this is a
-- second line, not the first.
create or replace function public.bowls_session_caller(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_id uuid;
begin
  select s.player_id into v_id
    from public.bowls_session_player(p_token) s
    join public.player_data d on d.id = s.player_id
   where not d.must_change_pin;
  return v_id;
end $function$;

-- The caller by token, if they hold one of p_roles.
create or replace function public.bowls_session_admin(p_token text, p_roles text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_id uuid;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return null;
  end if;
  if exists (select 1 from public.admins a
              where a.player_id = v_id and a.role = any (p_roles)) then
    return v_id;
  end if;
  return null;
end $function$;

-- The answer for a token function that got no caller back.
create or replace function public.bowls_session_refusal(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $function$
  -- 'expired' is the word bowls_session_state already uses for a token that
  -- no longer works, and the client already signs out on it. 'denied' is a
  -- live session that lacks the role.
  select case
           when exists (select 1 from public.bowls_sessions s
                         where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
                           and s.expires_at > now())
           then jsonb_build_object('status', 'denied')
           else jsonb_build_object('status', 'expired')
         end;
$function$;


-- ── 4. The existing admin checks, now with a lock ─────────────────────────
-- Same signatures and the same answers for a right PIN.
create or replace function public.bowls_admin_role(p_name text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_id   uuid;
  v_role text;
begin
  v_id := public.bowls_auth(p_name, p_pin, 'admin');
  if v_id is null then
    return null;
  end if;

  select a.role into v_role from public.admins a where a.player_id = v_id;

  if v_role not in ('super_admin', 'admin', 'draw_admin', 'events_admin') then
    return null;
  end if;
  return v_role;
end $function$;

create or replace function public.bowls_is_admin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  return public.bowls_admin_caller(p_name, p_pin, array['admin', 'super_admin']) is not null;
end $function$;

create or replace function public.bowls_is_super_admin(p_name text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  return public.bowls_admin_caller(p_name, p_pin, array['super_admin']) is not null;
end $function$;


-- ── 5. Sign-in, registration, and choosing a new PIN ──────────────────────

-- bowls_sign_in: the live body (20260901181531) with one addition. The right
-- PIN on an account with must_change_pin set answers 'must_change_pin' and
-- issues no token. The lockout it clears and every other answer are as live.
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

    -- NEW: the PIN is right, but it is one that has been readable by anyone.
    -- The only thing it can do now is choose a new one (bowls_change_pin).
    if v_row.must_change_pin then
      return jsonb_build_object(
        'status',       'must_change_pin',
        'account_name', public.bowls_account_name(v_row));
    end if;

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


-- bowls_register: the live body (20260901181531) with three changes, each a
-- way round the five-try lock:
--
--   1. A locked name is refused ('locked'). Live, the right PIN on a locked
--      account got a token here.
--   2. A wrong PIN for a name that already has an account is counted, the
--      same as bowls_sign_in counts it, and answers 'wrong_pin' — it no
--      longer creates a second account under that name. Live, it did, which
--      made 'existing' a PIN oracle with no limit: walk 0000..9999 until it
--      answers with a token. The client only reaches this after
--      bowls_sign_in has said not_found, so it never relied on the second
--      account.
--   3. The right PIN on an account with must_change_pin answers
--      'must_change_pin' and issues no token, as bowls_sign_in does.
--
-- The advisory lock is now on the name alone, since two different PINs for
-- one name must not both slip past the "already has an account" check. New
-- accounts still get their uuid as player_name — no PIN — and now record
-- pin_set_at.
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

    if v_row.must_change_pin then
      return jsonb_build_object(
        'status',       'must_change_pin',
        'account_name', public.bowls_account_name(v_row));
    end if;

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


-- bowls_change_pin: the member proves the PIN they have and chooses a new
-- one. The only thing an account with must_change_pin can do. Answers like
-- bowls_sign_in: 'ok' with a token, or a refusal.
--
-- The PIN never goes into player_name. A legacy account's player_name is
-- NAME-PIN, and holds the PIN being replaced; it becomes the row's uuid, as
-- bowls_register's accounts already are, and every copy of the old key moves
-- with it — the roster link, the admin row, the claim queue and live_games —
-- so nothing is left pointing at a key that no longer exists and nothing
-- goes on holding the old PIN. The sign-in name is frozen into account_name
-- first, so it survives the key change (see bowls_account_name).
--
-- Every session the account has is ended — the old PIN was readable, and
-- anyone who used it has one — and a fresh one is issued for this device.
create or replace function public.bowls_change_pin(p_name text, p_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_id      uuid;
  v_row     public.player_data%rowtype;
  v_member  public.members%rowtype;
  v_old_key text;
  v_new_key text;
  v_token   text;
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'bad_pin', 'message', 'A PIN must be exactly 4 digits.');
  end if;
  if p_new_pin = p_pin then
    return jsonb_build_object('status', 'same_pin', 'message', 'Choose a PIN different from your old one.');
  end if;

  v_id := public.bowls_auth(p_name, p_pin, 'member', true);
  if v_id is null then
    return public.bowls_auth_refusal(p_name, 'member');
  end if;

  select * into v_row from public.player_data where id = v_id for update;
  v_old_key := v_row.player_name;
  v_new_key := v_id::text;

  update public.player_data
     set account_name    = public.bowls_account_name(v_row),
         player_name     = v_new_key,
         pin_hash        = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
         must_change_pin = false,
         pin_set_at      = now(),
         updated_at      = now()
   where id = v_id
  returning * into v_row;

  if v_old_key is distinct from v_new_key then
    update public.members
       set linked_cloudkey = v_new_key, updated_at = now()
     where linked_cloudkey = v_old_key or linked_player_id = v_id;
    update public.admins
       set cloud_key = v_new_key
     where player_id = v_id or cloud_key = v_old_key;
    update public.member_claim_requests
       set requester_cloudkey = v_new_key
     where requester_player_id = v_id or requester_cloudkey = v_old_key;
    update public.member_claim_requests
       set current_linked_cloudkey = v_new_key
     where current_linked_cloudkey = v_old_key;
    update public.live_games
       set creator_cloudkey = 'id:' || v_id
     where creator_cloudkey = v_old_key;
  end if;

  delete from public.bowls_sessions where player_id = v_id;
  delete from public.login_lockouts
   where public.bowls_name_key(name) = v_row.name_key
      or name = 'ADMIN:' || v_row.name_key;

  select * into v_member from public.members where linked_player_id = v_id limit 1;
  v_token := public.bowls_session_issue(v_id, v_row.club_id);

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


-- ── 6. The member's own data, by token (Step 3b) ──────────────────────────

-- What bowls_sign_in hands back, for a device that is already signed in.
create or replace function public.bowls_my_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id  uuid;
  v_row public.player_data%rowtype;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select * into v_row from public.player_data where id = v_id;
  return jsonb_build_object(
    'status', 'ok', 'entries', v_row.entries, 'ties', v_row.ties,
    'profile', v_row.profile, 'updated_at', v_row.updated_at);
end $function$;

-- Replaces the client's upsert into player_data. A null argument leaves that
-- column as it is.
create or replace function public.bowls_save_my_data(p_token text, p_entries jsonb default null, p_ties jsonb default null, p_profile jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id uuid;
  v_at timestamptz;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  update public.player_data
     set entries    = coalesce(p_entries, entries),
         ties       = coalesce(p_ties, ties),
         profile    = coalesce(p_profile, profile),
         updated_at = now()
   where id = v_id
  returning updated_at into v_at;
  return jsonb_build_object('status', 'ok', 'updated_at', v_at);
end $function$;


-- ── 7. What a signed-in member reads (Step 3d) ────────────────────────────

-- The directory, phone numbers included, for a member of the same club.
-- Never includes linked_cloudkey. is_linked, is_me and linked_player_id stand
-- in for what the client used it for.
create or replace function public.bowls_member_directory(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  return jsonb_build_object(
    'status', 'ok',
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',               m.id,
               'name',             m.name,
               'phone',            m.phone,
               'section',          coalesce(m.section, 'gents'),
               'position',         m.position,
               'sort_order',       m.sort_order,
               'updated_at',       m.updated_at,
               'is_linked',        m.linked_player_id is not null,
               'linked_player_id', m.linked_player_id,
               'is_me',            m.linked_player_id is not distinct from v_id and m.linked_player_id is not null)
             order by m.sort_order, m.name)
        from public.members m
       where m.club_id = v_club), '[]'::jsonb));
end $function$;

-- Profiles and entries of linked members, keyed by roster id.
create or replace function public.bowls_member_profiles(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  return jsonb_build_object(
    'status', 'ok',
    'profiles', coalesce((
      select jsonb_object_agg(m.id, jsonb_build_object(
               'profile', d.profile,
               'entries', coalesce(d.entries, '[]'::jsonb)))
        from public.members m
        join public.player_data d on d.id = m.linked_player_id
       where m.club_id = v_club
         and d.profile is not null
         and d.profile <> '{}'::jsonb), '{}'::jsonb));
end $function$;


-- ── 8. What a signed-in member changes (Step 3d) ──────────────────────────

-- Link the caller to a roster entry. First come: an entry someone else holds
-- is refused, and the client offers a claim request. Drops the caller's
-- previous link in the same step.
create or replace function public.bowls_link_my_member(p_token text, p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_key  text;
  v_club uuid;
  v_m    record;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select player_name, club_id into v_key, v_club from public.player_data where id = v_id;

  select m.id, m.name, m.linked_player_id into v_m
    from public.members m
   where m.id = p_member_id and m.club_id = v_club
   for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_m.linked_player_id is not null and v_m.linked_player_id <> v_id then
    return jsonb_build_object('status', 'already_linked', 'member_id', v_m.id, 'member_name', v_m.name);
  end if;

  update public.members
     set linked_cloudkey = null, linked_player_id = null, updated_at = now()
   where (linked_player_id = v_id or linked_cloudkey = v_key)
     and id <> p_member_id;

  update public.members
     set linked_cloudkey = v_key, linked_player_id = v_id, updated_at = now()
   where id = p_member_id;

  return jsonb_build_object('status', 'ok', 'member_id', v_m.id, 'member_name', v_m.name);
end $function$;

create or replace function public.bowls_unlink_my_member(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id  uuid;
  v_key text;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select player_name into v_key from public.player_data where id = v_id;

  update public.members
     set linked_cloudkey = null, linked_player_id = null, updated_at = now()
   where linked_player_id = v_id or linked_cloudkey = v_key;
  return jsonb_build_object('status', 'ok');
end $function$;

-- "That roster entry is me" when someone else holds it. An admin decides.
create or replace function public.bowls_request_member_claim(p_token text, p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_acct record;
  v_m    record;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select d.player_name, d.club_id, public.bowls_account_name(d) as account_name
    into v_acct from public.player_data d where d.id = v_id;

  select m.id, m.name, m.linked_player_id, m.linked_cloudkey into v_m
    from public.members m
   where m.id = p_member_id and m.club_id = v_acct.club_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_m.linked_player_id is null or v_m.linked_player_id = v_id then
    return jsonb_build_object('status', 'not_needed');
  end if;

  if exists (select 1 from public.member_claim_requests r
              where r.status = 'pending'
                and r.target_member_id = v_m.id
                and (r.requester_player_id = v_id or r.requester_cloudkey = v_acct.player_name)) then
    return jsonb_build_object('status', 'already_requested');
  end if;

  insert into public.member_claim_requests
    (requester_cloudkey, requester_player_id, requester_display_name,
     target_member_id, target_member_name, current_linked_cloudkey, status, club_id)
  values
    (v_acct.player_name, v_id, v_acct.account_name,
     v_m.id, v_m.name, v_m.linked_cloudkey, 'pending', v_acct.club_id);

  return jsonb_build_object('status', 'ok');
end $function$;

-- A member changes the number on their own linked entry.
create or replace function public.bowls_set_my_phone(p_token text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_id uuid;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  if length(coalesce(p_phone, '')) > 30 then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.members
     set phone = nullif(trim(coalesce(p_phone, '')), ''), updated_at = now()
   where linked_player_id = v_id;
  if not found then
    return jsonb_build_object('status', 'not_linked');
  end if;
  return jsonb_build_object('status', 'ok');
end $function$;

-- "This member's number is out of date", for an admin to apply.
create or replace function public.bowls_request_phone_change(p_token text, p_member_id text, p_requested_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
  v_m    record;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  if coalesce(trim(p_requested_phone), '') = '' or length(p_requested_phone) > 30 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  select m.id, m.name, m.phone into v_m
    from public.members m where m.id = p_member_id and m.club_id = v_club;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.phone_change_requests (member_id, member_name, current_phone, requested_phone, club_id)
  values (v_m.id, v_m.name, v_m.phone, trim(p_requested_phone), v_club);
  return jsonb_build_object('status', 'ok');
end $function$;

-- "Please make me an admin".
create or replace function public.bowls_request_admin(p_token text, p_requested_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_acct record;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  if length(coalesce(p_requested_role, '')) > 100 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select public.bowls_account_name(d) as account_name, d.club_id
    into v_acct from public.player_data d where d.id = v_id;

  insert into public.admin_requests (player_name, player_id, requested_role, requested_at, club_id)
  values (v_acct.account_name, v_id,
          nullif(trim(coalesce(p_requested_role, '')), ''), now(), v_acct.club_id)
  on conflict (player_id) do update
    set player_name    = excluded.player_name,
        requested_role = excluded.requested_role,
        requested_at   = excluded.requested_at;
  return jsonb_build_object('status', 'ok');
end $function$;

-- The first super admin of a club. Replaces the client's direct write to
-- admins.
create or replace function public.bowls_claim_super_admin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_acct record;
begin
  v_id := public.bowls_session_caller(p_token);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select d.player_name, public.bowls_account_name(d) as account_name, d.club_id
    into v_acct from public.player_data d where d.id = v_id;

  perform pg_advisory_xact_lock(hashtext('claim_super_admin'));

  if exists (select 1 from public.admins where player_id = v_id and role = 'super_admin') then
    return jsonb_build_object('status', 'restored');
  end if;
  if exists (select 1 from public.admins where role = 'super_admin' and club_id = v_acct.club_id) then
    return jsonb_build_object('status', 'exists');
  end if;

  delete from public.admins where player_id = v_id or cloud_key = v_acct.player_name;
  insert into public.admins (cloud_key, player_name, role, display_name, player_id, club_id)
  values (v_acct.player_name, v_acct.account_name, 'super_admin', v_acct.account_name, v_id, v_acct.club_id);
  return jsonb_build_object('status', 'claimed');
end $function$;


-- ── 9. What an admin reads (Step 3e) ──────────────────────────────────────
-- Everything the admin panel loads on open. 'admin' and 'super_admin' only,
-- matching canEditMembers / canResetPins. No row carries a PIN or a cloud
-- key: accounts show account_name, admins show player_id.
create or replace function public.bowls_admin_panel_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id    uuid;
  v_club  uuid;
  v_super boolean;
  v_out   jsonb;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;
  v_super := exists (select 1 from public.admins where player_id = v_id and role = 'super_admin');

  v_out := jsonb_build_object(
    'status', 'ok',
    'phone_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'member_id', r.member_id, 'member_name', r.member_name,
               'current_phone', r.current_phone, 'requested_phone', r.requested_phone,
               'requested_at', r.requested_at) order by r.requested_at)
        from public.phone_change_requests r where r.club_id = v_club), '[]'::jsonb),
    'join_requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.requested_at)
        from public.member_join_requests r
       where r.club_id = v_club and r.status = 'pending'), '[]'::jsonb),
    'claim_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'requester_display_name', r.requester_display_name,
               'target_member_id', r.target_member_id,
               'target_member_name', r.target_member_name,
               'current_holder_name', (select public.bowls_account_name(d)
                                         from public.members m
                                         join public.player_data d on d.id = m.linked_player_id
                                        where m.id = r.target_member_id),
               'status', r.status,
               'requested_at', r.requested_at) order by r.requested_at)
        from public.member_claim_requests r
       where r.club_id = v_club and r.status = 'pending'), '[]'::jsonb),
    'lockouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'name', l.name, 'attempts', l.attempts,
               'locked_until', l.locked_until, 'unlock_requested', l.unlock_requested,
               'updated_at', l.updated_at) order by l.updated_at desc)
        from public.login_lockouts l where l.club_id = v_club), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'account_name', public.bowls_account_name(d),
               'display_name', d.display_name,
               'name_key', d.name_key,
               'updated_at', d.updated_at,
               'must_change_pin', d.must_change_pin,
               'pin_set_at', d.pin_set_at,
               'member_id',   (select m.id   from public.members m where m.linked_player_id = d.id limit 1),
               'member_name', (select m.name from public.members m where m.linked_player_id = d.id limit 1),
               'role',        (select a.role from public.admins a where a.player_id = d.id))
             order by d.updated_at desc)
        from public.player_data d where d.club_id = v_club), '[]'::jsonb));

  if v_super then
    v_out := v_out || jsonb_build_object(
      'admins', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'player_id', a.player_id, 'player_name', a.player_name,
                 'display_name', a.display_name, 'role', a.role, 'created_at', a.created_at)
               order by a.created_at)
          from public.admins a where a.club_id = v_club), '[]'::jsonb),
      'admin_requests', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', r.id, 'player_name', r.player_name, 'player_id', r.player_id,
                 'requested_role', r.requested_role, 'requested_at', r.requested_at)
               order by r.requested_at)
          from public.admin_requests r where r.club_id = v_club), '[]'::jsonb));
  end if;

  return v_out;
end $function$;


-- ── 10. What an admin changes (Step 3e) ───────────────────────────────────

-- Add (p_member_id null, or an id not yet on the roster) or edit a roster
-- entry. Returns the saved row, without linked_cloudkey.
create or replace function public.bowls_admin_save_member(
  p_token       text,
  p_member_id   text,
  p_member_name text,
  p_phone       text,
  p_section     text,
  p_position    text default null,
  p_sort_order  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
  v_row  public.members%rowtype;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  if coalesce(trim(p_member_name), '') = '' or length(coalesce(p_phone, '')) > 30 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  update public.members
     set name       = upper(trim(p_member_name)),
         phone      = nullif(trim(coalesce(p_phone, '')), ''),
         section    = coalesce(nullif(trim(coalesce(p_section, '')), ''), section),
         position   = nullif(trim(coalesce(p_position, '')), ''),
         sort_order = coalesce(p_sort_order, sort_order),
         updated_at = now()
   where id = p_member_id and club_id = v_club
  returning * into v_row;

  if not found then
    if p_member_id is not null and exists (select 1 from public.members where id = p_member_id) then
      return jsonb_build_object('status', 'not_found');  -- another club's id
    end if;
    insert into public.members (id, name, phone, section, position, sort_order, club_id)
    values (coalesce(p_member_id, gen_random_uuid()::text),
            upper(trim(p_member_name)),
            nullif(trim(coalesce(p_phone, '')), ''),
            coalesce(nullif(trim(coalesce(p_section, '')), ''), 'gents'),
            nullif(trim(coalesce(p_position, '')), ''),
            coalesce(p_sort_order, 999),
            v_club)
    returning * into v_row;
  end if;

  return jsonb_build_object('status', 'ok', 'member', jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'phone', v_row.phone, 'section', v_row.section,
    'position', v_row.position, 'sort_order', v_row.sort_order, 'updated_at', v_row.updated_at,
    'is_linked', v_row.linked_player_id is not null,
    'linked_player_id', v_row.linked_player_id,
    'is_me', v_row.linked_player_id is not distinct from v_id and v_row.linked_player_id is not null));
end $function$;

create or replace function public.bowls_admin_delete_member(p_token text, p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  begin
    delete from public.members where id = p_member_id and club_id = v_club;
  exception when foreign_key_violation then
    -- live_games.creator_member_id points at them.
    return jsonb_build_object('status', 'in_use',
      'message', 'This member set up a live game, so they cannot be removed from the roster.');
  end;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end $function$;

-- Delete an app account. Refused for the caller's own and for one holding an
-- admin role. Sessions and admin requests go with it (both cascade).
create or replace function public.bowls_admin_delete_account(p_token text, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
  v_acct record;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  select id, name_key, player_name into v_acct
    from public.player_data where id = p_player_id and club_id = v_club;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_player_id = v_id then
    return jsonb_build_object('status', 'self', 'message', 'You cannot delete your own account.');
  end if;
  if exists (select 1 from public.admins where player_id = p_player_id) then
    return jsonb_build_object('status', 'is_admin', 'message', 'Revoke their admin role first.');
  end if;

  update public.members
     set linked_cloudkey = null, linked_player_id = null, updated_at = now()
   where linked_player_id = p_player_id or linked_cloudkey = v_acct.player_name;
  delete from public.login_lockouts
   where public.bowls_name_key(name) = v_acct.name_key or name = 'ADMIN:' || v_acct.name_key;
  delete from public.player_data where id = p_player_id;
  return jsonb_build_object('status', 'ok');
end $function$;

-- Lock or unlock an account. p_account_name is a name as typed, or a lockout
-- row's name exactly ('ADMIN:' rows included). Locking writes the name key
-- locked until 2099, which login_lockouts_end_sessions turns into "and sign
-- them out everywhere". Unlocking clears every row for that name, sign-in
-- and admin counters both, whichever shape it was written in.
create or replace function public.bowls_admin_set_lockout(p_token text, p_account_name text, p_locked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
  v_key  text;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  v_key := public.bowls_name_key(regexp_replace(upper(trim(coalesce(p_account_name, ''))), '^ADMIN:', ''));
  if v_key = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_locked then
    insert into public.login_lockouts (name, attempts, locked_until, updated_at, club_id)
    values (v_key, 0, '2099-01-01T00:00:00Z', now(), v_club)
    on conflict (name) do update
      set locked_until = excluded.locked_until, updated_at = now();
  else
    delete from public.login_lockouts
     where public.bowls_name_key(name) = v_key or name = 'ADMIN:' || v_key;
  end if;
  return jsonb_build_object('status', 'ok', 'name', v_key);
end $function$;

create or replace function public.bowls_admin_resolve_phone_request(p_token text, p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
  v_req  record;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  select * into v_req from public.phone_change_requests
   where id = p_request_id and club_id = v_club for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_approve then
    update public.members
       set phone = v_req.requested_phone, updated_at = now()
     where id = v_req.member_id and club_id = v_club;
  end if;
  delete from public.phone_change_requests where id = p_request_id;
  return jsonb_build_object('status', 'ok', 'member_id', v_req.member_id,
                            'phone', case when p_approve then v_req.requested_phone end);
end $function$;

create or replace function public.bowls_admin_resolve_join_request(p_token text, p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id   uuid;
  v_club uuid;
  v_req  record;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  select * into v_req from public.member_join_requests
   where id = p_request_id and club_id = v_club and status = 'pending' for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_approve then
    insert into public.members (name, phone, section, sort_order, club_id)
    values (upper(trim(v_req.name)), v_req.phone, coalesce(v_req.section, 'gents'), 9999, v_club);
  end if;
  update public.member_join_requests
     set status = case when p_approve then 'approved' else 'declined' end
   where id = p_request_id;
  return jsonb_build_object('status', 'ok');
end $function$;

-- Approve: the requester takes the roster entry, the previous holder loses
-- it, and the requester's own previous link is dropped.
create or replace function public.bowls_admin_resolve_claim_request(p_token text, p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id      uuid;
  v_club    uuid;
  v_req     record;
  v_req_id  uuid;
  v_req_key text;
begin
  v_id := public.bowls_session_admin(p_token, array['admin', 'super_admin']);
  if v_id is null then
    return public.bowls_session_refusal(p_token);
  end if;
  select club_id into v_club from public.player_data where id = v_id;

  select * into v_req from public.member_claim_requests
   where id = p_request_id and club_id = v_club and status = 'pending' for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_approve then
    select d.id, d.player_name into v_req_id, v_req_key
      from public.player_data d
     where d.id = v_req.requester_player_id
        or (v_req.requester_player_id is null and d.player_name = v_req.requester_cloudkey)
     limit 1;
    if v_req_id is null then
      return jsonb_build_object('status', 'requester_gone',
        'message', 'The account that asked no longer exists.');
    end if;

    update public.members
       set linked_cloudkey = null, linked_player_id = null, updated_at = now()
     where id = v_req.target_member_id
        or linked_player_id = v_req_id
        or linked_cloudkey = v_req_key;
    update public.members
       set linked_cloudkey = v_req_key, linked_player_id = v_req_id, updated_at = now()
     where id = v_req.target_member_id and club_id = v_club;
  end if;

  update public.member_claim_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         resolved_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'ok');
end $function$;


-- ════════════════════════════════════════════════════════════════════════
--  EXECUTE
--
--  Revoked from PUBLIC first. Supabase's default privileges also grant
--  EXECUTE on new functions to anon and authenticated directly, so the
--  internal ones are revoked from those by name as well.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  r text;
  f text;
  endpoints text[] := array[
    'public.bowls_admin_role(text, text)',
    'public.bowls_sign_in(text, text)',
    'public.bowls_register(text, text, text)',
    'public.bowls_change_pin(text, text, text)',
    'public.bowls_my_data(text)',
    'public.bowls_save_my_data(text, jsonb, jsonb, jsonb)',
    'public.bowls_member_directory(text)',
    'public.bowls_member_profiles(text)',
    'public.bowls_link_my_member(text, text)',
    'public.bowls_unlink_my_member(text)',
    'public.bowls_request_member_claim(text, text)',
    'public.bowls_set_my_phone(text, text)',
    'public.bowls_request_phone_change(text, text, text)',
    'public.bowls_request_admin(text, text)',
    'public.bowls_claim_super_admin(text)',
    'public.bowls_admin_panel_data(text)',
    'public.bowls_admin_save_member(text, text, text, text, text, text, integer)',
    'public.bowls_admin_delete_member(text, text)',
    'public.bowls_admin_delete_account(text, uuid)',
    'public.bowls_admin_set_lockout(text, text, boolean)',
    'public.bowls_admin_resolve_phone_request(text, uuid, boolean)',
    'public.bowls_admin_resolve_join_request(text, uuid, boolean)',
    'public.bowls_admin_resolve_claim_request(text, uuid, boolean)'
  ];
  internal text[] := array[
    'public.bowls_auth(text, text, text, boolean)',
    'public.bowls_auth_refusal(text, text)',
    'public.bowls_admin_caller(text, text, text[])',
    'public.bowls_session_caller(text)',
    'public.bowls_session_admin(text, text[])',
    'public.bowls_session_refusal(text)',
    'public.bowls_is_admin(text, text)',
    'public.bowls_is_super_admin(text, text)',
    'public.bowls_save_player(text, text, jsonb, jsonb, jsonb)',
    'public.bowls_link_member(text, text, text)',
    'public.bowls_admin_set_member_phone(text, text, text, text)',
    'public.claim_super_admin_tx(text, text)'
  ];
begin
  foreach f in array endpoints || internal loop
    execute format('revoke execute on function %s from public', f);
  end loop;

  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach f in array endpoints loop
        execute format('grant execute on function %s to %I', f, r);
      end loop;
      foreach f in array internal loop
        execute format('revoke execute on function %s from %I', f, r);
      end loop;
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array endpoints || internal loop
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end $$;

-- Fail loudly rather than ship a club that cannot sign in or administer.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if not has_function_privilege('anon', 'public.bowls_admin_role(text, text)', 'execute')
       or not has_function_privilege('anon', 'public.bowls_sign_in(text, text)', 'execute')
       or not has_function_privilege('anon', 'public.bowls_session_state(text)', 'execute')
       or not has_function_privilege('anon', 'public.bowls_request_unlock(text)', 'execute')
       or not has_function_privilege('anon', 'public.bowls_member_directory(text)', 'execute') then
      raise exception 'anon cannot execute a function the client needs. Do not ship this.';
    end if;
    if has_function_privilege('anon', 'public.bowls_auth(text, text, text, boolean)', 'execute')
       or has_function_privilege('anon', 'public.bowls_session_caller(text)', 'execute')
       or has_function_privilege('anon', 'public.bowls_session_issue(uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'public.bowls_session_player(text)', 'execute')
       or has_function_privilege('anon', 'public.bowls_is_admin(text, text)', 'execute')
       or has_function_privilege('anon', 'public.bowls_save_player(text, text, jsonb, jsonb, jsonb)', 'execute')
       or has_function_privilege('anon', 'public.claim_super_admin_tx(text, text)', 'execute') then
      raise exception 'anon can execute an internal check. Do not ship this.';
    end if;
  end if;
end $$;
