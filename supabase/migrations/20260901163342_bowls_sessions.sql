-- ════════════════════════════════════════════════════════════════════════
--  SESSIONS  —  sign-in issues a token; the token is the identity
--
--  The app has no Supabase auth session. auth.uid() is null on every
--  request, so RLS cannot express "this row is yours" — there is nothing in
--  the request to compare a row against. That is why using(true) is on every
--  table: it was the only thing that worked, not a decision anybody made.
--
--  This is the missing identity. bowls_sign_in mints an opaque token, the
--  client sends it back, and SECURITY DEFINER functions resolve it to a
--  player and authorise for themselves. Once the client is on that path,
--  anon does not need table access at all and Step 4 can take it away.
--
--  Nothing in this file changes what the app can do today. The table is
--  unreachable from the publishable key, the new functions are additive, and
--  bowls_sign_in keeps every field and every status string it already
--  returned — it only gains four. The client is moved in Step 3.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Reversible in full. To undo:
--
--    drop function if exists public.bowls_sign_out(text);
--    drop function if exists public.bowls_session_player(text);
--    drop function if exists public.bowls_session_issue(uuid, uuid);
--    drop table    if exists public.bowls_sessions;
--    -- then restore bowls_sign_in to the body in
--    -- 20260619_baseline_pre_repo_schema.sql, which is the version this
--    -- file replaces. Its signature (p_name text, p_pin text) and all five
--    -- of its status strings are unchanged here, so any caller written
--    -- against either version keeps working across the revert.
--
--  Dropping the table signs everybody out — their next request finds no
--  session. It does not touch player_data, so nobody loses an account or
--  their data, and the pre-Step-3 client does not read the token at all.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. The table ──────────────────────────────────────────────────────────
-- What is stored is the SHA-256 of the token, never the token. The token is
-- returned to the client once, at sign-in, and cannot be recovered from this
-- table afterwards.
--
-- That is a deliberate deviation from the plan, which said to store the
-- token. The reason is the bug this whole track exists to fix: player_data
-- was also a table nobody was supposed to be able to read. A hash means the
-- day this table is accidentally exposed — a permissive policy added while
-- debugging, RLS switched off, a backup with the wrong grants — the rows are
-- worthless rather than a set of live logins. It costs one digest() call per
-- sign-in and one per resolve. If you would rather have the raw token, say
-- so and it is a two-line change; nothing else in the file depends on it.
create table if not exists public.bowls_sessions (
  id           uuid        primary key default gen_random_uuid(),
  token_hash   text        not null unique,          -- sha256(token), hex
  player_id    uuid        not null references public.player_data(id) on delete cascade,
  club_id      uuid        not null references public.clubs(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists bowls_sessions_player_idx  on public.bowls_sessions (player_id);
create index if not exists bowls_sessions_expires_idx on public.bowls_sessions (expires_at);

alter table public.bowls_sessions enable row level security;

-- No policies, deliberately. RLS with zero policies is zero rows for anyone
-- who is not the owner, which is the same shape the *_backup_* tables and
-- poster_tickets already use. The SECURITY DEFINER functions below run as
-- the owner and are unaffected.

-- Supabase hands anon and authenticated table privileges across the public
-- schema by default, so without this they would hold SELECT and DELETE on
-- the session table the moment it is created. RLS already reduces that to
-- zero rows — but the grant is what comes back to life the day somebody adds
-- a policy, and revoking it keeps the table off the PostgREST surface
-- altogether rather than publishing an endpoint that answers with [].
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.bowls_sessions from %I', r);
    end if;
  end loop;
end $$;


-- ── 2. Issuing a token ────────────────────────────────────────────────────
-- Internal. It takes a player_id, which is exactly the thing no caller is
-- ever allowed to choose, so EXECUTE is revoked from everybody below. Only
-- bowls_sign_in and bowls_register — which resolve the account from a PIN
-- first — are allowed to reach it.
create or replace function public.bowls_session_issue(
  p_player_id uuid,
  p_club_id   uuid
) returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token text;
begin
  -- 32 bytes from the CSPRNG, base64url so it survives a JSON round trip and
  -- a URL without escaping. 256 bits: not guessable, and not derived from
  -- anything about the account, so a token tells an attacker who holds it
  -- nothing about whose it is.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  -- Opportunistic housekeeping, the same way poster_tickets does it. A
  -- session table that is never swept grows one row per sign-in forever.
  delete from public.bowls_sessions where expires_at < now() - interval '30 days';

  insert into public.bowls_sessions (token_hash, player_id, club_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'),
          p_player_id,
          p_club_id,
          now() + interval '90 days');

  return v_token;
end $$;


-- ── 3. Resolving a token ──────────────────────────────────────────────────
-- The one place a token becomes an identity. Every RPC added from here on
-- calls this and takes player_id and club_id from what it returns — never
-- from its own arguments. That is the whole point: club_id in particular has
-- to come from the session, because the multi-club work cannot let a caller
-- name the club it is writing to.
--
-- Returns no rows for a token that is unknown, expired, or null. Callers
-- must treat "no rows" as "not signed in" and fail closed.
--
-- 90 days, and the expiry slides on every use. Members leave this installed
-- as a PWA and open it once a fortnight in winter; an absolute expiry would
-- sign the club out en masse on a date nobody chose. Idle for 90 days and
-- they sign in again, which is the same thing that happens today when iOS
-- evicts their localStorage.
create or replace function public.bowls_session_player(p_token text)
returns table (
  player_id    uuid,
  club_id      uuid,
  name_key     text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_hash text;
  v_sess public.bowls_sessions%rowtype;
begin
  if coalesce(p_token, '') = '' then
    return;
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  update public.bowls_sessions s
     set last_seen_at = now(),
         expires_at   = now() + interval '90 days'
   where s.token_hash = v_hash
     and s.expires_at > now()
  returning * into v_sess;

  if not found then
    return;
  end if;

  return query
    select v_sess.player_id, v_sess.club_id, p.name_key, p.display_name
      from public.player_data p
     where p.id = v_sess.player_id;
end $$;


-- ── 4. Signing out ────────────────────────────────────────────────────────
-- The counterpart to issuing. Without it, "switch account" leaves a valid
-- token behind on a device that has been handed to somebody else. Silent and
-- idempotent: it never says whether the token was real, because an endpoint
-- that distinguishes a live token from a dead one is an oracle for guessing
-- them.
create or replace function public.bowls_sign_out(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if coalesce(p_token, '') = '' then
    return;
  end if;
  delete from public.bowls_sessions
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
end $$;


-- ── 5. bowls_sign_in gains a token ────────────────────────────────────────
-- Everything that was in the 'ok' payload is still in it, spelled the same
-- way, and all five status strings — ok | invalid | locked | not_found |
-- wrong_pin — are unchanged. A client written against the old version keeps
-- working against this one.
--
-- Four fields are added:
--
--   token        the session token. The client stores it where it stores the
--                sign-in state today.
--   club_id      from the account's own row. The seam the multi-club work
--                needs: derived here, never accepted from the caller.
--   member_id    the roster entry linked to this account, or null.
--   member_name  its name, or null.
--
-- member_id/member_name are resolved through members.linked_player_id — the
-- uuid, not linked_cloudkey. linked_player_id is populated on all 69 linked
-- rows and disagrees with linked_cloudkey on none of them, so this is the
-- same answer by a route that does not go near a PIN. It is also what lets
-- commitSignIn drop its own members lookup in Step 3a.
--
-- The lockout counter stays at 5 attempts / 24h, as it already was. The
-- client's own limit of 3 goes away with the client code that enforced it;
-- it was never a control anyway, since anyone could delete the lockout row.
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

  select * into v_lock from public.login_lockouts where name = v_key;
  if found and v_lock.locked_until is not null and v_lock.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_lock.locked_until);
  end if;

  select * into v_row
    from public.player_data
   where name_key = v_key
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  if found then
    delete from public.login_lockouts where name = v_key;

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


-- ── 6. Who may call what ──────────────────────────────────────────────────
-- bowls_sign_in stays open to anon: it is the front door, and it takes a PIN.
-- bowls_sign_out stays open: you need a token to use it and it tells you
-- nothing.
--
-- bowls_session_issue and bowls_session_player are closed to everybody.
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so leaving
-- this out would publish an endpoint that mints a session for any player_id
-- you care to name — a worse hole than the one being closed. The two
-- SECURITY DEFINER callers above reach them as the owner and are unaffected.
--
-- Each revoke is guarded on the role existing. "revoke ... from anon,
-- authenticated" raises if either is missing, and a migration that half-
-- applies is worse than one that does not apply at all.
revoke all on function public.bowls_session_issue(uuid, uuid) from public;
revoke all on function public.bowls_session_player(text)      from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.bowls_session_issue(uuid, uuid) from %I', r);
      execute format('revoke all on function public.bowls_session_player(text) from %I', r);
      execute format('grant execute on function public.bowls_sign_out(text) to %I', r);
      execute format('grant execute on function public.bowls_sign_in(text, text) to %I', r);
    end if;
  end loop;
end $$;


-- ── What this is and is not ───────────────────────────────────────────────
-- IS: an identity the server can check. A token names a player and a club,
-- and only the server can turn it into either.
--
-- IS NOT: a lock on anything, yet. Every table in this schema is still
-- ALL/public/using(true) with full anon grants — player_data included, PINs
-- included. Nothing is closed until the client is off direct table access
-- (Step 3) and the grants come away (Step 4). This file is the thing that
-- makes those possible; on its own it changes no permission at all.
