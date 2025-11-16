import { build, serve } from "bun";
import { existsSync, statSync, watch } from "fs";
import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";

// Live reload configuration
const RELOAD_ENDPOINT = "/__dev__/reload";
const LIVE_RELOAD_SCRIPT = `<script>new EventSource("${RELOAD_ENDPOINT}").onmessage = (e) => { if(e.data === "reload") location.reload(); };</script>`;

// Live reload client store with proper typing
declare global {
  var liveReloadClients: Set<ReadableStreamDefaultController<string>>;
}

globalThis.liveReloadClients = globalThis.liveReloadClients || new Set();

// Inject live reload script into HTML (with duplicate prevention)
function injectLiveReloadScript(html: string): string {
  // Check if script is already injected to prevent duplicates
  if (html.includes(RELOAD_ENDPOINT)) {
    return html;
  }

  // Try case-insensitive replacement for </body>
  const bodyTagRegex = /<\/body>/i;
  if (bodyTagRegex.test(html)) {
    return html.replace(bodyTagRegex, `${LIVE_RELOAD_SCRIPT}</body>`);
  }

  // Fallback: append to end if no </body> tag found
  return html + LIVE_RELOAD_SCRIPT;
}

// Notify all connected clients to reload
// SSE format: "data: <message>\n\n" (note: double newline required by SSE spec)
function notifyReload() {
  for (const client of globalThis.liveReloadClients) {
    try {
      client.enqueue("data: reload\n\n");
    } catch {
      // Remove disconnected clients
      globalThis.liveReloadClients.delete(client);
    }
  }
}

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

    // Remove the original globals.css reference
    html = html.replace(
      /<link rel="stylesheet" href="\/src\/globals\.css" \/>/,
      ""
    );

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

// Graceful shutdown handler
const handleExit = (signal: string) => {
  console.log(`\n📦 Shutting down development server (${signal})...`);

  // Close watcher
  if (DevWatcher) {
    DevWatcher.close();
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
    // Watch for changes and rebuild only for relevant file types
    const relevantExtensions = [".ts", ".tsx", ".js", ".jsx", ".css"];

    // Track last rebuild time to prevent duplicate builds
    let isRebuilding = false;

    DevWatcher = watch("./src", { recursive: true }, async (_, filename) => {
      if (!filename || filename.includes("node_modules")) {
        return;
      }

      // Skip test files - they don't affect the browser build
      if (filename.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
        return;
      }

      // Only rebuild for relevant file extensions
      const hasRelevantExtension = relevantExtensions.some(ext =>
        filename.endsWith(ext)
      );

      if (!hasRelevantExtension) {
        return;
      }

      // Prevent overlapping rebuilds
      if (isRebuilding) {
        return;
      }

      isRebuilding = true;
      try {
        console.log(`🔄 Detected change in ${filename}, rebuilding...`);
        await buildDev();
        notifyReload();
      } catch (error) {
        console.error("❌ Build failed:", error);
      } finally {
        isRebuilding = false;
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
      async fetch(req) {
        const url = new URL(req.url);
        let pathname = url.pathname;

        // Live reload SSE endpoint (dev-only)
        if (pathname === RELOAD_ENDPOINT) {
          // Security: Only allow in development mode
          if (!isDev) {
            return new Response("Not Found", { status: 404 });
          }

          let clientController: ReadableStreamDefaultController<string> | null =
            null;

          const stream = new ReadableStream({
            start(controller) {
              clientController = controller;
              globalThis.liveReloadClients.add(controller);
              // SSE initial connection message
              controller.enqueue("data: connected\n\n");
            },
            cancel() {
              // Clean up client on disconnection
              if (clientController) {
                globalThis.liveReloadClients.delete(clientController);
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

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
                // Inject live reload script into HTML
                const html = await file.text();
                const modifiedHtml = injectLiveReloadScript(html);
                return new Response(modifiedHtml, {
                  headers: { "Content-Type": contentType },
                });
              } else if (pathname.endsWith(".json")) {
                contentType = "application/json";
              } else if (pathname.endsWith(".wasm")) {
                contentType = "application/wasm";
              } else if (pathname.match(/\.(png|jpe?g|gif|webp|ico)$/)) {
                contentType = "image/*";
              } else if (pathname.endsWith(".svg")) {
                contentType = "image/svg+xml";
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
            const html = await indexFile.text();
            const modifiedHtml = injectLiveReloadScript(html);
            return new Response(modifiedHtml, {
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
