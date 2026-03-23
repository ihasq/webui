import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/sw/index.ts"),
      name: "ServiceWorker",
      formats: ["iife"],
      fileName: () => "sw.js",
    },
    outDir: "dist-sw",
    emptyOutDir: true,
    minify: true,
    rolldownOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
