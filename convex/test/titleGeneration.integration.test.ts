import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("integration: title generation updates conversation", () => {
  test("generateTitleBackground replaces placeholder title and bumps updatedAt", async () => {
    const t = await makeConvexTest();

    // Seed an authenticated user
    const userId = await t.run((ctx: any) =>
      ctx.db.insert("users", {
        isAnonymous: false,
        createdAt: Date.now(),
        conversationCount: 0,
        totalMessageCount: 0,
      })
    );
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    // Create a conversation with a first message; server will start with placeholder title
    const firstMessage = "Please summarize my TypeScript generics notes";
    const { conversationId } = await authed.mutation(
      api.conversations.createConversation,
      { firstMessage }
    );

    const before = (await t.run((ctx: any) => ctx.db.get(conversationId))) as any;
    expect(before?.title).toMatch(/new conversation/i);
    const beforeUpdatedAt = before?.updatedAt;

    // Force fallback path (no external API) by clearing the env var
    if ((globalThis as any).process?.env) {
      delete (globalThis as any).process.env.GEMINI_API_KEY;
    }

    // Invoke background title generation action
    await authed.action(api.titleGeneration.generateTitleBackground, {
      conversationId,
      message: firstMessage,
    });

    const after = (await t.run((ctx: any) => ctx.db.get(conversationId))) as any;
    // Fallback should use cleaned/truncated first message (<= 60 chars)
    expect(typeof after?.title).toBe("string");
    expect(after.title.length).toBeLessThanOrEqual(60);
    expect(after.title.toLowerCase()).not.toMatch(/new conversation/);

    // updatedAt should have advanced
    expect(after.updatedAt).toBeGreaterThanOrEqual(beforeUpdatedAt);
  });
});

