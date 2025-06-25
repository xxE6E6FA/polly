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
      rollupOptions: {
        output: {
          manualChunks: {
            // Only manually chunk the largest/most important dependencies
            "react-vendor": [
              "react",
              "react-dom",
              "react-router",
              "react-router-dom",
            ],
            editor: [
              "@llm-ui/react",
              "@llm-ui/markdown",
              "@llm-ui/code",
              "shiki",
              "prism-react-renderer",
            ],
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom", "react-router"],
      exclude: ["@convex-dev/auth"],
    },
    // Ensure proper base path for Vercel deployment
    base: "/",
  };
});
