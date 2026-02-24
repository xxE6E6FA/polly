import { getAuthUserId } from "../auth";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
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
  validateUserMessageLength(args.content);

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }

  // Single round-trip: all DB work + scheduling in one mutation
  return ctx.runMutation(internal.conversations.prepareSendMessage, {
    userId,
    conversationId: args.conversationId,
    content: args.content,
    model: args.model,
    provider: args.provider,
    personaId: args.personaId,
    attachments: args.attachments,
    reasoningConfig: args.reasoningConfig,
    temperature: args.temperature,
  });
}
