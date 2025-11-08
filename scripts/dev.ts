import { build, serve } from "bun";
import { existsSync, statSync, watch } from "fs";
import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
const isDev = process.env.NODE_ENV !== "production";
const convexUrl = process.env.VITE_CONVEX_URL || "";

console.log("🚀 Starting Polly development server...");

// Store child processes for cleanup
const childProcesses: Bun.Subprocess[] = [];

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

  // Build JS and CSS with Bun's bundler (Tailwind plugin configured in bunfig.toml)
  console.log("📦 Building JavaScript and CSS with Tailwind...");

  // Import the Tailwind plugin
  const tailwindPlugin = await import("bun-plugin-tailwind");

  await build({
    entrypoints: ["./src/entry.client.tsx"],
    outdir: "./dist",
    target: "browser",
    format: "esm",
    splitting: true,
    minify: false,
    sourcemap: "linked",
    plugins: [tailwindPlugin.default],
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
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
      entry: "[name]-[hash].[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    packages: "bundle",
    external: [],
  });
  console.log("✅ Build complete");

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

    // Find the correct entry file name and CSS file
    const entries = await readdir(distDir);
    const entryFiles = entries.filter(
      file => file.startsWith("entry.client-") && file.endsWith(".js")
    );
    const cssFiles = entries.filter(
      file => file.startsWith("entry.client-") && file.endsWith(".css")
    );

    // Find the entry JS file
    if (entryFiles.length > 0) {
      // Find the actual entry point by looking for the file that contains the source reference
      let entryFile = entryFiles[0]; // fallback to first one

      for (const file of entryFiles) {
        const filePath = join(distDir, file);
        const content = await Bun.file(filePath).text();
        if (content.includes("src/entry.client.tsx")) {
          entryFile = file;
          break;
        }
      }

      html = html.replace(
        /<script type="module" src="\/src\/entry\.client\.tsx"><\/script>/,
        `<script type="module" src="/${entryFile}"></script>`
      );
    } else {
      html = html.replace(
        /<script type="module" src="\/src\/entry\.client\.tsx"><\/script>/,
        `<script type="module" src="/entry.client.js"></script>`
      );
    }

    // Add link to the bundled CSS file (not the manual globals.css)
    if (cssFiles.length > 0) {
      const cssFile = cssFiles[0]; // Use the first (and likely only) entry CSS file
      html = html.replace(
        /<\/head>/,
        `  <link rel="stylesheet" href="/${cssFile}">\n</head>`
      );
    }

    await Bun.write(distIndexPath, html);
  }

  return true;
};

let DevWatcher: ReturnType<typeof watch> | undefined;
let CssWatcher: ReturnType<typeof watch> | undefined;

// Graceful shutdown handler
const handleExit = (signal: string) => {
  console.log(`\n📦 Shutting down development server (${signal})...`);

  // Close watchers
  if (DevWatcher) {
    DevWatcher.close();
  }
  if (CssWatcher) {
    CssWatcher.close();
  }

  // Kill all child processes
  childProcesses.forEach((proc, index) => {
    console.log(`Terminating child process ${index + 1}...`);
    try {
      proc.kill();
    } catch {
      // Process may already be dead
    }
  });

  // Give processes time to cleanup
  setTimeout(() => {
    process.exit(0);
  }, 1000);
};

async function main() {
  // Set up signal handlers
  process.on("SIGINT", () => handleExit("SIGINT"));
  process.on("SIGTERM", () => handleExit("SIGTERM"));
  process.on("SIGQUIT", () => handleExit("SIGQUIT"));

  // Initial build
  const buildSuccess = await buildDev();

  if (!buildSuccess) {
    console.error("❌ Initial build failed");
    process.exit(1);
  }

  if (isDev) {
    // Watch for changes and rebuild
    DevWatcher = watch("./src", { recursive: true }, async (_, filename) => {
      if (filename && !filename.includes("node_modules")) {
        console.log(`🔄 Detected change in ${filename}, rebuilding...`);
        await buildDev();
      }
    });

    // CSS changes will trigger a full rebuild since CSS is bundled by Bun
    CssWatcher = watch("./src", { recursive: true }, async (_, filename) => {
      if (filename?.endsWith(".css")) {
        console.log(`🔄 Detected CSS change in ${filename}, rebuilding...`);
        await buildDev();
      }
    });
  }

  // Start Convex dev server if not already running
  try {
    console.log("🔄 Starting Convex backend...");
    const convexProc = Bun.spawn(["convex", "dev"], {
      stdout: "inherit",
      stderr: "inherit",
      env: process.env as Record<string, string>,
    });
    childProcesses.push(convexProc);
  } catch (error) {
    console.warn("⚠️  Could not start Convex (may already be running):", error);
  }

  // Start development server
  console.log(`📡 Starting development server on http://${HOSTNAME}:${PORT}`);

  try {
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

        try {
          if (existsSync(distPath)) {
            const stat = statSync(distPath);
            if (stat.isFile()) {
              const file = Bun.file(distPath);
              let contentType = "application/javascript";

              if (pathname.endsWith(".css")) {
                contentType = "text/css";
              } else if (pathname.endsWith(".html")) {
                contentType = "text/html";
              } else if (pathname.endsWith(".json")) {
                contentType = "application/json";
              } else if (pathname.endsWith(".wasm")) {
                contentType = "application/wasm";
              } else if (pathname.match(/\.(png|jpe?g|gif|svg|webp|ico)$/)) {
                contentType = "image/*";
              } else if (pathname.match(/\.(woff2?|eot|ttf|otf)$/)) {
                contentType = "font/*";
              } else {
                contentType = "application/javascript";
              }

              return new Response(file, {
                headers: { "Content-Type": contentType },
              });
            }
          }
        } catch (error) {
          console.error("Error serving file:", error);
          // Continue to fallback logic
        }

        // SPA fallback
        const indexPath = join(process.cwd(), "dist", "index.html");
        try {
          if (existsSync(indexPath)) {
            const indexFile = Bun.file(indexPath);
            return new Response(indexFile, {
              headers: { "Content-Type": "text/html" },
            });
          }
        } catch (error) {
          console.error("Error serving index.html:", error);
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    console.log(
      `✅ Development server running successfully at http://${HOSTNAME}:${PORT}`
    );
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);

    // Wait for child processes to complete (they shouldn't in dev mode)
    // This keeps the main process alive
    await new Promise(() => {
      // Never resolve, just wait for signals
    });
  } catch (error) {
    console.error("❌ Failed to start development server:", error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("❌ Development server error:", error);
  handleExit("ERROR");
});
