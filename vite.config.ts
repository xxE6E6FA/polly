import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
      tailwindcss(),
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
      // Increased a bit because we now intentionally create a few domain chunks
      chunkSizeWarningLimit: 900,
      // Minification options
      minify: "esbuild",
      cssMinify: true,
      // Safe manual chunk strategy: keep all React core pieces together (avoid circular
      // evaluation issues that previously caused undefined hook exports), and split other
      // large independent domains for better parallel loading.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return;
            }

            // Framework (React + router + scheduler)
            if (
              /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
                id
              )
            ) {
              return "framework";
            }

            // Convex
            if (/[\\/]node_modules[\\/]convex[\\/]/.test(id)) {
              return "convex";
            }

            // Markdown / rendering toolchain
            if (
              /[\\/]node_modules[\\/](react-markdown|markdown-to-jsx|remark|rehype|katex|prism-react-renderer)[\\/]/.test(
                id
              )
            ) {
              return "markdown";
            }

            // UI libraries
            if (
              /[\\/]node_modules[\\/](?:@radix-ui|@phosphor-icons|cmdk|vaul)[\\/]/.test(
                id
              )
            ) {
              return "ui-lib";
            }

            // Styling helpers
            if (
              /[\\/]node_modules[\\/](?:clsx|class-variance-authority|tailwind-merge)[\\/]/.test(
                id
              )
            ) {
              return "styling";
            }

            // Validation
            if (/[\\/]node_modules[\\/]zod[\\/]/.test(id)) {
              return "validation";
            }

            // Date utilities
            if (/[\\/]node_modules[\\/]date-fns[\\/]/.test(id)) {
              return "date";
            }

            // Fallback vendor bucket
            return "vendor";
          },
        },
      },
    },
    // Ensure single React instance (avoid duplicated copies in chunks)
    resolve: {
      dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
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
