import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.jsx";

// The real App, with only the Supabase client swapped. No service worker:
// main.jsx registers one, and a cached shell is the last thing a test of
// "what does the next startup do" needs.
createRoot(document.getElementById("root")).render(<App />);
