-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  add discipline, location and player selections
--  Run this once in the Supabase SQL editor (after 20260722_live_games.sql).
-- ════════════════════════════════════════════════════════════════════════

-- What kind of game: 'singles' | 'pairs' | 'triples' | 'rinks' | 'team'
alter table public.live_games add column if not exists discipline text not null default 'team';

-- Where it's being played (free text — e.g. "Saltcoats BC, Ardrossan").
alter table public.live_games add column if not exists location text default '';

-- Who's playing (arrays of member names), e.g. ["A FREW", "T SMITH"].
alter table public.live_games add column if not exists home_players jsonb not null default '[]'::jsonb;
alter table public.live_games add column if not exists away_players jsonb not null default '[]'::jsonb;
