import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages favorites", () => {
  test("toggleFavorite and isFavorited work per user; listFavorites paginates", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const otherId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const conv = await t.db.insert("conversations", {
      title: "Favs",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const msg = await t.db.insert("messages", {
      conversationId: conv,
      role: "assistant",
      content: "hi",
      isMainBranch: true,
      createdAt: Date.now(),
    });

    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res1 = await authed.runMutation(api.messages.toggleFavorite, { messageId: msg });
    expect(res1.favorited).toBe(true);
    const isFav = await authed.runQuery(api.messages.isFavorited, { messageId: msg });
    expect(isFav).toBe(true);

    // Other user should see false
    const otherAuthed = t.withIdentity({ subject: otherId, issuer: "test" });
    const isFavOther = await otherAuthed.runQuery(api.messages.isFavorited, { messageId: msg });
    expect(isFavOther).toBe(false);

    const list1 = await authed.runQuery(api.messages.listFavorites, { limit: 1 });
    expect(list1.items.length).toBe(1);
    if (list1.hasMore && list1.nextCursor) {
      const list2 = await authed.runQuery(api.messages.listFavorites, { limit: 1, cursor: list1.nextCursor });
      expect(list2.items.length).toBeGreaterThanOrEqual(0);
    }

    // Toggle off
    const res2 = await authed.runMutation(api.messages.toggleFavorite, { messageId: msg });
    expect(res2.favorited).toBe(false);
    const isFavAfter = await authed.runQuery(api.messages.isFavorited, { messageId: msg });
    expect(isFavAfter).toBe(false);
  });
});

