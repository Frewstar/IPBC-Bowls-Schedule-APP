-- ════════════════════════════════════════════════════════════════════════
--  20260923_directory_lockdown_2_close_tables.sql
--
--  STATUS: NOT YET APPLIED to the live database.
--
--  PART 2 OF 2. CLOSES TABLES, ENDS EVERY SESSION, AND ASKS EVERY ACCOUNT
--  FOR A NEW PIN. APPLY ONLY AFTER THE NEW CLIENT IS LIVE.
--
--  Track 2, Step 4. Requires 20260923_directory_lockdown_1_functions.sql,
--  and a client that no longer reads or writes these tables directly and
--  shows the "choose a new PIN" screen. Run against any earlier client, it
--  breaks the directory, account sync, member linking and the admin panel's
--  member, account, lockout and request sections at once, and the earlier
--  client cannot get anyone past the new-PIN step.
--
--  Four things, in this order:
--
--   1. live_games stops holding keys. creator_cloudkey was NAME-PIN for a
--      game set up by someone not linked to the roster — in a table anyone
--      can read — and a bare uuid key since 1 Sep. Both become
--      'id:<account id>', which is what the new client writes, and a check
--      refuses anything else from now on.
--   2. Every session ends and every account must choose a new PIN. Every
--      legacy PIN has sat in player_name, members.linked_cloudkey and
--      admins.cloud_key where the publishable key could read it, and every
--      session was issued to whoever typed one. An old PIN still signs in,
--      but only to "choose a new PIN": bowls_sign_in issues no token for it,
--      and every admin function refuses it (part 1). Admins and the super
--      admin included — their panel stays shut until they have changed it.
--   3. The tables are closed: policies, then grants.
--   4. A check that refuses to finish if any of it did not take.
--
--  After this, with the publishable key:
--
--   player_data            nothing. Reads and writes go through functions
--                          that check a session token (or, for sign-in and
--                          the admin functions that still take one, a PIN).
--   members                SELECT on id, name, section, position,
--                          sort_order, club_id only. No phone, no
--                          linked_cloudkey, no linked_player_id, no writes.
--                          The signed-out roster query the client makes
--                          ("id, name, section, position, sort_order") keeps
--                          working unchanged.
--   admins                 SELECT on everything except cloud_key. No writes.
--                          Kept readable because the draws and draw_pairings
--                          write policies look admins up by player_name and
--                          role as the caller.
--   login_lockouts         nothing.
--   admin_requests,
--   member_claim_requests,
--   member_join_requests,
--   phone_change_requests  nothing.
--   bowls_sessions         nothing (unchanged — closed since 20260901163342).
--
--  Not touched, still open to the publishable key and still worth doing:
--  club_config, club_fixtures, tournaments, club_events, live_games,
--  draw_results, draw_pairings deletes, and the draws policies (which trust
--  a generated_by name the client supplies).
--
--  bowls_admin_reset_pin is not touched: its live behaviour — pin_hash only,
--  and every session for the account ended — stands.
--
--  RLS is already enabled on every table here. Policies are dropped and
--  table grants revoked, so both layers say no. service_role, the SECURITY
--  DEFINER functions and triggers are unaffected.
--
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. No keys in live_games ──────────────────────────────────────────────
-- Before step 2 changes nothing about keys, but bowls_change_pin does, so
-- this runs while every stored key still matches its account. A key that
-- matches no account (deleted since) is cleared rather than kept.
update public.live_games g
   set creator_cloudkey = 'id:' || d.id
  from public.player_data d
 where g.creator_cloudkey = d.player_name;

update public.live_games
   set creator_cloudkey = null
 where creator_cloudkey is not null
   and creator_cloudkey !~ '^id:[0-9a-f-]{36}$';

alter table public.live_games drop constraint if exists live_games_creator_not_a_pin;
alter table public.live_games add constraint live_games_creator_not_a_pin
  check (creator_cloudkey is null or creator_cloudkey ~ '^id:[0-9a-f-]{36}$');


