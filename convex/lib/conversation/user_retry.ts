import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { ImageModelInfo } from "../../ai/tools";
import { toImageModelInfos } from "./helpers";
import { handleMessageDeletion } from "./message_handling";
import {
  buildContextMessages,
  executeStreamingActionForRetry,
} from "../conversation_utils";
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
    conversationId, reasoningConfig, user, conversation, messages,
    messageIndex, effectivePersonaId, requestedModel, requestedProvider,
  } = params;

  const fullModel = await getUserEffectiveModelWithCapabilities(ctx, requestedModel, requestedProvider);
  const contextEndIndex = messageIndex;

  // Delete messages after the user message (preserve the user message and context)
  await handleMessageDeletion(ctx, messages, messageIndex, "user");

  // Query image models if the text model supports tools
  const userRetrySupportsTools = fullModel.supportsTools ?? false;
  let imageModelsForUserRetry: ImageModelInfo[] | undefined;
  if (userRetrySupportsTools) {
    const userImageModels = await ctx.runQuery(
      internal.imageModels.getUserImageModelsInternal,
      { userId: user._id }
    );
    imageModelsForUserRetry = toImageModelInfos(userImageModels);
  }

  // Build context messages up to the retry point
  const { contextMessages } = await buildContextMessages(ctx, {
    conversationId,
    personaId: effectivePersonaId,
    includeUpToIndex: contextEndIndex,
    modelCapabilities: {
      supportsImages: fullModel.supportsImages ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
    },
    provider: fullModel.provider,
    modelId: fullModel.modelId,
    prefetchedMessages: messages,
    prefetchedModelInfo: { contextLength: fullModel.contextLength },
  });

  // Execute streaming action for retry (creates a NEW assistant message)
  const result = await executeStreamingActionForRetry(ctx, {
    conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    conversation: { ...conversation, personaId: effectivePersonaId },
    contextMessages,
    useWebSearch: true,
    reasoningConfig,
    supportsTools: userRetrySupportsTools,
    supportsFiles: fullModel.supportsFiles ?? false,
    imageModels: imageModelsForUserRetry,
    userId: user._id,
  });

  return { assistantMessageId: result.assistantMessageId };
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
