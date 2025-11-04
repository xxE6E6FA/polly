import { existsSync } from "fs";
import { cp } from "fs/promises";
import { join } from "path";

const cliFlags = new Set(Bun.argv.slice(2));
const isProduction =
  process.env.NODE_ENV === "production" ||
  Bun.env.BUILD_ENV === "production" ||
  cliFlags.has("--production");
const nodeEnv = isProduction
  ? "production"
  : process.env.NODE_ENV || Bun.env.BUILD_ENV || "development";
const convexUrl = process.env.VITE_CONVEX_URL || "";

// CSS is imported in entry.client.tsx and processed by Bun's bundler with Tailwind v4

const buildResult = await Bun.build({
  entrypoints: ["./src/entry.client.tsx"],
  outdir: "./dist",
  target: "browser",
  format: "esm",
  splitting: false,
  minify: isProduction
    ? {
        whitespace: true,
        syntax: true,
        identifiers: true,
      }
    : false,
  sourcemap: isProduction ? "external" : false,
  // Extract CSS to separate files for better caching
  cssChunking: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(nodeEnv),
    "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
    "import.meta.env.PROD": JSON.stringify(isProduction),
    "import.meta.env.DEV": JSON.stringify(!isProduction),
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

if (!buildResult.success) {
  console.error("Build failed:");
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Copy public assets
const publicDir = join(process.cwd(), "public");
const distDir = join(process.cwd(), "dist");

if (existsSync(publicDir)) {
  await cp(publicDir, distDir, { recursive: true });
}

// Copy and update index.html
const indexPath = join(process.cwd(), "index.html");
const distIndexPath = join(distDir, "index.html");
if (existsSync(indexPath)) {
  let html = await Bun.file(indexPath).text();
  // Update script src to point to the built entry file
  html = html.replace(
    /<script type="module" src="\/src\/entry\.client\.tsx"><\/script>/,
    `<link rel="stylesheet" href="/entry.client.css" />
<script type="module" src="/entry.client.js"></script>`
  );
  await Bun.write(distIndexPath, html);
}

const serverEntry = join(process.cwd(), "server.ts");

if (isProduction && existsSync(serverEntry)) {
  const serverBuildResult = await Bun.build({
    entrypoints: [serverEntry],
    outdir: "./dist/server",
    target: "bun",
    format: "cjs",
    splitting: false,
    bytecode: true,
    minify: {
      whitespace: true,
      syntax: true,
      identifiers: true,
    },
    sourcemap: "external",
    define: {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
      "import.meta.env.PROD": JSON.stringify(isProduction),
      "import.meta.env.DEV": JSON.stringify(!isProduction),
      global: "globalThis",
    },
    root: ".",
    packages: "external",
    naming: {
      entry: "index.[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
  });

  if (!serverBuildResult.success) {
    console.error("Server build failed:");
    for (const log of serverBuildResult.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}
