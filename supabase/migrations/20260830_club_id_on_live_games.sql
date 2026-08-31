-- ════════════════════════════════════════════════════════════════════════
--  club_id ON live_games
--
--  Run this after 20260722_live_games.sql.
--
--  Ledger: 20260830093855 add_club_id_tenancy_groundwork. That entry put
--  club_id on every table in the database. For all the tables the baseline
--  creates, the column is simply part of the create table there. live_games
--  is the exception: it is created by 20260722_live_games.sql, which runs
--  AFTER the baseline, so its club_id has to be added afterwards — which is
--  exactly what happened in production, five weeks later.
--
--  This file exists because the rebuild test caught its absence. Running
--  the folder end to end against an empty database produced a live_games
--  with 22 columns where production has 23, no club_id foreign key and no
--  club_id index. Nothing in the app would have failed loudly on it: the
--  column is defaulted, so the first symptom would have been live games
--  belonging to no club, found some months later.
-- ════════════════════════════════════════════════════════════════════════

alter table public.live_games
  add column if not exists club_id uuid not null
    default '61f82a8a-09cf-4385-874b-1741925bebe7'::uuid;

-- Added separately from the column: "add column ... references" would raise
-- if the column is already there, and the whole point is that this file can
-- be run against a database that already has it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_games_club_id_fkey') then
    alter table public.live_games
      add constraint live_games_club_id_fkey foreign key (club_id) references public.clubs(id);
  end if;
end $$;

create index if not exists live_games_club_id_idx on public.live_games (club_id);
