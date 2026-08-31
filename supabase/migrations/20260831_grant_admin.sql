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
  --
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

  -- 5. The super admin's role is not changeable here. Without this the
  --    delete-then-insert below strips their super_admin row and replaces it
  --    with a plain admin one — silently, reporting success, and with no way
  --    back: the claim flow only reopens on a DELETED row. bowls_revoke_admin
  --    has always refused this; grant has to as well.
  if exists (select 1 from public.admins
              where player_id = v_account_id and role = 'super_admin') then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', v_member.name || ' is the super admin. Their role can''t be changed here.');
  end if;

  -- 6. Resolved. Clear anything already standing for this person before
  --    writing, so a re-grant can't leave a second row behind: the inert
  --    'PENDING-' row from the old code, and any earlier row of their own.
  --    cloud_key is the table's primary key, so two rows for one person is
  --    otherwise perfectly possible — and one of them would outlive a revoke.
  -- v_account_name is the cloud_key about to be inserted, and admins_pkey is
  -- on cloud_key: a legacy row already holding that key with a null player_id
  -- would survive a delete keyed only on player_id, and the insert would then
  -- violate the primary key — an unhandled error instead of a message.
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
--
-- Keyed on player_id and not on cloud_key. cloud_key is NAME-PIN: passing it
-- meant the client had to read another admin's sign-in credential out of the
-- world-readable admins table and put it into a request payload — the exact
-- pattern being removed everywhere else in this migration.
-- admins_player_id_uniq (below) makes player_id a unique lookup, so nothing is
-- lost by keying on it.
--
-- A legacy row with a null player_id cannot be revoked through this, having no
-- id to key on. Such a row grants nothing anyway, and granting that member
-- again clears it — which is what the admin panel tells you to do.
drop function if exists public.bowls_revoke_admin(text, text, text);
create or replace function public.bowls_revoke_admin(
  p_admin_name text,
  p_admin_pin  text,
  p_player_id  uuid
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
   where a.player_id = p_player_id;

  if not found then
    -- Two different things reach here and this function cannot tell them
    -- apart, so the wording covers both rather than asserting the wrong one.
    --
    -- Distinguishing them was considered and rejected. The target's name is
    -- not among this function's arguments — p_admin_name is the CALLER — and
    -- the legacy rows are keyed 'PENDING-<NAME>', so finding one would mean
    -- matching on a name, which is the practice this whole migration exists
    -- to remove. Checking cloud_key against the account's own player_name
    -- would avoid that but catches only one of the two legacy shapes, which
    -- is worse than a message that is honest about the uncertainty.
    --
    -- It is also not reachable from the panel: the Revoke button is not
    -- rendered for a row with no player_id, and the client refuses before
    -- calling. This wording is for someone calling the function directly.
    return jsonb_build_object(
      'status',  'not_found',
      'message', 'That admin entry could not be found, or is an old-style entry '
                 || 'with no account attached. Granting them admin again will clear it.');
  end if;

  -- The club must not be able to lock itself out of its own admin panel.
  if v_target.role = 'super_admin' then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', 'A super admin can''t be revoked here.');
  end if;

  delete from public.admins
   where player_id = p_player_id
      or cloud_key = v_target.cloud_key;
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'status',  'revoked',
    'message', v_target.who || ' no longer has admin rights.',
    'removed', v_removed);
end $$;


-- ── bowls_is_super_admin is not callable with the anon key ────────────────
-- A new function is EXECUTE-able by PUBLIC by default, which would put this
-- one behind the publishable key in the bundle: a name and four digits in, a
-- boolean out, with no lockout, no failure counting and no delay, against the
-- single account that can hand out admin rights. admins is world-readable, so
-- the name to try is public too. That is a PIN oracle.
--
-- grant, revoke and approve are SECURITY DEFINER and call it internally as
-- their owner, so revoking it from the API roles breaks nothing legitimate —
-- the client has never called it directly and does not need to.
-- Written as a loop over the roles that actually exist. A plain
-- "revoke ... from anon, authenticated" raises if any one of them is missing,
-- and because this statement sits in the middle of the file that would abort
-- the migration here and leave it HALF APPLIED — the functions above created,
-- the admin_requests changes and the approve function below never run. Losing
-- the revoke would be bad; silently applying two thirds of a migration is
-- worse.
do $$
declare r text;
begin
  execute 'revoke execute on function public.bowls_is_super_admin(text, text) from public';
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.bowls_is_super_admin(text, text) from %I', r);
    end if;
  end loop;
