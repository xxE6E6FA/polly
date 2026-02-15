import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getApiKey } from "../encryption";
import Replicate from "replicate";
import { getUserFriendlyErrorMessage } from "../error_handlers";
import { scheduleRunAfter } from "../../lib/scheduler";
import { toMessageDoc } from "../replicate_helpers";

type PollPredictionArgs = {
  predictionId: string;
  messageId: Id<"messages">;
  maxAttempts: number;
  attempt: number;
};

export async function pollPredictionHandler(
  ctx: ActionCtx,
  args: PollPredictionArgs,
) {
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
    const messageResult = await ctx.runQuery(
      internal.messages.internalGetByIdQuery,
      {
        id: args.messageId,
      },
    );
    const messageDoc = toMessageDoc(messageResult);

    // Check if webhook has already completed this prediction
    if (
      messageDoc?.imageGeneration?.status === "succeeded" ||
      messageDoc?.imageGeneration?.status === "failed" ||
      messageDoc?.imageGeneration?.status === "canceled"
    ) {
      return;
    }

    // Check if a retry has replaced this prediction with a newer one.
    // Without this guard, a stale poll from the previous generation can
    // overwrite the retry's in-progress state with old results.
    if (messageDoc?.imageGeneration?.replicateId !== args.predictionId) {
      return;
    }

    // Get the model from the message metadata to check if it's a free built-in model
    const modelId = messageDoc?.imageGeneration?.metadata?.model;
    let isFreeBuiltInModel = false;
    if (modelId) {
      const builtInModel = await ctx.runQuery(
        internal.imageModels.getBuiltInImageModelByModelId,
        { modelId },
      );
      isFreeBuiltInModel = builtInModel?.free === true;
    }

    // Get API key - try user's key first, then server key for free models
    let apiKey: string | null = null;
    try {
      apiKey = await getApiKey(
        ctx,
        "replicate",
        undefined,
        messageDoc?.conversationId,
      );
    } catch {
      apiKey = null;
    }

    if (!apiKey && isFreeBuiltInModel) {
      apiKey = process.env.REPLICATE_API_KEY || null;
    }

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
      const existingMessageResult = await ctx.runQuery(
        internal.messages.internalGetByIdQuery,
        {
          id: args.messageId,
        },
      );
      const existingMessageDoc = toMessageDoc(existingMessageResult);

      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "succeeded",
        output: Array.isArray(prediction.output)
          ? prediction.output
          : [prediction.output],
        metadata: {
          ...existingMessageDoc?.imageGeneration?.metadata,
          duration: prediction.metrics?.predict_time,
        },
      });

      // Store the generated images in Convex storage
      if (prediction.output) {
        const imageUrls = Array.isArray(prediction.output)
          ? prediction.output
          : [prediction.output];
        if (imageUrls.length > 0) {
          // Store images in background - don't block the polling response
          await scheduleRunAfter(
            ctx,
            0,
            internal.ai.replicate.storeGeneratedImages,
            {
              messageId: args.messageId,
              imageUrls,
              metadata: existingMessageDoc?.imageGeneration?.metadata,
            },
          );
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
    await scheduleRunAfter(
      ctx,
      nextPollDelay,
      internal.ai.replicate.pollPrediction,
      {
        ...args,
        attempt: args.attempt + 1,
      },
    );
  } catch (error) {
    console.error("Error during prediction polling", {
      error: error instanceof Error ? error.message : String(error),
      predictionId: args.predictionId,
      attempt: args.attempt,
    });

    // Retry with exponential backoff
    if (args.attempt < args.maxAttempts) {
      const retryDelay = Math.min(10000, 2000 * 2 ** (args.attempt - 1));
      await scheduleRunAfter(
        ctx,
        retryDelay,
        internal.ai.replicate.pollPrediction,
        {
          ...args,
          attempt: args.attempt + 1,
        },
      );
    } else {
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "failed",
        error: getUserFriendlyErrorMessage(
          new Error("Failed to check generation status"),
        ),
      });
    }
  }
}

type StoreGeneratedImagesArgs = {
  messageId: Id<"messages">;
  imageUrls: string[];
  metadata?: {
    model?: string;
    prompt?: string;
    duration?: number;
    params?: {
      aspectRatio?: string;
      count?: number;
      guidanceScale?: number;
      steps?: number;
      seed?: number;
      negativePrompt?: string;
    };
  };
};

export async function storeGeneratedImagesHandler(
  ctx: ActionCtx,
  args: StoreGeneratedImagesArgs,
) {
  // Check if images are already stored to prevent duplicates from webhook/polling race conditions
  const existingMessageResult = await ctx.runQuery(
    internal.messages.internalGetByIdQuery,
    {
      id: args.messageId,
    },
  );
  const existingMessageDoc = toMessageDoc(existingMessageResult);

  if (
    existingMessageDoc?.attachments &&
    existingMessageDoc.attachments.length > 0
  ) {
    const existingGeneratedImages = existingMessageDoc.attachments.filter(
      (att: any) => att.type === "image" && att.generatedImage?.isGenerated,
    );

    // Also check if any existing generated images have URLs that match what we're about to store
    const urlsToStore = new Set(args.imageUrls);
    const existingUrls = existingGeneratedImages.map((att: any) => att.url);
    const hasMatchingUrls = existingUrls.some((url: any) =>
      urlsToStore.has(url),
    );

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
        const contentType =
          response.headers.get("content-type") || "image/jpeg";
        const imageBlob = new globalThis.Blob([imageBuffer], {
          type: contentType,
        });

        // Store in Convex storage
        const storageId = await ctx.storage.store(imageBlob);

        // Generate a name based on metadata
        const baseName = args.metadata?.model
          ? `${args.metadata.model.replace(/[^a-zA-Z0-9]/g, "_")}_generated`
          : "generated_image";
        const fileName =
          args.imageUrls.length > 1
            ? `${baseName}_${i + 1}.jpg`
            : `${baseName}.jpg`;

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
          error:
            imageError instanceof Error
              ? imageError.message
              : String(imageError),
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
}
