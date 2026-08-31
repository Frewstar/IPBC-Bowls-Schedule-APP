import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const realClient = path.resolve(here, "../../src/lib/supabase.js");
const mockClient = path.resolve(here, "./mockSupabase.js");

// Swap the Supabase client for the mock, and only that. Everything else —
// LiveGames.jsx, useLiveGames.js, liveGamesSync.js — is the shipping code.
const swapClient = {
  name: "swap-supabase-client",
  enforce: "pre",
  async resolveId(source, importer) {
    if (!importer || !source.includes("supabase.js")) return null;
    const resolved = path.resolve(path.dirname(importer), source);
    return resolved === realClient ? mockClient : null;
  },
};

export default defineConfig({
  root: here,
  plugins: [swapClient, react()],
  server: { port: 4598, strictPort: true },
});
