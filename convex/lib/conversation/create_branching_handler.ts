import { DEFAULT_BUILTIN_MODEL_ID } from "../../../shared/constants";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import {
  getAuthenticatedUserWithDataForAction,
  setConversationStreamingForAction,
  validateFreeModelUsage,
} from "../shared_utils";

export async function createBranchingConversationHandler(
  ctx: ActionCtx,
  args: {
    userId?: Id<"users">;
    firstMessage: string;
    sourceConversationId?: Id<"conversations">;
    personaId?: Id<"personas">;
    personaPrompt?: string;
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
    useWebSearch?: boolean;
    generateTitle?: boolean;
    reasoningConfig?: { enabled: boolean };
    contextSummary?: string;
  }
): Promise<{
  conversationId: Id<"conversations">;
  userId: Id<"users">;
  isNewUser: boolean;
  assistantMessageId?: Id<"messages">;
}> {
  // Get authenticated user ID first
  let authenticatedUserId: Id<"users"> | null = null;
  try {
    const { userId } = await getAuthenticatedUserWithDataForAction(ctx);
    authenticatedUserId = userId;
  } catch (error) {
    console.warn("Failed to get authenticated user:", error);
  }

  // Create user if needed or use provided user ID
  let actualUserId: Id<"users">;
  let isNewUser = false;

  if (args.userId) {
    // Use provided user ID (for background jobs or specific user creation)
    actualUserId = args.userId;
  } else if (authenticatedUserId) {
    // Use authenticated user ID
    actualUserId = authenticatedUserId;
  } else {
    throw new Error("Not authenticated");
  }

  const [selectedModel, user] = await Promise.all([
    ctx.runQuery(api.userModels.getUserSelectedModel),
    ctx.runQuery(api.users.getById, { id: actualUserId }),
  ]);

  if (!selectedModel) {
    throw new Error("No model selected. Please select a model in Settings.");
  }
  if (!user) {
    throw new Error("User not found");
  }

  // Check if it's a built-in free model and enforce limits
  // If model has 'free' field, it's from builtInModels table and is a built-in model
  const isBuiltInModelResult = selectedModel.free === true;

  if (isBuiltInModelResult && !user.hasUnlimitedCalls) {
    validateFreeModelUsage(user);
  }

  // Fetch persona prompt if personaId is provided but personaPrompt is not
  let finalPersonaPrompt = args.personaPrompt;
  if (args.personaId && !finalPersonaPrompt) {
    const persona = await ctx.runQuery(api.personas.get, {
      id: args.personaId,
    });
    finalPersonaPrompt = persona?.prompt ?? undefined;
  }

  // Provider is already the actual provider - no mapping needed
  const actualProvider = selectedModel.provider as
    | "openai"
    | "anthropic"
    | "google"
    | "openrouter";

  // Create conversation using internal mutation
  const createResult = await ctx.runMutation(
    internal.conversations.createWithUserId,
    {
      title: "New conversation",
      userId: actualUserId,
      personaId: args.personaId,
      sourceConversationId: args.sourceConversationId,
      firstMessage: args.firstMessage,
      attachments: args.attachments,
      useWebSearch: args.useWebSearch,
      model: selectedModel.modelId,
      provider: actualProvider,
      reasoningConfig: args.reasoningConfig,
    }
  );

  // Note: createWithUserId already increments user stats; avoid double increment here

  // Create context message FIRST if contextSummary is provided
  // This must happen before streaming so the AI can see the context
  if (args.sourceConversationId && args.contextSummary) {
    await ctx.runMutation(api.messages.create, {
      conversationId: createResult.conversationId,
      role: "context",
      content: `Prior context: ${args.contextSummary}`,
      sourceConversationId: args.sourceConversationId,
      isMainBranch: true,
    });
  }

  // **CRITICAL**: Trigger streaming for the assistant response!
  // This happens AFTER context is added so AI can see the full conversation
  if (args.firstMessage && args.firstMessage.trim().length > 0) {
    const [_fullModel] = await Promise.all([
      getUserEffectiveModelWithCapabilities(
        ctx,
        selectedModel.modelId,
        actualProvider
      ),

      // Mark conversation as streaming
      setConversationStreamingForAction(
        ctx,
        createResult.conversationId,
        true
      ),
    ]);
  }

  return {
    conversationId: createResult.conversationId,
    userId: actualUserId,
    isNewUser,
    // Expose assistantMessageId so the client can kick off HTTP streaming
    assistantMessageId: createResult.assistantMessageId,
  };
}

export async function createConversationActionHandler(
  ctx: ActionCtx,
  args: {
    title?: string;
    personaId?: Id<"personas">;
    model?: string;
    provider?: string;
    firstMessage?: string;
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
    useWebSearch?: boolean;
    reasoningConfig?: { enabled: boolean };
    temperature?: number;
  }
): Promise<
  | {
      conversationId: Id<"conversations">;
      userMessageId: Id<"messages">;
      assistantMessageId: Id<"messages">;
    }
  | { conversationId: Id<"conversations"> }
> {
  // Get current authenticated user
  const user = await ctx.runQuery(api.users.current);

  if (!user) {
    throw new Error("Not authenticated");
  }

  // If there's a first message, create conversation with it
  if (args.firstMessage) {
    // Resolve the model capabilities to decide on PDF processing
    await getUserEffectiveModelWithCapabilities(
      ctx,
      args.model,
      args.provider
    );

    // Store attachments as-is during conversation creation
    // PDF text extraction will happen during assistant response with progress indicators
    const processedAttachments = args.attachments;

    const result: {
      conversationId: Id<"conversations">;
      userMessageId: Id<"messages">;
      assistantMessageId: Id<"messages">;
    } = await ctx.runMutation(api.conversations.createConversation, {
      title: args.title,
      personaId: args.personaId,
      firstMessage: args.firstMessage,
      model: args.model || DEFAULT_BUILTIN_MODEL_ID,
      provider:
        (args.provider as
          | "openai"
          | "anthropic"
          | "google"
          | "openrouter"
          | undefined) || "google",
      attachments: processedAttachments,
      reasoningConfig: args.reasoningConfig,
      temperature: args.temperature,
    });

    // Kick off title generation immediately (action -> action), so UI updates fast
    try {
      await ctx.runAction(api.titleGeneration.generateTitleBackground, {
        conversationId: result.conversationId,
        message: args.firstMessage,
      });
    } catch {
      // Best-effort; server already scheduled a background job
    }

    return {
      conversationId: result.conversationId,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
    };
  }

  // Create empty conversation - use internal mutation to create just the conversation
  const conversationId: Id<"conversations"> = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      title: args.title || "New Conversation",
      userId: user._id,
      personaId: args.personaId,
    }
  );

  return { conversationId };
}
