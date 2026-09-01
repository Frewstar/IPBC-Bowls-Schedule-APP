-- ════════════════════════════════════════════════════════════════════════════
--  Writing to the Roll of Honour — admin only, through a function
--
--  roll_of_honour is SELECT-only to anon and authenticated. That was
--  deliberate: before it was locked down, anyone holding the bundle could have
--  emptied 285 entries going back to 1958. But the admin-gated replacement was
--  sketched and never built, so the Record Winner button has been failing with
--  "permission denied for table roll_of_honour" ever since.
--
--  Two functions, and no change to the table's grants: the write happens as the
--  function owner, and only after the caller has proved they are an admin.
--
--  WHO. bowls_admin_role must return 'admin' or 'super_admin'. NOT
--  events_admin — the social convenor's job is the diary, not the club's
--  permanent record. draw_admin is also excluded, deliberately: the honours
--  board outlives any one competition, and a draw admin's remit is running a
--  draw. Easy to widen later, awkward to narrow once someone has the button.
--
--  WHICH CLUB. Derived from the account, never passed. This is the first
--  function written since that rule was settled, so it is born following it:
--  the club comes off the player_data row the name+PIN resolve to, and the
--  UPDATE is scoped by it. roll_of_honour.id is a global text primary key —
--  'roh-gents-singles' is not club-qualified — so without the club_id in the
--  WHERE, a second club's admin could rewrite Irvine Park's board by naming
--  its category id.
--
--  THE SHAPE IS {year, winner}. Never {year, name}. All 285 live entries use
--  `winner`, and a second write path that used `name` rendered as a blank line
--  until it was fixed. That shape must not come back through a new door, so it
--  is built here with jsonb_build_object rather than passed through.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Record (or correct) a winner ────────────────────────────────────────────
create or replace function public.bowls_admin_record_winner(
  p_name        text,
  p_pin         text,
  p_category_id text,
  p_year        int,
  p_winner      text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_role     text;
  v_club_id  uuid;
  v_winner   text;
  v_max_year int  := extract(year from now())::int + 1;
  v_existing jsonb;
  v_prev     text;
  v_updated  jsonb;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);
  if coalesce(v_role, '') not in ('admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only a club admin can change the Roll of Honour.');
  end if;

  -- The club comes off the account. Re-checks the PIN rather than matching
  -- name_key alone: bowls_register allows two accounts under one name with
  -- different PINs, and at 200 clubs those can be in different clubs.
  select d.club_id into v_club_id
    from public.player_data d
   where d.name_key = public.bowls_name_key(p_name)
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_club_id is null then
    return jsonb_build_object(
      'status',  'no_club',
      'message', 'Could not establish which club that account belongs to.');
  end if;

  v_winner := btrim(coalesce(p_winner, ''));
  if v_winner = '' then
    return jsonb_build_object(
      'status',  'bad_winner',
      'message', 'Give the winner''s name.');
  end if;

  if p_year is null or p_year < 1900 or p_year > v_max_year then
    return jsonb_build_object(
      'status',  'bad_year',
      'message', format('The year must be between 1900 and %s.', v_max_year));
  end if;

  -- Row-locked for the read-modify-write: two admins recording the same
  -- evening would otherwise each rebuild the array from the version they read
  -- and the second would drop the first's entry.
  select winners into v_existing
    from public.roll_of_honour
   where id = p_category_id
     and club_id = v_club_id
   for update;

  if not found then
    -- Refuse rather than update nothing. A typo'd category id that silently
    -- succeeds is how you find out in a year's time.
    return jsonb_build_object(
      'status',  'no_category',
      'message', 'That competition is not on the Roll of Honour.');
  end if;

  v_existing := coalesce(v_existing, '[]'::jsonb);

  -- What is there for that year already, if anything.
  select w ->> 'winner' into v_prev
    from jsonb_array_elements(v_existing) w
   where jsonb_typeof(w -> 'year') = 'number'
     and (w ->> 'year')::int = p_year
   limit 1;

  -- One winner per year: the new entry, plus every entry that is not that
  -- year, newest first. An entry with a malformed year is kept rather than
  -- dropped — this function is not the place to lose 68 years of history to a
  -- cast — and sorts to the end.
  select coalesce(jsonb_agg(e order by
           case when jsonb_typeof(e -> 'year') = 'number'
                then (e ->> 'year')::int else -1 end desc), '[]'::jsonb)
    into v_updated
    from (
      select jsonb_build_object('year', p_year, 'winner', v_winner) as e
      union all
      select w
        from jsonb_array_elements(v_existing) w
       where not (jsonb_typeof(w -> 'year') = 'number'
                  and (w ->> 'year')::int = p_year)
    ) t;

  update public.roll_of_honour
     set winners = v_updated
   where id = p_category_id
     and club_id = v_club_id;

  return jsonb_build_object(
    'status',          'ok',
    'action',          case when v_prev is null then 'added' else 'replaced' end,
    'year',            p_year,
    'winner',          v_winner,
    'previous_winner', v_prev,
    'total',           jsonb_array_length(v_updated),
    'message',         case when v_prev is null
                         then format('%s recorded as %s winner.', v_winner, p_year)
                         else format('%s replaced %s for %s.', v_winner, v_prev, p_year)
                       end);