-- ── 2. Every session ends; every account chooses a new PIN ───────────────
-- Only on the run that closes the tables. Whether anon can still read
-- player_data is the marker: true the first time, false on any re-run, so
-- running this file again signs nobody out and asks nobody who has already
-- chosen a new PIN.
--
-- Every account, including the few bowls_register made since 1 Sep with a
-- uuid key: their PIN was never stored readably, but until this runs
-- bowls_register would hand any account's token to whoever walked its PIN,
-- and it is one sign-in for them against a rule nobody has to reason about.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.player_data', 'select') then
    update public.player_data set must_change_pin = true where not must_change_pin;
    delete from public.bowls_sessions;
  end if;
end $$;


-- ── 3. Policies ───────────────────────────────────────────────────────────
drop policy if exists "public_read_write" on public.player_data;

drop policy if exists "open"              on public.members;
drop policy if exists "members read"      on public.members;
create policy "members read" on public.members
  for select to anon, authenticated using (true);

drop policy if exists "public_read"            on public.admins;
drop policy if exists "anon_insert_non_super"  on public.admins;
drop policy if exists "anon_update_non_super"  on public.admins;
drop policy if exists "anon_delete_non_super"  on public.admins;
drop policy if exists "admins read"            on public.admins;
create policy "admins read" on public.admins
  for select to anon, authenticated using (true);

drop policy if exists "open" on public.login_lockouts;
drop policy if exists "open" on public.admin_requests;
drop policy if exists "anyone can insert claim requests" on public.member_claim_requests;
drop policy if exists "anyone can update claim requests" on public.member_claim_requests;
drop policy if exists "requester can read own requests"  on public.member_claim_requests;
drop policy if exists "open" on public.member_join_requests;
drop policy if exists "open" on public.phone_change_requests;


-- ── 4. Grants ─────────────────────────────────────────────────────────────
-- Revoke everything, then give back the columns that are safe to read. The
-- policy says which rows, the grant says which columns; phone,
-- linked_cloudkey and cloud_key are not among them, so a "select *" on
-- either table is refused outright.
do $$
declare
  r text;
  t text;
  closed text[] := array[
    'player_data', 'members', 'admins', 'login_lockouts', 'admin_requests',
    'member_claim_requests', 'member_join_requests', 'phone_change_requests'
  ];
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach t in array closed loop
        execute format('revoke all on table public.%I from %I', t, r);
      end loop;
      execute format('grant select (id, name, section, position, sort_order, club_id) on table public.members to %I', r);
      execute format('grant select (player_id, player_name, display_name, role, created_at, club_id) on table public.admins to %I', r);
      -- members_public is unchanged and stays readable.
      execute format('grant select on table public.members_public to %I', r);
    end if;
  end loop;
end $$;


-- ── 5. Check, and refuse to finish if any of it did not take ──────────────
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;
  end if;

  foreach t in array array['player_data', 'login_lockouts', 'admin_requests',
                           'member_claim_requests', 'member_join_requests',
                           'phone_change_requests', 'bowls_sessions'] loop
    if has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('anon', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'update')
       or has_table_privilege('anon', 'public.' || t, 'delete') then
      raise exception 'anon still has access to %.', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception '% still has a policy.', t;
    end if;
  end loop;

  foreach t in array array['members', 'admins'] loop
    if has_table_privilege('anon', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'update')
       or has_table_privilege('anon', 'public.' || t, 'delete') then
      raise exception 'anon can still write to %.', t;
    end if;
  end loop;

  if has_column_privilege('anon', 'public.members', 'phone', 'select')
     or has_column_privilege('anon', 'public.members', 'linked_cloudkey', 'select')
     or has_column_privilege('anon', 'public.admins', 'cloud_key', 'select') then
    raise exception 'anon can still read a phone number or a stored key.';
  end if;

  if exists (select 1 from public.live_games
              where creator_cloudkey is not null and creator_cloudkey !~ '^id:') then
    raise exception 'live_games still holds an account key.';
  end if;

  if exists (select 1 from public.player_data where not must_change_pin and pin_set_at is null) then
    raise exception 'an account with a readable PIN was not asked to change it.';
  end if;

  if not has_column_privilege('anon', 'public.members', 'name', 'select')
     or not has_column_privilege('anon', 'public.admins', 'role', 'select')
     or not has_function_privilege('anon', 'public.bowls_member_directory(text)', 'execute')
     or not has_function_privilege('anon', 'public.bowls_change_pin(text, text, text)', 'execute') then
    raise exception 'anon lost something the client needs. Do not ship this.';
  end if;
end $$;
