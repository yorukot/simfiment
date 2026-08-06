import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: "script-defer",
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "icons/favicon-64x64.png"],
      manifest: {
        id: "/",
        name: "Simfiment",
        short_name: "Simfiment",
        dir: "ltr",
        start_url: "/today",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#0f1113",
        theme_color: "#0f1113",
        categories: ["finance", "productivity"],
        icons: [
          {
            src: "/icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        inlineWorkboxRuntime: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health(?:\/|$)/],
      },
    }),
  ],
  build: {
    outDir: "../internal/static/dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});
