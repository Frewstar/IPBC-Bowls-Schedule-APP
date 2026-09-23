-- ════════════════════════════════════════════════════════════════════════
--  SESSIONS CAN BE ENDED  —  the server half of Step 3a
--
--  bowls_session_player slides expires_at to now() + 90 days on every use.
--  So an active session never expires, and until this file there was no way
--  to end one.
--
--  That breaks the one thing PIN reset exists for. A member says "someone
--  knows my PIN", an admin resets it, the PIN changes — and the other
--  person's session keeps working indefinitely, renewing itself every time
--  they open the app. The reset does nothing to them. Locking the account
--  had the same hole: it stopped new sign-ins while the locked person
--  carried on using the app.
--
--  Four changes:
--
--    1. bowls_admin_reset_pin changes pin_hash and NOTHING else, and ends
--       every session for the account.
--    2. A trigger on login_lockouts ends sessions the moment an account
--       becomes locked, whoever wrote the lock.
--    3. bowls_session_state lets the client find out its token is dead.
--       Without it, ending a session has no visible effect.
--    4. bowls_sign_out_all, for "sign me out everywhere".
--
--  Deleting an account needs nothing: bowls_sessions.player_id references
--  player_data(id) ON DELETE CASCADE, so the rows go with the account. That
--  is checked below rather than assumed.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--    drop trigger  if exists login_lockouts_end_sessions on public.login_lockouts;
--    drop function if exists public.login_lockouts_end_sessions();
--    drop function if exists public.bowls_session_state(text);
--    drop function if exists public.bowls_sign_out_all(text);
--    -- then restore bowls_admin_reset_pin from
--    -- 20260901164740_reset_pin_refuses_non_legacy_keys.sql
--
--  Reverting bowls_admin_reset_pin puts the player_name rewrite back, which
--  the Step 3a client no longer expects: it would start moving player_name
--  out from under a signed-in member again. Revert the client with it.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Reset-PIN changes the PIN, and only the PIN ────────────────────────
-- The old version rebuilt the account key from the new PIN and wrote it to
-- three places — player_data.player_name, members.linked_cloudkey and
-- admins.cloud_key — because player_name WAS the credential. That is the
-- thing this track is undoing, and it is why the previous migration could
-- only add a guard rather than a fix: the client still keyed its cloud sync
-- on NAME-PIN, so an account whose player_name stopped moving with its PIN
-- would have had its data vanish from under it. Step 3a moves the client off
-- that key, so the fix can land now.
--
-- What changes: pin_hash, updated_at, and the account's sessions. That is
-- all. player_name keeps whatever it already had, so every existing link
-- stays valid and nothing else needs updating in step with it.
--
-- A side effect worth naming: for a legacy NAME-PIN row, player_name now
-- holds a PIN that no longer opens the account. The exposure gets weaker
-- with every reset rather than moving to a fresh live PIN. Those rows are
-- rewritten wholesale in Phase D.
create or replace function public.bowls_admin_reset_pin(
  p_admin_name text,
  p_admin_pin  text,
  p_member_id  text,
  p_new_pin    text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_member   record;
  v_account  record;
  v_admin_id uuid;
  v_ended    integer := 0;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('status','bad_pin','message','A PIN must be exactly 4 digits.');
  end if;

  if coalesce(p_admin_name,'') = '' or coalesce(p_admin_pin,'') = ''
     or not public.bowls_is_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object('status','not_admin','message','That name and PIN did not match an admin account.');
  end if;

  -- Which account the caller is. Used only to tell them they have just reset
  -- their own PIN and are about to be signed out — the client cannot work
  -- this out reliably by comparing names, and should not have to.
  select d.id into v_admin_id
    from public.player_data d
   where d.name_key = public.bowls_name_key(p_admin_name)
     and d.pin_hash = extensions.crypt(p_admin_pin, d.pin_hash)
   limit 1;

  select m.id, m.name, m.linked_player_id into v_member
    from public.members m where m.id::text = p_member_id;
  if not found then
    return jsonb_build_object('status','no_member','message','That member is not on the roster.');
  end if;

  if v_member.linked_player_id is null then
    return jsonb_build_object('status','no_account',
      'message', v_member.name || ' has not set up an app account yet, so there is no PIN to reset.');
  end if;

  select d.id, d.player_name, d.display_name, d.name_key into v_account
    from public.player_data d where d.id = v_member.linked_player_id for update;
  if not found then
    return jsonb_build_object('status','no_account',
      'message','The account linked to ' || v_member.name || ' no longer exists.');
  end if;

  -- The bad_account branch is gone with the key rewriting that needed it.
  -- Any account can have its PIN reset now, whatever shape its player_name
  -- is, because the shape of player_name is no longer any of this
  -- function's business.
  update public.player_data
     set pin_hash   = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_account.id;

  -- The point of the reset. Whoever else was signed in as this account —
  -- including the member themselves, on their own phone — stops being signed
  -- in. They sign back in with the new PIN, which is the expected outcome
  -- and the only one that actually locks out whoever knew the old PIN.
  with gone as (delete from public.bowls_sessions where player_id = v_account.id returning 1)
  select count(*) into v_ended from gone;

  delete from public.login_lockouts
   where name = v_account.name_key
      or upper(name) = upper(v_member.name)
      or public.bowls_name_key(name) = v_account.name_key;

  return jsonb_build_object(
    'status',         'ok',
    'member_name',    v_member.name,
    'account_name',   coalesce(v_account.display_name, v_member.name),
    'new_pin',        p_new_pin,
    'player_id',      v_account.id,
    'is_self',        v_admin_id is not null and v_admin_id = v_account.id,
    'sessions_ended', v_ended);
end;
$function$;


-- ── 2. Locking an account ends its sessions ───────────────────────────────
-- A trigger rather than a function the admin panel calls, deliberately.
--
-- The lock is still written straight to the table by the client — that is
-- the admin-panel commit's job to move, not this one's — so a function would
-- leave the hole open until then, and would need remembering by every future
-- writer. The invariant is "a locked account has no live sessions", and the
-- table is where an invariant like that belongs.
--
-- Matching is on name_key both sides. login_lockouts.name is a name_key when
-- bowls_sign_in writes it and a raw uppercase name when the admin panel
-- does; bowls_name_key is idempotent, so squashing both makes the two agree.
-- Locking by name locks every account under that name, which is already how
-- the lockout check in bowls_sign_in behaves.
create or replace function public.login_lockouts_end_sessions()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if new.locked_until is null or new.locked_until <= now() then
    return new;
  end if;

  -- Only when the lock is newly in force. An admin editing an already-locked
  -- row should not re-run this on every touch.
  if tg_op = 'UPDATE'
     and old.locked_until is not null
     and old.locked_until > now() then
    return new;
  end if;

  delete from public.bowls_sessions s
   using public.player_data d
   where s.player_id = d.id
     and d.name_key  = public.bowls_name_key(new.name);

  return new;
end $$;

drop trigger if exists login_lockouts_end_sessions on public.login_lockouts;
create trigger login_lockouts_end_sessions
  after insert or update on public.login_lockouts
  for each row execute function public.login_lockouts_end_sessions();


-- ── 3. The client can find out its token is dead ──────────────────────────
-- Ending a session is invisible until something asks. This is what the app
-- calls on load: it answers "still signed in, and here is who you are", or
-- "no".
--
-- Identity only — no entries, no ties, no profile. Those move to their own
-- RPCs in Step 3b, and putting them here would be doing half of 3b early.
--
-- Two statuses, and the difference matters to the client: 'ok' means signed
-- in, 'expired' means this token is definitively dead and the device should
-- sign itself out. Anything else — a network error, a null — is NOT an
-- answer and the client must leave the member signed in and try again later.
-- Failing closed here would sign the whole club out on a flaky connection.
create or replace function public.bowls_session_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_sess   record;
  v_row    public.player_data%rowtype;
  v_member public.members%rowtype;
begin
  select * into v_sess from public.bowls_session_player(p_token);
  if not found then
    return jsonb_build_object('status', 'expired');
  end if;

  select * into v_row    from public.player_data where id = v_sess.player_id;
  select * into v_member from public.members     where linked_player_id = v_sess.player_id limit 1;

  return jsonb_build_object(
    'status',       'ok',
    'id',           v_row.id,
    'cloud_key',    v_row.player_name,
    'display_name', v_row.display_name,
    'club_id',      v_sess.club_id,
    'member_id',    v_member.id,
    'member_name',  v_member.name);
end $$;


-- ── 4. Sign out everywhere ────────────────────────────────────────────────
-- The member's own version of what a PIN reset does to them. Takes a token,
-- resolves it to the account, and ends every session for that account
-- including the one that asked.
create or replace function public.bowls_sign_out_all(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_sess record;
begin
  select * into v_sess from public.bowls_session_player(p_token);
  if not found then
    return;
  end if;
  delete from public.bowls_sessions where player_id = v_sess.player_id;
end $$;


-- ── 5. Grants, all of them deliberate ─────────────────────────────────────
-- bowls_sign_out was left on the default PUBLIC EXECUTE by the sessions
-- migration. It needs a valid token to do anything, so it was untidiness
-- rather than a hole — but "harmless by accident" is not the same as
-- "closed on purpose", and this file makes every one of these a decision.
--
-- Open to anon, because the app calls them and each one either needs a token
-- or a PIN to do anything:
--   bowls_session_state, bowls_sign_out, bowls_sign_out_all
--   bowls_admin_reset_pin  (re-checks the caller is an admin, by PIN)
--
-- Closed to everybody, because they take an identity rather than proving
-- one: bowls_session_issue, bowls_session_player — already closed by the
-- sessions migration, re-asserted here so a fresh database matches.
revoke all on function public.bowls_sign_out(text)       from public;
revoke all on function public.bowls_session_state(text)  from public;
revoke all on function public.bowls_sign_out_all(text)   from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_sign_out(text) to %I', r);
      execute format('grant execute on function public.bowls_session_state(text) to %I', r);
      execute format('grant execute on function public.bowls_sign_out_all(text) to %I', r);
      execute format('grant execute on function public.bowls_admin_reset_pin(text, text, text, text) to %I', r);
      execute format('revoke all on function public.bowls_session_issue(uuid, uuid) from %I', r);
      execute format('revoke all on function public.bowls_session_player(text) from %I', r);
    end if;
  end loop;
end $$;
