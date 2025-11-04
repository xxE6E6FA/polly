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
    try {
      const result: MigrationResult = await ctx.runMutation(
        internal.migrations.seedBuiltInModels.seedBuiltInModels
      );
      return result;
    } catch (error) {
      console.error("Migration failed:", error);
      throw error;
    }
  },
});
