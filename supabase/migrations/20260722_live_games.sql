-- ════════════════════════════════════════════════════════════════════════
--  LIVE GAMES  —  live score updates for representative / club matches
--  Run this once in the Supabase SQL editor for the app's project.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.live_games (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  title             text,                              -- occasion / competition, e.g. "Ayrshire Cup"
  home_team         text not null default 'IPBC',
  away_team         text not null default '',
  venue             text default '',                   -- 'home' | 'away' | ''
  format            text not null default 'rinks',     -- 'rinks' | 'single'
  status            text not null default 'live',      -- 'live' | 'finished'
  rinks             jsonb not null default '[]'::jsonb, -- [{ "id":"r1", "label":"Rink 1", "home":0, "away":0 }]
  home_score        integer not null default 0,        -- used when format = 'single'
  away_score        integer not null default 0,
  creator_cloudkey  text,                              -- who set the game up (NAME-PIN)
  creator_name      text,
  last_updated_by   text                               -- name of the last person to change the score
);

-- Keep results sorted with the newest activity first.
create index if not exists live_games_updated_idx on public.live_games (updated_at desc);

-- ── Access ────────────────────────────────────────────────────────────────
-- The app talks to Supabase with the publishable (anon) key, exactly like the
-- other tables in this project (members, draws, tournaments …). Edit rights are
-- enforced in the app (creator + admins only); these policies simply let the
-- anon key read/write the row like everything else.
alter table public.live_games enable row level security;

drop policy if exists "live_games public read"   on public.live_games;
drop policy if exists "live_games public insert" on public.live_games;
drop policy if exists "live_games public update" on public.live_games;
drop policy if exists "live_games public delete" on public.live_games;

create policy "live_games public read"   on public.live_games for select using (true);
create policy "live_games public insert" on public.live_games for insert with check (true);
create policy "live_games public update" on public.live_games for update using (true) with check (true);
create policy "live_games public delete" on public.live_games for delete using (true);

-- ── Realtime ──────────────────────────────────────────────────────────────
-- Stream row changes to every connected phone (this is what makes it "live").
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'live_games'
  ) then
    alter publication supabase_realtime add table public.live_games;
  end if;
end $$;
