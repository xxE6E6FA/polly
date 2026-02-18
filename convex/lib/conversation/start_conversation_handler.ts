import { getAuthUserId } from "../auth";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ImageModelInfo } from "../../ai/tools";
import { toImageModelInfos } from "./helpers";
import { buildContextMessages } from "../conversation_utils";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { scheduleRunAfter } from "../scheduler";
import { validateUserMessageLength } from "../shared_utils";

export async function startConversationHandler(
  ctx: ActionCtx,
  args: {
    clientId: string;
    content: string;
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
    model?: string;
    provider?: string;
    reasoningConfig?: {
      enabled: boolean;
      effort: "low" | "medium" | "high";
      maxTokens?: number;
    };
    temperature?: number;
  }
): Promise<{
  conversationId: Id<"conversations">;
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
}> {
  // Validate content
  validateUserMessageLength(args.content);

  // Get authenticated user
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // 1. Create conversation with clientId using existing internal mutation
  const conversationId = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      userId,
      personaId: args.personaId,
      clientId: args.clientId,
    }
  );

  // 2. Get model info for the message
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    args.model,
    args.provider
  );

  // 3. Create user message
  const userMessageId = await ctx.runMutation(api.messages.create, {
    conversationId,
    role: "user",
    content: args.content,
    attachments: args.attachments,
    reasoningConfig: args.reasoningConfig,
    model: fullModel.modelId,
    provider: fullModel.provider,
    metadata:
      args.temperature !== undefined
        ? { temperature: args.temperature }
        : undefined,
  });

  // Create file entries for attachments if any
  if (args.attachments && args.attachments.length > 0) {
    await ctx.runMutation(internal.fileStorage.createUserFileEntries, {
      userId,
      messageId: userMessageId,
      conversationId,
      attachments: args.attachments,
    });
  }

  // 4. Create assistant placeholder and mark as streaming
  const [assistantMessageId] = await Promise.all([
    ctx.runMutation(api.messages.create, {
      conversationId,
      role: "assistant",
      content: "",
      status: "thinking",
      model: fullModel.modelId,
      provider: fullModel.provider,
    }),
    ctx.runMutation(internal.conversations.internalPatch, {
      id: conversationId,
      updates: { isStreaming: true },
      setUpdatedAt: true,
    }),
  ]);

  // 5. Build context messages
  const { contextMessages } = await buildContextMessages(ctx, {
    conversationId,
    personaId: args.personaId,
    modelCapabilities: {
      supportsImages: fullModel.supportsImages ?? false,
      supportsFiles: fullModel.supportsFiles ?? false,
    },
    provider: fullModel.provider,
    modelId: fullModel.modelId,
  });

  // 6. Query image models if the text model supports tools
  let imageModelsForTools: ImageModelInfo[] | undefined;
  if (fullModel.supportsTools) {
    const userImageModels = await ctx.runQuery(
      internal.imageModels.getUserImageModelsInternal,
      { userId }
    );
    imageModelsForTools = toImageModelInfos(userImageModels);
  }

  // 7. Schedule server-side streaming (runs in background)
  await ctx.scheduler.runAfter(0, internal.streaming_actions.streamMessage, {
    messageId: assistantMessageId,
    conversationId,
    model: fullModel.modelId,
    provider: fullModel.provider,
    messages: contextMessages,
    personaId: args.personaId,
    reasoningConfig: args.reasoningConfig,
    // Pass model capabilities from mutation context where auth is available
    supportsTools: fullModel.supportsTools ?? false,
    supportsFiles: fullModel.supportsFiles ?? false,
    supportsReasoning: fullModel.supportsReasoning ?? false,
    imageModels: imageModelsForTools,
    userId,
  });

  // 8. Schedule title generation
  await scheduleRunAfter(ctx, 100, api.titleGeneration.generateTitle, {
    conversationId,
    message: args.content,
  });

  return {
    conversationId,
    userMessageId,
    assistantMessageId,
  };
}
