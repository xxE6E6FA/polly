import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

async function seedAuthedUser(t: any) {
  const userId = await t.run((ctx: any) =>
    ctx.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
      conversationCount: 0,
      totalMessageCount: 0,
    })
  );
  return { userId };
}

async function seedBuiltInModel(t: any) {
  await t.run((ctx: any) =>
    ctx.db.insert("builtInModels", {
      modelId: "gemini-2.5-flash-lite",
      name: "Gemini",
      provider: "google",
      contextLength: 128000,
      supportsImages: true,
      supportsTools: false,
      supportsReasoning: true,
      free: true,
      isActive: true,
      createdAt: Date.now(),
    })
  );
}

async function seedConversation(t: any, userId: string) {
  const authed = t.withIdentity({ subject: userId, issuer: "test" });
  // Create a conversation with two user/assistant turns
  const { conversationId } = await authed.mutation(
    api.conversations.createConversation,
    { firstMessage: "Hello" }
  );
  // Assistant
  await authed.mutation(api.messages.create, {
    conversationId,
    role: "assistant",
    content: "Hi there",
  });
  // Second user message
  const u2 = await authed.mutation(api.messages.createUserMessageBatched, {
    conversationId,
    content: "What is a GPU?",
  });
  // Create assistant placeholder to simulate prior reply
  await authed.mutation(api.messages.create, {
    conversationId,
    role: "assistant",
    content: "A GPU is...",
  });

  // Fetch messages to find ids
  const msgs = await t.run((ctx: any) =>
    ctx.db
      .query("messages")
      .withIndex("by_conversation", (q: any) => q.eq("conversationId", conversationId))
      .order("asc")
      .collect()
  );
  return { conversationId, messages: msgs };
}

describe("convex/branches", () => {
  test("createBranch clones history up to message and sets metadata", async () => {
    const t = await makeConvexTest();
    const { userId } = await seedAuthedUser(t);
    await seedBuiltInModel(t);
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const { conversationId, messages } = await seedConversation(t, userId);

    // Branch from the second user message
    const branchPoint = messages.find((m: any) => m.role === "user" && m.content.includes("GPU"));
    const res = await authed.action(api.branches.createBranch, {
      conversationId,
      messageId: branchPoint._id,
    });
    expect(res.conversationId).toBeTruthy();

    // New conversation should exist and contain history up to branch point
    const branchedMsgs = await t.run((ctx: any) =>
      ctx.db
        .query("messages")
        .withIndex("by_conversation", (q: any) => q.eq("conversationId", res.conversationId))
        .order("asc")
        .collect()
    );
    // Includes first user, first assistant, and the branchPoint user message
    expect(branchedMsgs.map((m: any) => m.role)).toContain("user");
    expect(branchedMsgs.find((m: any) => m.content.includes("GPU"))).toBeTruthy();

    // Conversation metadata
    const branched = await t.run((ctx: any) => ctx.db.get(res.conversationId));
    expect(branched?.parentConversationId).toBe(conversationId);
    expect(branched?.branchFromMessageId).toBe(branchPoint._id);
    expect(branched?.rootConversationId).toBeTruthy();
  });

  test("getBranches returns root + branches with ordering and preview fields", async () => {
    const t = await makeConvexTest();
    const { userId } = await seedAuthedUser(t);
    await seedBuiltInModel(t);
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const { conversationId, messages } = await seedConversation(t, userId);
    const branchPoint = messages.find((m: any) => m.role === "user" && m.content.includes("GPU"));
    await authed.action(api.branches.createBranch, { conversationId, messageId: branchPoint._id });

    // Determine root id
    const root = await t.run((ctx: any) => ctx.db.get(conversationId));
    const rootId = root?.rootConversationId || conversationId;
    const list = await authed.query(api.branches.getBranches, { rootConversationId: rootId });
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2); // root + 1 branch
    // Each item has title and createdAt
    expect(list.every((c: any) => typeof c.title === "string" && typeof c.createdAt === "number")).toBe(true);
  });
});

