import { api } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import { scheduleRunAfter } from "../scheduler";
import { validateUserMessageLength } from "../shared_utils";

export async function createUserMessageHandler(
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
  }
): Promise<{
  userMessageId: Id<"messages">;
}> {
  // Enforce max size on user-authored content
  validateUserMessageLength(args.content);
  // Get user's effective model with full capabilities
  const fullModel = await getUserEffectiveModelWithCapabilities(
    ctx,
    args.model,
    args.provider
  );
  // Create user message only
  const userMessageId: Id<"messages"> = await ctx.runMutation(
    api.messages.create,
    {
      conversationId: args.conversationId,
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
    }
  );

  // Check if this is the first user message in the conversation
  // If so, and the conversation has a generic title, schedule title generation
  // This handles image generation conversations which create empty conversations first
  const conversation = await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  });

  if (conversation) {
    const messages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId: args.conversationId,
    });

    // Check if this is the first user message and the title looks generic
    const userMessages = messages.filter(
      (m: Doc<"messages">) => m.role === "user"
    );
    const hasGenericTitle =
      conversation.title === "Image Generation" ||
      conversation.title === "New Conversation" ||
      conversation.title === "New conversation";

    if (
      userMessages.length === 1 &&
      hasGenericTitle &&
      args.content.trim().length > 0
    ) {
      // Schedule title generation based on the user message
      await scheduleRunAfter(
        ctx,
        100,
        api.titleGeneration.generateTitleBackground,
        {
          conversationId: args.conversationId,
          message: args.content,
        }
      );
    }
  }

  return { userMessageId };
}
