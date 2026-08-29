import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Catch Android Chrome install prompt and re-expose it via a custom event
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("swInstallReady", { detail: e }));
});

// Register the service worker and make sure a new deploy actually replaces the
// running bundle. The app is installed as a standalone PWA, so a phone can sit on
// one build for days: it only checks for a new worker when we ask it to, and the
// new worker only takes over when we tell it to stop waiting.
if ("serviceWorker" in navigator) {
  import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox("/sw.js");
    let updateApplied = false;

    function applyUpdate() {
      if (updateApplied) return;
      updateApplied = true;
      wb.messageSkipWaiting();
    }

    // Only reload for an update we asked for — `controlling` also fires the first
    // time the worker claims the page, and reloading there would be a pointless
    // refresh on every member's first visit.
    wb.addEventListener("controlling", () => {
      if (updateApplied) window.location.reload();
    });

    wb.addEventListener("waiting", () => {
      // Never yank the page out from under someone mid-score-entry: offer the
      // banner while they're looking, and apply it the moment they put it down.
      if (document.visibilityState === "hidden") { applyUpdate(); return; }
      window.dispatchEvent(new CustomEvent("swUpdateWaiting", { detail: { apply: applyUpdate } }));
      document.addEventListener("visibilitychange", function onHide() {
        if (document.visibilityState !== "hidden") return;
        document.removeEventListener("visibilitychange", onHide);
        applyUpdate();
      });
    });

    wb.register();

    // Ask for a newer worker on every foreground, and hourly for a session left
    // open. Without this an installed PWA can serve the old build indefinitely.
    const checkForUpdate = () => wb.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
    setInterval(checkForUpdate, 60 * 60 * 1000);
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
