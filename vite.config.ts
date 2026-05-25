import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),

    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.svg",
        "favicon-16.png",
        "favicon-32.png",
        "apple-touch-icon.png",
        "og-image.jpg",
      ],
      manifest: false,
      workbox: {
        // ✅ FIX: Only precache HTML and critical assets.
        // JS/CSS chunks are NOT precached — they are fetched fresh on load.
        // This prevents the "stuck spinner on refresh" bug where the SW
        // served a stale/mismatched chunk after a new deploy.
        globPatterns: ["**/*.{html,ico,png,svg,woff2}"],

        // ✅ FIX: JS and CSS chunks must ALWAYS come from network first.
        // If network fails, fall back to cache. This ensures refreshes
        // always get the latest code, not a stale SW-cached version.
        runtimeCaching: [
          {
            // JS and CSS chunks — NetworkFirst so refresh always works
            urlPattern: /\/assets\/.*\.(js|css)$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "js-css-chunks",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Supabase REST API — NetworkFirst
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            // Cloudinary images
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "cloudinary-images",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // OpenWeatherMap
            urlPattern: /^https:\/\/api\.openweathermap\.org\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "weather-api",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),

  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },

  build: {
    target: "es2020",
    minify: "esbuild",
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":    ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query":    ["@tanstack/react-query"],
          "vendor-motion":   ["framer-motion"],
          "vendor-ui":       ["lucide-react", "react-hot-toast"],
          "vendor-utils":    ["date-fns", "clsx", "tailwind-merge"],
          "vendor-xlsx":     ["xlsx"],
          "vendor-pdf":      ["jspdf", "jspdf-autotable"],
          "vendor-charts":   ["recharts"],
        },
        chunkFileNames:  "assets/[name]-[hash].js",
        entryFileNames:  "assets/[name]-[hash].js",
        assetFileNames:  "assets/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: mode === "development",
    reportCompressedSize: true,
  },
}));
