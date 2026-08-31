-- ════════════════════════════════════════════════════════════════════════
--  ADMIN ROLE LAYERS
--  Run this once in the Supabase SQL editor (after 20260831_grant_admin.sql).
--
--  The panel is all-or-nothing because the only thing the client can ask
--  is bowls_is_admin, which answers yes or no. A boolean cannot express
--  layers, so every screen is gated on the same flag and a Social Convenor
--  who should only add events would get the members' phone numbers and the
--  PIN reset as well.
--
--  The ladder:
--    super_admin    everything, including granting admin
--    admin          everything except granting
--    draw_admin     draws only
--    events_admin   What's On only                          (new)
--
--  THE BUG THIS ALSO CLOSES
--  bowls_grant_admin already accepted 'draw_admin', and bowls_is_admin
--  answers only for ('admin','super_admin'). So a draw_admin could be
--  granted and then got nothing at all — no panel, no draws, no error.
--  The same silent no-op that grantAdmin had until yesterday, still live
--  in the role check. A role that can be granted must do something, or
--  must not be grantable; from here the check constraint and the new
--  function agree on one list, so the two cannot drift apart again.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. The role, not a yes/no ─────────────────────────────────────────────
-- A NEW function rather than a changed signature. bowls_is_admin keeps its
-- name, its boolean return and its ('admin','super_admin') meaning, so the
-- bundle already on people's phones carries on working while they pick up
-- the new one. Same client-first ordering as the rest of 002b. It can be
-- retired in a later pass, once nothing calls it.
--
-- The failure counting is carried over deliberately and must stay: without
-- it this is a name plus four digits in, a role out, with nothing to slow
-- an attempt down — an unthrottled PIN oracle, which is what the last
-- review caught on bowls_is_super_admin. This one is called by the client
-- on every sign-in so it cannot be closed off in the same way; counting
-- failures into login_lockouts is the mitigation, exactly as bowls_is_admin
-- does it.
create or replace function public.bowls_admin_role(p_name text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key  text;
  v_id   uuid;
  v_role text;
begin
  v_key := public.bowls_name_key(p_name);

  if v_key = '' or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return null;
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
    return null;
  end if;

  delete from public.login_lockouts where name = 'ADMIN:' || v_key;

  -- admins_player_id_uniq means at most one row per account, so no ordering
  -- or precedence is needed here — there is nothing to choose between.
  select a.role into v_role
    from public.admins a
   where a.player_id = v_id;

  -- Null for a member with no admins row, and null for a role outside the
  -- ladder. The check constraint below should make the second impossible;
  -- this is belt and braces, so an unknown role grants nothing rather than
  -- being passed to the client to interpret.
  if v_role not in ('super_admin', 'admin', 'draw_admin', 'events_admin') then
    return null;
  end if;

  return v_role;
end $$;


-- ── 2. Roles are a fixed list, not free text ──────────────────────────────
-- admins.role had no constraint, so a typo in a permission column granted
-- nothing and said nothing. Verified before adding: all five live rows are
-- 'super_admin' or 'admin', so this applies without touching anything.
alter table public.admins drop constraint if exists admins_role_known;
alter table public.admins add constraint admins_role_known
  check (role in ('super_admin', 'admin', 'draw_admin', 'events_admin'));


-- ── 3. Grant can hand out the new tier ────────────────────────────────────
-- Only the role list changes. Every guard from the previous migration stays
-- exactly as it was — the super-admin demotion refusal above all, which is
-- the one that could lock the club out of its own panel.
--
-- super_admin stays ungrantable: there is a separate claim flow, and a
-- super_admin who can mint super_admins is a one-way door.
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
  v_member          record;
  v_account_id      uuid;
  v_account_name    text;
  v_account_display text;
  v_candidates      int;
  v_names           text;
begin
  if coalesce(p_role, '') not in ('admin', 'draw_admin', 'events_admin') then
    return jsonb_build_object(
      'status',  'bad_role',
      'message', 'Pick one of Admin, Draw Admin or Events Admin.');
  end if;

  if not public.bowls_is_super_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_super_admin',
      'message', 'Only a super admin can grant admin rights.');
  end if;

  -- TODO(multi-club): single-club by assumption. The member is found on id
  -- alone, with no club_id predicate, so once a second club exists a super
  -- admin at one club could grant admin over another club's member by passing
  -- their id. The inserted row would also take club_id from the column
  -- default, which is hardcoded to Irvine Park, so it would land under the
  -- wrong club silently rather than erroring.
  -- Fix when club two is onboarded: resolve the caller's club from their own
  -- admins row, require members.club_id to match, and set club_id explicitly
  -- on the insert instead of relying on the default. Same change needed in
  -- bowls_approve_admin_request.
  select m.id, m.name, m.section, m.linked_player_id
    into v_member
    from public.members m
   where m.id::text = p_member_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_member',
      'message', 'That member is not on the roster.');
  end if;

  if v_member.linked_player_id is not null then
    select d.id, d.player_name, d.display_name
      into v_account_id, v_account_name, v_account_display
      from public.player_data d
     where d.id = v_member.linked_player_id;
  end if;

  if v_account_id is null then
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

  if exists (select 1 from public.admins
              where player_id = v_account_id and role = 'super_admin') then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', v_member.name || ' is the super admin. Their role can''t be changed here.');
  end if;

  delete from public.admins
   where player_id = v_account_id
      or cloud_key = v_account_name
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
    'message',   v_member.name || ' can now use the admin panel'
                 || case p_role
                      when 'draw_admin'   then ' for draws.'
                      when 'events_admin' then ' for What''s On.'
                      else '.' end,
    'cloud_key', v_account_name,
    'player_id', v_account_id,
    'role',      p_role);
end $$;


-- ── What this is and is not ───────────────────────────────────────────────
-- The role itself is now decided on the server, against player_data.pin_hash,
-- and cannot be talked into a different answer by the client. What the client
-- does with it — which sections of the panel to draw — is a client control
-- over a server-verified fact. That is better than the flag it replaces, and
-- it is still not a lock: club_events, members and admins all carry
-- ALL/public/using(true) policies, so anyone with the publishable key from
-- the bundle can read or write those tables directly whatever their role. The
-- policies are 002b's job and are deliberately untouched here.
