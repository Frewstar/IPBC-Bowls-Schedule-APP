-- ════════════════════════════════════════════════════════════════════════
--  RESET-PIN REFUSES AN ACCOUNT IT WOULD OTHERWISE MANGLE
--
--  bowls_admin_reset_pin builds the new account key by hand:
--
--      v_name_part := regexp_replace(v_account.player_name, '-[^-]*$', '');
--      v_new_key   := v_name_part || '-' || p_new_pin;
--      update public.player_data set player_name = v_new_key, ...
--
--  That is correct for a NAME-PIN row and wrong for anything else. Now that
--  bowls_register writes the row's uuid into player_name, an account can
--  look like:
--
--      61f82a8a-09cf-4385-874b-1741925bebe7
--
--  and `-[^-]*$` strips the last hyphen group rather than a PIN, so the
--  function would write back:
--
--      61f82a8a-09cf-4385-874b-1234
--
--  which puts the PIN straight back into player_name — undoing the change it
--  is meant to support — and breaks the player_name = id invariant at the
--  same time. It does this silently, and the existing guard does not catch
--  it: v_name_part is neither empty nor equal to player_name, so the
--  bad_account branch is never reached.
--
--  Nothing can hit this today. No uuid-named account exists (the 92 live rows
--  are all NAME-PIN) and nothing calls bowls_register — the client still
--  creates accounts through its own upsert. The first uuid-named account
--  appears the moment Step 3a moves registration onto the RPC, which is why
--  this guard goes in now rather than then.
--
--  This is the small, safe half. The real fix is for reset-PIN to change
--  pin_hash and NOTHING else — never player_name, never members.linked_cloudkey,
--  never admins.cloud_key. That cannot land yet: the client still keys its
--  cloud sync on NAME-PIN, so an account whose player_name stopped moving
--  with its PIN would have its data disappear from under it. It belongs in
--  the same commit as Step 3a, where the client stops building the key.
--
--  Behaviour for all 92 existing accounts is unchanged, exactly. The only
--  difference is that an account this function cannot handle is refused in
--  words instead of quietly corrupted.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Restore bowls_admin_reset_pin from
--  20260830_reset_pin_keeps_admin_row_in_step.sql, which is the version this
--  file adds one guard to. The signature and every status string are
--  unchanged, so nothing calling it needs to know either way.
-- ════════════════════════════════════════════════════════════════════════

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
  v_member    record;
  v_account   record;
  v_name_part text;
  v_new_key   text;
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

  -- THE GUARD. Everything below rewrites player_name on the assumption that
  -- it ends in a 4-digit PIN. Say so, and refuse anything else, rather than
  -- letting regexp_replace do something plausible-looking to a key it does
  -- not understand.
  if v_account.player_name !~ '-[0-9]{4}$' then
    return jsonb_build_object('status','bad_account',
      'message', v_member.name || '''s account does not store a PIN in its key, so this reset cannot run against it yet. '
              || 'Ask for the reset-PIN change that ships with the sign-in move.');
  end if;

  v_name_part := regexp_replace(v_account.player_name, '-[^-]*$', '');
  if v_name_part = '' or v_name_part = v_account.player_name then
    return jsonb_build_object('status','bad_account',
      'message','That account key is not in NAME-PIN form and needs fixing by hand.');
  end if;

  v_new_key := v_name_part || '-' || p_new_pin;

  if exists (select 1 from public.player_data d where d.player_name = v_new_key and d.id <> v_account.id) then
    return jsonb_build_object('status','collision',
      'message','Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end if;

  begin
    update public.player_data
       set player_name = v_new_key,
           pin_hash    = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
           updated_at  = now()
     where id = v_account.id;
  exception when unique_violation then
    return jsonb_build_object('status','collision',
      'message','Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end;

  update public.members set linked_cloudkey = v_new_key where id = v_member.id;
  update public.admins  set cloud_key       = v_new_key where player_id = v_account.id;

  delete from public.login_lockouts
   where upper(name) in (upper(v_name_part), upper(v_member.name));

  return jsonb_build_object(
    'status','ok',
    'member_name',  v_member.name,
    'account_name', v_name_part,
    'new_key',      v_new_key,
    'new_pin',      p_new_pin);
end;
$function$;

-- create or replace preserves the existing EXECUTE grants; re-asserted so a
-- fresh database ends up in the same place as production.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_admin_reset_pin(text, text, text, text) to %I', r);
    end if;
  end loop;
end $$;
