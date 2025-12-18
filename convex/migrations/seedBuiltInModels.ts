import { v } from "convex/values";
import { builtInImageModels, builtInTextModels } from "../../config";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import { fetchReplicateImageModel } from "../lib/model_fetchers";

// ============================================================================
// INTERNAL MUTATIONS FOR DATABASE OPERATIONS
// ============================================================================

/**
 * Upsert a built-in text model.
 * Only stores identity + free/isActive - capabilities come from models.dev cache.
 */
export const upsertTextModel = internalMutation({
	args: {
		modelId: v.string(),
		name: v.string(),
		provider: v.string(),
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
			await ctx.db.patch("builtInModels", existing._id, {
				name: args.name,
				free: args.free,
				isActive: args.isActive,
			});
			return { inserted: false };
		}

		await ctx.db.insert("builtInModels", {
			modelId: args.modelId,
			name: args.name,
			provider: args.provider,
			free: args.free,
			isActive: args.isActive,
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
			await ctx.db.patch("builtInImageModels", existing._id, {
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
 * Only stores identity + free/isActive - capabilities come from models.dev cache.
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

		for (const config of builtInTextModels) {
			if (config.isActive !== undefined && !config.isActive) {
				continue;
			}

			try {
				const result = await ctx.runMutation(internal.migrations.seedBuiltInModels.upsertTextModel, {
					modelId: config.modelId,
					name: config.name ?? config.modelId,
					provider: config.provider,
					free: config.free,
					isActive: config.isActive ?? true,
				});

				if (result.inserted) {
					textInserted++;
				} else {
					textUpdated++;
				}
			} catch (error) {
				errors.push(`Error seeding ${config.provider}/${config.modelId}: ${error instanceof Error ? error.message : String(error)}`);
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
 * Alias for consistency with other migrations
 */
export const runMigration = seedBuiltInModels;
