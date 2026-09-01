import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Which build is this?
  //
  // Three rounds of debugging the sign-out flow were spent on the question,
  // because the service worker in main.jsx deliberately does NOT apply a new
  // build on reload while the page is visible — it waits until the tab is
  // hidden, so that nobody gets yanked out of the app mid-score-entry. That
  // is right for members and it means a tester pressing F5 after a deploy is
  // very often still running the previous bundle.
  //
  // So the build says who it is, in Settings > About. Vercel and Netlify both
  // put the commit in the environment; git is the fallback for a local build.
  define: {
    __BUILD_ID__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || (() => {
        try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return ""; }
      })()).slice(0, 7) || "dev"
    ),
  },

  plugins: [
    react(),
    VitePWA({
      // main.jsx registers the worker itself so it can drive the update banner.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["ipbc-badge.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png", "apple-touch-icon.png", "favicon-32.png"],
      manifest: {
        name: "Irvine Park Bowling Club",
        short_name: "IPBC Bowls",
        description: "Tournament draws, results and member directory for Irvine Park Bowling Club",
        theme_color: "#4a0e1f",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Drop the previous build's precache on activate, so an updated worker can
        // never keep serving the old bundle out of a leftover cache.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: "index.html",
        // /api/* is answered by a serverless function, never by the app
        // shell. Without this the installed PWA would hand its cached
        // index.html to the Open Graph share route and the crawler would
        // never reach it.
        //
        // /e/<id> is deliberately NOT in the denylist: it is a navigation a
        // member should be able to follow with the app installed and no
        // signal. The shell answers it and App.jsx reads the id straight off
        // the path, so the link works whether it is served by Vercel or by
        // the worker.
        navigateFallbackDenylist: [/^\/api\//],
        // There used to be a catch-all `/^https:\/\//` NetworkFirst rule here with a
        // 7-day expiry. It cached the navigation request (so a stale index.html could
        // point at assets that had already been cleaned up) and every Supabase read
        // (so a flaky connection could answer sign-in with a week-old view of
        // player_data, and make a registered member look unregistered). App assets are
        // precached above and Supabase must always hit the network, so only the web
        // fonts are cached at runtime.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "ipbc-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
