-- ════════════════════════════════════════════════════════════════════════
--  "I'M LOCKED OUT" WITHOUT READING THE LOCKOUT TABLE
--
--  The locked-out screen has a button that asks an admin to let them back
--  in. Today it does this:
--
--      supabase.from("login_lockouts").update({ unlock_requested: true })
--              .eq("id", lockoutInfo.id)
--
--  which needs the lockout row's id, which the client only has because it
--  selected the whole row a moment earlier. After Step 4 it has neither, and
--  bowls_sign_in's `locked` status carries locked_until and nothing else.
--
--  So the button needs its own way in. This is it.
--
--  Two things it deliberately does not ask for:
--
--    * the row id — the client will not have one
--    * the PIN — they are locked out precisely because they do not know it.
--      Requiring it would make the button useless to the only people who
--      ever press it.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--    drop function if exists public.bowls_request_unlock(text);
--
--  Nothing else to undo: no table, no column, no grant on anything that
--  existed before. Until Step 3c the client does not call it, so dropping it
--  is invisible.
-- ════════════════════════════════════════════════════════════════════════


-- ── bowls_request_unlock ──────────────────────────────────────────────────
-- Returns void, and returns it whatever happens. A caller cannot tell the
-- difference between "flag set", "you are not locked out" and "no such
-- member", because a function that answered differently would be a way to
-- ask whether a name has an account — the same oracle the sign-in statuses
-- are careful about, handed out without even a PIN attempt.
--
-- It only ever raises the flag on a row that is CURRENTLY locked. It cannot
-- create a lockout row, cannot extend one, cannot clear one, and cannot
-- change attempts or locked_until. The worst an attacker can do by calling
-- it is set a boolean that is already true, on an account that is already
-- locked, which the admin panel already lists.
--
-- Resolution is by bowls_name_key, the same normalisation login_lockouts.name
-- is written with, so "J.FREW" and "J FREW" reach the same row.
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
   where name = v_key
     and locked_until is not null
     and locked_until > now()
     and unlock_requested is distinct from true;
end $$;

revoke all on function public.bowls_request_unlock(text) from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_request_unlock(text) to %I', r);
    end if;
  end loop;
end $$;
