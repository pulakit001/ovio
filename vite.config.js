import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file output: the whole app inlines into dist/index.html. Required
// because the packaged app loads over file:// — external chunk files + module
// scripts are an all-or-nothing failure mode on strict file:// origins. With
// one file, loading is atomic: the app appears or the window is empty —
// nothing in between.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  publicDir: "public", // copied verbatim (logo.png for the favicon)
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    // Public-dir files must stay real files (referenced by URL from index.html)
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
