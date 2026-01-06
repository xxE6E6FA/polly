import { describe, expect, mock, test } from "bun:test";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ConversationSearchResult } from "../../conversation_search";
import {
  conversationSearchToolSchema,
  createConversationSearchTool,
  CONVERSATION_SEARCH_TOOL_NAME,
} from "./conversation_search";

// ============================================================================
// Test Data
// ============================================================================

const userId = "user-123" as Id<"users">;
const conversationId = "conv-current" as Id<"conversations">;

const mockSearchResult: ConversationSearchResult = {
  conversationId: "conv-1",
  title: "React Hooks Discussion",
  snippet: "We discussed useState and useEffect patterns",
  matchedIn: "title",
  messageCount: 15,
  updatedAt: Date.now(),
  relevantContext: "User asked about React hooks\nAssistant explained useState",
};

const mockSearchResultWithMessage: ConversationSearchResult = {
  conversationId: "conv-2",
  title: "TypeScript Generics",
  snippet: "Generic constraints allow you to narrow types",
  matchedIn: "message",
  messageCount: 8,
  updatedAt: Date.now() - 86400000, // 1 day ago
};

// ============================================================================
// Schema Tests
// ============================================================================

describe("conversationSearchToolSchema", () => {
  test("validates mode enum correctly", () => {
    const validRecent = conversationSearchToolSchema.safeParse({
      mode: "recent",
    });
    expect(validRecent.success).toBe(true);

    const validSearch = conversationSearchToolSchema.safeParse({
      mode: "search",
      query: "React hooks",
    });
    expect(validSearch.success).toBe(true);

    const invalidMode = conversationSearchToolSchema.safeParse({
      mode: "invalid",
    });
    expect(invalidMode.success).toBe(false);
  });

  test("query defaults to empty string", () => {
    const result = conversationSearchToolSchema.parse({
      mode: "recent",
    });
    expect(result.query).toBe("");
  });

  test("limit defaults to 10", () => {
    const result = conversationSearchToolSchema.parse({
      mode: "search",
      query: "test",
    });
    expect(result.limit).toBe(10);
  });

  test("accepts custom limit", () => {
    const result = conversationSearchToolSchema.parse({
      mode: "search",
      query: "test",
      limit: 5,
    });
    expect(result.limit).toBe(5);
  });
});

// ============================================================================
// Tool Name Tests
// ============================================================================

describe("CONVERSATION_SEARCH_TOOL_NAME", () => {
  test("has correct value", () => {
    expect(CONVERSATION_SEARCH_TOOL_NAME).toBe("conversationSearch");
  });
});

// ============================================================================
// Tool Creation Tests
// ============================================================================

describe("createConversationSearchTool", () => {
  test("creates a tool with correct structure", () => {
    const mockCtx = {
      runQuery: mock(() => Promise.resolve([])),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);

    expect(tool).toBeDefined();
    expect(tool.description).toContain("Search through the user's past conversations");
    expect(tool.inputSchema).toBe(conversationSearchToolSchema);
  });

  test("tool description includes usage guidance", () => {
    const mockCtx = {
      runQuery: mock(() => Promise.resolve([])),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);

    expect(tool.description).toContain("TWO MODES");
    expect(tool.description).toContain('mode="recent"');
    expect(tool.description).toContain('mode="search"');
    expect(tool.description).toContain("WHEN TO USE THIS TOOL");
    expect(tool.description).toContain("DO NOT USE WHEN");
  });
});

// ============================================================================
// Tool Execution Tests
// ============================================================================

