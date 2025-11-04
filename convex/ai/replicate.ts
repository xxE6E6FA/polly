import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getApiKey } from "./encryption";
import Replicate from "replicate";
import type { Prediction } from "replicate";
import { getUserFriendlyErrorMessage } from "./error_handlers";
import { scheduleRunAfter } from "../lib/scheduler";

function toMessageDoc(message: unknown): Doc<"messages"> | null {
  return message ? (message as Doc<"messages">) : null;
}

// Helper function to detect image editing models
function isImageEditingModel(modelName: string): boolean {
  // Known image editing models from Replicate's image editing collection
  const editingModels = [
    "google/nano-banana",
    "qwen/qwen2-vl",
    "ideogram/ideogram", 
    "ideogram/ideogram-v2",
    "ideogram/ideogram-v3",
    "black-forest-labs/flux-depth-pro",
    "black-forest-labs/flux-canny-pro", 
    "black-forest-labs/flux-kontext-pro",
    "black-forest-labs/flux-kontext-max",
    "xinntao/gpt-image-1",
    "lucataco/flux-schnell-t2i-adapter",
    "ostris/flux-dev-lora-trainer",
    "lucataco/sd3-medium",
    "cjwbw/controlnet",
    "rossjillian/controlnet",
  ];
  
  return editingModels.some(editModel => modelName.includes(editModel));
}

