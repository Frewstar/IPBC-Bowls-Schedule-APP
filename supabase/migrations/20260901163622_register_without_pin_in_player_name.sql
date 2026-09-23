-- ════════════════════════════════════════════════════════════════════════
--  REGISTER STOPS STORING THE PIN
--
--  bowls_register was the function registration was about to move onto. It
--  built NAME-PIN and stored it in player_data.player_name:
--
--      v_legacy := v_display || '-' || p_pin;
--      insert into public.player_data (player_name, ...) values (v_legacy, ...)
--
--  So every account created through the "safe" path re-created the exact
--  exposure this track is closing, one member at a time. Moving registration
--  onto it unchanged would have been worse than leaving registration where
--  it is.
--
--  The root cause is that player_data.player_name is both the identity and
--  the credential — it is the primary key AND the PIN. name_key, pin_hash
--  and display_name already carry everything the app needs, so player_name
--  only has to be unique and stable. From here it is the row's own uuid: not
--  derived from the name, not derived from the PIN, and not guessable.
--
--  This file changes NEW accounts only. The 92 existing rows still hold
--  NAME-PIN and are not touched — rewriting them has to happen after Step 3e
--  or the members/admins links break, and it is proposed separately rather
--  than improvised in here.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Reversible. To undo, restore bowls_register to the body in
--  20260619_baseline_pre_repo_schema.sql. The signature
--  (p_name text, p_pin text, p_display text default null) and both status
--  strings — created | existing | invalid — are unchanged here, so a caller
--  written against either version works with the other.
--
--  Rows created while this version was live keep a uuid player_name after
--  the revert. Nothing breaks: player_name is opaque to every reader of it,
--  and sign-in matches on name_key + pin_hash, never on player_name. The
--  only visible difference is the account list in the admin panel, which
--  shows player_name today and should show display_name instead — noted in
--  the README, and part of the admin-panel commit in Step 3.
-- ════════════════════════════════════════════════════════════════════════


-- ── bowls_register ────────────────────────────────────────────────────────
-- Unchanged: the name key, the 4-digit PIN check, the advisory lock, the
-- "you already have an account" pre-check, the lockout clear, and both
-- status strings.
--
-- Changed: player_name. It is now the row's own uuid.
--
-- Added: token and club_id, so registration signs the member in the same way
-- bowls_sign_in does. Step 3a moves sign-in and the confirm-new path
-- together, and confirm-new needs a token to have anything to store.
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

  -- Serialise concurrent registrations of the same name and PIN. This now
  -- carries more weight than it used to: the primary key was doing half the
  -- job before, because two people registering the same name with the same
  -- PIN collided on player_name and the second one was handed the first
  -- one's row. A uuid primary key cannot collide, so the lock plus the
  -- pre-check below is the only thing keeping that case to one account. It
  -- is held to the end of the transaction and released automatically.
  perform pg_advisory_xact_lock(hashtext('bowls_register:' || v_key || ':' || p_pin));

  -- Already registered under this name and PIN — hand back the existing
  -- account rather than making a second one. Same behaviour as before.
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

  -- The id is generated here rather than left to the column default, because
  -- player_name is the primary key and has to be the same value. That is the
  -- whole change: an opaque, stable identifier that says nothing about the
  -- member and cannot be turned back into a PIN.
  --
  -- club_id is left to the column default, which is this club. When a second
  -- club exists, registration will have to be told which one — that is the
  -- multi-club work, and it belongs with it rather than guessed at here.
  v_id := gen_random_uuid();

  insert into public.player_data (id, player_name, display_name, name_key, pin_hash, entries, ties, profile, updated_at)
  values (v_id, v_id::text, v_display, v_key,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
          '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, now())
  returning * into v_row;

  delete from public.login_lockouts where name = v_key;

  v_token := public.bowls_session_issue(v_row.id, v_row.club_id);

  return jsonb_build_object(
    'status',       'created',
    'id',           v_row.id,
    'cloud_key',    v_row.player_name,
    'display_name', v_row.display_name,
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

-- create or replace preserves the existing EXECUTE grants, so this is a
-- no-op against production and a correctness step against a fresh database.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_register(text, text, text) to %I', r);
    end if;
  end loop;
end $$;


-- ── player_data_backfill_keys is deliberately left alone ──────────────────
-- The trigger still accepts a NAME-PIN player_name and derives name_key and
-- pin_hash from it. That has to stay until nothing produces rows in that
-- shape: the client's own ensureAccountRow still does, on every sign-in,
-- until Step 3a takes it away.
--
-- bowls_register no longer relies on it — it supplies name_key and pin_hash
-- itself, so the derive-from-the-name branch is never reached from here.
-- Once Step 3a is deployed and ensureAccountRow is gone, the trigger can be
-- tightened to reject the old shape outright. That is a separate commit, and
-- it is the point at which a NAME-PIN row becomes impossible to create
-- rather than merely unused.
