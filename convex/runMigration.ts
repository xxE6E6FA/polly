import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";

type MigrationResult = {
  success: boolean;
  message: string;
};

export const runBuiltInModelsMigration = action({
  args: {},
  handler: async (ctx: ActionCtx): Promise<MigrationResult> => {
    console.log("Starting built-in models migration...");

    try {
      const result: MigrationResult = await ctx.runMutation(
        internal.migrations.seedBuiltInModels.seedBuiltInModels
      );
      console.log("Migration completed successfully:", result);
      return result;
    } catch (error) {
      console.error("Migration failed:", error);
      throw error;
    }
  },
});
