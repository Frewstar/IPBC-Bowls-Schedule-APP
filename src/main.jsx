import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Catch Android Chrome install prompt and re-expose it via a custom event
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("swInstallReady", { detail: e }));
});

// The service worker is registered by useRegisterSW in App.jsx, which owns the
// update banner, the update checks and the skip-waiting handshake. There used to
// be a second workbox-window registration here as well: two Workbox instances on
// the same worker, each with its own private view of the update. Whichever
// registered later could miss the `waiting` event entirely and silently never run
// its half of the update logic, so there is now exactly one registrar.

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
