"use node";

/**
 * Memory extraction action — runs in Node.js runtime for AI SDK access.
 * Scheduled after streaming completes to extract durable user facts.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { generateArrayWithProvider } from "./ai/text_generation";
import { generateEmbedding } from "./lib/memory/embedding";
import {
  buildExtractionPrompt,
  extractedMemorySchema,
} from "./lib/memory/extraction";

/**
 * Retrieve relevant memories for a user message via vector search.
 * Must run in Node.js runtime because embedding generation uses AI SDK.
 */
export const retrieveMemories = internalAction({
  args: {
    userId: v.id("users"),
    messageContent: v.string(),
  },
  returns: v.array(v.object({ content: v.string(), category: v.string() })),
  handler: async (ctx, args) => {
    try {
      const vector = await generateEmbedding(args.messageContent);

      const results = await ctx.vectorSearch("userMemories", "by_embedding", {
        vector,
        limit: 8,
        filter: q => q.eq("userId", args.userId),
      });

      if (results.length === 0) {
        return [];
      }

      // Post-filter for isActive since vector search filters don't support AND.
      const memories: Array<{ content: string; category: string }> = [];
      for (const result of results) {
        if (result._score < 0.1) {
          continue;
        }
        const doc = await ctx.runQuery(internal.memory.getMemoryById, {
          id: result._id,
        });
        if (doc?.isActive) {
          memories.push({
            content: doc.content,
            category: doc.category,
          });
        }
      }

      return memories;
    } catch (error) {
      console.error("[retrieveMemories] Failed to retrieve memories:", error);
      return [];
    }
  },
});

/**
 * Shared helper: embed, dedup via vector search, and save extracted memory items.
 * Dedup thresholds:
 *   - score > 0.95 → near-duplicate, skip
 *   - score > 0.8  → semantically similar, update existing memory
 *   - score < 0.8  → new memory, insert
 * Returns the list of memories that were actually saved.
 */
async function processExtractedMemories(
  ctx: ActionCtx,
  {
    items,
    userId,
    sourceConversationId,
  }: {
    items: Array<{
      content: string;
      category: "preference" | "fact" | "instruction";
    }>;
    userId: Id<"users">;
    sourceConversationId?: Id<"conversations">;
  }
): Promise<Array<{ content: string; category: string }>> {
  const savedMemories: Array<{ content: string; category: string }> = [];

  for (const item of items) {
    try {
      const embedding = await generateEmbedding(item.content);

      const similar = await ctx.vectorSearch("userMemories", "by_embedding", {
        vector: embedding,
        limit: 1,
        filter: q => q.eq("userId", userId),
      });
      const topMatch = similar.length > 0 ? similar[0] : null;

      // Near-duplicate — skip
      if (topMatch && topMatch._score > 0.95) {
        continue;
      }

      // Semantically similar — update existing memory (only if active)
      if (topMatch && topMatch._score > 0.8) {
        const existingDoc = await ctx.runQuery(internal.memory.getMemoryById, {
          id: topMatch._id,
        });
        if (existingDoc?.isActive) {
          await ctx.runMutation(internal.memory.updateMemoryContent, {
            memoryId: topMatch._id,
            content: item.content,
            category: item.category,
            embedding,
          });
          savedMemories.push({
            content: item.content,
            category: item.category,
          });
          continue;
        }
        // Inactive memory — fall through to insert as new
      }

      // New memory — insert
      await ctx.runMutation(internal.memory.insertMemory, {
        userId,
        content: item.content,
        category: item.category,
        sourceConversationId,
        embedding,
      });
      savedMemories.push({
        content: item.content,
        category: item.category,
      });
    } catch (error) {
      console.error(
        `[processExtractedMemories] Failed to save memory "${item.content}":`,
        error
      );
    }
  }

  return savedMemories;
}

export const extractMemories = internalAction({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    // 1. Check if user has memory enabled
    const settings = await ctx.runQuery(internal.memory.getUserMemorySettings, {
      userId: args.userId,
    });
    if (!settings?.memoryEnabled) {
      return;
    }

    // 2. Fetch recent messages from the conversation (last 10)
    const messages = await ctx.runQuery(internal.memory.getRecentMessages, {
      conversationId: args.conversationId,
      limit: 10,
    });
    if (messages.length === 0) {
      return;
    }

    // 3. Build prompt and extract memory candidates via LLM
    const prompt = buildExtractionPrompt(
      messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }))
    );

    let extracted;
    try {
      extracted = await generateArrayWithProvider({
        prompt,
        elementSchema: extractedMemorySchema,
        schemaName: "ExtractedMemory",
        schemaDescription: "A durable fact about the user",
        temperature: 0.1,
        maxOutputTokens: 1024,
      });
    } catch (error) {
      console.error("[extractMemories] LLM extraction failed:", error);
      return;
    }

    if (!extracted || extracted.length === 0) {
      return;
    }

    // 4. Dedup via vector search and save
    const savedMemories = await processExtractedMemories(ctx, {
      items: extracted,
      userId: args.userId,
      sourceConversationId: args.conversationId,
    });

    // 5. Patch assistant message with extracted memories
    if (savedMemories.length > 0) {
      try {
        await ctx.runMutation(internal.memory.patchMemoriesExtracted, {
          messageId: args.assistantMessageId,
          memories: savedMemories.map(m => ({
            content: m.content,
            category: m.category as "preference" | "fact" | "instruction",
          })),
        });
      } catch (error) {
        console.error(
          "[extractMemories] Failed to patch message with memories:",
          error
        );
      }
    }
  },
});

