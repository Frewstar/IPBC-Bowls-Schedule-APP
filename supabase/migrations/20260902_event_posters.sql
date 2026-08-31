-- ════════════════════════════════════════════════════════════════════════
--  EVENT POSTERS
--  Run this once in the Supabase SQL editor (after 20260901_admin_role_layers.sql).
--
--  Christine has the promoter's JPEG — it's what she puts on Facebook. This
--  puts it on the event, and on the Open Graph card of the shared link, which
--  is the part that actually does her job for her.
--
--  WHAT THIS ADDS
--    club_events.poster_path   the object path, not a URL. URLs change.
--    bucket 'event-posters'    public read, size- and type-limited
--    poster_tickets            short-lived permission to write ONE object
--    bowls_poster_ticket()     mints one, PIN-gated, events_admin and up
--    bowls_poster_remove_ticket()  the same for deleting one
--    bowls_poster_ticket_ok()  what the storage policies call
--
--  NOT base64 in the row. player_data.profile stores avatars that way and at
--  60px it is fine; a readable poster is 300KB-1MB and base64 adds a third
--  again. On club_events that would mean all 214 members downloading every
--  poster on every What's On load, whether or not they open one.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. The pointer ────────────────────────────────────────────────────────
alter table public.club_events add column if not exists poster_path text;

comment on column public.club_events.poster_path is
  'Object path in the event-posters bucket, e.g. <event_id>/<uuid>.jpg. Never a full URL: the project URL and the CDN in front of it can both change, the path cannot. Null for the great majority of events.';


