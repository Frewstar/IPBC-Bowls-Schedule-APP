import React from "react";
import { createRoot } from "react-dom/client";
// Same as src/main.jsx: theme.js reads some colours and fonts from these.
import "../../frewstar/tokens/frewstar-tokens.css";
import "../../frewstar/frewstar-brand.css";
import App from "../../src/App.jsx";

// The real App, with only the Supabase client swapped. No service worker:
// main.jsx registers one, and a cached shell is the last thing a test of
// "what does the next startup do" needs.
createRoot(document.getElementById("root")).render(<App />);
