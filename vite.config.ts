import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { plausiblePlugin } from "./vite-plugin-plausible";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [
    react(),
    plausiblePlugin(),
    // ✅ VitePWA completely removed — the Service Worker was causing
    // pages to hang on refresh by serving stale/broken cached JS chunks.
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
          // PROBLEM 6 FIX: "vendor-pdf" (jspdf + jspdf-autotable, ~142 KB
          // compressed) REMOVED from manualChunks. Forcing it into a named
          // chunk made Rollup place a tiny shared helper inside it, which the
          // ENTRY chunk then statically imported — so every visitor
          // (including the homepage) modulepreloaded the whole PDF library
          // before seeing anything. Without the manual entry, Rollup keeps
          // jspdf inside the on-demand lazy-route graph (Results, dashboard,
          // admin tabs) — it only downloads when a user actually opens a
          // page that offers PDF export.
          "vendor-charts":   ["recharts"],
          "vendor-three":    ["three"],
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
