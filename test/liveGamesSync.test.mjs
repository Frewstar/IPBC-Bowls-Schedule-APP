import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEvent, mergeFetched, canScore, sameList, rowTime } from "../src/lib/liveGamesSync.js";

const T = (s) => new Date(Date.UTC(2026, 7, 31, 17, 0, s)).toISOString();
const g = (id, secs, extra = {}) => ({ id, updated_at: T(secs), home_score: secs, ...extra });

// ── applyEvent: UPDATE ────────────────────────────────────────────────────
test("UPDATE replaces the row and keeps the rest", () => {
  const before = [g("a", 1), g("b", 1)];
  const after = applyEvent(before, { eventType: "UPDATE", new: g("a", 9) });
  assert.equal(after.find(x => x.id === "a").home_score, 9);
  assert.equal(after.find(x => x.id === "b").home_score, 1);
  assert.equal(after.length, 2);
});

test("an UPDATE older than what we hold is ignored — out-of-order delivery", () => {
  const before = [g("a", 9)];
  const after = applyEvent(before, { eventType: "UPDATE", new: g("a", 4) });
  assert.equal(after, before, "same array reference, no re-render");
  assert.equal(after[0].home_score, 9);
});

test("an UPDATE at the same instant wins — our own write echoing back", () => {
  const mine = g("a", 5, { optimistic: true });
  const after = applyEvent([mine], { eventType: "UPDATE", new: g("a", 5) });
  assert.equal(after[0].optimistic, undefined, "server's row replaces the optimistic copy");
});

test("INSERT of a game we have never seen is added", () => {
  const after = applyEvent([g("a", 1)], { eventType: "INSERT", new: g("z", 2) });
  assert.equal(after.length, 2);
  assert.equal(after[0].id, "z");
});

// ── applyEvent: DELETE, the replica-identity trap ─────────────────────────
test("DELETE works with a PK-ONLY old record (REPLICA IDENTITY DEFAULT)", () => {
  const before = [g("a", 1), g("b", 1)];
  // This is all Postgres sends: no updated_at, no scores, no status.
  const after = applyEvent(before, { eventType: "DELETE", old: { id: "a" } });
  assert.deepEqual(after.map(x => x.id), ["b"]);
});

test("DELETE with no id at all changes nothing rather than emptying the list", () => {
  const before = [g("a", 1)];
  assert.equal(applyEvent(before, { eventType: "DELETE", old: {} }), before);
  assert.equal(applyEvent(before, { eventType: "DELETE" }), before);
});

test("DELETE of a game we do not hold is a no-op, same reference", () => {
  const before = [g("a", 1)];
  assert.equal(applyEvent(before, { eventType: "DELETE", old: { id: "gone" } }), before);
});

test("a malformed payload never throws and never loses rows", () => {
  const before = [g("a", 1)];
  assert.equal(applyEvent(before, null), before);
  assert.equal(applyEvent(before, { eventType: "UPDATE", new: null }), before);
  assert.equal(applyEvent(before, { eventType: "UPDATE", new: {} }), before);
});

// ── mergeFetched: the poll backstop ───────────────────────────────────────
test("the poll brings a missed change in — the actual reported bug", () => {
  const stale = [g("a", 6)];                       // phone stuck on 6
  const server = [g("a", 9)];                      // database at 9
  const after = mergeFetched(stale, server, Date.now());
  assert.equal(after[0].home_score, 9);
});

test("a poll in flight does NOT undo the marker's own tap", () => {
  const sentAt = Date.now();
  // Marker taps: local row is newer than anything the server can have.
  const local = [{ id: "a", updated_at: new Date(sentAt + 1000).toISOString(), home_score: 7 }];
  const serverStillOld = [{ id: "a", updated_at: new Date(sentAt - 5000).toISOString(), home_score: 6 }];
  const after = mergeFetched(local, serverStillOld, sentAt);
  assert.equal(after[0].home_score, 7, "the +1 must not snap back to 6");
});

test("a game deleted on the server is dropped by the poll", () => {
  const after = mergeFetched([g("a", 1), g("b", 1)], [g("b", 1)], Date.now());
  assert.deepEqual(after.map(x => x.id), ["b"]);
});

test("a game created after the poll went out is NOT dropped by that poll", () => {
  const sentAt = Date.now();
  const justCreated = { id: "new", updated_at: new Date(sentAt + 500).toISOString() };
  const after = mergeFetched([justCreated], [], sentAt);
  assert.deepEqual(after.map(x => x.id), ["new"], "creator must not watch their own game vanish");
});

test("a poll that changed nothing returns an equal list, so the tab does not re-render", () => {
  const rows = [g("a", 1), g("b", 2)];
  const after = mergeFetched(rows, [rows[0], rows[1]], Date.now());
  assert.ok(sameList(rows, after));
});

test("new rows from the server are added", () => {
  const after = mergeFetched([g("a", 1)], [g("a", 1), g("new", 3)], Date.now());
  assert.equal(after.length, 2);
  assert.ok(after.some(x => x.id === "new"));
});

// ── rowTime ───────────────────────────────────────────────────────────────
test("a row with no or bad updated_at sorts oldest and never wins", () => {
  assert.equal(rowTime({}), 0);
  assert.equal(rowTime({ updated_at: "not a date" }), 0);
  const before = [g("a", 5)];
  assert.equal(applyEvent(before, { eventType: "UPDATE", new: { id: "a" } }), before);
});

// ── canScore ──────────────────────────────────────────────────────────────
const ME = "member-1", MY_KEY = "J FREW-1234";

test("the creator scores by member id", () => {
  assert.equal(canScore({ creator_member_id: ME }, { memberId: ME, cloudKey: null, isAdmin: false }), true);
});

test("somebody else does not", () => {
  assert.equal(canScore({ creator_member_id: ME }, { memberId: "member-2", cloudKey: MY_KEY, isAdmin: false }), false);
});

test("an admin always can", () => {
  assert.equal(canScore({ creator_member_id: ME }, { memberId: null, cloudKey: null, isAdmin: true }), true);
});

test("a game from before this shipped still works for its marker — the fallback", () => {
  const old = { creator_cloudkey: MY_KEY };
  assert.equal(canScore(old, { memberId: null, cloudKey: MY_KEY, isAdmin: false }), true);
  assert.equal(canScore(old, { memberId: null, cloudKey: "SOMEONE-9999", isAdmin: false }), false);
});

test("member id wins outright — a stale cloudkey on the same row grants nothing", () => {
  const row = { creator_member_id: ME, creator_cloudkey: MY_KEY };
  assert.equal(canScore(row, { memberId: "member-2", cloudKey: MY_KEY, isAdmin: false }), false,
    "once a row has a member id the old credential must stop being an answer");
});

test("a game with neither key is admin-only, and nulls never match", () => {
  assert.equal(canScore({}, { memberId: null, cloudKey: null, isAdmin: false }), false);
  assert.equal(canScore({ creator_member_id: null }, { memberId: null, cloudKey: null, isAdmin: false }), false);
  assert.equal(canScore(null, { memberId: ME, cloudKey: MY_KEY, isAdmin: true }), false);
});
