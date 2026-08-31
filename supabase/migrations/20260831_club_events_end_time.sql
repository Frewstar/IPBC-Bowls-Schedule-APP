-- ════════════════════════════════════════════════════════════════════════
--  CLUB EVENTS  —  the time it finishes, as well as the time it starts
--  Run this once in the Supabase SQL editor (after 20260830_club_events.sql).
--
--  Every flyer the club puts out advertises a window, not a start: the
--  Sunday karaoke is "4-9", the Christmas do is "4-8PM". With only a start
--  time the app says "Karaoke, 4pm" and leaves a member guessing whether
--  it is worth turning up at seven.
-- ════════════════════════════════════════════════════════════════════════

-- Text, in the same 24-hour "HH:MM" form as start_time, for the same reason:
-- it is a time on the clock on the wall, not an instant. See the comment on
-- event_date in 20260830_club_events.sql — the clocks change inside the
-- season and 8pm has to stay 8pm either side of it.
--
-- Null means the finish isn't advertised, which is most one-off nights and
-- every event created before this migration.
alter table public.club_events add column if not exists end_time text;

-- Same format guard as start_time, so a typo can't put "9" or "9pm" in a
-- column the app parses as HH:MM.
alter table public.club_events drop constraint if exists club_events_end_time_format;
alter table public.club_events add constraint club_events_end_time_format check (
  end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- Deliberately NO constraint that end_time must be later than start_time.
-- A band on until midnight finishes at 00:00 and a late night at 01:00, both
-- of which sort before an 8pm start. These are wall-clock times with no date
-- attached, so "later" is not a comparison this column can make. Requiring
-- end > start would reject exactly the nights that run latest.