// Try to detect an image input parameter from the model's OpenAPI input schema
function detectImageInputFromSchema(modelData: any): { paramName: string; isArray: boolean } | null {
  try {
    const inputProps = modelData?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties;
    if (!inputProps || typeof inputProps !== "object") return null;

    type Candidate = { key: string; isArray: boolean; score: number };
    const candidates: Candidate[] = [];

    const prioritize = (key: string): number => {
      const order = [
        "image_input",
        "image_inputs",
        "image",
        "input_image",
        "init_image",
        "reference_image",
        "conditioning_image",
      ];
      const idx = order.findIndex(k => key.includes(k));
      return idx === -1 ? 999 : idx;
    };

    for (const [key, raw] of Object.entries<any>(inputProps)) {
      const k = key.toLowerCase();
      const desc = String(raw?.description || "").toLowerCase();
      const type = raw?.type;
      const items = raw?.items;
      const looksImagey =
        k.includes("image") ||
        desc.includes("image") ||
        desc.includes("img") ||
        desc.includes("photo");
      if (!looksImagey) continue;

      if (type === "array" && items && (items.type === "string" || items.format === "uri" || items.format === "binary")) {
        candidates.push({ key, isArray: true, score: prioritize(k) });
      } else if (type === "string" || raw?.format === "uri" || raw?.format === "binary") {
        candidates.push({ key, isArray: false, score: prioritize(k) });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    const bestCandidate = candidates[0];
    if (!bestCandidate) return null;
    return { paramName: bestCandidate.key, isArray: bestCandidate.isArray };
  } catch {
    return null;
  }
}

// Helper function to get the appropriate image input parameter name and format for editing models
function getImageInputConfig(modelName: string): { paramName: string; isArray: boolean } {
  // Different models use different parameter names and formats for input images
  if (modelName.includes("nano-banana")) return { paramName: "image_input", isArray: true };
  if (modelName.includes("qwen")) return { paramName: "image", isArray: false }; 
  if (modelName.includes("ideogram")) return { paramName: "image", isArray: false };
  if (modelName.includes("flux")) return { paramName: "image", isArray: false };
  if (modelName.includes("gpt-image")) return { paramName: "image", isArray: false };
  if (modelName.toLowerCase().includes("seedream")) return { paramName: "image_input", isArray: true };
  
  // Default fallback
  return { paramName: "image", isArray: false };
}

// Helper function to convert aspect ratio to width/height dimensions
// Ensures all dimensions are divisible by 8 (required by most AI models)
function convertAspectRatioToDimensions(aspectRatio: string): { width: number; height: number } {
  const baseSize = 1024; // Standard size for most models (already divisible by 8)
  
  // Helper to round to nearest multiple of 8
  const roundToMultipleOf8 = (value: number): number => {
    return Math.round(value / 8) * 8;
  };
  
  switch (aspectRatio) {
    case "1:1":
      return { width: baseSize, height: baseSize }; // 1024x1024
    case "16:9":
      // 16:9 ratio from 1024 height = 1820x1024, round to 1824x1024
      return { width: roundToMultipleOf8(baseSize * (16 / 9)), height: baseSize };
    case "9:16":
      // 9:16 ratio from 1024 width = 1024x1820, round to 1024x1824
      return { width: baseSize, height: roundToMultipleOf8(baseSize * (16 / 9)) };
    case "4:3":
      // 4:3 ratio from 1024 height = 1365x1024, round to 1368x1024
      return { width: roundToMultipleOf8(baseSize * (4 / 3)), height: baseSize };
    case "3:4":
      // 3:4 ratio from 1024 width = 1024x1365, round to 1024x1368
      return { width: baseSize, height: roundToMultipleOf8(baseSize * (4 / 3)) };
    default:
      // Parse custom ratio like "3:2"
      const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
      if (widthRatio && heightRatio) {
        const ratio = widthRatio / heightRatio;
        if (ratio > 1) {
          // Landscape: fix height, calculate width
          return { width: roundToMultipleOf8(baseSize * ratio), height: baseSize };
        } else {
          // Portrait: fix width, calculate height
          return { width: baseSize, height: roundToMultipleOf8(baseSize / ratio) };
        }
      }
      // Fallback to square
      return { width: baseSize, height: baseSize };
  }
}

/**
 * Replicate image generation (text-to-image and image-to-image)
 *
 * Behavior
 * - Accepts a free-form `prompt`, a Replicate `model` (owner/name or version id), and optional params.
 * - Automatically detects if the model accepts an image input by inspecting the model's OpenAPI Input schema.
 *   - If an image input parameter is present, we set it using:
 *     1) The latest user-uploaded image in the conversation (preferred), otherwise
 *     2) The latest assistant-generated image in the conversation (fallback).
 *   - If no image is found, we proceed without an input image (pure text-to-image).
 * - Known model shims:
 *   - Seedream 4: uses `image_input` as an array (file[]). We map to that when detected.
 * - Aspect ratio handling:
 *   - If the model supports `aspect_ratio`, we pass it directly.
 *   - Otherwise we compute width/height from the requested aspect ratio with multiples of 8.
 * - Multiple images: attempts `num_outputs` and `batch_size` when `params.count` is set (1–4).
 * - Negative prompts: sends `negative_prompt` when provided.
 *
 * Inputs
 * - args.conversationId: Conversation context used to locate reference images.
 * - args.messageId: Assistant message which tracks generation state and stores output images.
 * - args.prompt: User prompt for the model.
 * - args.model: Replicate model id ("owner/name") or version id.
 * - args.params: Optional tuning parameters (aspectRatio, steps, guidanceScale, seed, negativePrompt, count).
 */
export const generateImage = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"), 
    prompt: v.string(),
    model: v.string(),
    params: v.optional(v.object({
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      aspectRatio: v.optional(v.string()),
      steps: v.optional(v.number()),
      guidanceScale: v.optional(v.number()),
      seed: v.optional(v.number()),
      negativePrompt: v.optional(v.string()),
      count: v.optional(v.number()),
    })),
  },
  
  handler: async (ctx, args) => {
    try {
      // Check if this is a retry by looking for existing image generation data
      const existingMessage = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: args.messageId,
      });
      const existingMessageDoc = toMessageDoc(existingMessage);

      const isRetry = Boolean(
        existingMessageDoc?.imageGeneration?.replicateId ||
          existingMessageDoc?.imageGeneration?.status === "failed" ||
          existingMessageDoc?.imageGeneration?.status === "canceled"
      );
      

      
      if (isRetry) {
        // Clear previous image generation attachments
        await ctx.runMutation(internal.messages.clearImageGenerationAttachments, {
          messageId: args.messageId,
        });
        
        // Reset image generation status
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "starting",
          output: undefined,
          error: undefined,
        });
      }
      // Get Replicate API key
      const apiKey = await getApiKey(ctx, "replicate", undefined, args.conversationId);
      
      if (!apiKey) {
        throw new Error("No Replicate API key found. Please add one in Settings.");
      }
      
      // Initialize Replicate client
      const replicate = new Replicate({
        auth: apiKey,
      });
      
      // Check if model supports aspect ratio parameter based on known models
      // This is a simplified approach since we no longer cache all model capabilities
      const aspectRatioSupportedModels = [
        "black-forest-labs/flux-schnell",
        "black-forest-labs/flux-dev", 
        "black-forest-labs/flux-pro",
        "stability-ai/sdxl",
        "stability-ai/stable-diffusion-xl-base-1.0",
        "lucataco/sdxl",
      ];
      const supportsAspectRatio = aspectRatioSupportedModels.some(supported => args.model.includes(supported));
      
      // Determine if the model accepts an image input and prepare input image(s)
      let inputImageUrls: string[] = [];
      let imageInputConfig: { paramName: string; isArray: boolean } | null = null;
      
      // Resolve model version and introspect schema to detect image input param
      try {
        const [owner, name] = args.model.split("/");
        if (!owner || !name) {
          throw new Error("Model must be specified as 'owner/name'");
        }
        const modelData = await replicate.models.get(owner, name);
        const schemaConfig = detectImageInputFromSchema(modelData);
        if (schemaConfig) {
          imageInputConfig = schemaConfig;
        } else if (isImageEditingModel(args.model)) {
          imageInputConfig = getImageInputConfig(args.model);
        }
      } catch {
        // Fall back to heuristic if version lookup fails
        if (isImageEditingModel(args.model)) {
          imageInputConfig = getImageInputConfig(args.model);
        }
      }

      const acceptsImageInput = !!imageInputConfig;

      const redactUrlForLog = (url: string) =>
        url.startsWith("data:") ? "<data-url>" : url;

      const previewUrlsForLog = (urls: string[]) =>
        urls.slice(0, 3).map(redactUrlForLog);

      const resolveImageUrlsFromAttachments = async (
        attachments: any[] | undefined
      ): Promise<string[]> => {
        if (!Array.isArray(attachments) || attachments.length === 0) {
          return [];
        }

        const resolved: string[] = [];
        for (const att of attachments) {
          if (!att || att.type !== "image") {
            continue;
          }

          if (typeof att.url === "string" && att.url.trim()) {
            resolved.push(att.url);
          } else if (att.storageId) {
            const storageUrl = await ctx.storage.getUrl(att.storageId);
            if (storageUrl) {
              resolved.push(storageUrl);
            }
          }
        }

        return resolved;
      };

      if (acceptsImageInput) {
        // Get conversation messages to find user-uploaded image(s) first,
        // otherwise fall back to the most recent assistant-generated image(s)
        const messages = await ctx.runQuery(
          internal.messages.getAllInConversationInternal,
          {
            conversationId: args.conversationId,
          }
        );

        const assistantMessageIndex = messages.findIndex(
          (msg: any) => msg._id === args.messageId
        );

        // 1) Prefer the most recent user message (typically the one that triggered this generation)
        if (assistantMessageIndex !== -1) {
          for (let i = assistantMessageIndex - 1; i >= 0; i--) {
            const candidate: any = messages[i];
            if (candidate.role !== "user") {
              continue;
            }

            const urls = await resolveImageUrlsFromAttachments(candidate.attachments);
            if (urls.length > 0) {
              inputImageUrls = urls;
              break;
            }

            // Stop scanning once we hit a user message even if it has no attachments,
            // because older user uploads should not override the latest request.
            break;
          }
        }

        // 2) Fallback: look for the most recent assistant message with generated image(s)
        if (inputImageUrls.length === 0) {
          const startIndex =
            assistantMessageIndex === -1
              ? messages.length - 1
              : assistantMessageIndex - 1;

          for (let i = startIndex; i >= 0; i--) {
            const message: any = messages[i];
            if (message.role !== "assistant" || !message.attachments) {
              continue;
            }

            const attachments = Array.isArray(message.attachments)
              ? message.attachments.filter((att: any) => att?.type === "image")
              : [];

            if (attachments.length === 0) {
              continue;
            }

            const generatedFirst = attachments.filter(
              (att: any) => att.generatedImage?.isGenerated
            );
            const others = attachments.filter(
              (att: any) => !att.generatedImage?.isGenerated
            );
            const prioritized = generatedFirst.concat(others);

            const urls = await resolveImageUrlsFromAttachments(prioritized);
            if (urls.length > 0) {
              inputImageUrls = urls;
              break;
            }
          }
        }

        if (inputImageUrls.length === 0) {
          // Note: When no input image is found, editing models typically fall back to generation mode
        }
      }

      // Prepare input parameters - let each model define its own schema  
      const input: Record<string, unknown> = {
        prompt: args.prompt,
      };
      
      // Add input image when the model accepts an image input
      if (imageInputConfig && inputImageUrls.length > 0) {
        input[imageInputConfig.paramName] = imageInputConfig.isArray
          ? inputImageUrls
          : inputImageUrls[0];
      }

      // Add optional parameters if provided
      if (args.params) {
        // Handle aspect ratio or dimensions based on model support
        if (args.params.aspectRatio) {
          if (supportsAspectRatio) {
            // Model supports aspect_ratio parameter
            input.aspect_ratio = args.params.aspectRatio;
          } else {
            // Model doesn't support aspect_ratio, convert to width/height
            const dimensions = convertAspectRatioToDimensions(args.params.aspectRatio);
            input.width = dimensions.width;
            input.height = dimensions.height;
          }
        }
        
        if (args.params.width && !args.params.aspectRatio) {
          input.width = args.params.width;
        }
        if (args.params.height && !args.params.aspectRatio) {
          input.height = args.params.height;
        }
        
        if (args.params.steps) {
          input.num_inference_steps = args.params.steps;
        }
        
        if (args.params.guidanceScale) {
          input.guidance_scale = args.params.guidanceScale;
        }
        
        if (args.params.seed) {
          input.seed = args.params.seed;
        }
        
        if (args.params.negativePrompt && args.params.negativePrompt.trim()) {
          input.negative_prompt = args.params.negativePrompt;
        }
        
        if (args.params.count && args.params.count >= 1 && args.params.count <= 4) {
          // Try both num_outputs and batch_size parameters
          // Some models use num_outputs, others use batch_size
          input.num_outputs = args.params.count;
          input.batch_size = args.params.count;
        }
        
        // Disable safety checker for faster generation and to avoid false positives
        input.disable_safety_checker = true;
      }
      
      // Prepare prediction body according to API spec
      const predictionBody: Partial<Prediction> = {
        input,
        webhook: process.env.CONVEX_SITE_URL ? 
          `${process.env.CONVEX_SITE_URL}/webhooks/replicate` : undefined,
        webhook_events_filter: ["start", "completed"],
      };



      // Handle model vs version field according to API spec
      if (args.model.length === 64 && /^[a-f0-9]+$/.test(args.model)) {
        // This is a 64-character version ID
        predictionBody.version = args.model;

      } else {
        // For model names (owner/name format), resolve to latest version
        try {
          const [owner, name] = args.model.split("/");
          if (!owner || !name) {
            throw new Error(`Invalid model format: ${args.model}. Use 'owner/name' format.`);
          }
          
          const modelData = await replicate.models.get(owner, name);
          const latestVersion = modelData.latest_version?.id;
          
          if (!latestVersion) {
            throw new Error(`No version available for model: ${args.model}`);
          }
          
          predictionBody.version = latestVersion;

        } catch (error) {
          console.error("Failed to resolve model version", {
            model: args.model,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error(`Failed to resolve model: ${args.model}. Please check the model name or provide a version ID.`);
        }
      }

      if (!predictionBody.version) {
        throw new Error("Model version is required");
      }
      


      // Create prediction using Replicate client
      const prediction = await replicate.predictions.create({
        version: predictionBody.version!,
        input,
        webhook: predictionBody.webhook,
        webhook_events_filter: predictionBody.webhook_events_filter,
      });
      
      // Store prediction ID for tracking
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        replicateId: prediction.id,
        status: prediction.status,
      });
      
      // Start polling for completion (webhooks are preferred but polling is fallback)
      // Polling will automatically stop if webhook completes the prediction first
      await scheduleRunAfter(ctx, 2000, internal.ai.replicate.pollPrediction, {
        predictionId: prediction.id,
        messageId: args.messageId,
        maxAttempts: 60, // 5 minutes max (5s * 60 = 300s)
        attempt: 1,
      });
      
      return {
        replicateId: prediction.id,
        status: prediction.status,
      };
    } catch (error) {
      console.error("Image generation failed", { error });
      
      const friendlyError = getUserFriendlyErrorMessage(error);
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "failed",
        error: friendlyError,
      });
      
      throw error;
    }
  },
});

