import tailwindcss from "@tailwindcss/postcss";
import { build, serve } from "bun";
import { existsSync, statSync, watch } from "fs";
import { cp } from "fs/promises";
import { join } from "path";
import postcss from "postcss";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
const isDev = process.env.NODE_ENV !== "production";
const skipInitialBuild = process.env.SKIP_INITIAL_BUILD === "true";
const convexUrl = process.env.VITE_CONVEX_URL || "";

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    webmanifest: "application/manifest+json",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

// Build for development
const buildDev = async () => {
  const distDir = join(process.cwd(), "dist");

  // CSS is imported in entry.client.tsx and processed by Bun's bundler with Tailwind v4

  const result = await build({
    entrypoints: ["./src/entry.client.tsx"],
    outdir: "./dist",
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    sourcemap: "inline",
    // Extract CSS to separate files for better caching
    cssChunking: true,
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
      entry: "[name].[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    packages: "bundle",
  });

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
    await cp(publicDir, distDir, { recursive: true });
  }

  // Process CSS files through PostCSS/Tailwind
  const globalsCssPath = join(process.cwd(), "src", "globals.css");
  const distGlobalsCssPath = join(distDir, "globals.css");

  if (existsSync(globalsCssPath)) {
    const cssContent = await Bun.file(globalsCssPath).text();
    const processed = await postcss([tailwindcss()]).process(cssContent, {
      from: globalsCssPath,
      to: distGlobalsCssPath,
    });
    await Bun.write(distGlobalsCssPath, processed.css);
  }

  // Process entry.client.css if it exists and contains Tailwind imports
  const entryClientCssPath = join(distDir, "entry.client.css");
  if (existsSync(entryClientCssPath)) {
    const cssContent = await Bun.file(entryClientCssPath).text();
    // Only process if it contains Tailwind imports
    if (cssContent.includes("@import") && cssContent.includes("tailwindcss")) {
      const processed = await postcss([tailwindcss()]).process(cssContent, {
        from: entryClientCssPath,
        to: entryClientCssPath,
      });
      await Bun.write(entryClientCssPath, processed.css);
    }
  }

  // Copy and update index.html to point to dist
  const indexPath = join(process.cwd(), "index.html");
  const distIndexPath = join(distDir, "index.html");
  if (existsSync(indexPath)) {
    let html = await Bun.file(indexPath).text();
    // Update script src to point to dist
    html = html.replace(
      /<script type="module" src="\/src\/entry\.client\.tsx"><\/script>/,
      `<link rel="stylesheet" href="/entry.client.css" />
    <script type="module" src="/entry.client.js"></script>`
    );

    if (!html.includes('href="/globals.css"')) {
      html = html.replace(
        /<head>/,
        '<head>\n    <link rel="stylesheet" href="/globals.css" />'
      );
    }
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
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Serve files from dist directory
      const distPath = join(process.cwd(), "dist", pathname);
      if (existsSync(distPath)) {
        const stats = statSync(distPath);
        // If it's a directory, serve index.html instead
        if (stats.isDirectory()) {
          const indexPath = join(distPath, "index.html");
          if (existsSync(indexPath)) {
            return new Response(Bun.file(indexPath), {
              headers: {
                "Content-Type": "text/html",
              },
            });
          }
        } else {
          // It's a file, serve it with proper MIME type
          const file = Bun.file(distPath);
          const contentType = getContentType(distPath);
          return new Response(file, {
            headers: {
              "Content-Type": contentType,
            },
          });
        }
      }

      // Fallback to public directory
      const publicPath = join(process.cwd(), "public", pathname);
      if (existsSync(publicPath)) {
        const stats = statSync(publicPath);
        if (stats.isDirectory()) {
          return new Response("Not Found", { status: 404 });
        }
        const file = Bun.file(publicPath);
        const contentType = getContentType(publicPath);
        return new Response(file, {
          headers: {
            "Content-Type": contentType,
          },
        });
      }

      // Serve index.html for SPA routing
      const indexPath = join(process.cwd(), "dist", "index.html");
      if (existsSync(indexPath)) {
        return new Response(Bun.file(indexPath), {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
