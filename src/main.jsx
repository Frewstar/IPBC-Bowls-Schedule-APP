import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Register SW and wire up update notification via a custom event
if ("serviceWorker" in navigator) {
  import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox("/sw.js");

    wb.addEventListener("waiting", () => {
      window.dispatchEvent(new CustomEvent("swUpdateWaiting", { detail: wb }));
    });

    wb.register();
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
