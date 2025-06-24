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
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor libraries
            vendor: ["react", "react-dom", "react-router", "react-router-dom"],
            // UI libraries
            ui: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-popover",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-select",
              "@radix-ui/react-switch",
            ],
            // AI and utility libraries
            ai: [
              "ai",
              "@ai-sdk/openai",
              "@ai-sdk/anthropic",
              "@ai-sdk/google",
              "@openrouter/ai-sdk-provider",
            ],
            // Markdown and code highlighting
            markdown: [
              "react-markdown",
              "remark-gfm",
              "remark-math",
              "rehype-katex",
              "prism-react-renderer",
              "shiki",
            ],
            // Convex
            convex: ["convex", "@convex-dev/auth"],
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router", "react-router-dom"],
    },
  };
});
