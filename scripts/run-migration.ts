#!/usr/bin/env bun

/**
 * Script to run the built-in models migration
 * Run with: bun scripts/run-migration.ts
 */

import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import { api } from "../convex/_generated/api";

// Load environment variables
dotenv.config({ path: ".env.local" });

async function runMigration() {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    console.error("❌ VITE_CONVEX_URL environment variable not found!");
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl);

  try {
    console.log("🚀 Starting built-in models migration...");

    const result = await client.action(
      api.runMigration.runBuiltInModelsMigration,
      {}
    );

    console.log("✅ Migration completed successfully:", result);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}
