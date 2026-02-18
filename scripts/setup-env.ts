/**
 * Interactive setup script for Convex environment variables.
 *
 * Checks which env vars are set, generates/sets missing ones,
 * and offers to clean up stale vars from old auth system.
 *
 * Usage:
 *   bun scripts/setup-env.ts          # dev deployment
 *   bun scripts/setup-env.ts --prod   # production deployment
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const prod = process.argv.includes("--prod");
const flags = prod ? ["--prod"] : [];

function envGet(name: string): string | null {
  try {
    const result = execFileSync(
      "bunx",
      ["convex", "env", "get", name, ...flags],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

function envSet(name: string, value: string): void {
  execFileSync("bunx", ["convex", "env", "set", name, ...flags], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function envRemove(name: string): void {
  execFileSync("bunx", ["convex", "env", "remove", name, ...flags], {
    stdio: "inherit",
  });
}

function envList(): string[] {
  const result = execFileSync("bunx", ["convex", "env", "list", ...flags], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result
    .split("\n")
    .map(line => line.split("=")[0])
    .filter(Boolean);
}

function getConvexSiteUrl(): string {
  const envPath = resolve(import.meta.dir, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");

  const match = envContent.match(/VITE_CONVEX_URL=(.+)/);
  if (!match?.[1]) {
    throw new Error("VITE_CONVEX_URL not found in .env.local");
  }

  return match[1].trim().replace(/\.convex\.cloud$/, ".convex.site");
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const REQUIRED_VARS = [
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_WEBHOOK_SECRET",
  "API_KEY_ENCRYPTION_SECRET",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
] as const;

const ANON_AUTH_VARS = [
  "ANON_AUTH_PRIVATE_KEY",
  "ANON_AUTH_PUBLIC_KEY",
  "ANON_AUTH_ISSUER",
] as const;

const OPTIONAL_VARS = [
  "EXA_API_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "REPLICATE_API_KEY",
  "SITE_URL",
  "CONVEX_SITE_URL",
] as const;

// Stale vars from the old @convex-dev/auth system
const STALE_VARS = [
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_LOG_LEVEL",
  "JWKS",
  "JWT_PRIVATE_KEY",
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const target = prod ? "production" : "dev";
  console.log(`\n  Convex env setup (${target} deployment)\n`);

  // 1. Check required vars
  console.log("  Required vars:");
  let missingRequired = false;
  for (const name of REQUIRED_VARS) {
    const value = envGet(name);
    if (value) {
      console.log(`    ✓ ${name}`);
    } else {
      console.log(`    ✗ ${name}  ← missing`);
      missingRequired = true;
    }
  }

  if (missingRequired) {
    console.log(
      "\n  Set missing required vars in the Convex dashboard before continuing."
    );
  }

  // 2. Anonymous auth vars
  console.log("\n  Anonymous auth:");
  const hasAnonKeys = ANON_AUTH_VARS.every(name => envGet(name));

  if (hasAnonKeys) {
    for (const name of ANON_AUTH_VARS) {
      console.log(`    ✓ ${name}`);
    }
  } else {
    for (const name of ANON_AUTH_VARS) {
      const value = envGet(name);
      if (value) {
        console.log(`    ✓ ${name}`);
      } else {
        console.log(`    ✗ ${name}  ← missing`);
      }
    }

    const answer = await ask(
      "\n  Generate and set anonymous auth keys? (Y/n) "
    );
    if (answer === "" || answer.toLowerCase() === "y") {
      const issuer = getConvexSiteUrl();

      console.log(`\n  Issuer: ${issuer}`);
      console.log("  Generating RS256 key pair...");

      const { publicKey, privateKey } = await generateKeyPair("RS256", {
        extractable: true,
      });
      const privatePem = await exportPKCS8(privateKey);
      const publicPem = await exportSPKI(publicKey);

      console.log("  Setting ANON_AUTH_PRIVATE_KEY...");
      envSet("ANON_AUTH_PRIVATE_KEY", privatePem);

      console.log("  Setting ANON_AUTH_PUBLIC_KEY...");
      envSet("ANON_AUTH_PUBLIC_KEY", publicPem);

      console.log("  Setting ANON_AUTH_ISSUER...");
      envSet("ANON_AUTH_ISSUER", issuer);

      console.log("  ✓ Anonymous auth configured");
    }
  }

  // 3. Optional vars
  console.log("\n  Optional vars:");
  for (const name of OPTIONAL_VARS) {
    const value = envGet(name);
    if (value) {
      console.log(`    ✓ ${name}`);
    } else {
      console.log(`    · ${name}  (not set)`);
    }
  }

  // 4. Stale vars cleanup
  const currentVars = envList();
  const staleFound = STALE_VARS.filter(name => currentVars.includes(name));

  if (staleFound.length > 0) {
    console.log("\n  Stale vars (from old auth system):");
    for (const name of staleFound) {
      console.log(`    ! ${name}`);
    }

    const answer = await ask(
      `\n  Remove ${staleFound.length} stale var(s)? (Y/n) `
    );
    if (answer === "" || answer.toLowerCase() === "y") {
      for (const name of staleFound) {
        console.log(`  Removing ${name}...`);
        envRemove(name);
      }
      console.log("  ✓ Stale vars removed");
    }
  }

  console.log("\n  Done.\n");
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
