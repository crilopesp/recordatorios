import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src"),
  clearScreen: false,
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    port: 1420,
  },
});
