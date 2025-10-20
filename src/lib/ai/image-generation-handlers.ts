import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import type { ImageGenerationParams } from "@/types";

/**
 * Handle image generation request
 */
export async function handleImageGeneration(
  convexClient: ConvexReactClient,
  conversationId: Id<"conversations">,
  _messageId: Id<"messages">,
  prompt: string,
  params: ImageGenerationParams
): Promise<void> {
  try {
    // Create an assistant message to show the image generation progress
    const messageData = {
      conversationId,
      role: "assistant",
      content: "", // Will be updated with image when ready
      status: "streaming" as const, // Use streaming status for image generation
      model: "replicate",
      provider: "replicate",
      imageGeneration: {
        status: "starting",
        metadata: {
          model: params.model,
          prompt,
          params: {
            aspectRatio: params.aspectRatio,
            steps: params.steps,
            guidanceScale: params.guidanceScale,
            seed: params.seed,
            negativePrompt: params.negativePrompt,
            count: params.count,
          },
        },
      },
    };

    const assistantMessage = await convexClient.mutation(
      api.messages.create,
      messageData
    );

    // Mark conversation as streaming so UI ordering and badges stay in sync.
    await convexClient.mutation(api.conversations.setStreaming, {
      conversationId,
      isStreaming: true,
    });

    // Call Convex action for image generation
    await convexClient.action(api.ai.replicate.generateImage, {
      conversationId,
      messageId: assistantMessage,
      prompt,
      model: params.model,
      params: {
        aspectRatio: params.aspectRatio,
        steps: params.steps,
        guidanceScale: params.guidanceScale,
        seed: params.seed,
        negativePrompt: params.negativePrompt,
        count: params.count,
      },
    });
  } catch (error) {
    if (
      error instanceof ConvexError &&
      error.message.includes("No Replicate API key")
    ) {
      throw new Error(
        "No Replicate API key found. Please add one in Settings → API Keys."
      );
    }

    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to start image generation. Please try again."
    );
  }
}

/**
 * Retry failed image generation by updating the existing message
 */
export async function retryImageGeneration(
  convexClient: ConvexReactClient,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
  originalParams: {
    prompt: string;
    model: string;
    params: Omit<ImageGenerationParams, "prompt" | "model">;
  }
): Promise<void> {
  await convexClient.mutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming: true,
  });
  await convexClient.action(api.ai.replicate.generateImage, {
    conversationId,
    messageId,
    prompt: originalParams.prompt,
    model: originalParams.model,
    params: originalParams.params,
  });
}