end $function$;


-- ── Take one back out ───────────────────────────────────────────────────────
-- Someone will type 1975 for 1976. Without this the only fix is a hand in the
-- database.
create or replace function public.bowls_admin_remove_winner(
  p_name        text,
  p_pin         text,
  p_category_id text,
  p_year        int
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_role     text;
  v_club_id  uuid;
  v_existing jsonb;
  v_prev     text;
  v_updated  jsonb;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);
  if coalesce(v_role, '') not in ('admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only a club admin can change the Roll of Honour.');
  end if;

  select d.club_id into v_club_id
    from public.player_data d
   where d.name_key = public.bowls_name_key(p_name)
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_club_id is null then
    return jsonb_build_object(
      'status',  'no_club',
      'message', 'Could not establish which club that account belongs to.');
  end if;

  select winners into v_existing
    from public.roll_of_honour
   where id = p_category_id
     and club_id = v_club_id
   for update;

  if not found then
    return jsonb_build_object(
      'status',  'no_category',
      'message', 'That competition is not on the Roll of Honour.');
  end if;

  v_existing := coalesce(v_existing, '[]'::jsonb);

  select w ->> 'winner' into v_prev
    from jsonb_array_elements(v_existing) w
   where jsonb_typeof(w -> 'year') = 'number'
     and (w ->> 'year')::int = p_year
   limit 1;

  if v_prev is null then
    -- Nothing there. Say so rather than reporting a removal that removed
    -- nothing, which reads the same as success.
    return jsonb_build_object(
      'status',  'not_found',
      'message', format('There is no %s winner recorded for that competition.', p_year));
  end if;

  select coalesce(jsonb_agg(w order by
           case when jsonb_typeof(w -> 'year') = 'number'
                then (w ->> 'year')::int else -1 end desc), '[]'::jsonb)
    into v_updated
    from jsonb_array_elements(v_existing) w
   where not (jsonb_typeof(w -> 'year') = 'number'
              and (w ->> 'year')::int = p_year);

  update public.roll_of_honour
     set winners = v_updated
   where id = p_category_id
     and club_id = v_club_id;

  return jsonb_build_object(
    'status',  'ok',
    'action',  'removed',
    'year',    p_year,
    'winner',  v_prev,
    'total',   jsonb_array_length(v_updated),
    'message', format('%s removed from %s.', v_prev, p_year));
end $function$;


-- ── Grants ──────────────────────────────────────────────────────────────────
-- The app holds the publishable key, so it calls as `anon`. Matching
-- bowls_poster_ticket, bowls_grant_admin and bowls_admin_reset_pin, which are
-- all granted to anon and authenticated and do their own gating inside.
-- roll_of_honour's own grants are untouched: still SELECT only.
revoke all on function public.bowls_admin_record_winner(text, text, text, int, text) from public;
revoke all on function public.bowls_admin_remove_winner(text, text, text, int)       from public;
grant execute on function public.bowls_admin_record_winner(text, text, text, int, text) to anon, authenticated;
grant execute on function public.bowls_admin_remove_winner(text, text, text, int)       to anon, authenticated;
