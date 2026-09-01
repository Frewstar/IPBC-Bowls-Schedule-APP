-- ════════════════════════════════════════════════════════════════════════
--  TRACK 2 — VERIFICATION
--
--  Paste into the Supabase SQL editor and run the whole file. It ends in
--  ROLLBACK, so it leaves nothing behind: the probe account it registers,
--  the lockout rows it trips and the sessions it mints all disappear. Safe
--  to run against production, and safe to run repeatedly.
--
--  Every check raises an exception on failure. A clean run means every
--  assertion below actually passed; there is no way for this file to report
--  success by doing nothing, because each block asserts a positive fact and
--  several of them assert a control alongside the thing being tested (a
--  "rejected" result is only meaningful next to an "accepted" one).
--
--  Check 8 is the one that changes meaning across the change. It detects
--  which side of the Step 4 revoke the database is on and asserts the
--  matching consequence, so the same file is a real test before and after.
--
--  Covers: Step 2 (sessions) and the bowls_register fix.
--  Does NOT cover: the HTTP layer. These run as a database role, which
--  exercises grants and RLS — the two things Step 4 changes — but not
--  PostgREST. For that, run test/anon-pin-dump.mjs from a machine with
--  network access to the project.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Nobody is locked out by any of this ────────────────────────────────
-- The premise of the whole track: every stored hash verifies against the PIN
-- in its own player_name. If that stops being true, sign-in has started
-- rejecting real members and everything downstream must stop.
do $$
declare v_total int; v_ok int;
begin
  select count(*), count(*) filter (where pin_hash = extensions.crypt(right(player_name, 4), pin_hash))
    into v_total, v_ok
    from public.player_data
   where player_name ~ '-[0-9]{4}$';

  if v_total = 0 then
    raise exception 'check 1: no legacy-shaped accounts found at all — this check just went vacuous, fix it';
  end if;
  if v_ok <> v_total then
    raise exception 'check 1 FAILED: % of % accounts no longer verify against their stored PIN', v_total - v_ok, v_total;
  end if;
  raise notice 'check 1 ok — %/% accounts verify', v_ok, v_total;
end $$;


-- ── 2. Sign-in returns the account, unchanged, plus a token ───────────────
do $$
declare
  v_row public.player_data%rowtype;
  v_res jsonb;
begin
  select * into v_row from public.player_data where player_name ~ '-[0-9]{4}$' order by updated_at desc nulls last limit 1;

  v_res := public.bowls_sign_in(regexp_replace(v_row.player_name, '-[0-9]{4}$', ''), right(v_row.player_name, 4));

  if v_res->>'status' <> 'ok'                        then raise exception 'check 2 FAILED: status %', v_res->>'status'; end if;
  if (v_res->>'id')::uuid <> v_row.id                then raise exception 'check 2 FAILED: id does not match the row'; end if;
  if v_res->>'cloud_key'    <> v_row.player_name     then raise exception 'check 2 FAILED: cloud_key changed'; end if;
  if v_res->>'display_name' is distinct from v_row.display_name then raise exception 'check 2 FAILED: display_name changed'; end if;
  if v_res->'entries'       <> v_row.entries         then raise exception 'check 2 FAILED: entries changed'; end if;
  if v_res->'ties'          <> v_row.ties            then raise exception 'check 2 FAILED: ties changed'; end if;
  if v_res->'profile'       <> v_row.profile         then raise exception 'check 2 FAILED: profile changed'; end if;
  if (v_res->>'club_id')::uuid <> v_row.club_id      then raise exception 'check 2 FAILED: club_id wrong'; end if;
  if length(v_res->>'token') < 43                    then raise exception 'check 2 FAILED: token is % chars, expected >= 43 (32 bytes base64url)', length(v_res->>'token'); end if;
  if not (v_res ? 'member_id')                       then raise exception 'check 2 FAILED: member_id missing from the payload'; end if;

  raise notice 'check 2 ok — every pre-existing field survived, token issued';
