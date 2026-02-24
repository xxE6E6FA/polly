import { getAuthUserId } from "../auth";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { validateUserMessageLength } from "../shared_utils";

export async function startConversationHandler(
  ctx: ActionCtx,
  args: {
    clientId: string;
    content: string;
    personaId?: Id<"personas">;
    profileId?: Id<"profiles">;
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
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
  }
): Promise<{
  conversationId: Id<"conversations">;
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
}> {
  validateUserMessageLength(args.content);

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Single round-trip: all DB work + scheduling in one mutation
  return ctx.runMutation(internal.conversations.prepareStartConversation, {
    userId,
    clientId: args.clientId,
    content: args.content,
    personaId: args.personaId,
    profileId: args.profileId,
    attachments: args.attachments,
    model: args.model,
    provider: args.provider,
    reasoningConfig: args.reasoningConfig,
    temperature: args.temperature,
  });
}
