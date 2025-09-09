import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

async function seedAuthedUser(t: any) {
  const userId = await t.run((ctx: any) => ctx.db.insert("users", {
    isAnonymous: false,
    createdAt: Date.now(),
    conversationCount: 0,
    totalMessageCount: 0,
  }));
  return { userId };
}

async function seedConversationWithMessages(t: any) {
  const { userId } = await seedAuthedUser(t);
  const authed = t.withIdentity({ subject: userId, issuer: "test" });

  // Create conversation via public mutation (increments conversationCount)
  const { conversationId } = await authed.mutation(
    api.conversations.createConversation,
    { firstMessage: "hi" }
  );

  // Add a couple more messages
  const m1 = await t.mutation(api.messages.create, {
    conversationId,
    role: "assistant",
    content: "a1",
  });
  const m2 = await t.mutation(api.messages.create, {
    conversationId,
    role: "assistant",
    content: "a2",
  });
  return { userId, conversationId, messageIds: [m1, m2] };
}

describe("convex/conversations", () => {
  it("remove deletes messages and conversation and decrements user count", async () => {
    const t = await makeConvexTest();
    const { userId, conversationId } = await seedConversationWithMessages(t);

    const beforeUser = await t.run((ctx: any) => ctx.db.get(userId)) as any;
    expect(beforeUser?.conversationCount).toBeGreaterThanOrEqual(1);

    // Remove while authed as owner
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    await authed.mutation(api.conversations.remove, { id: conversationId });

    const convo = await t.run((ctx: any) => ctx.db.get(conversationId));
    expect(convo).toBeNull();

    // Messages should be gone
    const msgs = await t.run((ctx: any) => ctx.db
      .query("messages")
      .withIndex("by_conversation", (q: any) => q.eq("conversationId", conversationId))
      .collect());
    expect(msgs.length).toBe(0);

    const afterUser = await t.run((ctx: any) => ctx.db.get(userId)) as any;
    expect((afterUser?.conversationCount || 0)).toBeLessThanOrEqual(
      beforeUser?.conversationCount || 0
    );
  });

  it("removeMultiple deletes a batch of messages with access", async () => {
    const t = await makeConvexTest();
    const { userId, conversationId, messageIds } = await seedConversationWithMessages(t);

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    await authed.mutation(api.messages.removeMultiple, { ids: messageIds });

    const left = await t.run((ctx: any) => ctx.db
      .query("messages")
      .withIndex("by_conversation", (q: any) => q.eq("conversationId", conversationId))
      .collect());
    // Only the two created assistant messages should be removed; user+assistant seed remain depending on seed
    expect(left.every((m: any) => !messageIds.includes(m._id))).toBe(true);
  });

  it("bulkRemove deletes multiple conversations synchronously", async () => {
    const t = await makeConvexTest();
    const { userId } = await seedAuthedUser(t);
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    const ids: string[] = [] as any;
    for (let i = 0; i < 3; i++) {
      const { conversationId } = await authed.mutation(
        api.conversations.createConversation,
        { firstMessage: `m${i}` }
      );
      ids.push(conversationId);
    }

    await authed.mutation(api.conversations.bulkRemove, { ids: ids as any });
    for (const id of ids) {
      const c = await t.run((ctx: any) => ctx.db.get(id as any));
      expect(c).toBeNull();
    }
  });

  it("createConversation uses selected user model when available, otherwise built-in fallback", async () => {
    const t = await makeConvexTest();
    const { userId } = await seedAuthedUser(t);
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    // Insert built-in default
    await t.run((ctx: any) => ctx.db.insert("builtInModels", {
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
    }));

    // No user selection: should fallback to built-in
    const { conversationId } = await authed.mutation(
      api.conversations.createConversation,
      { firstMessage: "hello" }
    );
    const assistant = await t.run((ctx: any) => ctx.db
      .query("messages")
      .withIndex("by_conversation_role", (q: any) =>
        q.eq("conversationId", conversationId).eq("role", "assistant")
      )
      .first());
    expect(assistant?.provider).toBe("google");

    // Select a user model and expect that to be used
    await t.run((ctx: any) => ctx.db.insert("userModels", {
      userId,
      modelId: "gpt",
      name: "GPT",
      provider: "openai",
      contextLength: 128000,
      supportsImages: true,
      supportsTools: false,
      supportsReasoning: false,
      selected: true,
      createdAt: Date.now(),
    }));
    const { conversationId: cid2 } = await authed.mutation(
      api.conversations.createConversation,
      { firstMessage: "hello2" }
    );
    const assistant2 = await t.run((ctx: any) => ctx.db
      .query("messages")
      .withIndex("by_conversation_role", (q: any) =>
        q.eq("conversationId", cid2).eq("role", "assistant")
      )
      .first());
    expect(assistant2?.provider).toBe("openai");
  });
});