end $$;


-- ── 3. A token resolves; a bad one does not ───────────────────────────────
-- The control matters: without the live-token line, four zeroes would also
-- be what a function that always returns nothing produces.
do $$
declare
  v_row   public.player_data%rowtype;
  v_token text;
  v_live  int; v_bogus int; v_empty int; v_null int; v_expired int;
begin
  select * into v_row from public.player_data where player_name ~ '-[0-9]{4}$' order by updated_at desc nulls last limit 1;
  v_token := public.bowls_sign_in(regexp_replace(v_row.player_name, '-[0-9]{4}$', ''), right(v_row.player_name, 4))->>'token';

  insert into public.bowls_sessions (token_hash, player_id, club_id, expires_at)
  values (encode(extensions.digest('EXPIRED-PROBE','sha256'),'hex'), v_row.id, v_row.club_id, now() - interval '1 day');

  select count(*) into v_live    from public.bowls_session_player(v_token);
  select count(*) into v_bogus   from public.bowls_session_player('not-a-real-token');
  select count(*) into v_empty   from public.bowls_session_player('');
  select count(*) into v_null    from public.bowls_session_player(null);
  select count(*) into v_expired from public.bowls_session_player('EXPIRED-PROBE');

  if v_live <> 1 then raise exception 'check 3 FAILED: a live token resolved to % rows, expected 1', v_live; end if;
  if v_bogus   <> 0 then raise exception 'check 3 FAILED: a made-up token resolved'; end if;
  if v_empty   <> 0 then raise exception 'check 3 FAILED: an empty token resolved'; end if;
  if v_null    <> 0 then raise exception 'check 3 FAILED: a null token resolved'; end if;
  if v_expired <> 0 then raise exception 'check 3 FAILED: an EXPIRED token resolved'; end if;

  -- and the sliding refresh must not have revived the expired one on its way past
  if exists (select 1 from public.bowls_sessions
              where token_hash = encode(extensions.digest('EXPIRED-PROBE','sha256'),'hex')
                and expires_at > now()) then
    raise exception 'check 3 FAILED: resolving an expired token extended it';
  end if;

  -- the token must resolve to the right player, not merely to some player
  if (select player_id from public.bowls_session_player(v_token)) <> v_row.id then
    raise exception 'check 3 FAILED: token resolved to the wrong account';
  end if;

  raise notice 'check 3 ok — live token resolves, bogus/empty/null/expired do not';
end $$;


-- ── 4. anon cannot mint or read a session ─────────────────────────────────
-- Asserts the specific SQLSTATE, not the absence of a result.
do $$
declare v_state text;
begin
  begin
    set local role anon;
    perform count(*) from public.bowls_sessions;
    reset role;
    raise exception 'check 4 FAILED: anon can SELECT bowls_sessions';
  exception when insufficient_privilege then
    get stacked diagnostics v_state = returned_sqlstate;
    reset role;
    if v_state <> '42501' then raise exception 'check 4 FAILED: unexpected sqlstate %', v_state; end if;
  end;

  begin
    set local role anon;
    perform public.bowls_session_issue((select id from public.player_data limit 1), (select id from public.clubs limit 1));
    reset role;
    raise exception 'check 4 FAILED: anon can mint a session for any player_id';
  exception when insufficient_privilege then
    reset role;
  end;

  begin
    set local role anon;
    perform count(*) from public.bowls_session_player('anything');
    reset role;
    raise exception 'check 4 FAILED: anon can call bowls_session_player';
  exception when insufficient_privilege then
    reset role;
  end;

  -- Control: anon CAN still reach the front door, so the three denials above
  -- are about those functions and not about anon being broken generally.
  set local role anon;
  if public.bowls_sign_in('NO SUCH PERSON', '0000')->>'status' <> 'not_found' then
    reset role;
    raise exception 'check 4 FAILED: anon can no longer call bowls_sign_in';
  end if;
  reset role;

  raise notice 'check 4 ok — 42501 on the session internals, sign-in still open';
