import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file output so the game can be hosted as one self-contained HTML page.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: "dist", target: "es2020" },
});