export const pollPrediction = internalAction({
  args: {
    predictionId: v.string(),
    messageId: v.id("messages"),
    maxAttempts: v.number(),
    attempt: v.number(),
  },
  
  handler: async (ctx, args) => {
    if (args.attempt > args.maxAttempts) {
      console.warn("Polling timeout reached", {
        predictionId: args.predictionId,
        maxAttempts: args.maxAttempts,
      });
      
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "failed",
        error: getUserFriendlyErrorMessage(new Error("Generation timed out")),
      });
      return;
    }
    
    try {
      // Get the message to access conversationId and check if already completed
      const messageResult = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: args.messageId,
      });
      const messageDoc = toMessageDoc(messageResult);
      
      // Check if webhook has already completed this prediction
      if (messageDoc?.imageGeneration?.status === "succeeded" ||
          messageDoc?.imageGeneration?.status === "failed" ||
          messageDoc?.imageGeneration?.status === "canceled") {
        return;
      }
      
      const apiKey = await getApiKey(
        ctx, 
        "replicate",
        undefined, // modelId is not available here
        messageDoc?.conversationId
      );
      
      if (!apiKey) {
        throw new Error("No Replicate API key found");
      }
      
      // Initialize Replicate client
      const replicate = new Replicate({
        auth: apiKey,
      });
      
      const prediction = await replicate.predictions.get(args.predictionId);
      
      // Handle terminal states
      if (prediction.status === "succeeded") {
        // Get the existing message to preserve original metadata
        const existingMessageResult = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
          id: args.messageId,
        });
        const existingMessageDoc = toMessageDoc(existingMessageResult);

        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "succeeded",
          output: Array.isArray(prediction.output) ? prediction.output : [prediction.output],
          metadata: {
            ...existingMessageDoc?.imageGeneration?.metadata,
            duration: prediction.metrics?.predict_time,
          },
        });
        
        // Store the generated images in Convex storage
        if (prediction.output) {
          const imageUrls = Array.isArray(prediction.output) ? prediction.output : [prediction.output];
          if (imageUrls.length > 0) {
            // Store images in background - don't block the polling response
            await scheduleRunAfter(ctx, 0, internal.ai.replicate.storeGeneratedImages, {
              messageId: args.messageId,
              imageUrls,
              metadata: existingMessageDoc?.imageGeneration?.metadata,
            });
          }
        }
        
        return;
      }
      
      if (prediction.status === "failed") {
        console.warn("Image generation failed", {
          predictionId: args.predictionId,
          error: prediction.error,
        });
        
        const errorMessage = prediction.error
          ? getUserFriendlyErrorMessage(new Error(String(prediction.error)))
          : "Generation failed";
        
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "failed",
          error: errorMessage,
        });
        return;
      }
      
      if (prediction.status === "canceled") {
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "canceled",
        });
        return;
      }
      
      // Continue polling for non-terminal states (starting, processing)
      const nextPollDelay = args.attempt <= 3 ? 2000 : 5000; // Faster polling initially
      await scheduleRunAfter(ctx, nextPollDelay, internal.ai.replicate.pollPrediction, {
        ...args,
        attempt: args.attempt + 1,
      });
      
    } catch (error) {
      console.error("Error during prediction polling", { 
        error: error instanceof Error ? error.message : String(error),
        predictionId: args.predictionId,
        attempt: args.attempt,
      });
      
      // Retry with exponential backoff
      if (args.attempt < args.maxAttempts) {
        const retryDelay = Math.min(10000, 2000 * Math.pow(2, args.attempt - 1));
        await scheduleRunAfter(ctx, retryDelay, internal.ai.replicate.pollPrediction, {
          ...args,
          attempt: args.attempt + 1,
        });
      } else {
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "failed",
          error: getUserFriendlyErrorMessage(new Error("Failed to check generation status")),
        });
      }
    }
  },
});

