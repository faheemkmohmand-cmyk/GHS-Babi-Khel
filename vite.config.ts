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
          "vendor-pdf":      ["jspdf", "jspdf-autotable"],
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
