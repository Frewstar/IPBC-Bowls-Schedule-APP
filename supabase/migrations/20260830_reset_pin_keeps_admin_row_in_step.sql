-- ════════════════════════════════════════════════════════════════════════
--  RESET PIN KEEPS THE ADMIN ROW IN STEP
--
--  Run this after 20260830_admin_reset_pin.sql. It replaces the function
--  that file creates with the version that is actually live.
--
--  THE LEDGER ALREADY KNOWS ABOUT THIS ONE. schema_migrations has carried
--  20260830095508 reset_pin_keeps_admin_row_in_step since the morning of
--  30 August. What was missing was the FILE: the fix went into the SQL
--  editor and the repo copy in 20260830_admin_reset_pin.sql was never
--  brought up to it. The README has flagged that file as "the live
--  function is AHEAD of this file" ever since, which warns a human reading
--  the README and does nothing at all for a machine replaying the folder.
--
--  So this is drift in the repository, not in the database — the opposite
--  direction from club_events.end_time. Left alone, a new club would have
--  run 20260830_admin_reset_pin.sql, got the function without the last
--  statement, and hit the bug below on their first PIN reset.
--
--  WHAT THE MISSING STATEMENT DOES
--
--    update public.admins set cloud_key = v_new_key where player_id = v_account.id;
--
--  admins_pkey is on cloud_key, and cloud_key is a copy of the account's
--  NAME-PIN sign-in key. Resetting a PIN moves player_data.player_name to
--  a new NAME-PIN. Without this line the admins row keeps pointing at the
--  old key, and bowls_is_admin — which matches on player_id — still finds
--  it, but every path that matches on cloud_key does not. An admin who
--  resets their own PIN silently stops being an admin.
--
--  Body taken from the live database with pg_get_functiondef on 31 August
--  2026, not reconstructed from the repo file. create or replace, so
--  running it against production is a no-op.
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
set search_path = public, extensions
as $function$
declare
  v_member record; v_account record; v_name_part text; v_new_key text;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('status','bad_pin','message','A PIN must be exactly 4 digits.');
  end if;

  if coalesce(p_admin_name,'') = '' or coalesce(p_admin_pin,'') = ''
     or not public.bowls_is_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object('status','not_admin','message','That name and PIN did not match an admin account.');
  end if;

  select m.id, m.name, m.linked_player_id into v_member
    from public.members m where m.id::text = p_member_id;
  if not found then
    return jsonb_build_object('status','no_member','message','That member is not on the roster.');
  end if;

  if v_member.linked_player_id is null then
    return jsonb_build_object('status','no_account',
      'message', v_member.name || ' has not set up an app account yet, so there is no PIN to reset.');
  end if;

  select d.id, d.player_name into v_account
    from public.player_data d where d.id = v_member.linked_player_id for update;
  if not found then
    return jsonb_build_object('status','no_account',
      'message','The account linked to ' || v_member.name || ' no longer exists.');
  end if;

  v_name_part := regexp_replace(v_account.player_name, '-[^-]*$', '');
  if v_name_part = '' or v_name_part = v_account.player_name then
    return jsonb_build_object('status','bad_account',
      'message','That account key is not in NAME-PIN form and needs fixing by hand.');
  end if;

  v_new_key := v_name_part || '-' || p_new_pin;

  if exists (select 1 from public.player_data d
              where d.player_name = v_new_key and d.id <> v_account.id) then
    return jsonb_build_object('status','collision',
      'message','Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end if;

  begin
    update public.player_data
       set player_name = v_new_key,
           pin_hash    = crypt(p_new_pin, gen_salt('bf')),
           updated_at  = now()
     where id = v_account.id;
  exception when unique_violation then
    return jsonb_build_object('status','collision',
      'message','Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end;

  update public.members set linked_cloudkey = v_new_key where id = v_member.id;

  -- NEW: keep the admin row's key in step, if this member is an admin.
  update public.admins set cloud_key = v_new_key where player_id = v_account.id;

  delete from public.login_lockouts
   where upper(name) in (upper(v_name_part), upper(v_member.name));

  return jsonb_build_object(
    'status','ok', 'member_name', v_member.name, 'account_name', v_name_part,
    'new_key', v_new_key, 'new_pin', p_new_pin);
end;
$function$;

-- create or replace preserves the existing EXECUTE grants, so the revoke and
-- grant from 20260830_admin_reset_pin.sql still stand. Restated so that this
-- file is correct on its own if that one is ever replayed after it.
do $$
declare r text;
begin
  execute 'revoke execute on function public.bowls_admin_reset_pin(text, text, text, text) from public';
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_admin_reset_pin(text, text, text, text) to %I', r);
    end if;
  end loop;
end $$;

-- The COMMENT set by 20260830_admin_reset_pin.sql is deliberately left as it
-- is. It does not mention the admins update and so is now a sentence short,
-- but production carries that exact text and rewriting it here would make
-- this file change something rather than record something. Worth a one-line
-- fix in a later migration; not worth widening this one.
