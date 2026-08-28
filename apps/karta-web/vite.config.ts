import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// UTC timestamp injected at build time. Used as cache-bust query param on
// lazy fetches (see src/lib/version.ts). Bumps every build so the SW
// runtime cache invalidates predictably on redeploy.
const BUILD_VERSION = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "DOMOVINA Karta — Geografija Hrvatske",
        short_name: "Karta",
        description:
          "Interaktivna karta Republike Hrvatske — 556 JLS, 6759 naselja, 901 nogometni klub.",
        lang: "hr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0a0e14",
        theme_color: "#002F6C",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico}"],
        // _worker.js je Pages Advanced Mode skripta — Pages je NE servira kao
        // asset (/_worker.js = 404). Ako uđe u precache manifest, workbox
        // install padne na tom 404, SW se nikad ne aktivira i u cacheu ostaju
        // orphan revizije index.html-a. Bez ovoga: stari app shell ostaje
        // zauvijek jer novi SW ne može preuzeti.
        globIgnores: ["**/_worker.js", "**/_headers", "**/_redirects"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/data\//, /^\/logos\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/data/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "karta-data-v1",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/logos/"),
            handler: "CacheFirst",
            options: {
              cacheName: "karta-logos-v1",
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
