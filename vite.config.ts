import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "./convex"),
      "@shared": path.resolve(__dirname, "./shared"),
      "convex/_generated": path.resolve(__dirname, "./convex/_generated"),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // HEIC conversion (lazy loaded, keep separate)
            if (id.includes("/heic2any/")) {
              return "heic2any";
            }
            // AI SDK (check before /ai/ to avoid false matches)
            if (id.includes("/@ai-sdk/") || id.includes("/node_modules/ai/")) {
              return "vendor-ai";
            }
            // Convex
            if (id.includes("/convex/") || id.includes("/@convex-dev/")) {
              return "vendor-convex";
            }
            // LLM UI
            if (id.includes("/@llm-ui/")) {
              return "vendor-llm-ui";
            }
            // Prism syntax highlighting
            if (id.includes("/prism-react-renderer/")) {
              return "vendor-prism";
            }
            // Base UI components
            if (
              id.includes("/@base-ui-components/") ||
              id.includes("/cmdk/") ||
              id.includes("/sonner/") ||
              id.includes("/vaul/")
            ) {
              return "vendor-ui";
            }
            // Animation
            if (id.includes("/framer-motion/") || id.includes("/motion/")) {
              return "vendor-motion";
            }
            // Icons
            if (id.includes("/@phosphor-icons/")) {
              return "vendor-icons";
            }
            // Virtualization
            if (id.includes("/react-virtuoso/")) {
              return "vendor-virtuoso";
            }
            // React Router (separate from core React)
            if (id.includes("/react-router")) {
              return "vendor-router";
            }
            // Core React (more specific patterns)
            if (
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/scheduler/")
            ) {
              return "vendor-react";
            }
            // Markdown/LaTeX processing
            if (
              id.includes("/katex/") ||
              id.includes("/markdown-to-jsx/") ||
              id.includes("/remark") ||
              id.includes("/rehype") ||
              id.includes("/unified/") ||
              id.includes("/micromark/") ||
              id.includes("/mdast")
            ) {
              return "vendor-markdown";
            }
            // Remaining node_modules
            return "vendor-misc";
          }
        },
      },
    },
  },
});
