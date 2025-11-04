import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages attachments", () => {
  test("list resolves attachments with fallback to original url when storage url missing", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conversationId = await t.db.insert("conversations", {
      title: "t",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const storageId = await t.db.insert("_storage", { _creationTime: Date.now() } as any);
    await t.db.insert("messages", {
      conversationId,
      role: "user",
      content: "c",
      createdAt: Date.now(),
      isMainBranch: true,
      attachments: [
        { type: "image", url: "orig", name: "n", size: 1, storageId },
      ],
    });

    const res = await t.runQuery(api.messages.list, {
      conversationId,
      resolveAttachments: true,
      paginationOpts: undefined as any,
    });
    const arr = Array.isArray(res) ? res : res.page;
    expect(arr[0].attachments[0].url).toBe("orig");
  });
});