end $$;


-- ── 5. Registration no longer stores the PIN ──────────────────────────────
do $$
declare v1 jsonb; v2 jsonb; v3 jsonb; v_si jsonb; v_rows int;
begin
  if exists (select 1 from public.player_data where name_key = public.bowls_name_key('ZZ TRACK2 PROBE')) then
    raise exception 'check 5: the probe name is already taken — pick another before trusting this result';
  end if;

  v1 := public.bowls_register('ZZ TRACK2 PROBE', '4271');
  if v1->>'status' <> 'created'                     then raise exception 'check 5 FAILED: status %', v1->>'status'; end if;
  if (v1->>'cloud_key') ~ '-[0-9]{4}$'              then raise exception 'check 5 FAILED: player_name is still NAME-PIN shaped'; end if;
  if (v1->>'cloud_key') like '%4271%'               then raise exception 'check 5 FAILED: the PIN is in player_name'; end if;
  if (v1->>'cloud_key') <> (v1->>'id')              then raise exception 'check 5 FAILED: player_name is not the row uuid'; end if;
  if length(v1->>'token') < 43                      then raise exception 'check 5 FAILED: registration issued no token'; end if;

  -- same name, same PIN, twice: one account, not two
  v2 := public.bowls_register('ZZ TRACK2 PROBE', '4271');
  if v2->>'status' <> 'existing'                    then raise exception 'check 5 FAILED: second register said %', v2->>'status'; end if;
  if (v2->>'id') <> (v1->>'id')                     then raise exception 'check 5 FAILED: second register made a different account'; end if;

  select count(*) into v_rows from public.player_data where name_key = public.bowls_name_key('ZZ TRACK2 PROBE');
  if v_rows <> 1 then raise exception 'check 5 FAILED: % rows for one probe account', v_rows; end if;

  v3 := public.bowls_register('ZZ TRACK2 PROBE', 'abcd');
  if v3->>'status' <> 'invalid'                     then raise exception 'check 5 FAILED: a non-numeric PIN was accepted'; end if;

  -- punctuation differs on purpose: bowls_name_key must squash it the same
  -- way the client's normName does, or members get locked out at Step 3a
  v_si := public.bowls_sign_in('ZZ.TRACK2  PROBE', '4271');
  if v_si->>'status' <> 'ok'                        then raise exception 'check 5 FAILED: sign-in after register said %', v_si->>'status'; end if;
  if (v_si->>'id') <> (v1->>'id')                   then raise exception 'check 5 FAILED: sign-in found a different account'; end if;

  raise notice 'check 5 ok — new accounts carry no PIN in player_name and still sign in';
end $$;


-- ── 6. Five wrong PINs lock the account ───────────────────────────────────
do $$
declare v_res jsonb; v_locked boolean;
begin
  perform public.bowls_sign_in('ZZ TRACK2 PROBE','9999');
  perform public.bowls_sign_in('ZZ TRACK2 PROBE','9999');
  perform public.bowls_sign_in('ZZ TRACK2 PROBE','9999');
  perform public.bowls_sign_in('ZZ TRACK2 PROBE','9999');
  v_res := public.bowls_sign_in('ZZ TRACK2 PROBE','9999');

  if v_res->>'remaining' <> '0' then raise exception 'check 6 FAILED: 5 wrong PINs left % remaining', v_res->>'remaining'; end if;

  select locked_until > now() into v_locked from public.login_lockouts where name = public.bowls_name_key('ZZ TRACK2 PROBE');
  if not coalesce(v_locked, false) then raise exception 'check 6 FAILED: account not locked after 5 wrong PINs'; end if;

  -- and the lock is real: the CORRECT PIN is refused while it holds
  if public.bowls_sign_in('ZZ TRACK2 PROBE','4271')->>'status' <> 'locked' then
    raise exception 'check 6 FAILED: the lock does not actually stop a sign-in';
  end if;

  raise notice 'check 6 ok — locked at 5, and the lock refuses the correct PIN';
