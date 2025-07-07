import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import { api } from "../convex/_generated/api";

// Load environment variables
dotenv.config({ path: ".env.local" });

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("❌ VITE_CONVEX_URL environment variable not found!");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

async function clearAuthTables() {
  console.log("🔐 Clearing auth tables to fix orphaned accounts...");

  const authTables = [
    { name: "authAccounts", mutation: "clearAuthAccounts" },
    { name: "authSessions", mutation: "clearAuthSessions" },
    { name: "authVerificationCodes", mutation: "clearAuthVerificationCodes" },
    { name: "authRefreshTokens", mutation: "clearAuthRefreshTokens" },
    { name: "authRateLimits", mutation: "clearAuthRateLimits" },
  ];

  for (const { name, mutation } of authTables) {
    try {
      const count = await client.mutation(
        api.internal[mutation as keyof typeof api.internal],
        {}
      );
      console.log(`✅ Cleared ${name}: ${count} documents`);
    } catch (error) {
      console.error(`❌ Error clearing ${name}:`, error);
    }
  }

  console.log(
    "\n✨ Auth tables cleared! You can now sign in with Google again."
  );
}

clearAuthTables().catch(console.error);
