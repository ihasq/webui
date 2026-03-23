import { defineConfig } from "vite";
import path from "path";

// Polyfill for ReadableStream.from() - injected at very beginning of bundle
// Must be lazy (use pull, not start) to match native behavior
const readableStreamPolyfill = `
(function() {
  if (typeof ReadableStream.from !== "function") {
    ReadableStream.from = function(asyncIterable) {
      var iterator = asyncIterable[Symbol.asyncIterator]
        ? asyncIterable[Symbol.asyncIterator]()
        : asyncIterable[Symbol.iterator]();
      return new ReadableStream({
        async pull(controller) {
          var result = await iterator.next();
          if (result.done) {
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        },
        async cancel(reason) {
          if (typeof iterator.return === "function") {
            await iterator.return(reason);
          }
        }
      });
    };
  }
})();
`;

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
        banner: readableStreamPolyfill,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
