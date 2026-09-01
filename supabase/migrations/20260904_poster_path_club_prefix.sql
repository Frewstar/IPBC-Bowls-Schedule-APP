-- ════════════════════════════════════════════════════════════════════════════
--  Poster object paths get the club in front
--
--    was:  <event_id>/<file_uuid>.jpg
--    now:  <club_id>/<event_id>/<file_uuid>.jpg
--
--  WHY, AND WHY NOW
--  "The first path segment is always the tenant id" is the convention the rest
--  of the estate already follows, and it is what lets a storage policy check
--  the club later — a policy can read the club off the path without a join.
--  Bowls did not follow it. The bucket holds exactly ONE object today, so this
--  costs minutes; at 200 clubs it is a migration of thousands of files.
--
--  THE CLUB IS DERIVED, NEVER PASSED. bowls_poster_ticket takes name + PIN and
--  reads the club off the account row those resolve to. No caller names a club,
--  so no caller can name someone else's.
--
--  THIS IS PREPARATION, NOT THE CHECK. The storage policies are deliberately
--  untouched: they still authorise by matching a live ticket's object_path, not
--  by inspecting the path. Adding "the first segment must be your club" belongs
--  with the rest of the tenancy work, not here. Two consequences worth naming:
--    * An events_admin of club A could still mint a ticket for club B's event —
--      it would be written under A's prefix. A no-op with one club; it is the
--      event-belongs-to-your-club check that closes it, and that is tenancy work.
--    * Nothing yet stops a hand-built path from being uploaded to if a ticket
--      exists for it. Same as before this change.
--
--  THE ONE EXISTING OBJECT IS NOT TOUCHED BY THIS FILE. Renaming it means
--  moving it through the storage API; editing storage.objects.name in SQL
--  orphans the stored file from its row. It stays on the old two-segment path,
--  keeps working (public read is path-agnostic, and club_events.poster_path
--  still matches), and gets the new shape whenever it is next replaced.
--  bowls_poster_remove_ticket below therefore has to accept both shapes.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Minting an upload ticket ────────────────────────────────────────────────
create or replace function public.bowls_poster_ticket(p_name text, p_pin text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_role    text;
  v_club_id uuid;
  v_path    text;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);

  if coalesce(v_role, '') not in ('events_admin', 'admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only an admin or the social convenor can add a poster.');
  end if;

  -- The club comes off the account, not off an argument. bowls_admin_role has
  -- already proved this name+PIN resolves to a real account carrying a
  -- poster-capable role; this reads the club from that same row.
  --
  -- It re-checks the PIN rather than matching on name_key alone, and must:
  -- bowls_register deliberately allows two accounts under one name with
  -- different PINs, so name_key on its own does not identify a single row —
  -- and at 200 clubs those two rows can be in different clubs. That is a
  -- second bcrypt on a path that already does one; ~200ms total on an
  -- operation that then uploads a photograph, which is the right trade.
  select d.club_id into v_club_id
    from public.player_data d
   where d.name_key = public.bowls_name_key(p_name)
     and d.pin_hash = extensions.crypt(p_pin, d.pin_hash)
   limit 1;

  if v_club_id is null then
    -- Unreachable while the role check above passed. A guard, not a fallback:
    -- a path with no club in it is the thing this change exists to stop, so
    -- refuse rather than quietly write the old shape.
    return jsonb_build_object(
      'status',  'no_club',
      'message', 'Could not establish which club that account belongs to.');
  end if;

  if not exists (select 1 from public.club_events where id = p_event_id) then
    return jsonb_build_object(
      'status',  'no_event',
      'message', 'That night is not in the diary any more.');
  end if;

  delete from public.poster_tickets where expires_at < now() - interval '1 day';

  -- <club_id>/<event_id>/<file_uuid>.jpg
  -- A fresh filename every time. Two uploads for the same event never collide,
  -- and a replaced poster is never served stale from the CDN under a path that
  -- now means something else.
  v_path := v_club_id::text || '/' || p_event_id::text || '/' || gen_random_uuid()::text || '.jpg';

  insert into public.poster_tickets (event_id, object_path, purpose, created_by, expires_at)
  values (p_event_id, v_path, 'upload', upper(coalesce(p_name, '')), now() + interval '5 minutes');

  return jsonb_build_object('status', 'ok', 'path', v_path);
end $function$;


-- ── Minting a delete ticket ─────────────────────────────────────────────────
-- This function read the event id out of the FIRST path segment. Under the new
-- shape that segment is the CLUB, so left alone it would have recorded a club
-- id in poster_tickets.event_id — silently, because there is no foreign key on
-- that column to reject it. The delete itself would still have worked
-- (bowls_poster_ticket_ok matches on object_path, not event_id), which is what
-- makes it worth fixing now rather than discovering later.
create or replace function public.bowls_poster_remove_ticket(p_name text, p_pin text, p_object_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_role     text;
  v_parts    text[];
  v_event    text;
  v_uuid_re  constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  v_role := public.bowls_admin_role(p_name, p_pin);

  if coalesce(v_role, '') not in ('events_admin', 'admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only an admin or the social convenor can remove a poster.');
  end if;

  -- Two shapes are accepted, and which segment is the event depends on which:
  --   <club_id>/<event_id>/<file>   current
  --   <event_id>/<file>             legacy, one object in the bucket
  -- The legacy branch can go once that object has been replaced; until then,
  -- dropping it would leave the George Hoffin poster unremovable through the
  -- app. Still not a security boundary on its own — only an admin reaches
  -- here — but it stops a malformed path minting a ticket for something
  -- unrelated.
  v_parts := string_to_array(coalesce(p_object_path, ''), '/');

  if array_length(v_parts, 1) = 3 and v_parts[1] ~ v_uuid_re and v_parts[2] ~ v_uuid_re then
    v_event := v_parts[2];
  elsif array_length(v_parts, 1) = 2 and v_parts[1] ~ v_uuid_re then
    v_event := v_parts[1];
  else
    return jsonb_build_object('status', 'bad_path', 'message', 'That is not a poster this app uploaded.');
  end if;

  delete from public.poster_tickets where expires_at < now() - interval '1 day';

  insert into public.poster_tickets (event_id, object_path, purpose, created_by, expires_at)
  values (v_event::uuid, p_object_path, 'delete', upper(coalesce(p_name, '')), now() + interval '5 minutes');

  return jsonb_build_object('status', 'ok');
end $function$;
