-- ════════════════════════════════════════════════════════════════════════
--  live_games.creator_member_id  —  the sign-in PIN comes out of a table
--                                   that is deliberately shared by link
--
--  Run this after 20260722_live_games.sql (which creates the table) and
--  after the baseline (which creates members).
--
--  THE PROBLEM
--  live_games.creator_cloudkey holds "NAME-PIN" — the credential a member
--  signs in with — in a table with `using (true)` on all four operations
--  and a share button that puts its rows in front of anyone with the link.
--  2 of 3 rows carried one when this was written, and it accrues one per
--  game for as long as it is left alone.
--
--  WHY THE DATABASE COULD NOT JUST NULL THE COLUMN
--  LiveGames.jsx decides who may score with
--    creator_cloudkey === cloudKey || isAdmin
--  so emptying the column takes the +1 buttons off the marker's phone
--  mid-game. The client has to learn a new key first. This migration adds
--  that key; the client change ships with it.
--
--  ── A CORRECTION TO THE BRIEF ───────────────────────────────────────────
--  This was specified as `creator_member_id uuid references members(id)`.
--  It is TEXT here, because members.id is text:
--
--    members.id  text  primary key  default (gen_random_uuid())::text
--
--  A uuid column cannot carry a foreign key to a text column — Postgres
--  refuses the constraint outright, so the migration as specified would
--  not have applied at all. The values are uuids in shape; the column
--  they point at is simply typed text, and matching it is what makes the
--  reference legal. Worth knowing before the same assumption is made
--  about members.id somewhere else: draw_pairings, member_claim_requests
--  and phone_change_requests all reference members by text too.
-- ════════════════════════════════════════════════════════════════════════


-- ── The column ────────────────────────────────────────────────────────────
alter table public.live_games
  add column if not exists creator_member_id text;

-- Added separately from the column, so this file is safe to re-run against a
-- database that already has it: "add column ... references" raises when the
-- column is already there.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_games_creator_member_id_fkey') then
    alter table public.live_games
      add constraint live_games_creator_member_id_fkey
      foreign key (creator_member_id) references public.members(id);
  end if;
end $$;

comment on column public.live_games.creator_member_id is
  'The roster entry of whoever set the game up, replacing creator_cloudkey. A member id is not a secret; creator_cloudkey was. Deliberately NOT indexed: the table holds single figures of rows and is never queried by creator.';


-- ── Backfill ──────────────────────────────────────────────────────────────
-- Row-driven, not value-driven: it joins live_games to members on a column
-- both already carry, and names no id and no person. On a new club's empty
-- database it matches nothing and does nothing, which is why a backfill of
-- this shape belongs in the migration folder where a data repair does not.
update public.live_games lg
   set creator_member_id = m.id
  from public.members m
 where m.linked_cloudkey = lg.creator_cloudkey
   and lg.creator_cloudkey is not null
   and lg.creator_member_id is null;


-- ── And the credential goes, on finished games only ───────────────────────
-- FINISHED only, and this is the whole of the caution in this file. A live or
-- scheduled game may be being scored right now by a phone running the old
-- bundle, which still reads creator_cloudkey and nothing else; clearing it
-- would take the buttons away mid-game. Those rows keep their cloudkey until
-- the client fallback is removed in a later PR.
--
-- Note this clears the column whether or not the backfill found a member for
-- that row. A finished game needs no marker: reopening it is an admin action,
-- and the alternative is leaving a live credential in a public table because
-- its owner never linked their roster entry. Removing the credential wins.
update public.live_games
   set creator_cloudkey = null
 where status = 'finished'
   and creator_cloudkey is not null;


-- ── What this does and does not buy ───────────────────────────────────────
-- The permission check the client now makes —
--   creator_member_id === myMemberId || isAdmin
-- — is ADVISORY, and it is worth being plain that it always was. live_games
-- carries `using (true)` on select, insert, update and delete, so anyone
-- holding the publishable key out of the JavaScript bundle can update any
-- game whatever the client believes about them. Swapping a credential for a
-- member id loses no security that existed; it removes a password from a
-- table built to be shared.
--
-- The real fix is an RPC — bowls_update_live_game(name, pin, game_id, patch)
-- — verifying the PIN against player_data.pin_hash and the caller against
-- creator, assigned scorers and admins, with the table's write policies then
-- closed to anon. That belongs with the assigned-scorers work and is
-- deliberately not built here.
--
-- creator_cloudkey is NOT dropped in this migration. It goes when no bundle
-- in the field still reads it — the same client-first ordering as everything
-- else in this folder.
