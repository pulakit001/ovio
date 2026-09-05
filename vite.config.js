import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the packaged app (loaded via file://) resolves
  // its JS/CSS correctly. Absolute "/assets/..." breaks under file://.
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
  },
});