-- ── 2. The bucket ─────────────────────────────────────────────────────────
-- public = true so the object URL serves without a token, which is what makes
-- the Open Graph image work: Facebook's crawler carries no credentials.
--
-- file_size_limit and allowed_mime_types are enforced by the storage service
-- itself, on every request, whatever the client believes. The client resizes
-- to under 300KB before upload; this is the backstop for when it doesn't.
-- 2MB rather than 300KB so a legitimate poster from a browser that resizes
-- less aggressively still lands, while a 4MB camera original still cannot.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ── 3. Why this is not "using (true)" ─────────────────────────────────────
-- Every table policy in this app is ALL/public/using(true), and the
-- publishable key is in the JavaScript bundle. On a table that is a
-- data-integrity problem: the worst case is someone rewriting the club's own
-- rows, which are backed up and can be put back.
--
-- On a storage bucket it is a different kind of problem. An open insert
-- policy means anyone on the internet who opens devtools can upload arbitrary
-- files to the club's storage, on the club's bill, served from the club's
-- domain. That is free file hosting for strangers, and taking it down again
-- means finding out what they put there first.
--
-- There is no Supabase Auth in this app — every visitor is the anon role, so
-- "restrict writes to authenticated" restricts them to nobody. What gates the
-- rest of the app is a name and a PIN checked in a SECURITY DEFINER function
-- against player_data.pin_hash. This does the same, in the only shape storage
-- policies allow:
--
--   1. The client asks bowls_poster_ticket(name, pin, event) for permission.
--      That verifies the PIN and the role, exactly as adding an event does.
--   2. It returns ONE exact object path and records a ticket for it, good for
--      five minutes.
--   3. The storage insert policy allows a write only to a path that has a
--      live ticket. No ticket, no upload — the key alone buys nothing.
--
-- The ticket table is not readable by anon (RLS on, no policies), so a ticket
-- cannot be found by looking; it has to be issued. The policies reach it
-- through a SECURITY DEFINER function for that reason — a policy expression
-- runs with the caller's privileges, so referring to the table directly would
-- have required granting anon SELECT on it, which is the whole secret.
create table if not exists public.poster_tickets (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid,
  object_path text not null,
  purpose     text not null check (purpose in ('upload', 'delete')),
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table public.poster_tickets enable row level security;
-- Deliberately no policies: anon and authenticated get nothing. Only the
-- SECURITY DEFINER functions below touch this table.

create index if not exists poster_tickets_path_idx on public.poster_tickets (object_path);


-- ── 4. What the storage policies call ─────────────────────────────────────
-- Exact path match, not a prefix: a ticket authorises one object and only the
-- one it was issued for.
create or replace function public.bowls_poster_ticket_ok(p_path text, p_purpose text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.poster_tickets t
     where t.object_path = p_path
       and t.purpose     = p_purpose
       and t.expires_at  > now()
  );
$$;

-- Must stay executable by anon: the storage policies are evaluated as anon on
-- every upload and delete. Same reasoning as bowls_admin_role in 20260901 —
-- it is reachable with the publishable key but tells an attacker nothing they
-- did not already supply, and it is the thing that makes the lock work.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.bowls_poster_ticket_ok(text, text) to %I', r);
    end if;
  end loop;
end $$;


-- ── 5. The policies themselves ────────────────────────────────────────────
drop policy if exists "event posters are public to read"  on storage.objects;
drop policy if exists "event poster writes need a ticket" on storage.objects;
drop policy if exists "event poster deletes need a ticket" on storage.objects;

-- SELECT: public, and intended. The bucket is public so the object URL works
-- for Facebook's crawler and for anyone the link is pasted to.
create policy "event posters are public to read"
  on storage.objects for select
  using (bucket_id = 'event-posters');

-- INSERT: only to a path with a live ticket.
create policy "event poster writes need a ticket"
  on storage.objects for insert
  with check (bucket_id = 'event-posters'
              and public.bowls_poster_ticket_ok(name, 'upload'));

-- DELETE: only a path with a live delete ticket.
create policy "event poster deletes need a ticket"
  on storage.objects for delete
  using (bucket_id = 'event-posters'
         and public.bowls_poster_ticket_ok(name, 'delete'));

-- UPDATE: no policy, so no overwrite. Replacing a poster uploads a new object
-- under a fresh name and deletes the old one, which also sidesteps the CDN
-- serving the previous image from cache under a reused path.


-- ── 6. Minting a ticket ───────────────────────────────────────────────────
-- Same capability as adding an event: events_admin, admin, super_admin. The
-- role comes from bowls_admin_role, which verifies the PIN against
-- player_data.pin_hash and counts failures into login_lockouts, so this
-- inherits the throttle rather than opening a second unthrottled door.
create or replace function public.bowls_poster_ticket(
  p_name     text,
  p_pin      text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
  v_path text;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);

  if coalesce(v_role, '') not in ('events_admin', 'admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only an admin or the social convenor can add a poster.');
  end if;

  if not exists (select 1 from public.club_events where id = p_event_id) then
    return jsonb_build_object(
      'status',  'no_event',
      'message', 'That night is not in the diary any more.');
  end if;

  delete from public.poster_tickets where expires_at < now() - interval '1 day';

  -- A fresh filename every time. Two uploads for the same event never collide,
  -- and a replaced poster is never served stale from the CDN under a path that
  -- now means something else.
  v_path := p_event_id::text || '/' || gen_random_uuid()::text || '.jpg';

  insert into public.poster_tickets (event_id, object_path, purpose, created_by, expires_at)
  values (p_event_id, v_path, 'upload', upper(coalesce(p_name, '')), now() + interval '5 minutes');

  return jsonb_build_object('status', 'ok', 'path', v_path);
end $$;


-- ── 7. And for taking one down ────────────────────────────────────────────
-- Removing has to really remove. Christine will pick the wrong file at some
-- point, and "remove" that only clears poster_path would leave the wrong image
-- sitting on a public URL for as long as the bucket exists.
create or replace function public.bowls_poster_remove_ticket(
  p_name        text,
  p_pin         text,
  p_object_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
  v_head text;
begin
  v_role := public.bowls_admin_role(p_name, p_pin);

  if coalesce(v_role, '') not in ('events_admin', 'admin', 'super_admin') then
    return jsonb_build_object(
      'status',  'not_allowed',
      'message', 'Only an admin or the social convenor can remove a poster.');
  end if;

  -- The path must be shaped like one this app issued: <event id>/<file>. Not a
  -- security boundary on its own — only an admin gets this far — but it keeps a
  -- malformed path from minting a ticket for something unrelated.
  v_head := split_part(coalesce(p_object_path, ''), '/', 1);
  if v_head = '' or v_head !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status', 'bad_path', 'message', 'That is not a poster this app uploaded.');
  end if;

  delete from public.poster_tickets where expires_at < now() - interval '1 day';

  insert into public.poster_tickets (event_id, object_path, purpose, created_by, expires_at)
  values (v_head::uuid, p_object_path, 'delete', upper(coalesce(p_name, '')), now() + interval '5 minutes');

  return jsonb_build_object('status', 'ok');
end $$;


-- ── 8. And take the default grants off the ticket table ───────────────────
-- Supabase grants anon and authenticated table privileges across the public
-- schema by default, so anon holds SELECT on poster_tickets even though nothing
-- should ever read it directly. RLS with no policies already reduces that to
-- zero rows — checked, not assumed: `set role anon; select count(*)` returns 0
-- with live tickets in the table. So this is not what makes the tickets secret.
--
-- It is worth doing anyway. The grant is the thing that would come back to life
-- the day somebody adds a permissive policy or turns RLS off while debugging
-- something else, and it also keeps the table off the PostgREST surface
-- entirely rather than exposing an endpoint that answers with an empty list.
-- The SECURITY DEFINER functions above run as the owner and are unaffected.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.poster_tickets from %I', r);
    end if;
  end loop;
end $$;

-- ── What this is and is not ───────────────────────────────────────────────
-- LOCKED: the bytes. Writing an object into this bucket requires a name and a
-- PIN that resolve to events_admin or above. The publishable key on its own
-- buys read access and nothing else. That is a real server-side lock, not a
-- check in the client.
--
-- NOT LOCKED, and worth being plain about:
--
--   * club_events itself is still ALL/public/using(true), poster_path
--     included. Anyone with the key from the bundle can point an event at a
--     different poster, or clear it, or delete the event. The image is gated;
--     the pointer to it is not. That is 002b's job, along with every other
--     table, and is deliberately not changed here.
--   * A ticket is good for five minutes and is not single-use, so within that
--     window the admin who minted it could write that one path more than once.
--     Bounded to one path, one bucket, and the size and MIME limits above.
--   * Public read means public forever, for as long as the object exists. A
--     poster uploaded by mistake is readable by anyone holding the URL until
--     it is removed — which is why removing really deletes rather than just
--     clearing the column.
--   * Anyone who is an admin can upload anything the MIME limits allow. This
--     grants the social convenor a real capability; it does not police it.
