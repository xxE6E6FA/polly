import { beforeEach, describe, expect, test } from "bun:test";
import type { Doc } from "@convex/_generated/dataModel";
import { buildKey, CACHE_KEYS } from "@/lib/local-storage";
import {
  clearCachedConversations,
  getCachedConversations,
  setCachedConversations,
} from "./conversations-cache";

describe("conversations cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const makeConversation = (id: string, userId: string): Doc<"conversations"> =>
    ({
      _id: id as unknown as Doc<"conversations">["_id"],
      userId: userId as unknown as Doc<"conversations">["userId"],
      title: "Sample",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }) as unknown as Doc<"conversations">;

  test("stores conversations per user", () => {
    const userA = "userA";
    const userB = "userB";
    const convA = makeConversation("convA", userA);
    const convB = makeConversation("convB", userB);

    setCachedConversations(userA, [convA]);
    setCachedConversations(userB, [convB]);

    expect(getCachedConversations(userA)).toEqual([convA]);
    expect(getCachedConversations(userB)).toEqual([convB]);
  });

  test("ignores legacy array caches", () => {
    const key = buildKey(CACHE_KEYS.conversations);
    const legacyPayload = {
      version: 1,
      data: [makeConversation("legacy", "oldUser")],
    };
    localStorage.setItem(key, JSON.stringify(legacyPayload));

    expect(getCachedConversations("someone")).toEqual([]);
  });

  test("clears cached conversations for a user", () => {
    const userId = "userC";
    const conversation = makeConversation("convC", userId);

    setCachedConversations(userId, [conversation]);
    expect(getCachedConversations(userId)).toHaveLength(1);

    clearCachedConversations(userId);
    expect(getCachedConversations(userId)).toEqual([]);
  });
});
