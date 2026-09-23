-- ════════════════════════════════════════════════════════════════════════
--  THE NAME AN ACCOUNT SIGNS IN UNDER
--
--  The client stores `myName` and matches it, as a string, against draw
--  pairings, personal-competition owners and roll-of-honour entries. So the
--  value it stores at sign-in is not cosmetic — get it wrong and a member's
--  own competitions and honours stop being theirs.
--
--  The old client was careful about this. It signed in under the name part
--  of the stored player_name, not the name the member typed:
--
--      commitSignIn(keyName(match.player_name), pinInput)
--                   -- "Sign in under the exact name already stored so
--                   --  their data follows them"
--
--  because members type "J FREW", "J.FREW" and "J  FREW" between sign-ins.
--
--  Step 3a has to reproduce that exactly, and the obvious candidate does
--  not: display_name differs from the stored name part on 6 of the 92
--  accounts, because the trigger fills it from profile.displayName when the
--  member has set one. Signing those six in under their display name would
--  quietly orphan their personal comps and honours. Checked, not assumed —
--  86 of 92 match, 6 do not, and 31 accounts have a profile display name.
--
--  So the payload gains `account_name`: the name part of player_name for a
--  legacy row, and display_name for a uuid row, which has no name part. For
--  all 92 live accounts this is byte-for-byte what the old client stored.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Restore bowls_sign_in from 20260901181151_lockout_lookup_shape_tolerant.sql,
--  bowls_register from 20260901163622_register_without_pin_in_player_name.sql,
--  and bowls_session_state from 20260901181006_sessions_can_be_ended.sql.
--  Adding a field is backwards compatible; removing it is not, so revert the
--  client first or it will store an empty name.
-- ════════════════════════════════════════════════════════════════════════


-- One rule, in one place, so the three payloads cannot drift apart.
create or replace function public.bowls_account_name(p_row public.player_data)
returns text
language sql
immutable
as $$
  select case
           when p_row.player_name ~ '-[0-9]{4}$'
           then regexp_replace(p_row.player_name, '-[0-9]{4}$', '')
           else p_row.display_name
         end;
$$;

revoke all on function public.bowls_account_name(public.player_data) from public;


create or replace function public.bowls_sign_in(p_name text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
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
end $$;


create or replace function public.bowls_register(
  p_name    text,
  p_pin     text,
  p_display text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_key     text;
  v_row     public.player_data%rowtype;
  v_member  public.members%rowtype;
  v_display text;
  v_id      uuid;
  v_token   text;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_display := upper(trim(coalesce(nullif(trim(coalesce(p_display, '')), ''), p_name)));

  perform pg_advisory_xact_lock(hashtext('bowls_register:' || v_key || ':' || p_pin));

  select * into v_row
    from public.player_data
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  if found then
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

  v_id := gen_random_uuid();

  insert into public.player_data (id, player_name, display_name, name_key, pin_hash, entries, ties, profile, updated_at)
  values (v_id, v_id::text, v_display, v_key,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
          '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, now())
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
end $$;


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
    'account_name', public.bowls_account_name(v_row),
    'club_id',      v_sess.club_id,
    'member_id',    v_member.id,
    'member_name',  v_member.name);
end $$;
