import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import {
  createBranchHandler,
  internalCloneMessagesHandler,
} from "./lib/branch/mutation_handlers";
import { getBranchesHandler } from "./lib/branch/query_handlers";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";

// Re-export handler functions for tests
export {
  createBranchHandler,
  getBranchesHandler,
  internalCloneMessagesHandler,
};

export const internalCloneMessages = internalMutation({
  args: {
    targetConversationId: v.id("conversations"),
    sourceMessages: v.array(
      v.object({
        _id: v.id("messages"),
        role: v.string(),
        content: v.string(),
        status: v.optional(messageStatusSchema),
        statusText: v.optional(v.string()),
        reasoning: v.optional(v.string()),
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
        reasoningConfig: v.optional(reasoningConfigSchema),
        parentId: v.optional(v.id("messages")),
        branchId: v.optional(v.string()),
        sourceConversationId: v.optional(v.id("conversations")),
        useWebSearch: v.optional(v.boolean()),
        attachments: v.optional(v.array(attachmentSchema)),
        citations: v.optional(v.array(webCitationSchema)),
        metadata: v.optional(extendedMessageMetadataSchema),
        imageGeneration: v.optional(imageGenerationSchema),
        createdAt: v.number(),
        completedAt: v.optional(v.number()),
      })
    ),
  },
  handler: internalCloneMessagesHandler,
});

export const createBranch = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    assistantMessageId: v.optional(v.id("messages")),
  }),
  handler: createBranchHandler,
});

export const getBranches = query({
  args: {
    rootConversationId: v.id("conversations"),
  },
  handler: getBranchesHandler,
});
