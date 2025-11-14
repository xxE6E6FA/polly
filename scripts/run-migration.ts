#!/usr/bin/env bun

/**
 * CLI script to run Convex database migrations
 *
 * LIMITATION: This script cannot directly execute internal migrations from the CLI
 * because Convex internal mutations are not exposed to client-side API calls.
 * The script serves as a helper to list available migrations and provide the
 * correct commands to run them via the Convex CLI.
 *
 * Usage:
 *   bun scripts/run-migration.ts <migrationName>  # Shows how to run the migration
 *   bun scripts/run-migration.ts --list           # Lists all migrations
 *
 * To actually run migrations, use:
 *   bunx convex run migrations:<name>:runMigration '{}'
 *
 * Examples:
 *   bun scripts/run-migration.ts addUserIdToMessages  # Shows command
 *   bunx convex run migrations:addUserIdToMessages:runMigration '{}'  # Runs migration
 */

import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import { api } from "../convex/_generated/api";

// Load environment variables
dotenv.config({ path: ".env.local" });

const AVAILABLE_MIGRATIONS = [
  {
    name: "seedBuiltInModels",
    path: "migrations.seedBuiltInModels.runMigration",
  },
  {
    name: "addUserIdToMessages",
    path: "migrations.addUserIdToMessages.runMigration",
  },
  {
    name: "populateUserFiles",
    path: "migrations.populateUserFiles.runMigration",
  },
  {
    name: "updateUserFilesMetadata",
    path: "migrations.updateUserFilesMetadata.runMigration",
  },
] as const;

function printUsage() {
  console.log(`
Usage: bun scripts/run-migration.ts <command>

Commands:
  <migrationName>  Run a specific migration
  --list           List available migrations

Available Migrations:
${AVAILABLE_MIGRATIONS.map(m => `  - ${m.name}`).join("\n")}

Examples:
  bun scripts/run-migration.ts addUserIdToMessages
  bun scripts/run-migration.ts seedBuiltInModels
  `);
}

function runMigration(migrationName: string) {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    console.error("❌ VITE_CONVEX_URL environment variable not found!");
    console.error(
      "   Make sure you have a .env.local file with VITE_CONVEX_URL set."
    );
    process.exit(1);
  }

  const _client = new ConvexHttpClient(convexUrl);

  try {
    const migration = AVAILABLE_MIGRATIONS.find(m => m.name === migrationName);
    if (!migration) {
      throw new Error(`Unknown migration: ${migrationName}`);
    }

    console.log(`🚀 Running migration: ${migrationName}...`);

    // Access the internal mutation directly via the generated API
    const _migrationFn = migration.path
      .split(".")
      .reduce(
        (obj: unknown, key: string) => (obj as Record<string, unknown>)[key],
        api as unknown
      );

    // Since these are internal mutations, we need to call them as mutations
    // But they're internal, so we can't call them from the client directly
    // We need to use the Convex dashboard or create an action wrapper

    console.error("❌ Cannot run internal migrations directly from CLI");
    console.error("   Please use one of these methods:");
    console.error("");
    console.error("   1. Via Convex Dashboard:");
    console.error("      - Go to https://dashboard.convex.dev");
    console.error(
      `      - Navigate to Functions > migrations > ${migration.name} > runMigration`
    );
    console.error("      - Click 'Run' with empty args {}");
    console.error("");
    console.error("   2. Via convex CLI:");
    console.error(
      `      bunx convex run ${migration.path.replace(/\./g, ":")} --args '{}'`
    );

    process.exit(1);
  } catch (error) {
    console.error(`❌ Migration failed: ${error}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  if (command === "--list") {
    console.log("Available migrations:");
    for (const migration of AVAILABLE_MIGRATIONS) {
      console.log(`  - ${migration.name}`);
      console.log(
        `    Command: bunx convex run ${migration.path.replace(/\./g, ":")} --args '{}'`
      );
    }
    process.exit(0);
  }

  // Run specific migration
  if (!AVAILABLE_MIGRATIONS.find(m => m.name === command)) {
    console.error(`❌ Unknown migration: ${command}`);
    console.error(
      `   Available migrations: ${AVAILABLE_MIGRATIONS.map(m => m.name).join(", ")}`
    );
    process.exit(1);
  }

  await runMigration(command);
}

// Run the script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
