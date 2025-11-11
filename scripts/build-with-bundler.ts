import { build } from "bun";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";

const convexUrl = process.env.VITE_CONVEX_URL || "";
const startTime = Date.now();

// Build caching mechanism
const getCacheKey = () => {
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    VITE_CONVEX_URL: process.env.VITE_CONVEX_URL,
  };
  return createHash("md5").update(JSON.stringify(envVars)).digest("hex");
};

const cacheDir = join(process.cwd(), ".build-cache");
const cacheKeyPath = join(cacheDir, "cache-key");
const distDir = join(process.cwd(), "dist");

console.log("🏗️  Building Polly frontend for production...");

async function copyPublicDir(src: string, dest: string) {
  if (!existsSync(src)) {
    return;
  }

  const entries = await readdir(src, { withFileTypes: true });

  // Create all directories first
  const dirOperations = entries
    .filter(entry => entry.isDirectory())
    .map(async entry => {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      await mkdir(destPath, { recursive: true });
      return copyPublicDir(srcPath, destPath);
    });

  // Copy all files in parallel
  const fileOperations = entries
    .filter(entry => entry.isFile())
    .map(entry => {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      return Bun.write(destPath, Bun.file(srcPath));
    });

  await Promise.all([...dirOperations, ...fileOperations]);
}

const buildProduction = async () => {
  // Check build cache
  const currentCacheKey = getCacheKey();
  let useCache = false;

  if (existsSync(cacheDir) && existsSync(cacheKeyPath)) {
    try {
      const cachedKey = await readFile(cacheKeyPath, "utf-8");
      if (cachedKey === currentCacheKey && existsSync(distDir)) {
        console.log("  📦 Using cached build (no changes detected)");
        useCache = true;
      }
    } catch {
      // Cache read failed, proceed with build
    }
  }

  if (!useCache) {
    if (existsSync(distDir)) {
      console.log("  🧹 Cleaning dist directory...");
      await rm(distDir, { recursive: true, force: true });
    }

    await mkdir(distDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });

    console.log("  📦 Building JavaScript and CSS with Tailwind...");

    // Import the Tailwind plugin
    const tailwindPlugin = await import("bun-plugin-tailwind");

    const result = await build({
      entrypoints: ["./src/entry.client.tsx"],
      outdir: "./dist",
      target: "browser",
      format: "esm",
      splitting: true,
      plugins: [tailwindPlugin.default],
      jsx: {
        runtime: "automatic",
        importSource: "react",
      },
      minify: true,
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
    });

    if (!result.success) {
      console.error("❌ Build failed:");
      for (const log of result.logs) {
        console.error(log);
      }
      process.exit(1);
    }

    console.log("  ✅ JavaScript bundle built");

    // CSS is automatically processed by Bun's bundler via the import in entry.client.tsx
    console.log("  ✅ CSS processed by Bun's bundler");

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
            output.path.includes("entry.client") &&
            output.kind === "entry-point"
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

      // Find CSS files generated by Bun's bundler
      const entries = await readdir(distDir);
      const cssFiles = entries.filter(
        file => file.startsWith("entry.client-") && file.endsWith(".css")
      );

      if (entryFile) {
        // Remove the original globals.css reference
        html = html.replace(
          /<link rel="stylesheet" href="\/src\/globals\.css" \/>/,
          ""
        );

        // Add link to the bundled CSS file
        if (cssFiles.length > 0) {
          const cssFile = cssFiles[0];
          html = html.replace(
            /<\/head>/,
            `  <link rel="stylesheet" href="/${cssFile}">\n   </head>`
          );
        }

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

    // Save cache key
    await writeFile(cacheKeyPath, currentCacheKey);

    // Generate bundle analysis if requested
    if (process.env.ANALYZE_BUNDLE) {
      console.log(
        "  📊 Bundle analysis requested - use Vite build for detailed analysis"
      );
      console.log("  💡 Run: ANALYZE_BUNDLE=true bun run build:frontend");
    }
  }

  const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);

  const outputSize = async () => {
    const distFiles = await readdir(distDir, { recursive: true });
    const stats = await Promise.all(
      distFiles.map(async file => {
        const filePath = join(distDir, file);
        try {
          const fileStat = await stat(filePath);
          return fileStat.isFile() ? fileStat.size : 0;
        } catch {
          return 0;
        }
      })
    );
    const totalSize = stats.reduce((sum, size) => sum + size, 0);
    return (totalSize / 1024 / 1024).toFixed(2);
  };

  const sizeMB = await outputSize();

  console.log(`\n✨ Build complete in ${buildTime}s (${sizeMB} MB)\n`);
};

buildProduction().catch(error => {
  console.error("❌ Build error:", error);
  process.exit(1);
});
