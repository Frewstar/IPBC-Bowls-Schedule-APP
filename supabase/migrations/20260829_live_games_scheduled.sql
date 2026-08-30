-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  scheduled fixtures
--  Run this once in the Supabase SQL editor (after 20260723_…_location.sql).
-- ════════════════════════════════════════════════════════════════════════

-- When the game is due to start. Null means "no start time" — which is what
-- every game created before this migration has, and what the app shows for a
-- game started on the spot.
alter table public.live_games add column if not exists starts_at timestamptz;

-- status gains a third value, 'scheduled', alongside 'live' and 'finished'.
-- The column is plain text with no check constraint, so there is no DDL for
-- the value itself. Existing rows keep status = 'live' (not null default).
--
-- 'scheduled' → the fixture is announced but not under way. The app shows it
--               in an Upcoming section and never renders it as live, however
--               long ago starts_at passed. Only a person moves it on: the
--               "Go live" button, or the first change to the score.
-- 'live'      → under way, score is being kept.
-- 'finished'  → played out.

-- Upcoming games are listed soonest-first, unlike live and finished games
-- which are listed by most recent activity.
create index if not exists live_games_starts_at_idx
  on public.live_games (starts_at)
  where starts_at is not null;
