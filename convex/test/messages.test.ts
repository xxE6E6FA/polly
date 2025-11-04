import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

async function seedUserAndConversation(t: any) {
  // Create a user and a conversation owned by that user using the public mutation
  const userId = await t.db.insert("users", { name: "Test", createdAt: Date.now() });
  // createConversation requires auth; spoof identity for this test
  const authed = t.withIdentity({ subject: userId, issuer: "test" });
  const { conversationId, userMessageId, assistantMessageId } = await authed.runMutation(
    api.conversations.createConversation,
    {
      firstMessage: "hello",
    }
  );
  return { userId, conversationId, userMessageId, assistantMessageId };
}

describe("convex/messages", () => {
  test("creates and lists messages (main branch)", async () => {
    const t = await makeConvexTest();
    const { conversationId } = await seedUserAndConversation(t);

    const mId = await t.runMutation(api.messages.create, {
      conversationId,
      role: "assistant",
      content: "hi there",
      isMainBranch: true,
    });
    expect(mId).toBeDefined();

    const list = await t.runQuery(api.messages.list, {
      conversationId,
      paginationOpts: { numItems: 100 },
    });
    const arr = Array.isArray(list) ? list : list.page;
    expect(arr.some((m: any) => m._id === mId)).toBe(true);
  });

  test("update patches fields without writing undefineds", async () => {
    const t = await makeConvexTest();
    const { conversationId } = await seedUserAndConversation(t);
    const mId = await t.runMutation(api.messages.create, {
      conversationId,
      role: "assistant",
      content: "old",
    });
    await t.runMutation(api.messages.update, { id: mId, content: "new", reasoning: undefined });
    const { page } = await t.runQuery(api.messages.list, {
      conversationId,
      paginationOpts: { numItems: 10 },
    });
    const updated = page.find((m: any) => m._id === mId);
    expect(updated.content).toBe("new");
    // Should not create metadata for undefined
    expect(updated.reasoning ?? undefined).toBeUndefined();
  });
});

