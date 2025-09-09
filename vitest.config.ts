import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Write SSR/transform cache to a stable local folder to avoid tmp cleanup races
  cacheDir: ".vite-temp",
  plugins: [tsconfigPaths()],
  test: {
    // Run in a single forked process to avoid Vite SSR temp cache races
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 1,
    // Additionally, try to execute in main process if supported
    // (Vitest v3 ignores this but older flags may help in some environments)
    // @ts-expect-error legacy option
    threads: false,
    // Default to edge-runtime, override for browser tests below
    environment: "edge-runtime",
    // Route environments per directory (deprecated, but kept for stability per project preference)
    environmentMatchGlobs: [
      ["src/**", "jsdom"],
      ["shared/**", "jsdom"],
      ["convex/**", "edge-runtime"],
    ],
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "shared/**/*.test.{ts,tsx}",
      "convex/**/*.test.ts",
    ],
    globals: true,
    coverage: {
      provider: "v8",
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/convex/**",
        "**/convex/_generated/**",
        "**/src/test/**",
        "**/vite.config.*",
        "**/tsconfig*.json",
        "**/postcss.config.*",
        "**/tailwind.config.*",
        "**/*.config.*",
        "public/**",
        "docs/**",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
    env: {
      viteNodeCacheDir: path.resolve(".vitest-ssr-cache"),
      tmpdir: path.resolve(".tmp"),
      temp: path.resolve(".tmp"),
      tmp: path.resolve(".tmp"),
    },
  },
});