export const storeGeneratedImages = internalAction({
  args: {
    messageId: v.id("messages"),
    imageUrls: v.array(v.string()),
    metadata: v.optional(v.object({
      model: v.optional(v.string()),
      prompt: v.optional(v.string()),
      duration: v.optional(v.float64()),
      params: v.optional(v.object({
        aspectRatio: v.optional(v.string()),
        count: v.optional(v.float64()),
        guidanceScale: v.optional(v.float64()),
        steps: v.optional(v.float64()),
        seed: v.optional(v.float64()),
        negativePrompt: v.optional(v.string()),
      })),
    })),
  },
  
  handler: async (ctx, args) => {
    
    // Check if images are already stored to prevent duplicates from webhook/polling race conditions
    const existingMessageResult = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
      id: args.messageId,
    });
    const existingMessageDoc = toMessageDoc(existingMessageResult);

    if (existingMessageDoc?.attachments && existingMessageDoc.attachments.length > 0) {
      const existingGeneratedImages = existingMessageDoc.attachments.filter(
        (att: any) => att.type === "image" && att.generatedImage?.isGenerated
      );

      // Also check if any existing generated images have URLs that match what we're about to store
      const urlsToStore = new Set(args.imageUrls);
      const existingUrls = existingGeneratedImages.map((att: any) => att.url);
      const hasMatchingUrls = existingUrls.some((url: any) => urlsToStore.has(url));
      
      if (existingGeneratedImages.length > 0 || hasMatchingUrls) {
        return { storedCount: 0, skipped: true };
      }
    }
    
    try {
      const attachments = [];
      
      for (let i = 0; i < args.imageUrls.length; i++) {
        const imageUrl = args.imageUrls[i];
        if (!imageUrl) {
          continue;
        }
        
        try {
          // Download the image from Replicate
          const response = await fetch(imageUrl);
          
          if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
          }
          
          // Get the image data
          const imageBuffer = await response.arrayBuffer();
          
          // Create a blob for storage
          const contentType = response.headers.get("content-type") || "image/jpeg";
          const imageBlob = new globalThis.Blob([imageBuffer], { 
            type: contentType
          });
          
          // Store in Convex storage
          const storageId = await ctx.storage.store(imageBlob);
          
          // Generate a name based on metadata
          const baseName = args.metadata?.model ? 
            `${args.metadata.model.replace(/[^a-zA-Z0-9]/g, '_')}_generated` : 
            "generated_image";
          const fileName = args.imageUrls.length > 1 ? 
            `${baseName}_${i + 1}.jpg` : 
            `${baseName}.jpg`;
          
          // Create attachment object with generation metadata
          const attachment = {
            type: "image" as const,
            url: imageUrl, // Keep original URL for reference
            name: fileName,
            size: imageBuffer.byteLength,
            storageId: storageId as Id<"_storage">,
            mimeType: response.headers.get("content-type") || "image/jpeg",
            // Add metadata to identify this as a generated image
            generatedImage: {
              isGenerated: true,
              source: "replicate",
              model: args.metadata?.model,
              prompt: args.metadata?.prompt,
            },
          };
          
          attachments.push(attachment);
          
        } catch (imageError) {
          console.error("Failed to store individual image", {
            imageUrl,
            index: i,
            error: imageError instanceof Error ? imageError.message : String(imageError),
          });
          // Continue with other images even if one fails
        }
      }
      
      if (attachments.length > 0) {
        // Update the message with the stored attachments in the main attachments field
        await ctx.runMutation(internal.messages.addAttachments, {
          messageId: args.messageId,
          attachments,
        });
        
      } else {
        console.warn("No images were successfully stored", {
          messageId: args.messageId,
          totalCount: args.imageUrls.length,
        });
      }
      
      return { storedCount: attachments.length };
      
    } catch (error) {
      console.error("Error storing generated images", {
        messageId: args.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

export const handleWebhook = internalAction({
  args: {
    predictionId: v.string(),
    status: v.string(),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  
  handler: async (ctx, args) => {
    try {
      // Validate status is one of the expected values from API spec
      const validStatuses: Prediction["status"][] = ["starting", "processing", "succeeded", "failed", "canceled"];
      if (!validStatuses.includes(args.status as Prediction["status"])) {
        console.warn("Received webhook with invalid status", {
          predictionId: args.predictionId,
          status: args.status,
        });
        return;
      }
      
      // Find message by Replicate prediction ID
      const message = await ctx.runQuery(internal.messages.getByReplicateId, {
        replicateId: args.predictionId,
      });
      const messageDoc = toMessageDoc(message);

      if (!messageDoc) {
        console.warn("No message found for prediction ID", {
          predictionId: args.predictionId,
        });
        return;
      }
      
      // Update message with webhook data - preserve existing metadata and only update duration
      const existingMessage = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: messageDoc._id as Id<"messages">,
      });
      const existingMessageDoc = toMessageDoc(existingMessage);

      const transformedMetadata = args.metadata ? {
        ...existingMessageDoc?.imageGeneration?.metadata,
        duration: args.metadata.predict_time || args.metadata.duration,
        // Only include fields that match our validator schema
      } : undefined;

      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: messageDoc._id as Id<"messages">,
        status: args.status,
        output: args.output ? (Array.isArray(args.output) ? args.output : [args.output]) : undefined,
        error: args.error,
        metadata: transformedMetadata,
      });
      
      // If the generation succeeded and we have output URLs, store the images
      if (args.status === "succeeded" && args.output) {
        const imageUrls = Array.isArray(args.output) ? args.output : [args.output];
        if (imageUrls.length > 0) {
          // Store images in background - don't block webhook response
          await scheduleRunAfter(ctx, 0, internal.ai.replicate.storeGeneratedImages, {
            messageId: messageDoc._id as Id<"messages">,
            imageUrls,
            metadata: existingMessageDoc?.imageGeneration?.metadata,
          });
        }
      }
      
    } catch (error) {
      console.error("Error handling webhook", { 
        error: error instanceof Error ? error.message : String(error),
        predictionId: args.predictionId,
      });
    }
  },
});

