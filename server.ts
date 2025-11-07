import { $, build, serve } from "bun";
import { existsSync, statSync, watch } from "fs";
import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
const isDev = process.env.NODE_ENV !== "production";
const skipInitialBuild = process.env.SKIP_INITIAL_BUILD === "true";
const convexUrl = process.env.VITE_CONVEX_URL || "";

async function copyPublicDir(src: string, dest: string) {
  if (!existsSync(src)) {
    return;
  }

  const entries = await readdir(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyPublicDir(srcPath, destPath);
    } else if (stat.isFile()) {
      await Bun.write(destPath, Bun.file(srcPath));
    }
  }
}

// Build for development
const buildDev = async () => {
  const distDir = join(process.cwd(), "dist");

  // Clean previous build files to prevent accumulation
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true });
  }

  await mkdir(distDir, { recursive: true });

  // Build JS with optimized Bun bundler settings
  const result = await build({
    entrypoints: ["./src/entry.client.tsx"],
    outdir: "./dist",
    target: "browser",
    format: "esm",
    splitting: true, // Enable code splitting for better caching
    minify: {
      whitespace: false,
      syntax: true,
      identifiers: false, // Keep readable names in dev
    },
    sourcemap: "linked", // External sourcemaps for better performance
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
      "import.meta.env.PROD": JSON.stringify(false),
      "import.meta.env.DEV": JSON.stringify(true),
      global: "globalThis",
    },
    root: ".",
    publicPath: "/",
    naming: {
      entry: "[name]-[hash].[ext]", // Include hash to prevent cache issues
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    packages: "bundle",
    // Enable additional optimizations
    emitDCEAnnotations: true,
  });

  // Build CSS using Tailwind CLI for proper v4 support
  // biome-ignore lint/suspicious/noConsole: Build script output
  console.log("🎨 Processing CSS with Tailwind v4...");
  await $`./node_modules/.bin/tailwindcss -i ./src/globals.css -o ./dist/globals.css`.quiet();

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  // Copy public assets
  const publicDir = join(process.cwd(), "public");

  if (existsSync(publicDir)) {
    await copyPublicDir(publicDir, distDir);
  }

  // Copy and update index.html to point to dist
  const indexPath = join(process.cwd(), "index.html");
  const distIndexPath = join(distDir, "index.html");
  if (existsSync(indexPath)) {
    let html = await Bun.file(indexPath).text();
    // Add CSS link in head
    html = html.replace(
      /<\/head>/,
      `  <link rel="stylesheet" href="/globals.css">
</head>`
    );
    // Update script src to point to dist
    html = html.replace(
      /<script type="module" src="\/src\/entry\.client\.tsx"><\/script>/,
      `<script type="module" src="/entry.client.js"></script>`
    );
    await Bun.write(distIndexPath, html);
  }
};

let _devWatcher: ReturnType<typeof watch> | undefined;

async function main() {
  if (!skipInitialBuild) {
    await buildDev();
  }

  if (isDev) {
    _devWatcher = watch(
      "./src",
      { recursive: true },
      async (eventType, filename) => {
        if (filename) {
          await buildDev();
        }
      }
    );
  }

  serve({
    port: Number(PORT),
    hostname: HOSTNAME,
    development: isDev,
    fetch(req) {
      const url = new URL(req.url);
      let pathname = url.pathname;

      if (pathname === "/") {
        pathname = "/index.html";
      }

      const distPath = join(process.cwd(), "dist", pathname.slice(1));
      const publicPath = join(process.cwd(), "public", pathname.slice(1));

      try {
        if (existsSync(distPath)) {
          const stat = statSync(distPath);
          if (stat.isFile()) {
            const file = Bun.file(distPath);
            return new Response(file);
          }
        }
      } catch {
        // Continue to fallback logic
      }

      try {
        if (existsSync(publicPath)) {
          const stat = statSync(publicPath);
          if (stat.isFile()) {
            const publicFile = Bun.file(publicPath);
            return new Response(publicFile);
          }
        }
      } catch {
        // Continue to SPA fallback
      }

      const indexPath = join(process.cwd(), "dist", "index.html");
      try {
        if (existsSync(indexPath)) {
          const indexFile = Bun.file(indexPath);
          return new Response(indexFile, {
            headers: { "Content-Type": "text/html" },
          });
        }
      } catch {
        // Final fallback
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
