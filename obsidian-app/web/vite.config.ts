import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Konfiguracja Vite dla aplikacji w stylu Obsidian.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
