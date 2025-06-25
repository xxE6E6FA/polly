import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tsconfigPaths()],
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
      // Increase the chunk size warning limit since we're splitting more aggressively
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: id => {
            // Core vendor libraries - absolutely essential
            if (id.includes("node_modules")) {
              // React core - MUST include scheduler to avoid unstable_now errors
              if (
                id.includes("react/") ||
                id.includes("react-dom/") ||
                id.includes("scheduler/") ||
                id.includes("react-is")
              ) {
                return "react-core";
              }

              if (id.includes("react-router")) {
                return "react-router";
              }

              // Convex and auth
              if (id.includes("convex/")) {
                return "convex";
              }
              if (id.includes("@convex-dev/auth")) {
                return "convex-auth";
              }

              // Heavy markdown/code libraries
              if (
                id.includes("@llm-ui/markdown") ||
                id.includes("remark") ||
                id.includes("rehype") ||
                id.includes("unified") ||
                id.includes("micromark") ||
                id.includes("mdast") ||
                id.includes("hast")
              ) {
                return "markdown";
              }

              // Code highlighting
              if (
                id.includes("shiki") ||
                id.includes("prism") ||
                id.includes("@shikijs") ||
                id.includes("vscode-oniguruma") ||
                id.includes("vscode-textmate")
              ) {
                return "code-highlighting";
              }

              // LLM UI components
              if (id.includes("@llm-ui")) {
                return "llm-ui";
              }

              // Math rendering
              if (id.includes("katex")) {
                return "katex";
              }

              // All Radix UI components
              if (id.includes("@radix-ui")) {
                return "radix-ui";
              }

              // AI SDKs - split into separate chunks
              if (id.includes("@ai-sdk/anthropic")) {
                return "ai-anthropic";
              }
              if (id.includes("@ai-sdk/google")) {
                return "ai-google";
              }
              if (id.includes("@ai-sdk/openai")) {
                return "ai-openai";
              }
              if (id.includes("@openrouter/ai-sdk-provider")) {
                return "ai-openrouter";
              }
              if (id.includes("ai/") || id.includes("@ai-sdk/")) {
                return "ai-core";
              }

              // Analytics and monitoring
              if (id.includes("@vercel/analytics")) {
                return "analytics";
              }

              // Date utilities
              if (id.includes("date-fns")) {
                return "date-utils";
              }

              // Form/validation libraries
              if (id.includes("zod")) {
                return "zod";
              }
              if (id.includes("@hookform")) {
                return "forms";
              }

              // Large UI components
              if (id.includes("cmdk")) {
                return "command";
              }
              if (id.includes("sonner")) {
                return "toast";
              }
              if (id.includes("emoji-picker-react")) {
                return "emoji";
              }
              if (id.includes("@tanstack/react-virtual")) {
                return "virtual";
              }
              if (id.includes("@tanstack/react-query")) {
                return "query";
              }

              // Styling utilities
              if (
                id.includes("clsx") ||
                id.includes("tailwind-merge") ||
                id.includes("class-variance-authority")
              ) {
                return "style-utils";
              }

              // Auth-related libraries
              if (id.includes("@auth/core")) {
                return "auth-core";
              }

              // Icons
              if (id.includes("@phosphor-icons")) {
                return "icons";
              }

              // Crypto/Security
              if (
                id.includes("jose") ||
                id.includes("oauth") ||
                id.includes("lucia") ||
                id.includes("oslo")
              ) {
                return "crypto";
              }

              // Large dependencies
              if (id.includes("humanize-ai-lib")) {
                return "humanize-ai";
              }

              // Additional splitting for remaining large packages
              if (
                id.includes("acorn") ||
                id.includes("@babel") ||
                id.includes("postcss")
              ) {
                return "parsers";
              }

              // Split remaining vendor code by hash for consistent distribution
              // Hash the module path to distribute modules across chunks
              const hash = id
                .split("")
                .reduce((acc, char) => acc + char.charCodeAt(0), 0);
              return `vendor-${hash % 5}`; // Split into 5 vendor chunks
            }
          },
          // Optimize chunk names
          chunkFileNames: chunkInfo => {
            const facadeModuleId = chunkInfo.facadeModuleId
              ? chunkInfo.facadeModuleId
              : "unknown";
            const name =
              chunkInfo.name ||
              facadeModuleId.split("/").pop()?.split(".")[0] ||
              "chunk";
            return `assets/${name}-[hash].js`;
          },
        },
      },
      // Reduce the size of inline assets
      assetsInlineLimit: 4096,
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router",
        "react-router-dom",
        "scheduler", // Add scheduler to ensure it's pre-bundled with React
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      exclude: ["@convex-dev/auth"],
      // Force optimization of specific heavy dependencies
      force: true,
      esbuildOptions: {
        target: "es2020",
      },
    },
    // Ensure proper base path for Vercel deployment
    base: "/",
  };
});
