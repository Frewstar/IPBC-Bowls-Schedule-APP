-- ════════════════════════════════════════════════════════════════════════
--  CLUB EVENTS  —  What's On: the band, the karaoke, and one-off nights
--  Run this once in the Supabase SQL editor.
--
--  One row per night. A weekly series is generated into ordinary rows when
--  the admin sets it up — there is no recurrence rule stored here and
--  nothing is expanded on read. That is the point: cancelling Christmas Eve
--  is then an edit to one row rather than a feature nobody built.
--
--  This is deliberately NOT club_fixtures. That table is match-shaped —
--  Fixtures.jsx renders a Home/Away pill from `venue` and "{n} rinks" from
--  `rinks` — so a band night listed there would carry an "Away" badge and a
--  blank rink count.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.club_events (
  id          uuid primary key default gen_random_uuid(),

  -- Every table in this database carries club_id, defaulted to IPBC so the
  -- client never has to supply it. Same shape as members, live_games and the
  -- rest, so this table doesn't have to be retrofitted when the app goes
  -- multi-club.
  club_id     uuid not null references public.clubs(id)
                default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid,

  title       text not null,                    -- "Band", "Karaoke", "Christmas Party"
  detail      text,                             -- optional line under it — who's playing, ticket price

  -- A DATE and a local clock time held as TEXT ("20:00"). Deliberately not a
  -- timestamptz.
  --
  -- The clocks go forward on the last Sunday in March, which is inside the
  -- season. Generating a series by adding 7 * 86400 seconds to a timestamptz
  -- puts every date after that Sunday an hour out — a band advertised at 9pm
  -- because the app did the arithmetic in UTC. "Saturday, 8pm" means 8pm on
  -- the clock on the wall, in March and in July alike, so that is what is
  -- stored. Nothing here is ever converted between zones.
  event_date  date not null,
  start_time  text,

  -- A cancelled night stays in the table and stays on the screen, struck
  -- through. Deleting it tells a member expecting a band precisely nothing;
  -- they turn up to a shut club. This is why cancellation is a column and not
  -- a delete.
  cancelled   boolean not null default false,

  -- Ties the generated rows of one series together, so "every Saturday from
  -- November to March" can be removed or re-priced in one go. Null on a
  -- one-off. Not a foreign key — there is no series table, and there is not
  -- meant to be one.
  series_id   uuid,

  created_by  text,                             -- display name of the admin who set it up
  created_at  timestamptz not null default now()
);

-- Catch a clock time that isn't one, so a typo can't put "8" or "8pm" in a
-- column the app parses as HH:MM. Null is allowed: an all-day or
-- time-unannounced event is a real thing.
alter table public.club_events drop constraint if exists club_events_start_time_format;
alter table public.club_events add constraint club_events_start_time_format check (
  start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- ── The duplicate guard ───────────────────────────────────────────────────
-- Generating a series is one tap, and one tap is easy to make twice — a slow
-- connection, a nervous second press, an admin who isn't sure the first one
-- took. club_fixtures carries a duplicate row from exactly that, so this table
-- refuses it at the database rather than trusting the app to check.
--
-- lower(title) so "Band" and "band" collide, which is what an admin means.
create unique index if not exists club_events_no_dupes
  on public.club_events (club_id, event_date, lower(title));

-- What's On reads a date window for one club, and that is the only read there is.
create index if not exists club_events_club_date_idx
  on public.club_events (club_id, event_date);

-- Editing or removing a whole series.
create index if not exists club_events_series_idx
  on public.club_events (series_id)
  where series_id is not null;

-- ── Access ────────────────────────────────────────────────────────────────
-- Same as every other table in this project: the app talks to Supabase with
-- the publishable (anon) key, which ships inside the JavaScript bundle, and
-- these policies let that key read and write.
--
-- Being plain about it: "admin only" for creating events is enforced in the
-- app's UI and nowhere else. Anyone who reads the bundle can get the key and
-- write to this table directly. That is the same exposure every other table
-- here already has, and it is what the 002b lockdown is for. Do not read
-- these policies as security.
alter table public.club_events enable row level security;

drop policy if exists "club_events public read"   on public.club_events;
drop policy if exists "club_events public insert" on public.club_events;
drop policy if exists "club_events public update" on public.club_events;
drop policy if exists "club_events public delete" on public.club_events;

create policy "club_events public read"   on public.club_events for select using (true);
create policy "club_events public insert" on public.club_events for insert with check (true);
create policy "club_events public update" on public.club_events for update using (true) with check (true);
create policy "club_events public delete" on public.club_events for delete using (true);

-- ── Not added to the realtime publication, on purpose ─────────────────────
-- live_games is in supabase_realtime because a score changes while you are
-- watching it. A Saturday night band does not. What's On refetches whenever
-- the app comes to the foreground, which is the moment a member actually
-- looks — and unlike a socket, that keeps working after the phone has been in
-- a pocket for three days.
