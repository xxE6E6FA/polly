import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ============================================================================
// Test helpers - Must be defined before handler import for hoisting
// ============================================================================

// Helper to create a mock query chain that supports search indexes
function createSearchQuery<T>(results: T[]) {
  return {
    withSearchIndex: mock(function () {
      return this;
    }),
    withIndex: mock(function () {
      return this;
    }),
    order: mock(function () {
      return this;
    }),
    take: mock(() => Promise.resolve(results)),
    collect: mock(() => Promise.resolve(results)),
  };
}

// ============================================================================
// Handler import for testing
// ============================================================================

// Import the handler directly for unit testing
import { searchUserConversationsHandler } from "./conversation_search";

// ============================================================================
// Test Data
// ============================================================================

const userId = "user-123" as Id<"users">;
const otherUserId = "user-456" as Id<"users">;

const mockConversation1 = {
  _id: "conv-1" as Id<"conversations">,
  userId,
  title: "React hooks discussion",
  isArchived: false,
  updatedAt: 3000,
  messageCount: 10,
};

const mockConversation2 = {
  _id: "conv-2" as Id<"conversations">,
  userId,
  title: "TypeScript generics",
  isArchived: false,
  updatedAt: 2000,
  messageCount: 5,
};

const mockConversation3 = {
  _id: "conv-3" as Id<"conversations">,
  userId,
  title: "Archived chat",
  isArchived: true,
  updatedAt: 1000,
  messageCount: 3,
};

const mockOtherUserConversation = {
  _id: "conv-other" as Id<"conversations">,
  userId: otherUserId,
  title: "Other user's conversation",
  isArchived: false,
  updatedAt: 4000,
  messageCount: 8,
};

// ============================================================================
// Tests
// ============================================================================

