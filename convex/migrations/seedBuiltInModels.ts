import { v } from "convex/values";
import { builtInImageModels, builtInTextModels } from "../../config";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import {
	fetchAnthropicModels,
	fetchGoogleModel,
	fetchGroqModels,
	fetchOpenAIModels,
	fetchOpenRouterModels,
	fetchReplicateImageModel,
	type TextModelCapabilities,
} from "../lib/model-fetchers";

// ============================================================================
// INTERNAL MUTATIONS FOR DATABASE OPERATIONS
// ============================================================================

export const upsertTextModel = internalMutation({
	args: {
		modelId: v.string(),
		name: v.string(),
		provider: v.string(),
		contextLength: v.number(),
		maxOutputTokens: v.optional(v.number()),
		supportsImages: v.boolean(),
		supportsTools: v.boolean(),
		supportsReasoning: v.boolean(),
		supportsFiles: v.boolean(),
		free: v.boolean(),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("builtInModels")
			.filter((q) =>
				q.and(
					q.eq(q.field("modelId"), args.modelId),
					q.eq(q.field("provider"), args.provider),
				),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name,
				contextLength: args.contextLength,
				maxOutputTokens: args.maxOutputTokens,
				supportsImages: args.supportsImages,
				supportsTools: args.supportsTools,
				supportsReasoning: args.supportsReasoning,
				supportsFiles: args.supportsFiles,
				free: args.free,
				isActive: args.isActive,
			});
			return { inserted: false };
		}

		await ctx.db.insert("builtInModels", {
			...args,
			createdAt: Date.now(),
		});
		return { inserted: true };
	},
});

export const upsertImageModel = internalMutation({
	args: {
		modelId: v.string(),
		name: v.string(),
		provider: v.string(),
		description: v.optional(v.string()),
		supportedAspectRatios: v.optional(v.array(v.string())),
		supportsUpscaling: v.optional(v.boolean()),
		supportsInpainting: v.optional(v.boolean()),
		supportsOutpainting: v.optional(v.boolean()),
		supportsImageToImage: v.optional(v.boolean()),
		supportsMultipleImages: v.optional(v.boolean()),
		supportsNegativePrompt: v.optional(v.boolean()),
		modelVersion: v.optional(v.string()),
		owner: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		free: v.boolean(),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("builtInImageModels")
			.filter((q) =>
				q.and(
					q.eq(q.field("modelId"), args.modelId),
					q.eq(q.field("provider"), args.provider),
				),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name,
				description: args.description,
				supportedAspectRatios: args.supportedAspectRatios,
				supportsUpscaling: args.supportsUpscaling,
				supportsInpainting: args.supportsInpainting,
				supportsOutpainting: args.supportsOutpainting,
				supportsImageToImage: args.supportsImageToImage,
				supportsMultipleImages: args.supportsMultipleImages,
				supportsNegativePrompt: args.supportsNegativePrompt,
				modelVersion: args.modelVersion,
				owner: args.owner,
				tags: args.tags,
				free: args.free,
				isActive: args.isActive,
			});
			return { inserted: false };
		}

		await ctx.db.insert("builtInImageModels", {
			...args,
			createdAt: Date.now(),
		});
		return { inserted: true };
	},
});

// ============================================================================
// MAIN SEED ACTION
// ============================================================================

/**
 * Seeds built-in models from config files.
 * Capabilities are auto-discovered from provider APIs.
 */
