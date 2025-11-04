import { describe, expect, test } from "bun:test";
import type { Doc } from "convex/_generated/dataModel";
import {
  convertServerMessage,
  convertServerMessages,
  extractMessagesArray,
  findStreamingMessage,
  isMessageMetadata,
  isMessageStreaming,
} from "./message-utils?actual";

describe("chat/message-utils", () => {
  describe("isMessageMetadata", () => {
    test("accepts null and undefined", () => {
      expect(isMessageMetadata(null)).toBe(true);
      expect(isMessageMetadata(undefined)).toBe(true);
    });

    test("accepts objects with valid metadata properties", () => {
      expect(isMessageMetadata({ finishReason: "stop" })).toBe(true);
      expect(isMessageMetadata({ stopped: true })).toBe(true);
      expect(isMessageMetadata({ tokenCount: 100 })).toBe(true);
      expect(isMessageMetadata({ reasoningTokenCount: 50 })).toBe(true);
      expect(isMessageMetadata({ duration: 1000 })).toBe(true);
      expect(isMessageMetadata({ searchQuery: "test" })).toBe(true);
      expect(isMessageMetadata({ status: "pending" })).toBe(true);
    });

    test("accepts empty objects", () => {
      expect(isMessageMetadata({})).toBe(true);
    });

    test("rejects non-object types", () => {
      expect(isMessageMetadata("string")).toBe(false);
      expect(isMessageMetadata(123)).toBe(false);
      expect(isMessageMetadata(true)).toBe(false);
      expect(isMessageMetadata([])).toBe(false);
    });
  });

  describe("convertServerMessage", () => {
    test("converts server message to ChatMessage format", () => {
      const serverMessage = {
        _id: "msg_123",
        _creationTime: 1234567890,
        role: "assistant",
        content: "Hello world",
        status: "completed",
        reasoning: "Test reasoning",
        model: "gpt-4",
        provider: "openai",
        parentId: "parent_123",
        isMainBranch: true,
        sourceConversationId: "conv_123",
        useWebSearch: false,
        attachments: [{ type: "image", url: "test.jpg" }],
        citations: [{ url: "http://example.com", title: "Example" }],
        metadata: { finishReason: "stop", tokenCount: 100 },
        imageGeneration: { prompt: "test image" },
        createdAt: 1234567890,
        conversationId: "conv_123",
      } as unknown as Doc<"messages">;

      const result = convertServerMessage(serverMessage);

      expect(result).toEqual({
        id: "msg_123",
        role: "assistant",
        content: "Hello world",
        status: "completed",
        reasoning: "Test reasoning",
        model: "gpt-4",
        provider: "openai",
        parentId: "parent_123",
        isMainBranch: true,
        sourceConversationId: "conv_123",
        useWebSearch: false,
        attachments: [{ type: "image", url: "test.jpg" }],
        citations: [{ url: "http://example.com", title: "Example" }],
        metadata: { finishReason: "stop", tokenCount: 100 },
        imageGeneration: { prompt: "test image" },
        createdAt: 1234567890,
      });
    });

    test("falls back to _creationTime when createdAt is missing", () => {
      const serverMessage = {
        _id: "msg_123",
        _creationTime: 1234567890,
        role: "user",
        content: "Test",
        status: "completed",
        conversationId: "conv_123",
      } as unknown as Doc<"messages">;

      const result = convertServerMessage(serverMessage);
      expect(result.createdAt).toBe(1234567890);
    });

    test("handles undefined metadata gracefully", () => {
      const serverMessage = {
        _id: "msg_123",
        _creationTime: 1234567890,
        role: "user",
        content: "Test",
        status: "completed",
        conversationId: "conv_123",
        metadata: "invalid_metadata",
      } as unknown as Doc<"messages">;

      const result = convertServerMessage(serverMessage);
      expect(result.metadata).toBeUndefined();
    });
  });

  describe("extractMessagesArray", () => {
    test("returns empty array for null/undefined input", () => {
      expect(extractMessagesArray(null)).toEqual([]);
      expect(extractMessagesArray(undefined)).toEqual([]);
    });

    test("returns direct array when input is array", () => {
      const messages = [
        { _id: "msg_1" },
        { _id: "msg_2" },
      ] as unknown as Doc<"messages">[];
      expect(extractMessagesArray(messages)).toEqual(messages);
    });

    test("extracts page from paginated result", () => {
      const messages = [
        { _id: "msg_1" },
        { _id: "msg_2" },
      ] as unknown as Doc<"messages">[];
      const paginatedResult = { page: messages, isDone: true };

      expect(extractMessagesArray(paginatedResult)).toEqual(messages);
    });

    test("returns empty array for invalid input", () => {
      expect(extractMessagesArray("string")).toEqual([]);
      expect(extractMessagesArray(123)).toEqual([]);
      expect(extractMessagesArray({ data: [] })).toEqual([]);
    });
  });

  describe("convertServerMessages", () => {
    test("converts array of server messages", () => {
      const serverMessages: Doc<"messages">[] = [
        {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "user",
          content: "Hello",
          status: "completed",
          conversationId: "conv_123",
        },
        {
          _id: "msg_2",
          _creationTime: 1234567891,
          role: "assistant",
          content: "Hi there",
          status: "completed",
          conversationId: "conv_123",
        },
      ] as unknown as Doc<"messages">[];

      const result = convertServerMessages(serverMessages);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("msg_1");
      expect(result[0].role).toBe("user");
      expect(result[1].id).toBe("msg_2");
      expect(result[1].role).toBe("assistant");
    });

    test("converts paginated server messages", () => {
      const serverMessages: Doc<"messages">[] = [
        {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "user",
          content: "Hello",
          status: "completed",
          conversationId: "conv_123",
        },
      ] as unknown as Doc<"messages">[];

      const paginatedResult = { page: serverMessages };
      const result = convertServerMessages(paginatedResult);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("msg_1");
    });

    test("handles empty input", () => {
      expect(convertServerMessages(null)).toEqual([]);
      expect(convertServerMessages([])).toEqual([]);
    });
  });

  describe("isMessageStreaming", () => {
    describe("with server messages", () => {
      test("identifies streaming assistant messages", () => {
        const message: Doc<"messages"> = {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "assistant",
          content: "Partial response...",
          status: "generating",
          conversationId: "conv_123",
          metadata: null,
        } as unknown as Doc<"messages">;

        expect(isMessageStreaming(message)).toBe(true);
      });

      test("identifies non-streaming finished messages", () => {
        const message: Doc<"messages"> = {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "assistant",
          content: "Complete response",
          status: "completed",
          conversationId: "conv_123",
          metadata: { finishReason: "stop" },
        } as unknown as Doc<"messages">;

        expect(isMessageStreaming(message)).toBe(false);
      });

      test("identifies stopped messages", () => {
        const message: Doc<"messages"> = {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "assistant",
          content: "Stopped response",
          status: "completed",
          conversationId: "conv_123",
          metadata: { stopped: true },
        } as unknown as Doc<"messages">;

        expect(isMessageStreaming(message)).toBe(false);
      });

      test("does not identify user messages as streaming", () => {
        const message: Doc<"messages"> = {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "user",
          content: "User message",
          status: "completed",
          conversationId: "conv_123",
        } as unknown as Doc<"messages">;

        expect(isMessageStreaming(message)).toBe(false);
      });
    });

    describe("with chat messages", () => {
      test("identifies streaming chat messages when generating", () => {
        const message = {
          id: "msg_1",
          role: "assistant" as const,
          content: "Partial response...",
          metadata: { finishReason: "streaming" },
          isMainBranch: true,
          createdAt: 0,
        };

        expect(isMessageStreaming(message, true)).toBe(true);
      });

      test("does not identify streaming when not generating", () => {
        const message = {
          id: "msg_1",
          role: "assistant" as const,
          content: "Partial response...",
          metadata: { finishReason: "streaming" },
          isMainBranch: true,
          createdAt: 0,
        };

        expect(isMessageStreaming(message, false)).toBe(false);
      });

      test("identifies finished chat messages", () => {
        const message = {
          id: "msg_1",
          role: "assistant" as const,
          content: "Complete response",
          metadata: { finishReason: "stop" },
          isMainBranch: true,
          createdAt: 0,
        };

        expect(isMessageStreaming(message, true)).toBe(false);
      });
    });
  });

  describe("findStreamingMessage", () => {
    test("finds streaming message in array", () => {
      const messages: Doc<"messages">[] = [
        {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "user",
          content: "Hello",
          status: "completed",
          conversationId: "conv_123",
        },
        {
          _id: "msg_2",
          _creationTime: 1234567891,
          role: "assistant",
          content: "Streaming...",
          status: "generating",
          conversationId: "conv_123",
          metadata: null,
        },
      ] as unknown as Doc<"messages">[];

      const result = findStreamingMessage(messages);
      expect(result).toEqual({ id: "msg_2", isStreaming: true });
    });

    test("finds streaming message in paginated result", () => {
      const messages: Doc<"messages">[] = [
        {
          _id: "msg_streaming",
          _creationTime: 1234567891,
          role: "assistant",
          content: "Streaming...",
          status: "generating",
          conversationId: "conv_123",
          metadata: {},
        },
      ] as unknown as Doc<"messages">[];

      const paginatedResult = { page: messages };
      const result = findStreamingMessage(paginatedResult);
      expect(result).toEqual({ id: "msg_streaming", isStreaming: true });
    });

    test("returns null when no streaming message found", () => {
      const messages: Doc<"messages">[] = [
        {
          _id: "msg_1",
          _creationTime: 1234567890,
          role: "assistant",
          content: "Complete",
          status: "completed",
          conversationId: "conv_123",
          metadata: { finishReason: "stop" },
        },
      ] as unknown as Doc<"messages">[];

      expect(findStreamingMessage(messages)).toBeNull();
    });

    test("returns null for empty input", () => {
      expect(findStreamingMessage(null)).toBeNull();
      expect(findStreamingMessage([])).toBeNull();
    });
  });
});