describe("conversationSearchTool.execute", () => {
  test("executes search mode with query", async () => {
    const mockResults = [mockSearchResult];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "React hooks",
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.searchQuery).toBe("React hooks");
    expect(mockCtx.runQuery).toHaveBeenCalled();
  });

  test("executes recent mode with empty query", async () => {
    const mockResults = [mockSearchResult, mockSearchResultWithMessage];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "recent",
      query: "ignored query",
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.searchQuery).toBe(""); // Query should be empty for recent mode
  });

  test("filters out current conversation from results", async () => {
    const currentConvResult: ConversationSearchResult = {
      conversationId: conversationId,
      title: "Current Conversation",
      snippet: "This is the current conversation",
      matchedIn: "title",
      messageCount: 5,
      updatedAt: Date.now(),
    };

    const mockResults = [mockSearchResult, currentConvResult];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId, conversationId);
    const result = await tool.execute({
      mode: "search",
      query: "test",
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].conversationId).not.toBe(conversationId);
  });

  test("respects limit after filtering", async () => {
    const manyResults: ConversationSearchResult[] = Array.from(
      { length: 5 },
      (_, i) => ({
        conversationId: `conv-${i}`,
        title: `Conversation ${i}`,
        snippet: `Snippet ${i}`,
        matchedIn: "title" as const,
        messageCount: i + 1,
        updatedAt: Date.now() - i * 1000,
      })
    );

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(manyResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "test",
      limit: 3,
    });

    expect(result.results).toHaveLength(3);
  });

  test("handles empty results gracefully", async () => {
    const mockCtx = {
      runQuery: mock(() => Promise.resolve([])),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "nonexistent topic",
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
    expect(result.context).toContain("No matching conversations found");
  });

  test("handles query errors gracefully", async () => {
    const mockCtx = {
      runQuery: mock(() => Promise.reject(new Error("Database error"))),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "test",
      limit: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database error");
    expect(result.results).toHaveLength(0);
  });

  test("handles non-Error exceptions", async () => {
    const mockCtx = {
      runQuery: mock(() => Promise.reject("String error")),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "test",
      limit: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown error occurred");
  });
});

// ============================================================================
// Citation Building Tests
// ============================================================================

describe("citation building", () => {
  test("builds citations from search results", async () => {
    const mockResults = [mockSearchResult, mockSearchResultWithMessage];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "test",
      limit: 10,
    });

    expect(result.citations).toHaveLength(2);

    expect(result.citations[0]).toMatchObject({
      type: "conversation_citation",
      conversationId: "conv-1",
      title: "React Hooks Discussion",
      matchedIn: "title",
      messageCount: 15,
    });

    expect(result.citations[1]).toMatchObject({
      type: "conversation_citation",
      conversationId: "conv-2",
      title: "TypeScript Generics",
      matchedIn: "message",
      messageCount: 8,
    });
  });

  test("citations include snippet when available", async () => {
    const mockResults = [mockSearchResult];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "React",
      limit: 10,
    });

    expect(result.citations[0].snippet).toBe(
      "We discussed useState and useEffect patterns"
    );
  });
});

// ============================================================================
// Context Building Tests
// ============================================================================

describe("context building", () => {
  test("builds context string with result count", async () => {
    const mockResults = [mockSearchResult, mockSearchResultWithMessage];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "test",
      limit: 10,
    });

    expect(result.context).toContain("Found 2 relevant conversation(s)");
  });

  test("includes conversation titles and dates", async () => {
    const mockResults = [mockSearchResult];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "React",
      limit: 10,
    });

    expect(result.context).toContain("React Hooks Discussion");
    expect(result.context).toContain("15 messages");
    expect(result.context).toContain("Matched in: title");
  });

  test("includes matched content for message matches", async () => {
    const mockResults = [mockSearchResultWithMessage];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "generics",
      limit: 10,
    });

    expect(result.context).toContain("Matched in: message");
    expect(result.context).toContain("Matched content:");
    expect(result.context).toContain("Generic constraints allow you to narrow types");
  });

  test("includes conversation preview when available", async () => {
    const mockResults = [mockSearchResult];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "React",
      limit: 10,
    });

    expect(result.context).toContain("Conversation preview:");
    expect(result.context).toContain("User asked about React hooks");
  });

  test("includes integration instruction", async () => {
    const mockResults = [mockSearchResult];

    const mockCtx = {
      runQuery: mock(() => Promise.resolve(mockResults)),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "React",
      limit: 10,
    });

    expect(result.context).toContain(
      "Integrate this context naturally into your response"
    );
  });

  test("returns no results message for empty results", async () => {
    const mockCtx = {
      runQuery: mock(() => Promise.resolve([])),
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    const result = await tool.execute({
      mode: "search",
      query: "nonexistent",
      limit: 10,
    });

    expect(result.context).toBe("No matching conversations found in your history.");
  });
});

// ============================================================================
// Authorization Tests
// ============================================================================

describe("authorization", () => {
  test("passes userId to search query", async () => {
    const mockRunQuery = mock(() => Promise.resolve([]));

    const mockCtx = {
      runQuery: mockRunQuery,
    } as unknown as ActionCtx;

    const tool = createConversationSearchTool(mockCtx, userId);
    await tool.execute({
      mode: "search",
      query: "test",
      limit: 10,
    });

    // Verify runQuery was called with the userId
    expect(mockRunQuery).toHaveBeenCalledWith(
      expect.anything(), // internal.conversation_search.searchUserConversations
      expect.objectContaining({
        userId,
      })
    );
  });

  test("tool is scoped to specific user", async () => {
    const user1 = "user-1" as Id<"users">;
    const user2 = "user-2" as Id<"users">;

    const mockRunQuery1 = mock(() => Promise.resolve([]));
    const mockRunQuery2 = mock(() => Promise.resolve([]));

    const mockCtx1 = { runQuery: mockRunQuery1 } as unknown as ActionCtx;
    const mockCtx2 = { runQuery: mockRunQuery2 } as unknown as ActionCtx;

    const tool1 = createConversationSearchTool(mockCtx1, user1);
    const tool2 = createConversationSearchTool(mockCtx2, user2);

    await tool1.execute({ mode: "search", query: "test", limit: 10 });
    await tool2.execute({ mode: "search", query: "test", limit: 10 });

    // Each tool should pass its own userId
    expect(mockRunQuery1).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: user1 })
    );
    expect(mockRunQuery2).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: user2 })
    );
  });
});