end $$;


-- ── 7. bowls_request_unlock ───────────────────────────────────────────────
do $$
declare v_before jsonb; v_after jsonb;
begin
  select to_jsonb(l) into v_before from public.login_lockouts l where name = public.bowls_name_key('ZZ TRACK2 PROBE');

  -- punctuation differs again: it must reach the same row without the id
  perform public.bowls_request_unlock('ZZ.TRACK2 PROBE');

  select to_jsonb(l) into v_after from public.login_lockouts l where name = public.bowls_name_key('ZZ TRACK2 PROBE');

  if (v_after->>'unlock_requested')::boolean is not true then raise exception 'check 7 FAILED: flag not set'; end if;
  if v_after->>'attempts'     <> v_before->>'attempts'     then raise exception 'check 7 FAILED: it changed attempts'; end if;
  if v_after->>'locked_until' <> v_before->>'locked_until' then raise exception 'check 7 FAILED: it changed locked_until'; end if;

  -- an unknown name must not create a row, and must not raise
  perform public.bowls_request_unlock('NOBODY BY THIS NAME AT ALL');
  if exists (select 1 from public.login_lockouts where name = public.bowls_name_key('NOBODY BY THIS NAME AT ALL')) then
    raise exception 'check 7 FAILED: it created a lockout row for a name with no account';
  end if;

  raise notice 'check 7 ok — flag set without the row id or the PIN, nothing else touched';
end $$;


-- ── 8. THE ATTACK: delete the lockout row mid-way ─────────────────────────
-- The 5-attempt limit is only a control if the attacker cannot remove the
-- row that counts. Today anon can, which is why 10,000 requests walks a
-- 4-digit PIN regardless of the limit.
--
-- This block works out which side of the Step 4 revoke it is running on and
-- asserts the matching consequence, so it stays a real test either way:
--
--   before the revoke : the delete SUCCEEDS, and the account must come
--                       unlocked as a result — proving the hole is open
--   after  the revoke : the delete raises 42501, and the account must STILL
--                       be locked — proving it is closed
do $$
declare v_deleted boolean := false; v_status text;
begin
  begin
    set local role anon;
    delete from public.login_lockouts where name = public.bowls_name_key('ZZ TRACK2 PROBE');
    v_deleted := true;
    reset role;
  exception when insufficient_privilege then
    reset role;
    v_deleted := false;
  end;

  v_status := public.bowls_sign_in('ZZ TRACK2 PROBE','9999')->>'status';

  if v_deleted then
    if v_status = 'locked' then
      raise exception 'check 8 FAILED: anon deleted the lockout row but the account stayed locked — this check is not measuring what it claims';
    end if;
    raise warning 'check 8 — PRE-REVOKE: anon deleted the lockout row and the lock was bypassed (status %). This is the hole. Expected until Step 4.', v_status;
  else
    if v_status <> 'locked' then
      raise exception 'check 8 FAILED: anon could not delete the row, yet the account is not locked (status %)', v_status;
    end if;
    raise notice 'check 8 ok — POST-REVOKE: anon cannot delete the lockout row and the lock holds';
  end if;
end $$;


-- ── 9. Where a live credential is still readable ──────────────────────────
-- Scans every text column of every base table in public for a value that
-- verifies as a real PIN against player_data.pin_hash — not merely one that
-- looks like NAME-PIN. Asserts the exact set of columns, so a NEW place
-- storing a credential fails the check rather than passing unnoticed.
do $$
declare
  v_found text;
  v_expected text := 'admins.cloud_key, admins_backup_20260830.cloud_key, live_games.creator_cloudkey, member_claim_requests.current_linked_cloudkey, member_claim_requests.requester_cloudkey, members.linked_cloudkey, members_backup_20260829.linked_cloudkey, player_data.player_name, player_data_backup_20260829.player_name, player_data_deleted_20260830.player_name';
