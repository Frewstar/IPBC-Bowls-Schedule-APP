import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const realClient = path.resolve(here, "../../src/lib/supabase.js");
const mockClient = path.resolve(here, "./appSupabase.js");

const swapClient = {
  name: "swap-supabase-client",
  enforce: "pre",
  async resolveId(source, importer) {
    if (!importer || !source.includes("supabase.js")) return null;
    const resolved = path.resolve(path.dirname(importer), source);
    return resolved === realClient ? mockClient : null;
  },
};

// App.jsx imports vite-plugin-pwa's virtual module. The harness deliberately
// runs without a service worker — a cached app shell is the last thing a test
// of "what does the next startup do" needs — so stub it.
const stubPwa = {
  name: "stub-pwa-register",
  enforce: "pre",
  resolveId: id => (id === "virtual:pwa-register/react" ? "\0stub-pwa" : null),
  load: id => (id === "\0stub-pwa"
    ? "export const useRegisterSW = () => ({ offlineReady: [false, () => {}], needRefresh: [false, () => {}], updateServiceWorker: () => {} });"
    : null),
};

export default defineConfig({
  root: here,
  // __BUILD_ID__ is replaced at build time by the real config; the harness
  // needs it defined or Settings > About throws on render.
  define: { __BUILD_ID__: JSON.stringify("harness") },
  plugins: [swapClient, stubPwa, react()],
  server: { port: 4600, strictPort: true },
});
