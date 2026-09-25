-- ════════════════════════════════════════════════════════════════════════
--  20260925_keep_existing_pin_2_clear_flag.sql
--
--  STATUS: NOT YET APPLIED to the live database.
--
--  Clears must_change_pin on every account that has not chosen a new PIN
--  yet (pin_set_at is null). That is the only thing it does: one column, on
--  those rows. No PIN, key, session, lockout or grant is touched. A member
--  who has already chosen a new PIN (pin_set_at is set) keeps it — their row
--  is not in the WHERE clause.
--
--  Apply after 20260925_keep_existing_pin_1_functions.sql. If
--  20260923_directory_lockdown_2_close_tables.sql is applied after this file
--  (it sets the flag on every account the first time it runs), run this
--  file again afterwards. It is idempotent: a second run updates 0 rows.
--
--  ── VERIFICATION ──────────────────────────────────────────────────────
--  Run before and after, and paste the numbers here and in the PR:
--
--    select count(*) filter (where must_change_pin and pin_set_at is null)      as flagged_no_new_pin,
--           count(*) filter (where must_change_pin and pin_set_at is not null)  as flagged_has_new_pin,
--           count(*) filter (where not must_change_pin)                         as not_flagged,
--           count(*) filter (where pin_set_at is not null)                      as chose_own_pin,
--           count(*)                                                            as accounts
--      from public.player_data;
--
--  Expected after: flagged_no_new_pin = 0; chose_own_pin and accounts
--  unchanged; not_flagged grows by exactly the "before" flagged_no_new_pin.
--  (flagged_has_new_pin can only be non-zero if lockdown_2 flagged an
--  account bowls_register had made; the flag is no longer enforced
--  anywhere, so such a member is not blocked, but it is left as the brief
--  asks and reported here.)
--
--  Before: flagged_no_new_pin = ___  flagged_has_new_pin = ___  not_flagged = ___  chose_own_pin = ___  accounts = ___
--  After:  flagged_no_new_pin = ___  flagged_has_new_pin = ___  not_flagged = ___  chose_own_pin = ___  accounts = ___
--
--  The same numbers are printed as NOTICEs when this runs.
--
--  ── DOWN ──────────────────────────────────────────────────────────────
--  Not needed: with 20260925_keep_existing_pin_1_functions.sql applied the
--  flag has no effect. To put it back regardless:
--    update public.player_data set must_change_pin = true
--     where not must_change_pin and pin_set_at is null;
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_flagged_before  integer;
  v_has_pin_before  integer;
  v_chose_before    integer;
  v_total_before    integer;
  v_updated         integer;
  v_flagged_after   integer;
  v_has_pin_after   integer;
  v_chose_after     integer;
  v_total_after     integer;
begin
  select count(*) filter (where must_change_pin and pin_set_at is null),
         count(*) filter (where must_change_pin and pin_set_at is not null),
         count(*) filter (where pin_set_at is not null),
         count(*)
    into v_flagged_before, v_has_pin_before, v_chose_before, v_total_before
    from public.player_data;

  update public.player_data
     set must_change_pin = false
   where must_change_pin
     and pin_set_at is null;
  get diagnostics v_updated = row_count;

  select count(*) filter (where must_change_pin and pin_set_at is null),
         count(*) filter (where must_change_pin and pin_set_at is not null),
         count(*) filter (where pin_set_at is not null),
         count(*)
    into v_flagged_after, v_has_pin_after, v_chose_after, v_total_after
    from public.player_data;

  raise notice 'before: flagged_no_new_pin=% flagged_has_new_pin=% chose_own_pin=% accounts=%',
    v_flagged_before, v_has_pin_before, v_chose_before, v_total_before;
  raise notice 'cleared: % rows', v_updated;
  raise notice 'after:  flagged_no_new_pin=% flagged_has_new_pin=% chose_own_pin=% accounts=%',
    v_flagged_after, v_has_pin_after, v_chose_after, v_total_after;

  if v_flagged_after <> 0
     or v_updated <> v_flagged_before
     or v_has_pin_after <> v_has_pin_before
     or v_chose_after <> v_chose_before
     or v_total_after <> v_total_before then
    raise exception 'must_change_pin clear did not land as expected; rolled back.';
  end if;
end $$;
