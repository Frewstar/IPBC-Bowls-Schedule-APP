-- ════════════════════════════════════════════════════════════════════════════
--  Irvine Park Bowling Club — content, not schema
--
--  DELIBERATELY NOT IN supabase/migrations/. That folder builds any club's
--  database; this file fills ONE club's tables. A second club running the
--  migrations must not inherit Irvine Park's fixture card, so this is applied
--  by hand against this club's project and registers nothing in the ledger.
--
--  WHY IT EXISTS
--  Track 0 removed the hardcoded FIXTURES and HONORARY_MEMBERS that shipped in
--  the client bundle. Those constants had been standing in for the database
--  since June: production holds ONE club_fixtures row and ZERO club_config
--  rows, so deploying Track 0 first would have taken the Fixtures tab from 34
--  fixtures to 1 and emptied the honorary members list. This puts Irvine Park's
--  own content where it should always have lived, so the client can stop
--  carrying it.
--
--  SOURCE
--  Recovered from commit e3c3503 (the commit before Track 0):
--    src/lib/constants.js          FIXTURES           -> public.club_fixtures
--    src/components/tabs/Club.jsx  HONORARY_MEMBERS   -> public.club_config
--  Dates converted from JavaScript's 0-indexed months: new Date(2026, 3, 18)
--  is 18 APRIL 2026, not 18 March.
--
--  NOT SEEDED HERE: tournaments and roll_of_honour. Production already holds
--  30 and 18, both richer than the bundle's 23 and 10.
--
--  IDEMPOTENT. Safe to re-run: every statement is ON CONFLICT DO NOTHING
--  against the live unique keys, so a second run changes nothing.
--    club_fixtures : unique (event_date, lower(event))  [club_fixtures_no_dupes]
--    club_config   : primary key (key)
--
--  club_id is never named. Both tables default it to Irvine Park's id, which
--  is the standing rule: club_id is derived, never passed.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. The 2026 fixture card ────────────────────────────────────────────────
-- sort_order is chronological and matters: App.jsx reads club_fixtures with
-- .order("sort_order") and NO date tiebreak, and Fixtures.jsx takes the "Next
-- Fixture" hero card from upcoming[0] — the first row in query order. Rows all
-- sharing the default 99 would render the season in arbitrary order.
-- Numbered in tens so a fixture can be slotted between two without a renumber.
insert into public.club_fixtures (event_date, event, "time", venue, rinks, sort_order)
values
  ('2026-04-18'::date, 'Opening Day', '2.00pm', 'home', null, 10),
  ('2026-05-02'::date, 'Ladies/Gents', '2.00pm', 'home', null, 20),
  ('2026-05-08'::date, 'Gents Trials', '6.30pm', 'home', null, 30),
  ('2026-05-09'::date, 'Camphill BC', '1.00pm', 'away', null, 40),
  ('2026-05-10'::date, 'Margaret/Donald Memorial', '11.00am', 'home', null, 50),
  ('2026-05-16'::date, 'GWC Open Fours', '9.30am', 'home', null, 60),
  ('2026-05-17'::date, 'GWC Open Fours Finals', '11.00am', 'home', null, 70),
  ('2026-05-22'::date, 'Gents Trial', '6.30pm', 'home', null, 80),
  ('2026-05-23'::date, 'Saltcoats BC', '1.30pm', 'home', 6, 90),
  ('2026-05-31'::date, 'Mixed Triples', '11.00am', 'home', null, 100),
  ('2026-06-03'::date, 'Gold/Silver Bowl', '1.30pm', 'home', 2, 110),
  ('2026-06-05'::date, 'Gents Trials', '6.30pm', 'home', null, 120),
  ('2026-06-12'::date, 'Gents Trials', '6.30pm', 'home', null, 130),
  ('2026-06-13'::date, '149 BC', '2.00pm', 'home', null, 140),
  ('2026-06-14'::date, 'Albert Hall', '11.00am', 'home', null, 150),
  ('2026-06-20'::date, 'Ayrshire Cup', '1.00pm', 'away', 4, 160),
  ('2026-06-27'::date, 'Open Pairs', '10.00am', 'home', null, 170),
  ('2026-07-03'::date, 'Glasgow/Ayrshire', '9.30am', 'home', 6, 180),
  ('2026-07-10'::date, 'Gents Trials', '6.30pm', 'home', null, 190),
  ('2026-07-11'::date, 'Gents 2 Bowl Pairs', '12.00pm', 'home', null, 200),
  ('2026-07-24'::date, 'Gents Trials', '6.30pm', 'home', null, 210),
  ('2026-07-25'::date, 'Past Presidents', '1.30pm', 'home', null, 220),
  ('2026-07-31'::date, 'Gents Trials', '6.30pm', 'home', null, 230),
  ('2026-08-01'::date, 'Bellahouston BC', '1.00pm', 'away', 6, 240),
  ('2026-08-08'::date, 'Stonehouse BC', '1.30pm', 'home', 5, 250),
  ('2026-08-15'::date, 'Open Triples', '9.30am', 'home', null, 260),
  ('2026-08-28'::date, 'Championship Final', '5.30pm', 'home', 2, 270),
  ('2026-08-29'::date, 'Finals Weekend', '12.00pm', 'home', null, 280),
  ('2026-08-30'::date, 'Finals Weekend', '12.00pm', 'home', null, 290),
  ('2026-09-02'::date, 'Charity Day', '2.00pm', 'home', null, 300),
  ('2026-09-05'::date, 'Ruth McNab Pairs', '9.30am', 'home', null, 310),
  ('2026-09-11'::date, 'Gents Trials', '6.30pm', 'home', null, 320),
  ('2026-09-12'::date, 'Ladies/Gents', '1.30pm', 'home', null, 330),
  ('2026-09-26'::date, 'Closing Day', '1.30pm', 'home', null, 350)
on conflict (event_date, lower(event)) do nothing;

-- The one row that was already live (19 Sep, Glasgow Ayrshire Presentation)
-- carries the default sort_order of 99, which would drop it after Closing Day
-- on 26 Sep. Only its position changes; its content is untouched.
update public.club_fixtures
   set sort_order = 340
 where event_date = '2026-09-19'::date
   and lower(event) = lower('Glasgow Ayrshire Presentation')
   and sort_order = 99;

-- ── 2. Honorary members ─────────────────────────────────────────────────────
-- One row, keyed 'honorary_members'. The client reads it with
-- .eq("key","honorary_members").maybeSingle() and uses .value directly as an
-- array of strings, so the jsonb must be a bare array — not an object wrapping
-- one.
insert into public.club_config (key, value)
values ('honorary_members', '["T. Shields","K. Houston","W. Reid","J B Muir"]'::jsonb)
on conflict (key) do nothing;

commit;
