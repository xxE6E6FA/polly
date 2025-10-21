import { createRequire, Module } from "node:module";
import path from "node:path";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

const nativeRollupModule = `@rollup/rollup-${process.platform}-${process.arch}`;
let fallbackRollupPath: string | null = null;
try {
  require.resolve(nativeRollupModule);
} catch {
  try {
    fallbackRollupPath = require.resolve("rollup/dist/es/shared/node-entry.js");
  } catch {
    fallbackRollupPath = null;
  }
}

if (fallbackRollupPath) {
  const originalResolveFilename = Module._resolveFilename;
  // @ts-expect-error: using private Node API to shim missing native bindings
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === nativeRollupModule) {
      return originalResolveFilename.call(
        this,
        fallbackRollupPath,
        parent,
        isMain,
        options
      );
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

export default defineConfig({
  // Write SSR/transform cache to a stable local folder to avoid tmp cleanup races
  cacheDir: ".vite-temp",
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "@convex": path.resolve(process.cwd(), "convex"),
      "@shared": path.resolve(process.cwd(), "shared"),
      "convex/_generated": path.resolve(process.cwd(), "convex/_generated"),
    },
  },
  test: {
    // Run in a single forked process to avoid Vite SSR temp cache races
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 1,
    // Additionally, try to execute in main process if supported
    // (Vitest v3 ignores this but older flags may help in some environments)
    // @ts-expect-error legacy option
    threads: false,
    // Default to edge-runtime unless a project overrides it
    environment: "edge-runtime",
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
    projects: [
      {
        test: {
          name: "browser",
          include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          globals: true,
        },
        resolve: {
          alias: {
            "@": path.resolve(process.cwd(), "src"),
            "@convex": path.resolve(process.cwd(), "convex"),
            "@shared": path.resolve(process.cwd(), "shared"),
            "convex/_generated": path.resolve(
              process.cwd(),
              "convex/_generated"
            ),
          },
        },
      },
      {
        test: {
          name: "edge",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          setupFiles: ["./src/test/setup.ts"],
          globals: true,
        },
        resolve: {
          alias: {
            "@": path.resolve(process.cwd(), "src"),
            "@convex": path.resolve(process.cwd(), "convex"),
            "@shared": path.resolve(process.cwd(), "shared"),
            "convex/_generated": path.resolve(
              process.cwd(),
              "convex/_generated"
            ),
          },
        },
      },
    ],
  },
});