export const cancelPrediction = internalAction({
  args: {
    predictionId: v.string(),
    messageId: v.id("messages"),
  },
  
  handler: async (ctx, args) => {
    try {
      // Get the message to access conversationId
      const messageResult = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: args.messageId,
      });
      const messageDoc = toMessageDoc(messageResult);

      const apiKey = await getApiKey(ctx, "replicate", undefined, messageDoc?.conversationId);
      
      if (!apiKey) {
        throw new Error("No Replicate API key found");
      }
      
      // Initialize Replicate client
      const replicate = new Replicate({
        auth: apiKey,
      });
      
      try {
        await replicate.predictions.cancel(args.predictionId);
        
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "canceled",
        });
        
      } catch (cancelError) {
        console.warn("Failed to cancel prediction", {
          predictionId: args.predictionId,
          error: cancelError instanceof Error ? cancelError.message : String(cancelError),
        });
        
        // Don't throw error - cancellation failures shouldn't break the UI
      }
    } catch (error) {
      console.error("Error during cancellation", { 
        error: error instanceof Error ? error.message : String(error),
        predictionId: args.predictionId,
      });
    }
  },
});

// Test-only helpers export
// This object is tree-shakeable and harmless in production.
export const __test__ = {
  detectImageInputFromSchema,
  getImageInputConfig,
  isImageEditingModel,
};
