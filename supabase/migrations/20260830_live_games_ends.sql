-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  games played over a set number of ends
--  Run this once in the Supabase SQL editor.
--
--  Singles is normally played to 21 shots. Pairs, triples and rinks are
--  usually played over a fixed number of ends — "best of 15" — and the
--  scoreboard needs to show how far through the game is, not just the shots.
-- ════════════════════════════════════════════════════════════════════════

-- How many ends the game is played over. Null means it isn't limited by ends
-- (play to 21 shots), which is what every game created before this migration
-- is, and what the app assumes when the column is empty.
alter table public.live_games add column if not exists ends_total integer;

-- How many have been played so far. Always present so the scoreboard never has
-- to guard against null when it counts up.
alter table public.live_games add column if not exists ends_played integer not null default 0;

-- Guard against a typo putting the game at end 40 of 15, or at a negative end.
alter table public.live_games drop constraint if exists live_games_ends_sane;
alter table public.live_games add constraint live_games_ends_sane check (
  (ends_total is null or ends_total between 1 and 30)
  and ends_played >= 0
  and (ends_total is null or ends_played <= ends_total)
);