describe("conversation_search.searchUserConversations", () => {
  describe("empty/short queries (recent conversations)", () => {
    test("returns recent conversations for empty query", async () => {
      const recentConversations = [mockConversation1, mockConversation2];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(recentConversations);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "",
          limit: 10,
        }
      );

      expect(result).toHaveLength(2);
      expect(result[0].conversationId).toBe("conv-1");
      expect(result[0].matchedIn).toBe("title");
    });

    test("returns recent conversations for whitespace-only query", async () => {
      const recentConversations = [mockConversation1];

      const ctx = makeConvexCtx({
        db: {
          query: mock(() => createSearchQuery(recentConversations)),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "   ",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
    });

    test("returns recent conversations for single character query", async () => {
      const recentConversations = [mockConversation1];

      const ctx = makeConvexCtx({
        db: {
          query: mock(() => createSearchQuery(recentConversations)),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "a",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
    });

    test("uses default limit of 10 when not specified", async () => {
      const ctx = makeConvexCtx({
        db: {
          query: mock(() => createSearchQuery([])),
        },
      });

      await searchUserConversationsHandler(ctx as unknown as QueryCtx, {
        userId,
        query: "",
      });

      // Should still work without throwing
      expect(ctx.db.query).toHaveBeenCalled();
    });
  });

  describe("title search", () => {
    test("finds conversations by title match", async () => {
      const titleMatches = [mockConversation1];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(titleMatches);
            }
            if (table === "messages") {
              return createSearchQuery([]);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "React",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("React hooks discussion");
      expect(result[0].matchedIn).toBe("title");
    });

    test("returns empty array when no title matches found", async () => {
      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([]);
            }
            if (table === "messages") {
              return createSearchQuery([]);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "nonexistent",
          limit: 10,
        }
      );

      expect(result).toHaveLength(0);
    });

    test("respects limit parameter for title results", async () => {
      const manyConversations = [
        mockConversation1,
        mockConversation2,
        { ...mockConversation1, _id: "conv-4" as Id<"conversations"> },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(manyConversations);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "test",
          limit: 2,
        }
      );

      expect(result).toHaveLength(2);
    });
  });

  describe("message content search", () => {
    test("searches message content when title results are insufficient", async () => {
      const titleMatches: never[] = [];

      const messageMatches = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-2" as Id<"conversations">,
          content: "This message discusses React hooks in detail",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(titleMatches);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
          get: mock((_table: string, id: string) => {
            if (id === "conv-2") {
              return Promise.resolve(mockConversation2);
            }
            return Promise.resolve(null);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "React hooks",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].conversationId).toBe("conv-2");
      expect(result[0].matchedIn).toBe("message");
    });

    test("skips messages from archived conversations", async () => {
      const messageMatches = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-3" as Id<"conversations">,
          content: "Message in archived conversation",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([]);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
          get: mock((_table: string, id: string) => {
            if (id === "conv-3") {
              return Promise.resolve(mockConversation3); // Archived
            }
            return Promise.resolve(null);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "archived",
          limit: 10,
        }
      );

      expect(result).toHaveLength(0);
    });

    test("skips messages from other users' conversations (authorization)", async () => {
      const messageMatches = [
        {
          _id: "msg-other" as Id<"messages">,
          conversationId: "conv-other" as Id<"conversations">,
          content: "Message from other user",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([]);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
          get: mock((_table: string, id: string) => {
            if (id === "conv-other") {
              return Promise.resolve(mockOtherUserConversation);
            }
            return Promise.resolve(null);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId, // Searching as user-123
          query: "other user",
          limit: 10,
        }
      );

      // Should NOT return the other user's conversation
      expect(result).toHaveLength(0);
    });

    test("truncates long message snippets", async () => {
      const longContent = "A".repeat(500);
      const messageMatches = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-1" as Id<"conversations">,
          content: longContent,
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([]);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
          get: mock(() => Promise.resolve(mockConversation1)),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "test",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      // Snippet should be truncated (max 200 chars + ellipsis)
      expect(result[0].snippet.length).toBeLessThanOrEqual(210);
      expect(result[0].snippet.endsWith("...")).toBe(true);
    });
  });

  describe("deduplication", () => {
    test("deduplicates conversations found in both title and message search", async () => {
      const titleMatches = [mockConversation1];

      const messageMatches = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-1" as Id<"conversations">, // Same as title match
          content: "React hooks are great",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(titleMatches);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "React",
          limit: 10,
        }
      );

      // Should only have 1 result, not 2 (deduped)
      expect(result).toHaveLength(1);
      expect(result[0].conversationId).toBe("conv-1");
      expect(result[0].matchedIn).toBe("title"); // Title match takes priority
    });

    test("deduplicates multiple messages from same conversation", async () => {
      const messageMatches = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-2" as Id<"conversations">,
          content: "First message about topic",
          isMainBranch: true,
        },
        {
          _id: "msg-2" as Id<"messages">,
          conversationId: "conv-2" as Id<"conversations">, // Same conversation
          content: "Second message about topic",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([]);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
          get: mock(() => Promise.resolve(mockConversation2)),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "topic",
          limit: 10,
        }
      );

      // Should only have 1 result (first message wins)
      expect(result).toHaveLength(1);
    });
  });

  describe("sorting", () => {
    test("sorts results by updatedAt descending", async () => {
      const titleMatches = [
        { ...mockConversation2, updatedAt: 1000 }, // Older
        { ...mockConversation1, updatedAt: 3000 }, // Newer
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(titleMatches);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "test",
          limit: 10,
        }
      );

      expect(result).toHaveLength(2);
      // More recent conversation should be first
      expect(result[0].updatedAt).toBeGreaterThan(result[1].updatedAt);
    });
  });

  describe("context building", () => {
    test("includes recent messages as context", async () => {
      const titleMatches = [mockConversation1];
      const recentMessages = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-1" as Id<"conversations">,
          role: "user",
          content: "How do React hooks work?",
          isMainBranch: true,
        },
        {
          _id: "msg-2" as Id<"messages">,
          conversationId: "conv-1" as Id<"conversations">,
          role: "assistant",
          content: "React hooks are functions that let you use state...",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(titleMatches);
            }
            if (table === "messages") {
              return createSearchQuery(recentMessages);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "React",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].relevantContext).toBeDefined();
    });
  });

  describe("result structure", () => {
    test("returns correct result structure for title matches", async () => {
      const titleMatches = [mockConversation1];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery(titleMatches);
            }
            if (table === "messages") {
              return createSearchQuery([]);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "React",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        conversationId: "conv-1",
        title: "React hooks discussion",
        snippet: "React hooks discussion",
        matchedIn: "title",
        messageCount: 10,
        updatedAt: 3000,
      });
    });

    test("returns correct result structure for message matches", async () => {
      const messageMatches = [
        {
          _id: "msg-1" as Id<"messages">,
          conversationId: "conv-2" as Id<"conversations">,
          content: "Discussing TypeScript generics here",
          isMainBranch: true,
        },
      ];

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([]);
            }
            if (table === "messages") {
              return createSearchQuery(messageMatches);
            }
            return createSearchQuery([]);
          }),
          get: mock(() => Promise.resolve(mockConversation2)),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "TypeScript",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        conversationId: "conv-2",
        title: "TypeScript generics",
        snippet: "Discussing TypeScript generics here",
        matchedIn: "message",
        messageCount: 5,
        updatedAt: 2000,
      });
    });

    test("handles conversations with no title gracefully", async () => {
      const untitledConversation = {
        ...mockConversation1,
        title: undefined,
      };

      const ctx = makeConvexCtx({
        db: {
          query: mock(table => {
            if (table === "conversations") {
              return createSearchQuery([untitledConversation]);
            }
            if (table === "messages") {
              return createSearchQuery([]);
            }
            return createSearchQuery([]);
          }),
        },
      });

      const result = await searchUserConversationsHandler(
        ctx as unknown as QueryCtx,
        {
          userId,
          query: "",
          limit: 10,
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Untitled");
      expect(result[0].snippet).toBe("No title");
    });
  });
});
