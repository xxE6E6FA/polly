import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

export async function getBranchesHandler(
  ctx: QueryCtx,
  args: {
    rootConversationId: Id<"conversations">;
  }
) {
  // Return all conversations in the branch group, including root
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_root_updated", q =>
      q.eq("rootConversationId", args.rootConversationId)
    )
    .order("asc")
    .collect();

  // If none, include root if exists (backfill scenario)
  if (!conversations.length) {
    const root = await ctx.db.get("conversations", args.rootConversationId);
    return root ? [root] : [];
  }

  // Attach a lightweight preview: first user message after branch point (when present)
  const results = [] as Array<
    Doc<"conversations"> & {
      previewText?: string | null;
      divergeSnippet?: string | null;
      messagesAfter?: number;
    }
  >;
  for (const conv of conversations) {
    let preview: string | null = null;
    let divergeSnippet: string | null = null;
    let messagesAfter: number | undefined;
    try {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", q => q.eq("conversationId", conv._id))
        .order("asc")
        .collect();
      if (conv.branchFromMessageId) {
        // Find first message created after branch point
        const branchSource = await ctx.db.get(
          "messages",
          conv.branchFromMessageId
        );
        if (branchSource) {
          const firstAfter = msgs.find(
            m => m.createdAt > branchSource.createdAt
          );
          const firstUserAfter = msgs.find(
            m => m.createdAt > branchSource.createdAt && m.role === "user"
          );
          divergeSnippet =
            firstUserAfter?.content || firstAfter?.content || null;
          preview = divergeSnippet;
          // Count how many messages exist after branch point
          messagesAfter = msgs.filter(
            m => m.createdAt > branchSource.createdAt
          ).length;
        }
      }
      if (!preview) {
        // Fallback to last user message
        const lastUser = [...msgs].reverse().find(m => m.role === "user");
        preview = lastUser?.content || null;
      }
    } catch {
      preview = null;
    }
    results.push({
      ...conv,
      previewText: preview,
      divergeSnippet,
      messagesAfter,
    });
  }
  return results;
}
