import assert from "node:assert/strict";
import { test } from "node:test";
import { countWatching } from "../src/lib/useWatching.js";

test("one key is one viewer", () => {
  assert.equal(countWatching({ a: [{}] }), 1);
  assert.equal(countWatching({ a: [{}], b: [{}], c: [{}] }), 3);
});

test("nobody watching is zero, not a crash", () => {
  assert.equal(countWatching({}), 0);
});

test("a client that somehow tracked twice is still one viewer", () => {
  // Supabase keys by client, so two entries under one key is one connection.
  assert.equal(countWatching({ a: [{}, {}] }), 1);
});

test("an empty entry list does not count as a viewer", () => {
  assert.equal(countWatching({ a: [], b: [{}] }), 1);
});

test("garbage off the wire counts as nobody rather than throwing", () => {
  // This is parsed straight from a socket anyone with the link can join.
  assert.equal(countWatching(null), 0);
  assert.equal(countWatching(undefined), 0);
  assert.equal(countWatching("3"), 0);
  assert.equal(countWatching(42), 0);
  assert.equal(countWatching({ a: "not an array" }), 0);
  assert.equal(countWatching({ a: null, b: [{}] }), 1);
});

test("the payload is never read — only the number of keys", () => {
  // Nothing identifying is tracked, so nothing identifying can be counted on.
  // If this ever needs the payload, the privacy note in useWatching.js has
  // stopped being true.
  assert.equal(countWatching({ x: [{ name: "J FREW" }], y: [{}] }), 2);
});
