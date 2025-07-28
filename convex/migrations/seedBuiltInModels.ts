import { internalMutation } from "../_generated/server";
import { supportsReasoning } from "../../shared/reasoning-model-detection";

export const seedBuiltInModels = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if built-in models already exist
    const existingBuiltInModels = await ctx.db
      .query("builtInModels")
      .first();

    if (existingBuiltInModels) {
      console.log("Built-in models already exist, skipping seeding");
      return { success: true, message: "Built-in models already exist" };
    }

    if (!process.env.GEMINI_API_KEY) {
      console.log("No GEMINI_API_KEY found, skipping built-in model seeding");
      return { success: true, message: "No GEMINI_API_KEY available" };
    }

    // Define built-in models
    const builtInModels = [
      {
        modelId: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        provider: "google",
        contextLength: 1048576,
        maxOutputTokens: undefined,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: supportsReasoning("google", "gemini-2.5-flash-lite"),
        supportsFiles: false,
        free: true,
        isActive: true,
      },
      // Add more built-in models as needed
      // Example of adding models from different providers:
      /*
      {
        modelId: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "built-in",
        actualProvider: "openai",
        actualModelId: "gpt-4o-mini",

        contextLength: 128000,
        maxOutputTokens: 16384,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: false,
        supportsFiles: false,
        free: true,
        builtIn: true,
        selected: false,
      },
      {
        modelId: "claude-3-haiku",
        name: "Claude 3 Haiku",
        provider: "built-in",
        actualProvider: "anthropic",
        actualModelId: "claude-3-haiku-20240307",

        contextLength: 200000,
        maxOutputTokens: 4096,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: false,
        supportsFiles: false,
        free: true,
        builtIn: true,
        selected: false,
      }
      */
    ];

    // Insert built-in models globally (not per-user)
    let insertedCount = 0;

    for (const model of builtInModels) {
      // Check if this built-in model already exists
      const existingModel = await ctx.db
        .query("builtInModels")
        .filter(q => 
          q.and(
            q.eq(q.field("modelId"), model.modelId),
            q.eq(q.field("provider"), model.provider)
          )
        )
        .first();

      if (!existingModel) {
        await ctx.db.insert("builtInModels", {
          ...model,
          createdAt: Date.now(),
        });
        insertedCount++;
      }
    }

    console.log(`Seeded ${insertedCount} global built-in models`);
    return { 
      success: true, 
      message: `Seeded ${insertedCount} global built-in models` 
    };
  },
});