begin
  select string_agg(t || '.' || c, ', ' order by t, c) into v_found
  from (
    select c.table_name as t, c.column_name as c,
      (xpath('/row/c/text()', query_to_xml(format(
        'select count(*) as c from public.%I t where t.%I ~ ''-[0-9]{4}$'' and exists (select 1 from public.player_data p where p.name_key = public.bowls_name_key(regexp_replace(t.%I, ''-[0-9]{4}$'', '''')) and p.pin_hash = extensions.crypt(right(t.%I,4), p.pin_hash))',
        c.table_name, c.column_name, c.column_name, c.column_name), false, true, '')))[1]::text::int as n
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type in ('text','character varying','character')
  ) s
  where s.n > 0;

  if v_found is distinct from v_expected then
    raise exception 'check 9: the set of columns holding live credentials has CHANGED. expected [%] but found [%]',
      v_expected, coalesce(v_found, '(none)');
  end if;

  raise notice 'check 9 ok — credentials confined to the ten known columns; Steps 3e and 4 remove them';
end $$;


-- ── 10. Reset-PIN refuses an account it would otherwise mangle ────────────
-- bowls_admin_reset_pin rebuilds player_name from the new PIN with
-- `-[^-]*$`, which is right for NAME-PIN and wrong for a uuid: it would
-- strip the last hyphen group and write back <uuid-prefix>-<new PIN>,
-- putting the PIN back into player_name. The guard must refuse instead.
--
-- The control is the point of this block. Refusing everything would also
-- satisfy the first half, so a legacy account must still reset normally.
do $$
declare
  v_admin_name text; v_admin_pin text;
  v_probe jsonb; v_member_id text; v_legacy_member_id text;
  v_res_uuid jsonb; v_res_legacy jsonb;
begin
  select regexp_replace(p.player_name, '-[0-9]{4}$', ''), right(p.player_name, 4)
    into v_admin_name, v_admin_pin
    from public.admins a join public.player_data p on p.id = a.player_id
   where p.player_name ~ '-[0-9]{4}$' limit 1;
  if v_admin_name is null then
    raise exception 'check 10: no admin with a legacy key — this check cannot run, do not read it as a pass';
  end if;

  v_probe := public.bowls_register('ZZ RESET PROBE', '4271');
  select id into v_member_id from public.members where linked_player_id is null and linked_cloudkey is null limit 1;
  update public.members set linked_player_id = (v_probe->>'id')::uuid where id = v_member_id;

  v_res_uuid := public.bowls_admin_reset_pin(v_admin_name, v_admin_pin, v_member_id, '8888');
  if v_res_uuid->>'status' <> 'bad_account' then
    raise exception 'check 10 FAILED: reset on a uuid-named account returned %, player_name is now %',
      v_res_uuid->>'status', (select player_name from public.player_data where id = (v_probe->>'id')::uuid);
  end if;
  if (select player_name from public.player_data where id = (v_probe->>'id')::uuid) <> (v_probe->>'id') then
    raise exception 'check 10 FAILED: it refused but modified player_name anyway';
  end if;

  select m.id into v_legacy_member_id
    from public.members m join public.player_data p on p.id = m.linked_player_id
   where p.player_name ~ '-[0-9]{4}$' limit 1;
  v_res_legacy := public.bowls_admin_reset_pin(v_admin_name, v_admin_pin, v_legacy_member_id, '8888');
  if v_res_legacy->>'status' <> 'ok' then
    raise exception 'check 10 FAILED (control): a legacy account no longer resets: %', v_res_legacy->>'status';
  end if;
  if (v_res_legacy->>'new_key') !~ '-8888$' then
    raise exception 'check 10 FAILED (control): legacy new_key has the wrong shape';
  end if;

  raise notice 'check 10 ok — uuid account refused untouched, legacy account still resets';
end $$;



rollback;

-- Everything above is undone. If you want to keep a change, this is not the
-- file to make it in.
