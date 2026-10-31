import { defineConfig } from "vite";

export default defineConfig({
  // relative base: the build works at any sub-path (GitHub Pages serves it at /try-ghost/)
  base: "./",
  server: { host: true, port: 5190, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
