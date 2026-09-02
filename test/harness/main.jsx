import React from "react";
import { createRoot } from "react-dom/client";
import LiveGamesTab from "../../src/components/tabs/LiveGames.jsx";

// A roster big enough to fill both sides of a rinks game twice over. The names
// are the shape the real directory uses — surname-led, upper case.
const ROSTER = [
  "L BROWN", "C MCCLEAN", "MADGE WILLIAMSON", "L MAIR", "N POLLOCK",
  "S COUSER", "L HART", "J LAW", "W BROWN", "M BURNS", "T SMITH", "J FREW",
].map((name, i) => ({ id: `m${i + 1}`, name }));

// Who this browser context is signed in as, from the query string, so one
// build serves the marker, a watcher and a different member.
const q = new URLSearchParams(location.search);
const props = {
  myName: q.get("name") || "WATCHER",
  cloudKey: q.get("cloudkey") || null,
  myMemberId: q.get("member") || null,
  isAdmin: q.get("admin") === "1",
  setActiveTab: () => {},
  members: ROSTER,
};
createRoot(document.getElementById("root")).render(<LiveGamesTab {...props} />);
