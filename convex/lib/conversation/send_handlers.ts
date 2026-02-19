import { getAuthUserId } from "../auth";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ImageModelInfo } from "../../ai/tools";
import { toImageModelInfos } from "./helpers";
import {
  buildContextMessages,
  incrementUserMessageStats,
} from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { scheduleRunAfter } from "../scheduler";
import { validateUserMessageLength } from "../shared_utils";

export { createUserMessageHandler } from "./create_message_handler";
export { startConversationHandler } from "./start_conversation_handler";

export async function sendMessageHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    content: string;
    model?: string;
    provider?: string;
    personaId?: Id<"personas">;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      url: string;
      name: string;
      size: number;
      content?: string;
      thumbnail?: string;
      storageId?: Id<"_storage">;
      mimeType?: string;
    }>;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    topK?: number;
    repetitionPenalty?: number;
  }
): Promise<{
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
}> {
  // Validate user message size before any writes
  validateUserMessageLength(args.content);
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }
  const [conversation, fullModel] = await Promise.all([
    ctx.runQuery(api.conversations.get, { id: args.conversationId }),
    getUserEffectiveModelWithCapabilities(ctx, args.model, args.provider),
  ]);

  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  // Use provided personaId, or fall back to conversation's existing personaId
  const effectivePersonaId =
    args.personaId !== undefined ? args.personaId : conversation?.personaId;

  // Store attachments as-is during message creation
  // PDF text extraction will happen during assistant response with progress indicators
  const processedAttachments = args.attachments;

  // Create user message first to maintain proper order
  const userMessageId = await ctx.runMutation(api.messages.create, {
    conversationId: args.conversationId,
    role: "user",
    content: args.content,
    attachments: processedAttachments,
    reasoningConfig: args.reasoningConfig,
    model: fullModel.modelId,
    provider: fullModel.provider,
    metadata:
      args.temperature !== undefined
        ? { temperature: args.temperature }
        : undefined,
  });

  // Create file entries for attachments if any
  if (processedAttachments && processedAttachments.length > 0) {
    await ctx.runMutation(internal.fileStorage.createUserFileEntries, {
      userId,
      messageId: userMessageId,
      conversationId: args.conversationId,
      attachments: processedAttachments,
    });
  }

  // Then create assistant message and update streaming in parallel
  const [assistantMessageId] = await Promise.all([
    // Create assistant placeholder with thinking status
    ctx.runMutation(api.messages.create, {
      conversationId: args.conversationId,
      role: "assistant",
      content: "",
      status: "thinking",
      model: fullModel.modelId,
      provider: fullModel.provider,
    }),

    // Mark conversation as streaming and bump updatedAt so it jumps to top
    ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
      updates: { isStreaming: true },
      setUpdatedAt: true,
    }),
  ]);

  // Load persona parameters if set and not explicitly overridden
  let personaParams: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    topK?: number;
    repetitionPenalty?: number;
  } = {};
  if (effectivePersonaId) {
    const persona = await ctx.runQuery(api.personas.get, {
      id: effectivePersonaId,
    });
    if (
      persona &&
      (persona as { advancedSamplingEnabled?: boolean })
        .advancedSamplingEnabled
    ) {
      // Only apply persona parameters if advanced sampling is enabled
      const rawParams = {
        // These fields are optional in the schema
        temperature: (persona as { temperature?: number }).temperature,
        topP: (persona as { topP?: number }).topP,
        topK: (persona as { topK?: number }).topK,
        frequencyPenalty: (persona as { frequencyPenalty?: number })
          .frequencyPenalty,
        presencePenalty: (persona as { presencePenalty?: number })
          .presencePenalty,
        repetitionPenalty: (persona as { repetitionPenalty?: number })
          .repetitionPenalty,
      };

      // Filter out undefined values
      personaParams = Object.fromEntries(
        Object.entries(rawParams).filter(([_, value]) => value !== undefined)
      ) as typeof personaParams;
    }
  }

  // Trigger summary generation in background based on context window limits
  // rather than message count. We estimate total tokens and compare against
  // the effective model context window with a conservative 100k cap to
  // protect multi-model conversations.
  try {
    // Prefer rolling estimate if present
    const latestConversation = await ctx.runQuery(api.conversations.get, {
      id: args.conversationId,
    });
    let totalTokens: number | null =
      latestConversation?.tokenEstimate ?? null;
    if (totalTokens === null || totalTokens === undefined) {
      totalTokens = await ctx.runQuery(
        api.messages.getConversationTokenEstimate,
        { conversationId: args.conversationId }
      );
    }

    // Use model context length if available; otherwise default to the cap
    const cap = 100_000; // conservative lower limit across providers
    const modelWindow = fullModel.contextLength || cap;
    const threshold = Math.min(modelWindow, cap);

    if ((totalTokens || 0) > threshold) {
      await scheduleRunAfter(
        ctx,
        5000,
        internal.conversationSummary.generateMissingSummaries,
        {
          conversationId: args.conversationId,
          forceRegenerate: false,
        }
      );
    }
  } catch (e) {
    console.warn("Failed to schedule token-aware summaries:", e);
  }

  // Query image models if the text model supports tools
  const supportsTools = fullModel.supportsTools ?? false;
  let imageModelsForTools: ImageModelInfo[] | undefined;
  if (supportsTools) {
    const userImageModels = await ctx.runQuery(
      internal.imageModels.getUserImageModelsInternal,
      { userId }
    );
    imageModelsForTools = toImageModelInfos(userImageModels);
  }

  // Build context messages
  const { contextMessages } = await buildContextMessages(ctx, {
    conversationId: args.conversationId,
    personaId: effectivePersonaId,
    modelCapabilities: {
      supportsImages: fullModel.supportsImages ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
    },
    provider: fullModel.provider,
    modelId: fullModel.modelId,
  });

  // Schedule server-side streaming
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: assistantMessageId,
    conversationId: args.conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    messages: contextMessages,
    personaId: effectivePersonaId,
    reasoningConfig: args.reasoningConfig,
    supportsTools,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    supportsTemperature: fullModel.supportsTemperature ?? undefined,
    imageModels: imageModelsForTools,
    userId,
  });

  return { userMessageId, assistantMessageId };
}
