-- ════════════════════════════════════════════════════════════════════════
--  A LOCK LOCKS, WHICHEVER WAY IT WAS WRITTEN
--
--  login_lockouts.name holds two different things depending on who wrote it:
--
--    bowls_sign_in   writes a name_key  — "JFREW"
--    the admin panel writes a raw name  — "J FREW"   (App.jsx lockAppAccount)
--
--  and bowls_sign_in looks the row up with `where name = v_key`, which only
--  ever matches the first kind.
--
--  That works today by accident: the client does its own lockout check with
--  `.eq("name", nameUpper)`, raw, so it matches the admin's raw row. Step 3a
--  moves sign-in onto bowls_sign_in — and an account an admin had locked
--  would have quietly started signing in again. The lock would still be
--  sitting in the table, still showing as locked in the admin panel, doing
--  nothing.
--
--  Found by the test for the lock-ends-sessions trigger: the sessions were
--  ended correctly and the account signed straight back in.
--
--  Both readers now match on the squashed form of whatever is stored.
--  bowls_name_key is idempotent, so a row already holding a name_key
--  squashes to itself and keeps matching.
--
--  Writes are unchanged and still store a name_key, so the admin panel is
--  the only remaining source of raw names — that write moves with the rest
--  of the admin panel. This makes the reader tolerant of what is already in
--  the table, which it has to be regardless of when the writer is fixed.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Restore bowls_sign_in from 20260901181006_sessions_can_be_ended.sql's predecessor
--  (20260901163342_bowls_sessions.sql) and bowls_request_unlock from
--  20260901163739_request_unlock.sql. Reverting reinstates the mismatch, so
--  only revert alongside a client that does its own raw-name lockout check.
-- ════════════════════════════════════════════════════════════════════════


-- ── bowls_sign_in ─────────────────────────────────────────────────────────
-- Two changes, both in the lockout handling. Everything else — the five
-- status strings, every field of the ok payload, the 5-attempt counter — is
-- exactly as it was.
--
--   * the lookup matches on bowls_name_key(name) rather than name
--   * it takes the strongest lock if more than one row matches, rather than
--     erring. A raw row and a keyed row for the same account can both exist
--     already; picking the one that locks for longest is the safe reading,
--     and the alternative is a sign-in that throws
--
-- The clear-on-success delete widens the same way, so signing in
-- successfully cleans up both shapes rather than leaving a stale raw row
-- behind to lock the member out again on their next wrong PIN.
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


-- ── bowls_request_unlock ──────────────────────────────────────────────────
-- Same mismatch, same fix. A member locked by an admin — a raw-name row —
-- could not have asked to be let back in, because the button's function
-- could not find their row either.
create or replace function public.bowls_request_unlock(p_name text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_key text;
begin
  v_key := public.bowls_name_key(p_name);
  if v_key = '' then
    return;
  end if;

  update public.login_lockouts
     set unlock_requested = true,
         updated_at       = now()
   where public.bowls_name_key(name) = v_key
     and locked_until is not null
     and locked_until > now()
     and unlock_requested is distinct from true;
end $$;
