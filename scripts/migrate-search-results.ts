#!/usr/bin/env npx tsx

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

async function runMigration() {
  const deploymentUrl = process.env.CONVEX_URL;

  if (!deploymentUrl) {
    console.error("❌ CONVEX_URL environment variable is not set");
    process.exit(1);
  }

  console.log(
    "🔄 Starting migration to remove deprecated searchResults field..."
  );

  const client = new ConvexHttpClient(deploymentUrl);

  try {
    const result = await client.mutation(
      api.messages.runSearchResultsMigration,
      {}
    );

    console.log(`✅ Migration completed successfully!`);
    console.log(`   - Total messages processed: ${result.totalMessages}`);
    console.log(`   - Messages migrated: ${result.migratedCount}`);

    if (result.migratedCount === 0) {
      console.log("   - No messages needed migration");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
runMigration().catch(console.error);
