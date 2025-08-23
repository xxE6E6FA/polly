import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tsconfigPaths(),
      // Bundle analyzer - only in build mode
      mode === "production" &&
        visualizer({
          filename: "dist/bundle-analysis.html",
          open: false,
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),
    server: {
      port: 3000,
      host: true,
    },
    define: {
      global: "globalThis",
      // Explicitly define environment variables for the client
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(env.VITE_CONVEX_URL),
    },
    build: {
      reportCompressedSize: true,
      sourcemap: false,
      // Set reasonable chunk size warning threshold
      chunkSizeWarningLimit: 800,
      // Minification options
      minify: "esbuild",
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: id => {
            // Vendor chunks
            if (id.includes("node_modules")) {
              // Split React ecosystem into smaller chunks
              if (id.includes("react-dom")) {
                return "react-dom";
              }
              if (id.includes("react-router")) {
                return "react-router";
              }
              if (id.includes("/react/") && !id.includes("react-")) {
                return "react";
              }

              // AI/LLM libraries - split further
              if (id.includes("@llm-ui")) {
                return "llm-ui";
              }
              if (
                id.includes("prism-react-renderer") ||
                id.includes("katex") ||
                id.includes("rehype") ||
                id.includes("remark")
              ) {
                return "markdown";
              }

              // UI libraries - split Radix from icons
              if (id.includes("@radix-ui")) {
                return "radix-ui";
              }
              if (id.includes("@phosphor-icons")) {
                return "icons";
              }
              if (id.includes("cmdk") || id.includes("vaul")) {
                return "ui-misc";
              }

              // AI SDKs - split by provider
              if (id.includes("@ai-sdk")) {
                return "ai-sdk-core";
              }
              if (id.includes("@anthropic") || id.includes("@openrouter")) {
                return "ai-providers";
              }
              if (id.includes("replicate")) {
                return "ai-misc";
              }

              // Convex
              if (id.includes("convex")) {
                return "convex";
              }

              // Utilities - split into smaller groups
              if (id.includes("zod")) {
                return "validation";
              }
              if (id.includes("date-fns")) {
                return "date";
              }
              if (
                id.includes("clsx") ||
                id.includes("class-variance-authority") ||
                id.includes("tailwind-merge")
              ) {
                return "styling";
              }

              // Everything else
              return "vendor";
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom", "react-router"],
      exclude: ["@convex-dev/auth"],
    },
    esbuild: {
      // Remove unused code
      treeShaking: true,
      // Remove console logs in production
      ...(mode === "production" && {
        drop: ["console", "debugger"],
      }),
    },
    // Ensure proper base path for Vercel deployment
    base: "/",
  };
});
