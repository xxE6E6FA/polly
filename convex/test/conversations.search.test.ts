import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/conversations.search", () => {
  it("combines title and message matches and filters by user", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const otherUser = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    // Conversation owned by user with title match
    const c1 = await t.db.insert("conversations", {
      title: "Project Alpha",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Conversation with message content match
    const c2 = await t.db.insert("conversations", {
      title: "Random",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await t.db.insert("messages", {
      conversationId: c2,
      role: "user",
      content: "Discuss Alpha features",
      createdAt: Date.now(),
      isMainBranch: true,
    });
    // Conversation owned by other user shouldn't appear
    const c3 = await t.db.insert("conversations", {
      title: "Alpha external",
      userId: otherUser,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const results = await authed.runQuery(api.conversations.search, {
      searchQuery: "Alpha",
      includeArchived: true,
      limit: 10,
    });
    const ids = results.map((c: any) => c._id);
    expect(ids).toContain(c1);
    expect(ids).toContain(c2);
    expect(ids).not.toContain(c3);
  });
});