export const seedBuiltInModels = internalAction({
	args: {},
	handler: async (ctx): Promise<{ success: boolean; message: string }> => {
		let textInserted = 0;
		let textUpdated = 0;
		let imageInserted = 0;
		let imageUpdated = 0;
		const errors: string[] = [];

		// ========================================================================
		// SEED TEXT MODELS
		// ========================================================================

		// Group text models by provider for efficient fetching
		const modelsByProvider = new Map<string, typeof builtInTextModels>();
		for (const config of builtInTextModels) {
			if (config.isActive !== undefined && !config.isActive) {
				continue;
			}
			const existing = modelsByProvider.get(config.provider) || [];
			existing.push(config);
			modelsByProvider.set(config.provider, existing);
		}

		// Process each provider
		for (const [provider, configs] of modelsByProvider) {
			const apiKey = getApiKeyForProvider(provider);

			if (!apiKey) {
				errors.push(`No API key for provider: ${provider}`);
				continue;
			}

			try {
				let fetchedModels: TextModelCapabilities[] = [];

				// Use appropriate fetch strategy based on provider
				if (provider === "google") {
					// Google supports individual model fetch
					for (const config of configs) {
						const model = await fetchGoogleModel(config.modelId, apiKey);
						if (model) {
							fetchedModels.push(model);
						} else {
							errors.push(`Failed to fetch Google model: ${config.modelId}`);
						}
					}
				} else {
					// Other providers require fetching all models
					switch (provider) {
						case "openai":
							fetchedModels = await fetchOpenAIModels(apiKey);
							break;
						case "anthropic":
							fetchedModels = await fetchAnthropicModels(apiKey);
							break;
						case "groq":
							fetchedModels = await fetchGroqModels(apiKey);
							break;
						case "openrouter":
							fetchedModels = await fetchOpenRouterModels(apiKey);
							break;
						default:
							errors.push(`Unknown provider: ${provider}`);
							continue;
					}
				}

				// Match config entries with fetched models and upsert
				for (const config of configs) {
					const fetchedModel = fetchedModels.find((m) => m.modelId === config.modelId);

					if (!fetchedModel) {
						errors.push(`Model not found in API: ${config.provider}/${config.modelId}`);
						continue;
					}

					const result = await ctx.runMutation(internal.migrations.seedBuiltInModels.upsertTextModel, {
						modelId: fetchedModel.modelId,
						name: config.name || fetchedModel.name,
						provider: fetchedModel.provider,
						contextLength: fetchedModel.contextLength,
						maxOutputTokens: fetchedModel.maxOutputTokens,
						supportsImages: fetchedModel.supportsImages,
						supportsTools: fetchedModel.supportsTools,
						supportsReasoning: fetchedModel.supportsReasoning,
						supportsFiles: fetchedModel.supportsFiles,
						free: config.free,
						isActive: config.isActive ?? true,
					});

					if (result.inserted) {
						textInserted++;
					} else {
						textUpdated++;
					}
				}
			} catch (error) {
				errors.push(`Error fetching ${provider} models: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		// ========================================================================
		// SEED IMAGE MODELS
		// ========================================================================

		const replicateApiKey = process.env.REPLICATE_API_TOKEN;

		if (replicateApiKey) {
			for (const config of builtInImageModels) {
				if (config.isActive !== undefined && !config.isActive) {
					continue;
				}

				try {
					const fetchedModel = await fetchReplicateImageModel(config.modelId, replicateApiKey);

					if (!fetchedModel) {
						errors.push(`Failed to fetch Replicate model: ${config.modelId}`);
						continue;
					}

					const result = await ctx.runMutation(internal.migrations.seedBuiltInModels.upsertImageModel, {
						modelId: fetchedModel.modelId,
						name: config.name || fetchedModel.name,
						provider: fetchedModel.provider,
						description: fetchedModel.description,
						supportedAspectRatios: fetchedModel.supportedAspectRatios,
						supportsUpscaling: fetchedModel.supportsUpscaling,
						supportsInpainting: fetchedModel.supportsInpainting,
						supportsOutpainting: fetchedModel.supportsOutpainting,
						supportsImageToImage: fetchedModel.supportsImageToImage,
						supportsMultipleImages: fetchedModel.supportsMultipleImages,
						supportsNegativePrompt: fetchedModel.supportsNegativePrompt,
						modelVersion: fetchedModel.modelVersion,
						owner: fetchedModel.owner,
						tags: fetchedModel.tags,
						free: config.free,
						isActive: config.isActive ?? true,
					});

					if (result.inserted) {
						imageInserted++;
					} else {
						imageUpdated++;
					}
				} catch (error) {
					errors.push(`Error fetching Replicate model ${config.modelId}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		} else if (builtInImageModels.length > 0) {
			errors.push("No REPLICATE_API_TOKEN available for image model seeding");
		}

		// ========================================================================
		// RESULT
		// ========================================================================

		const parts: string[] = [];
		if (textInserted > 0 || textUpdated > 0) {
			parts.push(`Text: ${textInserted} inserted, ${textUpdated} updated`);
		}
		if (imageInserted > 0 || imageUpdated > 0) {
			parts.push(`Image: ${imageInserted} inserted, ${imageUpdated} updated`);
		}
		if (errors.length > 0) {
			parts.push(`Errors: ${errors.length}`);
		}

		const message = parts.length > 0 ? parts.join(". ") : "No models to seed";

		if (errors.length > 0) {
			console.warn("Seed errors:", errors);
		}

		return {
			success: errors.length === 0,
			message,
		};
	},
});

/**
 * Helper to get API key from environment for a provider.
 */
function getApiKeyForProvider(provider: string): string | undefined {
	switch (provider) {
		case "google":
			return process.env.GEMINI_API_KEY;
		case "openai":
			return process.env.OPENAI_API_KEY;
		case "anthropic":
			return process.env.ANTHROPIC_API_KEY;
		case "groq":
			return process.env.GROQ_API_KEY;
		case "openrouter":
			return process.env.OPENROUTER_API_KEY;
		default:
			return undefined;
	}
}

/**
 * Alias for consistency with other migrations
 */
export const runMigration = seedBuiltInModels;
