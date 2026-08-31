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

  -- 5. Resolved. Clear anything already standing for this person before
  --    writing, so a re-grant can't leave a second row behind: the inert
  --    'PENDING-' row from the old code, and any earlier row of their own.
  --    cloud_key is the table's primary key, so two rows for one person is
  --    otherwise perfectly possible — and one of them would outlive a revoke.
  delete from public.admins
   where player_id = v_account_id
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
create or replace function public.bowls_revoke_admin(
  p_admin_name text,
  p_admin_pin  text,
  p_cloud_key  text
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
   where a.cloud_key = p_cloud_key;

  if not found then
    return jsonb_build_object(
      'status',  'not_found',
      'message', 'That admin is no longer listed.');
  end if;

  -- The club must not be able to lock itself out of its own admin panel.
  if v_target.role = 'super_admin' then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', 'A super admin can''t be revoked here.');
  end if;

  delete from public.admins
   where cloud_key = p_cloud_key
      or (v_target.player_id is not null and player_id = v_target.player_id);
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'status',  'revoked',
    'message', v_target.who || ' no longer has admin rights.',
    'removed', v_removed);
end $$;


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
