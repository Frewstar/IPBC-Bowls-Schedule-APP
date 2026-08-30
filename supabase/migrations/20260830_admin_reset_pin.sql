-- ════════════════════════════════════════════════════════════════════════
--  ADMIN PIN RESET
--  Run this once in the Supabase SQL editor (after migration 001).
--
--  A member who forgets their PIN currently has no way back in. This adds a
--  single SECURITY DEFINER function so an admin can set a new one without the
--  PIN ever passing through the client's hands, and without anyone reading the
--  old one out of the table.
--
--  The PIN lives in two places and they must move together:
--    player_data.player_name  — "NAME-PIN" in clear, the sign-in key
--    player_data.pin_hash     — bcrypt, added by 001
--  Updating one without the other locks the member out of their own account.
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
-- Explicit search_path: a SECURITY DEFINER function must not resolve names
-- through the caller's. extensions is where Supabase keeps pgcrypto (crypt,
-- gen_salt).
set search_path = public, extensions
as $$
declare
  v_member    record;
  v_account   record;
  v_name_part text;
  v_new_key   text;
begin
  -- ── 1. the new PIN has to be a PIN ──────────────────────────────────────
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'status',  'bad_pin',
      'message', 'A PIN must be exactly 4 digits.');
  end if;

  -- ── 2. the caller proves who they are, on every reset ───────────────────
  -- Deliberately not a trusted flag from the client: the admin re-enters
  -- their own PIN and it is checked here.
  if coalesce(p_admin_name, '') = ''
     or coalesce(p_admin_pin, '') = ''
     or not public.bowls_is_admin(p_admin_name, p_admin_pin) then
    return jsonb_build_object(
      'status',  'not_admin',
      'message', 'That name and PIN did not match an admin account.');
  end if;

  -- ── 3. find the member on the roster ────────────────────────────────────
  -- id is cast to text so this works whether members.id is uuid or text.
  select m.id, m.name, m.linked_player_id
    into v_member
    from public.members m
   where m.id::text = p_member_id;

  if not found then
    return jsonb_build_object(
      'status',  'no_member',
      'message', 'That member is not on the roster.');
  end if;

  if v_member.linked_player_id is null then
    return jsonb_build_object(
      'status',  'no_account',
      'message', v_member.name || ' has not set up an app account yet, so there is no PIN to reset.');
  end if;

  -- ── 4. find their account and hold the row ──────────────────────────────
  select d.id, d.player_name
    into v_account
    from public.player_data d
   where d.id = v_member.linked_player_id
   for update;

  if not found then
    return jsonb_build_object(
      'status',  'no_account',
      'message', 'The account linked to ' || v_member.name || ' no longer exists.');
  end if;

  -- ── 5. build the new key ────────────────────────────────────────────────
  -- Keep the name exactly as the member typed it when they signed up — the
  -- brief is that nothing changes except the PIN, and rebuilding the name from
  -- the roster row could change the key they sign in with. Strips the last
  -- "-nnnn" only, so a hyphenated name survives.
  v_name_part := regexp_replace(v_account.player_name, '-[^-]*$', '');

  if v_name_part = '' or v_name_part = v_account.player_name then
    return jsonb_build_object(
      'status',  'bad_account',
      'message', 'That account key is not in NAME-PIN form and needs fixing by hand.');
  end if;

  v_new_key := v_name_part || '-' || p_new_pin;

  -- ── 6. refuse a collision rather than trampling another account ─────────
  -- Excludes the target row itself, so re-issuing the same PIN is allowed.
  if exists (
    select 1 from public.player_data d
     where d.player_name = v_new_key
       and d.id <> v_account.id
  ) then
    return jsonb_build_object(
      'status',  'collision',
      'message', 'Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end if;

  -- ── 7. move both copies of the PIN in one statement ─────────────────────
  -- name_key is deliberately not set: it derives from the NAME, and the name
  -- is not changing. Leaving it alone is correct whether the
  -- player_data_backfill_keys trigger fills these only when absent or
  -- recomputes them on every write — in the latter case it derives the same
  -- values from the new player_name anyway.
  begin
    update public.player_data
       set player_name = v_new_key,
           pin_hash    = crypt(p_new_pin, gen_salt('bf')),
           updated_at  = now()
     where id = v_account.id;
  exception
    -- Belt and braces for the gap between the check above and this write.
    when unique_violation then
      return jsonb_build_object(
        'status',  'collision',
        'message', 'Another account already signs in as ' || v_new_key || '. Pick a different PIN.');
  end;

  -- ── 8. keep the roster link pointing at the renamed account ─────────────
  -- A trigger on members maintains linked_player_id from linked_cloudkey.
  update public.members
     set linked_cloudkey = v_new_key
   where id = v_member.id;

  -- ── 9. a reset clears the slate: failed attempts and any lockout go ─────
  delete from public.login_lockouts
   where upper(name) in (upper(v_name_part), upper(v_member.name));

  -- ── 10. hand the new PIN back so the admin can read it out ──────────────
  return jsonb_build_object(
    'status',       'ok',
    'member_name',  v_member.name,
    'account_name', v_name_part,
    'new_key',      v_new_key,
    'new_pin',      p_new_pin);
end;
$$;

-- The app calls this with the publishable (anon) key, exactly like the other
-- RPCs. It authorises itself in step 2 — being able to call it is not being
-- allowed to use it.
revoke all on function public.bowls_admin_reset_pin(text, text, text, text) from public;
grant execute on function public.bowls_admin_reset_pin(text, text, text, text) to anon, authenticated;

comment on function public.bowls_admin_reset_pin(text, text, text, text) is
  'Admin-authorised PIN reset. Verifies the caller with bowls_is_admin, then '
  'moves player_data.player_name and player_data.pin_hash together, repoints '
  'members.linked_cloudkey and clears any lockout. Returns a jsonb status.';
