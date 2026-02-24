import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { handleMessageDeletion } from "./message_handling";
import { executeStreamMessage } from "../../streaming_actions";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";

export async function handleReplicateUserRetry(
  ctx: ActionCtx,
  params: {
    conversationId: Id<"conversations">;
    messages: Doc<"messages">[];
    messageIndex: number;
    targetMessage: Doc<"messages">;
    requestedModel: string | undefined;
  }
): Promise<{ assistantMessageId: Id<"messages"> }> {
  const { conversationId, messages, messageIndex, targetMessage, requestedModel } = params;

  const prompt = targetMessage.content || "";
  const subsequentAssistant = messages
    .slice(messageIndex + 1)
    .find(msg => msg.role === "assistant" && msg.imageGeneration);

  const previousMetadata = subsequentAssistant?.imageGeneration?.metadata;
  const candidateModel = requestedModel || (previousMetadata?.model as string | undefined);

  if (!candidateModel) {
    throw new Error(
      "Unable to determine Replicate model for retry. Please choose a model and try again."
    );
  }

  const sanitizedParams = sanitizeReplicateParams(previousMetadata?.params);

  // Delete messages after the user message (preserve the user message and context)
  await handleMessageDeletion(ctx, messages, messageIndex, "user");

  if (
    targetMessage.model !== candidateModel ||
    targetMessage.provider?.toLowerCase() !== "replicate"
  ) {
    await ctx.runMutation(internal.messages.internalUpdate, {
      id: targetMessage._id,
      model: candidateModel,
      provider: "replicate",
    });
  }

  const imageGenerationMetadata: {
    model: string;
    prompt: string;
    params?: ReplicateParams;
  } = { model: candidateModel, prompt };

  if (sanitizedParams && Object.keys(sanitizedParams).length > 0) {
    imageGenerationMetadata.params = sanitizedParams;
  }

  const assistantMessageId = await ctx.runMutation(api.messages.create, {
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    model: "replicate",
    provider: "replicate",
    imageGeneration: { status: "starting", metadata: imageGenerationMetadata },
  });

  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: true },
    setUpdatedAt: true,
  });

  await ctx.runAction(api.ai.replicate.generateImage, {
    conversationId,
    messageId: assistantMessageId,
    prompt,
    model: candidateModel,
    params:
      sanitizedParams && Object.keys(sanitizedParams).length > 0
        ? sanitizedParams
        : undefined,
  });

  return { assistantMessageId };
}

export async function handleUserRetry(
  ctx: ActionCtx,
  params: {
    conversationId: Id<"conversations">;
    reasoningConfig?: { enabled: boolean };
    user: Doc<"users">;
    conversation: Doc<"conversations">;
    messages: Doc<"messages">[];
    messageIndex: number;
    effectivePersonaId: Id<"personas"> | undefined;
    requestedModel: string | undefined;
    requestedProvider: string | undefined;
  }
): Promise<{ assistantMessageId: Id<"messages"> }> {
  const {
    conversationId, reasoningConfig, user, messages,
    messageIndex, effectivePersonaId, requestedModel, requestedProvider,
  } = params;

  // Delete messages after the user message (preserve the user message and context)
  await handleMessageDeletion(ctx, messages, messageIndex, "user");

  // Compute IDs for messages that were deleted (for reference)
  const fullModel = await getUserEffectiveModelWithCapabilities(ctx, requestedModel, requestedProvider);

  // Create assistant message + set streaming state via combined mutation
  const { assistantMessageId, streamingArgs } = await ctx.runMutation(
    internal.conversations.prepareEditAndResend,
    {
      userId: user._id,
      conversationId,
      userMessageId: messages[messageIndex]!._id,
      newContent: messages[messageIndex]!.content,
      messageIdsToDelete: [], // Already deleted above via handleMessageDeletion
      model: fullModel.modelId,
      provider: fullModel.provider,
      personaId: effectivePersonaId,
      reasoningConfig,
    },
  );

  // Direct streaming call — skip scheduler hop
  await executeStreamMessage(ctx, {
    messageId: assistantMessageId,
    conversationId,
    model: streamingArgs.modelId,
    provider: streamingArgs.provider,
    personaId: effectivePersonaId,
    reasoningConfig,
    supportsTools: streamingArgs.supportsTools,
    supportsImages: streamingArgs.supportsImages,
    supportsFiles: streamingArgs.supportsFiles,
    supportsReasoning: streamingArgs.supportsReasoning,
    supportsTemperature: streamingArgs.supportsTemperature,
    contextLength: streamingArgs.contextLength,
    contextEndIndex: messageIndex,
    userId: user._id,
  });

  return { assistantMessageId };
}

// --- Shared helpers ---

type ReplicateParams = {
  aspectRatio?: string;
  steps?: number;
  guidanceScale?: number;
  seed?: number;
  negativePrompt?: string;
  count?: number;
};

const ALLOWED_REPLICATE_PARAM_KEYS = new Set([
  "aspectRatio", "steps", "guidanceScale", "seed", "negativePrompt", "count",
]);

function sanitizeReplicateParams(
  params: Record<string, unknown> | undefined
): ReplicateParams | undefined {
  if (!params) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(params).filter(
      ([key, value]) =>
        ALLOWED_REPLICATE_PARAM_KEYS.has(key) &&
        value !== undefined &&
        value !== null
    )
  ) as ReplicateParams;
}