// ============================================================================
// MEMORY SCAN (background job to scan existing conversations)
// ============================================================================

/** Public action: schedule a memory scan background job */
export const scheduleMemoryScan = action({
  args: { jobId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ jobId: v.string(), totalConversations: v.number() })
  ),
  handler: async (
    ctx,
    args
  ): Promise<{
    jobId: string;
    totalConversations: number;
  } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify memory is enabled before scanning
    const memSettings = await ctx.runQuery(
      internal.memory.getUserMemorySettings,
      { userId }
    );
    if (!memSettings?.memoryEnabled) {
      throw new Error("Memory feature is not enabled");
    }

    // Check for existing active scan
    const existingJobs = await ctx.runQuery(api.backgroundJobs.listUserJobs, {
      type: "memory_scan",
      limit: 10,
    });
    const hasActive = existingJobs?.some(
      (j: { status: string }) =>
        j.status === "scheduled" || j.status === "processing"
    );
    if (hasActive) {
      throw new Error("A memory scan is already in progress");
    }

    // Get eligible conversations
    type EligibleConversation = {
      _id: Id<"conversations">;
      title: string | undefined;
    };
    const eligible: EligibleConversation[] = await ctx.runQuery(
      internal.memory.getEligibleConversations,
      { userId, limit: 50 }
    );

    if (eligible.length === 0) {
      return null;
    }

    const dateStr = new Date().toLocaleDateString();
    const title = `Memory Scan - ${dateStr}`;
    const description = `Scanning ${eligible.length} conversation${eligible.length !== 1 ? "s" : ""} for memories`;

    await ctx.runMutation(api.backgroundJobs.create, {
      jobId: args.jobId,
      type: "memory_scan",
      totalItems: eligible.length,
      title,
      description,
    });

    await ctx.scheduler.runAfter(
      100,
      internal.memory_actions.processMemoryScan,
      {
        userId,
        jobId: args.jobId,
        conversationIds: eligible.map(c => c._id),
      }
    );

    return { jobId: args.jobId, totalConversations: eligible.length };
  },
});

/** Internal action: process memory scan in background */
export const processMemoryScan = internalAction({
  args: {
    userId: v.id("users"),
    jobId: v.string(),
    conversationIds: v.array(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const { userId, jobId, conversationIds } = args;

    // Update status to processing
    await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
      jobId,
      status: "processing",
    });

    let memoriesExtracted = 0;
    let conversationsProcessed = 0;
    const errors: string[] = [];

    let processedIndex = 0;
    for (const conversationId of conversationIds) {
      processedIndex++;
      try {
        // Fetch recent messages
        const messages = await ctx.runQuery(internal.memory.getRecentMessages, {
          conversationId,
          limit: 10,
        });

        // Skip if not enough user+assistant messages
        const relevantMessages = messages.filter(
          (m: { role: string }) => m.role === "user" || m.role === "assistant"
        );
        if (relevantMessages.length < 2) {
          conversationsProcessed++;
          await ctx.runMutation(
            internal.backgroundJobs.internalUpdateProgress,
            {
              jobId,
              processedItems: processedIndex,
              totalItems: conversationIds.length,
            }
          );
          continue;
        }

        // Build extraction prompt
        const prompt = buildExtractionPrompt(
          messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          }))
        );

        // Call LLM for extraction
        const extracted = await generateArrayWithProvider({
          prompt,
          elementSchema: extractedMemorySchema,
          schemaName: "ExtractedMemory",
          schemaDescription: "A durable fact about the user",
          temperature: 0.1,
          maxOutputTokens: 1024,
        });

        if (extracted && extracted.length > 0) {
          const saved = await processExtractedMemories(ctx, {
            items: extracted,
            userId,
            sourceConversationId: conversationId,
          });

          memoriesExtracted += saved.length;
        }

        conversationsProcessed++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[processMemoryScan] Error scanning conversation ${conversationId}:`,
          error
        );
        errors.push(`Conversation ${conversationId}: ${errorMsg}`);
        conversationsProcessed++;
      }

      // Update progress after each conversation
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId,
        processedItems: processedIndex,
        totalItems: conversationIds.length,
      });
    }

    // Complete the job
    const finalStatus =
      errors.length > 0 && memoriesExtracted === 0
        ? ("failed" as const)
        : ("completed" as const);

    await ctx.runMutation(internal.backgroundJobs.internalSaveImportResult, {
      jobId,
      result: {
        totalImported: memoriesExtracted,
        totalProcessed: conversationsProcessed,
        errors,
      },
      status: finalStatus,
      ...(finalStatus === "failed" ? { error: errors[0] } : {}),
    });
  },
});
