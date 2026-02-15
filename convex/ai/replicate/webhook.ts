import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { Prediction } from "replicate";
import Replicate from "replicate";
import { getApiKey } from "../encryption";
import { scheduleRunAfter } from "../../lib/scheduler";
import { toMessageDoc } from "../replicate_helpers";

type HandleWebhookArgs = {
  predictionId: string;
  status: string;
  output?: any;
  error?: string;
  metadata?: any;
};

export async function handleWebhookHandler(
  ctx: ActionCtx,
  args: HandleWebhookArgs,
) {
  try {
    // Validate status is one of the expected values from API spec
    const validStatuses: Prediction["status"][] = [
      "starting",
      "processing",
      "succeeded",
      "failed",
      "canceled",
    ];
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
    const existingMessage = await ctx.runQuery(
      internal.messages.internalGetByIdQuery,
      {
        id: messageDoc._id as Id<"messages">,
      },
    );
    const existingMessageDoc = toMessageDoc(existingMessage);

    const transformedMetadata = args.metadata
      ? {
          ...existingMessageDoc?.imageGeneration?.metadata,
          duration: args.metadata.predict_time || args.metadata.duration,
          // Only include fields that match our validator schema
        }
      : undefined;

    await ctx.runMutation(internal.messages.updateImageGeneration, {
      messageId: messageDoc._id as Id<"messages">,
      status: args.status,
      output: args.output
        ? Array.isArray(args.output)
          ? args.output
          : [args.output]
        : undefined,
      error: args.error,
      metadata: transformedMetadata,
    });

    // If the generation succeeded and we have output URLs, store the images
    if (args.status === "succeeded" && args.output) {
      const imageUrls = Array.isArray(args.output)
        ? args.output
        : [args.output];
      if (imageUrls.length > 0) {
        // Store images in background - don't block webhook response
        await scheduleRunAfter(
          ctx,
          0,
          internal.ai.replicate.storeGeneratedImages,
          {
            messageId: messageDoc._id as Id<"messages">,
            imageUrls,
            metadata: existingMessageDoc?.imageGeneration?.metadata,
          },
        );
      }
    }
  } catch (error) {
    console.error("Error handling webhook", {
      error: error instanceof Error ? error.message : String(error),
      predictionId: args.predictionId,
    });
  }
}

type CancelPredictionArgs = {
  predictionId: string;
  messageId: Id<"messages">;
};

export async function cancelPredictionHandler(
  ctx: ActionCtx,
  args: CancelPredictionArgs,
) {
  try {
    // Get the message to access conversationId and model info
    const messageResult = await ctx.runQuery(
      internal.messages.internalGetByIdQuery,
      {
        id: args.messageId,
      },
    );
    const messageDoc = toMessageDoc(messageResult);

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

    try {
      await replicate.predictions.cancel(args.predictionId);

      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "canceled",
      });
    } catch (cancelError) {
      console.warn("Failed to cancel prediction", {
        predictionId: args.predictionId,
        error:
          cancelError instanceof Error
            ? cancelError.message
            : String(cancelError),
      });

      // Don't throw error - cancellation failures shouldn't break the UI
    }
  } catch (error) {
    console.error("Error during cancellation", {
      error: error instanceof Error ? error.message : String(error),
      predictionId: args.predictionId,
    });
  }
}