end $$;

-- bowls_is_admin deliberately KEEPS its grant to anon. The client calls it on
-- every sign-in to decide whether to show the admin panel at all, so revoking
-- it would lock every admin out of their own panel. It is also the one with a
-- mitigation: a failed call writes to login_lockouts and counts attempts.
-- That asymmetry — the exposed one counting failures, the silent one not — is
-- why the new function is closed rather than the old one left to match it.


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


-- ════════════════════════════════════════════════════════════════════════
--  THE ADMIN REQUEST QUEUE
--
--  Approving a request had the same defect as granting: it wrote
--    cloud_key = 'APPROVED-' || <name>,  player_id = null
--  and produced the same inert row.
--
--  The table also carried the requester's cloud_key, which is their
--  NAME-PIN — their sign-in credential — in a table that is world-readable
--  AND world-writable. It holds zero rows, so this is the cheapest moment
--  there will ever be to change its shape: no backfill, nothing to
--  preserve, no migration risk.
-- ════════════════════════════════════════════════════════════════════════

-- The account being asked about, by id. Replaces cloud_key entirely.
alter table public.admin_requests add column if not exists player_id uuid
  references public.player_data(id) on delete cascade;

-- What the member is ASKING for, in their words. Named requested_role and not
-- role_title on purpose: members.position is the club's record of who holds
-- which committee post, and is what the Club tab reads. This column is a line
-- in a request, nothing more. Approving a request does NOT write to
-- members.position — a committee title is set on the roster, by hand, and
-- there is exactly one place it lives.
--
-- The Settings screen has always collected and written this field, under the
-- name role_title, and no column of either name has ever existed — so every
-- request insert has failed and the queue has never held a row.
alter table public.admin_requests add column if not exists requested_role text;

-- The client upserts, and there was no unique index for it to conflict
-- against — the second reason no request ever landed. One pending request per
-- person is also the behaviour you want.
--
-- Keyed on player_id and NOT on player_name. player_name arrives on an
-- unauthenticated insert, so conflicting on it would let anyone replace
-- anyone else's pending request by sending the same name: a denial of service
-- on the approval queue. player_id is the identity that matters, and the only
-- one a member can clobber for themselves.
create unique index if not exists admin_requests_player_id_uniq
  on public.admin_requests (player_id);

-- And the credential goes. Nothing reads it after this migration.
alter table public.admin_requests drop column if exists cloud_key;


