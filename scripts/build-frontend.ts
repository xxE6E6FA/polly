import { build } from "bun";
import { existsSync } from "fs";
import { mkdir, readdir, rm, stat } from "fs/promises";
import { join } from "path";

const convexUrl = process.env.VITE_CONVEX_URL || "";
const startTime = Date.now();

console.log("🏗️  Building Polly frontend for production...");

async function copyPublicDir(src: string, dest: string) {
  if (!existsSync(src)) {
    return;
  }

  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyPublicDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await Bun.write(destPath, Bun.file(srcPath));
    }
  }
}

async function processCSSWithTailwind() {
  const { $ } = await import("bun");
  const postcssConfig = join(process.cwd(), "postcss.config.mjs");

  if (!existsSync(postcssConfig)) {
    throw new Error("PostCSS config not found");
  }

  console.log("🎨 Processing CSS with Tailwind v4 (minified)...");

  const result =
    await $`./node_modules/.bin/tailwindcss -i ./src/globals.css -o ./dist/globals.css --minify`.quiet();

  if (result.exitCode !== 0) {
    throw new Error("Tailwind CSS processing failed");
  }
}

const buildProduction = async () => {
  const distDir = join(process.cwd(), "dist");

  if (existsSync(distDir)) {
    console.log("  🧹 Cleaning dist directory...");
    await rm(distDir, { recursive: true, force: true });
  }

  await mkdir(distDir, { recursive: true });

  console.log("  📦 Building JavaScript bundle...");

  const result = await build({
    entrypoints: ["./src/entry.client.tsx"],
    outdir: "./dist",
    target: "browser",
    format: "esm",
    splitting: true,
    minify: {
      whitespace: true,
      syntax: true,
      identifiers: true,
    },
    sourcemap: "external",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
      "import.meta.env.PROD": JSON.stringify(true),
      "import.meta.env.DEV": JSON.stringify(false),
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
    // Advanced Bun bundler optimizations
    emitDCEAnnotations: true, // Better tree shaking
    drop: ["console.debug", "console.log"], // Remove debug logs in production
    banner: "/*! Polly - Built with Bun */",
  });

  if (!result.success) {
    console.error("❌ Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log("  ✅ JavaScript bundle built");

  await processCSSWithTailwind();
  console.log("  ✅ CSS processed");

  const publicDir = join(process.cwd(), "public");

  if (existsSync(publicDir)) {
    console.log("  📂 Copying public assets...");
    await copyPublicDir(publicDir, distDir);
    console.log("  ✅ Public assets copied");
  }

  const indexPath = join(process.cwd(), "index.html");
  const distIndexPath = join(distDir, "index.html");

  if (existsSync(indexPath)) {
    console.log("  📄 Generating index.html...");
    let html = await Bun.file(indexPath).text();

    let entryFile: string | undefined;

    if (result.outputs && result.outputs.length > 0) {
      const entryOutput = result.outputs.find(
        output =>
          output.path.includes("entry.client") && output.kind === "entry-point"
      );
      if (entryOutput) {
        entryFile = entryOutput.path.split("/").pop();
      }
    }

    if (!entryFile) {
      const entries = await readdir(distDir);
      const entryFiles = entries.filter(
        file => file.startsWith("entry.client-") && file.endsWith(".js")
      );

      if (entryFiles.length > 0) {
        const entryStats = await Promise.all(
          entryFiles.map(async file => {
            const filePath = join(distDir, file);
            const fileStat = await stat(filePath);
            return { file, size: fileStat.size };
          })
        );

        entryFile = entryStats.sort((a, b) => b.size - a.size)[0]?.file;
      }
    }

    if (entryFile) {
      html = html.replace(
        /<\/head>/,
        `  <link rel="stylesheet" href="/globals.css">
  </head>`
      );
      html = html.replace(
        /<script type="module" src="\/src\/entry\.client\.tsx"><\/script>/,
        `<script type="module" src="/${entryFile}"></script>`
      );
    } else {
      throw new Error("Could not find entry.client bundle file");
    }

    await Bun.write(distIndexPath, html);
    console.log("  ✅ index.html generated");
  }

  const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);

  const outputSize = async () => {
    const distFiles = await readdir(distDir, { recursive: true });
    let totalSize = 0;

    for (const file of distFiles) {
      const filePath = join(distDir, file);
      if (existsSync(filePath)) {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          totalSize += fileStat.size;
        }
      }
    }

    return (totalSize / 1024 / 1024).toFixed(2);
  };

  const sizeMB = await outputSize();

  console.log(`\n✨ Build complete in ${buildTime}s (${sizeMB} MB)\n`);
};

buildProduction().catch(error => {
  console.error("❌ Build error:", error);
  process.exit(1);
});
