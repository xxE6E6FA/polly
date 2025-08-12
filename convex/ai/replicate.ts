import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getApiKey } from "./encryption";
import { log } from "../lib/logger";
import Replicate from "replicate";
import type { Prediction } from "replicate";

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
          log.debug("Starting Replicate image generation", {
        messageId: args.messageId,
        model: args.model,
      });

    try {
      // Check if this is a retry by looking for existing image generation data
      const existingMessage = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: args.messageId,
      });
      
      const isRetry = existingMessage?.imageGeneration?.replicateId || 
                     existingMessage?.imageGeneration?.status === "failed" ||
                     existingMessage?.imageGeneration?.status === "canceled";
      

      
      if (isRetry) {
        log.debug("Detected image generation retry, clearing previous attachments", {
          messageId: args.messageId,
        });
        
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
      
      // Prepare input parameters - let each model define its own schema  
      const input: Record<string, unknown> = {
        prompt: args.prompt,
      };

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
          log.error("Failed to resolve model version", {
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
      
      log.debug("Replicate prediction created", {
        predictionId: prediction.id,
        status: prediction.status,
      });
      
      // Store prediction ID for tracking
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        replicateId: prediction.id,
        status: prediction.status,
      });
      
      // Start polling for completion (webhooks are preferred but polling is fallback)
      // Polling will automatically stop if webhook completes the prediction first
      await ctx.scheduler.runAfter(2000, internal.ai.replicate.pollPrediction, {
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
      log.error("Image generation failed", { error });
      
      // Update message with error
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
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
    log.debug("Polling prediction status", {
      predictionId: args.predictionId,
      attempt: args.attempt,
    });

    if (args.attempt > args.maxAttempts) {
      log.warn("Polling timeout reached", {
        predictionId: args.predictionId,
        maxAttempts: args.maxAttempts,
      });
      
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "failed",
        error: "Generation timed out",
      });
      return;
    }
    
    try {
      // Get the message to access conversationId and check if already completed
      const message = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: args.messageId,
      });
      
      // Check if webhook has already completed this prediction
      if (message?.imageGeneration?.status === "succeeded" || 
          message?.imageGeneration?.status === "failed" || 
          message?.imageGeneration?.status === "canceled") {
        log.info("Message already completed via webhook, stopping polling", {
          predictionId: args.predictionId,
          currentStatus: message.imageGeneration.status,
          attempt: args.attempt,
        });
        return;
      }
      
      const apiKey = await getApiKey(
        ctx, 
        "replicate",
        undefined, // modelId is not available here
        message?.conversationId
      );
      
      if (!apiKey) {
        throw new Error("No Replicate API key found");
      }
      
      // Initialize Replicate client
      const replicate = new Replicate({
        auth: apiKey,
      });
      
      const prediction = await replicate.predictions.get(args.predictionId);
      
      log.debug("Retrieved prediction status", {
        predictionId: args.predictionId,
        status: prediction.status,
        hasOutput: !!prediction.output,
        outputLength: prediction.output ? (Array.isArray(prediction.output) ? prediction.output.length : 1) : 0,
      });
      
      // Handle terminal states
      if (prediction.status === "succeeded") {
        log.debug("Image generation completed successfully", {
          predictionId: args.predictionId,
        });
        
        // Get the existing message to preserve original metadata
        const existingMessage = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
          id: args.messageId,
        });

        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "succeeded",
          output: Array.isArray(prediction.output) ? prediction.output : [prediction.output],
          metadata: {
            ...existingMessage?.imageGeneration?.metadata,
            duration: prediction.metrics?.predict_time,
          },
        });
        
        // Store the generated images in Convex storage
        if (prediction.output) {
          const imageUrls = Array.isArray(prediction.output) ? prediction.output : [prediction.output];
          if (imageUrls.length > 0) {
            // Store images in background - don't block the polling response
            await ctx.scheduler.runAfter(0, internal.ai.replicate.storeGeneratedImages, {
              messageId: args.messageId,
              imageUrls,
              metadata: existingMessage?.imageGeneration?.metadata,
            });
          }
        }
        
        return;
      }
      
      if (prediction.status === "failed") {
        log.warn("Image generation failed", {
          predictionId: args.predictionId,
          error: prediction.error,
        });
        
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "failed",
          error: prediction.error ? String(prediction.error) : "Generation failed",
        });
        return;
      }
      
      if (prediction.status === "canceled") {
        log.info("Image generation was canceled", {
          predictionId: args.predictionId,
        });
        
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "canceled",
        });
        return;
      }
      
      // Continue polling for non-terminal states (starting, processing)
      const nextPollDelay = args.attempt <= 3 ? 2000 : 5000; // Faster polling initially
      await ctx.scheduler.runAfter(nextPollDelay, internal.ai.replicate.pollPrediction, {
        ...args,
        attempt: args.attempt + 1,
      });
      
    } catch (error) {
      log.error("Error during prediction polling", { 
        error: error instanceof Error ? error.message : String(error),
        predictionId: args.predictionId,
        attempt: args.attempt,
      });
      
      // Retry with exponential backoff
      if (args.attempt < args.maxAttempts) {
        const retryDelay = Math.min(10000, 2000 * Math.pow(2, args.attempt - 1));
        await ctx.scheduler.runAfter(retryDelay, internal.ai.replicate.pollPrediction, {
          ...args,
          attempt: args.attempt + 1,
        });
      } else {
        await ctx.runMutation(internal.messages.updateImageGeneration, {
          messageId: args.messageId,
          status: "failed",
          error: "Failed to check generation status",
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
    const existingMessage = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
      id: args.messageId,
    });
    
    log.info("Checking for existing generated images", {
      messageId: args.messageId,
      hasAttachments: !!existingMessage?.attachments,
      attachmentCount: existingMessage?.attachments?.length || 0,
      imageUrls: args.imageUrls,
    });
    
    if (existingMessage?.attachments) {
      const existingGeneratedImages = existingMessage.attachments.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      );
      
      // Also check if any existing generated images have URLs that match what we're about to store
      const urlsToStore = new Set(args.imageUrls);
      const existingUrls = existingGeneratedImages.map(att => att.url);
      const hasMatchingUrls = existingUrls.some(url => urlsToStore.has(url));
      
      if (existingGeneratedImages.length > 0 || hasMatchingUrls) {
        log.debug("Skipping image storage - images already exist", {
          messageId: args.messageId,
        });
        return { storedCount: 0, skipped: true };
      }
    }
    
    log.debug("Storing generated images in Convex storage", {
      messageId: args.messageId,
      imageCount: args.imageUrls.length,
    });
    
    try {
      const attachments = [];
      
      for (let i = 0; i < args.imageUrls.length; i++) {
        const imageUrl = args.imageUrls[i];
        
        try {
          log.debug("Downloading image from Replicate", {
            imageUrl,
            index: i,
          });
          
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
          
          log.debug("Successfully stored generated image", {
            fileName,
            storageId,
            size: imageBuffer.byteLength,
          });
          
        } catch (imageError) {
          log.error("Failed to store individual image", {
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
        
        log.debug("Successfully stored generated images", {
          messageId: args.messageId,
          storedCount: attachments.length,
        });
      } else {
        log.warn("No images were successfully stored", {
          messageId: args.messageId,
          totalCount: args.imageUrls.length,
        });
      }
      
      return { storedCount: attachments.length };
      
    } catch (error) {
      log.error("Error storing generated images", {
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
    log.info("Processing Replicate webhook", {
      predictionId: args.predictionId,
      status: args.status,
    });
    
    try {
      // Validate status is one of the expected values from API spec
      const validStatuses: Prediction["status"][] = ["starting", "processing", "succeeded", "failed", "canceled"];
      if (!validStatuses.includes(args.status as Prediction["status"])) {
        log.warn("Received webhook with invalid status", {
          predictionId: args.predictionId,
          status: args.status,
        });
        return;
      }
      
      // Find message by Replicate prediction ID
      const message = await ctx.runQuery(internal.messages.getByReplicateId, {
        replicateId: args.predictionId,
      });
      
      if (!message) {
        log.warn("No message found for prediction ID", {
          predictionId: args.predictionId,
        });
        return;
      }
      
      // Update message with webhook data - preserve existing metadata and only update duration
      const existingMessage = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: message._id,
      });
      
      const transformedMetadata = args.metadata ? {
        ...existingMessage?.imageGeneration?.metadata,
        duration: args.metadata.predict_time || args.metadata.duration,
        // Only include fields that match our validator schema
      } : undefined;

      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: message._id,
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
          await ctx.scheduler.runAfter(0, internal.ai.replicate.storeGeneratedImages, {
            messageId: message._id,
            imageUrls,
            metadata: existingMessage?.imageGeneration?.metadata,
          });
        }
      }
      
      log.debug("Successfully updated message from webhook", {
        messageId: message._id,
        predictionId: args.predictionId,
      });
    } catch (error) {
      log.error("Error handling webhook", { 
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
    log.info("Canceling prediction", {
      predictionId: args.predictionId,
    });
    
    try {
      // Get the message to access conversationId
      const message = await ctx.runQuery(internal.messages.internalGetByIdQuery, {
        id: args.messageId,
      });
      
      const apiKey = await getApiKey(ctx, "replicate", undefined, message?.conversationId);
      
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
        
        log.debug("Successfully canceled prediction", {
          predictionId: args.predictionId,
        });
      } catch (cancelError) {
        log.warn("Failed to cancel prediction", {
          predictionId: args.predictionId,
          error: cancelError instanceof Error ? cancelError.message : String(cancelError),
        });
        
        // Don't throw error - cancellation failures shouldn't break the UI
      }
    } catch (error) {
      log.error("Error during cancellation", { 
        error: error instanceof Error ? error.message : String(error),
        predictionId: args.predictionId,
      });
    }
  },
});