-- ── Approve a request ─────────────────────────────────────────────────────
-- Parity with bowls_grant_admin: resolves to a real account, refuses in
-- words, writes nothing when it refuses, and checks the caller here.
--
-- There is deliberately no 'ambiguous' branch, unlike the grant. It cannot
-- arise: the request names an account by primary key, and
-- members_linked_player_id_uniq (already on the table) allows at most one
-- roster member per account. Two candidates is unreachable by construction
-- rather than merely absent from today's data — so there is nothing here to
-- cover, and a branch that can never run would be worse than none.
--
-- The names shown to the approver are read from the account and the roster,
-- never from admin_requests.player_name. That column is written by an
-- unauthenticated insert (see the note at the foot) and must not be able to
-- put one member's name against another member's account.
create or replace function public.bowls_approve_admin_request(
  p_admin_name text,
  p_admin_pin  text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_req             record;
  v_account_name    text;
  v_account_display text;
  v_member_name     text;
  v_role            text;
begin
  if not public.bowls_is_super_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_super_admin',
      'message', 'Only a super admin can approve an admin request.');
  end if;

  select r.id, r.player_name, r.player_id, r.requested_role
    into v_req
    from public.admin_requests r
   where r.id::text = p_request_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_request',
      'message', 'That request is no longer in the queue.');
  end if;

  if v_req.player_id is null then
    -- A request filed before this migration, by a client that had no
    -- player_id to give. Nothing to resolve; clear it and ask again.
    delete from public.admin_requests where id = v_req.id;
    return jsonb_build_object(
      'status',  'no_account',
      'message', coalesce(v_req.player_name, 'That request')
                 || ' was sent by an older version of the app and can''t be matched to an account. '
                 || 'It has been cleared — ask them to send it again.');
  end if;

  select d.player_name, d.display_name
    into v_account_name, v_account_display
    from public.player_data d
   where d.id = v_req.player_id;

  if v_account_name is null then
    delete from public.admin_requests where id = v_req.id;
    return jsonb_build_object(
      'status',  'no_account',
      'message', 'The account that sent that request no longer exists. The request has been cleared.');
  end if;

  -- TODO(multi-club): no club_id predicate here either — see the note on the
  -- member lookup in bowls_grant_admin above.
  select m.name into v_member_name
    from public.members m
   where m.linked_player_id = v_req.player_id;

  if v_member_name is null then
    return jsonb_build_object(
      'status',  'not_linked',
      'message', coalesce(v_account_display, v_account_name)
                 || ' has an app account but it isn''t linked to anyone on the roster, '
                 || 'so there is no way to say who they are. Link it on the roster first.');
  end if;

  -- Same guard as the grant: approving must not be able to demote the super
  -- admin by replacing their row with a plain one.
  if exists (select 1 from public.admins
              where player_id = v_req.player_id and role = 'super_admin') then
    return jsonb_build_object(
      'status',  'is_super_admin',
      'message', v_member_name || ' is the super admin. Their role can''t be changed here.');
  end if;

  -- The role they actually asked for. Selecting requested_role and then
  -- hardcoding 'admin' handed full Admin to someone who asked for Draw Admin,
  -- without telling the approver. Validated the same way the grant validates
  -- its argument; anything else, including null, means plain admin.
  if coalesce(v_req.requested_role, '') not in ('admin', 'draw_admin') then
    v_role := 'admin';
  else
    v_role := v_req.requested_role;
  end if;

  delete from public.admins
   where player_id = v_req.player_id
      or cloud_key = v_account_name
      or cloud_key = 'PENDING-' || upper(v_member_name)
      or cloud_key = 'APPROVED-' || upper(v_member_name);

  insert into public.admins (cloud_key, player_name, display_name, role, player_id)
  values (v_account_name, upper(v_member_name),
          coalesce(v_account_display, v_member_name), v_role, v_req.player_id);

  delete from public.admin_requests where id = v_req.id;

  return jsonb_build_object(
    'status',      'granted',
    'message',     v_member_name || ' can now use the admin panel'
                   || case when v_role = 'draw_admin' then ' as Draw Admin.' else '.' end,
    'member_name', v_member_name,
    'role',        v_role,
    'cloud_key',   v_account_name);
end $$;


-- ── Still to do, and not in this migration ────────────────────────────────
-- TODO(multi-club): bowls_grant_admin and bowls_approve_admin_request both
-- find a member without a club_id predicate, and both let the inserted admins
-- row take club_id from the column default, which is hardcoded to Irvine Park.
-- Dormant while one club exists; wrong the day a second one does. The full
-- note is on the member lookup in bowls_grant_admin.
--
-- admin_requests carries an `open` policy: ALL, public, using(true) with
-- check(true). Anyone with the publishable key can read the queue, add to it
-- or empty it, and the insert is entirely unauthenticated — nothing proves
-- the person filing a request is who the row says they are. That is why the
-- function above takes its names from the account and the roster and never
-- from admin_requests.player_name.
--
-- Tightening that policy is NOT done here on purpose. The deployed client
-- still writes to this table directly, so locking it needs the same
-- client-first ordering as the rest of 002b: ship a client that goes through
-- an RPC, wait for the phones to pick it up, then close the policy. Closing
-- it first would break the request button for everyone still on the old
-- bundle. It belongs with the RPC work, not with a check in the client.
