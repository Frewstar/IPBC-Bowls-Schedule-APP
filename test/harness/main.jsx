import React from "react";
import { createRoot } from "react-dom/client";
// Same as src/main.jsx: theme.js reads some colours and fonts from these.
import "../../frewstar/tokens/frewstar-tokens.css";
import "../../frewstar/frewstar-brand.css";
import LiveGamesTab from "../../src/components/tabs/LiveGames.jsx";

// Who this browser context is signed in as, from the query string, so one
// build serves the marker, a watcher and a different member.
const q = new URLSearchParams(location.search);
const props = {
  myName: q.get("name") || "WATCHER",
  cloudKey: q.get("cloudkey") || null,
  myMemberId: q.get("member") || null,
  isAdmin: q.get("admin") === "1",
  setActiveTab: () => {},
  members: [],
};
createRoot(document.getElementById("root")).render(<LiveGamesTab {...props} />);
