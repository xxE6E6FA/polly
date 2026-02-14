import { tool } from "ai";
import { z } from "zod/v3";
import Replicate from "replicate";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";

/**
 * Image model info passed from mutation context (where auth is available).
 */
export type ImageModelInfo = {
  modelId: string;
  name: string;
  description?: string;
  supportedAspectRatios?: string[];
  modelVersion?: string;
};

/**
 * Image generation tool schema for AI SDK tool calling.
 */
export const imageGenerationToolSchema = z.object({
  prompt: z
    .string()
    .describe(
      "A detailed prompt describing the image to generate. Be specific about style, composition, lighting, and subject matter."
    ),
  model: z
    .string()
    .describe(
      "The model ID to use for generation. Must be one of the available models listed in the tool description."
    ),
  aspectRatio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"])
    .optional()
    .default("1:1")
    .describe("Aspect ratio for the generated image. Defaults to 1:1 (square)."),
});

export type ImageGenerationToolParams = z.infer<
  typeof imageGenerationToolSchema
>;

/**
 * Result returned from the image generation tool.
 */
export interface ImageGenerationToolResult {
  success: boolean;
  imageCount?: number;
  model?: string;
  prompt?: string;
  error?: string;
}

/**
 * Tool name constant for reference.
 */
export const IMAGE_GENERATION_TOOL_NAME = "generateImage" as const;

/**
 * Creates the image generation tool for AI SDK streamText.
 * Uses the same closure pattern as createConversationSearchTool.
 */
export function createImageGenerationTool(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  replicateApiKey: string,
  availableModels: ImageModelInfo[]
) {
  // Build dynamic description listing available models
  const modelListStr = availableModels
    .map((m) => {
      const desc = m.description ? ` — ${m.description}` : "";
      return `- "${m.modelId}" (${m.name})${desc}`;
    })
    .join("\n");

  return tool({
    description: `Generate an image using AI image generation models. Use this tool when the user asks you to create, generate, draw, or make an image.

Available models:
${modelListStr}

Choose the model that best fits the user's request. If the user doesn't specify a model, pick the most appropriate one.

Tips for good prompts:
- Be specific and descriptive about what you want to see
- Include style, lighting, composition, and mood details
- Mention the medium (photograph, oil painting, digital art, etc.)`,
    inputSchema: imageGenerationToolSchema,
    execute: async ({
      prompt,
      model,
      aspectRatio,
    }): Promise<ImageGenerationToolResult> => {
      // Validate the requested model is in the available list
      const validModel = availableModels.find((m) => m.modelId === model);
      if (!validModel) {
        const validIds = availableModels.map((m) => m.modelId).join(", ");
        return {
          success: false,
          error: `Model "${model}" is not available. Available models: ${validIds}`,
        };
      }

      try {
        const replicate = new Replicate({ auth: replicateApiKey });

        // Resolve the model version — use stored version or fetch latest
        let version = validModel.modelVersion;
        if (!version) {
          const [owner, name] = model.split("/");
          if (!owner || !name) {
            return {
              success: false,
              model,
              prompt,
              error: `Invalid model format: ${model}. Expected 'owner/name'.`,
            };
          }
          const modelData = await replicate.models.get(owner, name);
          version = modelData.latest_version?.id;
          if (!version) {
            return {
              success: false,
              model,
              prompt,
              error: `No version available for model: ${model}`,
            };
          }
        }

        // Create prediction with explicit version and wait for completion
        const input: Record<string, unknown> = { prompt };

        // Only include aspect_ratio if the model declares supported ratios
        if (validModel.supportedAspectRatios && validModel.supportedAspectRatios.length > 0) {
          input.aspect_ratio = aspectRatio || "1:1";
        }

        const prediction = await replicate.predictions.create({
          version,
          input,
        });

        // Wait for the prediction to complete
        const completedPrediction = await replicate.wait(prediction);

        if (
          completedPrediction.status !== "succeeded" ||
          !completedPrediction.output
        ) {
          return {
            success: false,
            model,
            prompt,
            error:
              typeof completedPrediction.error === "string"
                ? completedPrediction.error
                : `Prediction ${completedPrediction.status}`,
          };
        }

        // Handle various Replicate output types
        const imageUrls = extractImageUrls(completedPrediction.output);

        if (imageUrls.length === 0) {
          return {
            success: false,
            model,
            prompt,
            error: "No images were returned from the model.",
          };
        }

        // Download and store each image in Convex file storage
        const attachments = [];
        for (let i = 0; i < imageUrls.length; i++) {
          const imageUrl = imageUrls[i];
          if (!imageUrl) {
            continue;
          }
          try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
              console.error(
                `[image_generation] Failed to download image ${i}:`,
                response.status
              );
              continue;
            }

            const imageBuffer = await response.arrayBuffer();
            const contentType =
              response.headers.get("content-type") || "image/jpeg";
            const imageBlob = new globalThis.Blob([imageBuffer], {
              type: contentType,
            });

            const storageId = await ctx.storage.store(imageBlob);

            const baseName = model.replace(/[^a-zA-Z0-9]/g, "_");
            let ext = ".jpg";
            if (contentType.includes("png")) {
              ext = ".png";
            } else if (contentType.includes("webp")) {
              ext = ".webp";
            }
            const fileName =
              imageUrls.length > 1
                ? `${baseName}_${i + 1}${ext}`
                : `${baseName}${ext}`;

            attachments.push({
              type: "image" as const,
              url: imageUrl,
              name: fileName,
              size: imageBuffer.byteLength,
              storageId: storageId as Id<"_storage">,
              mimeType: contentType,
              generatedImage: {
                isGenerated: true,
                source: "replicate",
                model,
                prompt,
              },
            });
          } catch (imgError) {
            console.error(
              `[image_generation] Failed to store image ${i}:`,
              imgError
            );
          }
        }

        if (attachments.length > 0) {
          // Attach images to the assistant message
          await ctx.runMutation(internal.messages.addAttachments, {
            messageId,
            attachments,
          });
        }

        return {
          success: true,
          imageCount: attachments.length,
          model,
          prompt,
        };
      } catch (error) {
        console.error("[image_generation] Error:", error);
        return {
          success: false,
          model,
          prompt,
          error:
            error instanceof Error ? error.message : "Image generation failed",
        };
      }
    },
  });
}

/**
 * Extract image URLs from various Replicate output formats.
 * Handles: string URL, array of strings, ReadableStream (returns empty — not supported).
 */
function extractImageUrls(output: unknown): string[] {
  if (typeof output === "string") {
    return [output];
  }

  if (Array.isArray(output)) {
    return output
      .filter((item): item is string => typeof item === "string")
      .filter((url) => url.startsWith("http"));
  }

  // Some newer models return an object with an `output` or `url` field
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === "string") {
      return [obj.url];
    }
    if (typeof obj.output === "string") {
      return [obj.output];
    }
    if (Array.isArray(obj.output)) {
      return (obj.output as unknown[])
        .filter((item): item is string => typeof item === "string")
        .filter((url) => url.startsWith("http"));
    }
  }

  return [];
}
