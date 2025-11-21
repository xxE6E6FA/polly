import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Doc } from "convex/_generated/dataModel";
import { setConvexMock, setUserDataMock } from "../../test/global-mocks";

// Import after global mocks are set up
const { mapServerMessageToChatMessage, useChat } = await import("./use-chat");
const { StreamingCoordinator } = await import("@/lib/ai/streaming-coordinator");

// Mock the useSelectedModel hook using spyOn instead of mock.module
const mockUseSelectedModel = mock(() => [
  { modelId: "gemini-2.0-flash", provider: "google" },
  mock(),
]);

// Import the module to spy on
const selectedModelModule = await import("@/hooks/use-selected-model");

// Mock the useAuthToken hook using spyOn instead of mock.module
const mockUseAuthToken = mock(() => "test-auth-token");

// Import the module to spy on
const authModule = await import("@convex-dev/auth/react");

describe("mapServerMessageToChatMessage", () => {
  test("converts Convex message to chat message", () => {
    const serverMessage = {
      _id: "msg-1",
      conversationId: "conv-1",
      role: "assistant",
      content: "Hello",
      status: "completed",
      statusText: "done",
      reasoning: "chain",
      model: "model-x",
      provider: "openai",
      parentId: undefined,
      isMainBranch: true,
      sourceConversationId: undefined,
      useWebSearch: false,
      attachments: [],
      citations: [],
      metadata: { custom: true },
      imageGeneration: {
        prompt: "A cat",
        status: "processing",
      },
      error: undefined,
      createdAt: 123,
    } as unknown as Doc<"messages">;

    const result = mapServerMessageToChatMessage(serverMessage);
    expect(result).toMatchObject({
      id: "msg-1",
      role: "assistant",
      content: "Hello",
      status: "completed",
      metadata: { custom: true },
      imageGeneration: {
        prompt: "A cat",
        status: "processing",
      },
      createdAt: 123,
    });
  });

  test("handles missing optional fields", () => {
    const serverMessage = {
      _id: "msg-2",
      conversationId: "conv-1",
      role: "user",
      content: "Hi",
      isMainBranch: false,
      attachments: undefined,
      citations: undefined,
      createdAt: 99,
    } as unknown as Doc<"messages">;

    const result = mapServerMessageToChatMessage(serverMessage);
    expect(result.error).toBeUndefined();
    expect(result.attachments).toBeUndefined();
    expect(result.imageGeneration).toBeUndefined();
  });
});

describe("useChat", () => {
  beforeEach(() => {
    setUserDataMock({
      user: { _id: "user-123", isAnonymous: false },
      canSendMessage: true,
    });

    // Set up spies for each test
    spyOn(selectedModelModule, "useSelectedModel").mockReturnValue(
      mockUseSelectedModel()
    );
    spyOn(authModule, "useAuthToken").mockReturnValue(mockUseAuthToken());

    // Mock StreamingCoordinator methods
    spyOn(StreamingCoordinator, "start").mockResolvedValue(true);
    spyOn(StreamingCoordinator, "stop").mockImplementation(() => {});
    spyOn(StreamingCoordinator, "isStreaming").mockReturnValue(false);
    spyOn(StreamingCoordinator, "getCurrentStreamId").mockReturnValue(null);
  });

  describe("initialization", () => {
    test("initializes with empty messages when no conversationId", () => {
      setConvexMock({});

      const { result } = renderHook(() => useChat({}));

      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.canSave).toBe(false);
    });

    test("initializes with provided initialMessages", () => {
      const initialMessages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
      ];

      setConvexMock({});
      const { result } = renderHook(() => useChat({ initialMessages }));

      expect(result.current.messages).toEqual(initialMessages);
      expect(result.current.isLoading).toBe(false);
    });

    test("sets loading state when conversationId provided without initialMessages", () => {
      setConvexMock({
        useQuery: () => undefined, // Loading state
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.messages).toEqual([]);
    });
  });

  describe("server mode (with conversationId)", () => {
    test("loads and converts server messages", async () => {
      const serverMessages = [
        {
          _id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          _id: "msg-2",
          role: "assistant",
          content: "Hi there",
          isMainBranch: true,
          createdAt: 456,
        },
      ] as Doc<"messages">[];

      setConvexMock({
        useQuery: () => serverMessages, // Return messages directly
        useAction: () =>
          mock(async () => ({
            userMessageId: "msg-1",
            assistantMessageId: "msg-2",
          })),
        useMutation: () =>
          mock(async () => {
            /* no-op mock */
          }),
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toMatchObject({
        id: "msg-1",
        role: "user",
        content: "Hello",
      });
      expect(result.current.canSave).toBe(false); // Has conversationId
    });

    test("handles paginated message results", async () => {
      const paginatedMessages = {
        page: [
          {
            _id: "msg-1",
            role: "user",
            content: "Hello",
            isMainBranch: true,
            createdAt: 123,
          },
        ],
        isDone: true,
        continueCursor: null,
      };

      setConvexMock({
        useQuery: () => paginatedMessages,
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe("Hello");
    });

    test("handles null server messages result", async () => {
      setConvexMock({
        useQuery: () => null,
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.messages).toEqual([]);
    });
  });

  describe("private mode (without conversationId)", () => {
    test("enables save functionality for non-anonymous users with messages", () => {
      setConvexMock({
        useAction: () => mock(async () => "conv-new"),
      });

      const { result } = renderHook(() =>
        useChat({
          initialMessages: [
            {
              id: "msg-1",
              role: "user",
              content: "Hello",
              isMainBranch: true,
              createdAt: 123,
            },
          ],
        })
      );

      expect(result.current.canSave).toBe(true);
    });

    test("disables save for anonymous users", () => {
      setUserDataMock({
        user: { _id: "user-123", isAnonymous: true },
      });
      setConvexMock({});

      const { result } = renderHook(() =>
        useChat({
          initialMessages: [
            {
              id: "msg-1",
              role: "user",
              content: "Hello",
              isMainBranch: true,
              createdAt: 123,
            },
          ],
        })
      );

      expect(result.current.canSave).toBe(false);
    });

    test("disables save when no messages", () => {
      setConvexMock({});

      const { result } = renderHook(() => useChat({}));

      expect(result.current.canSave).toBe(false);
    });
  });

  describe("streaming detection", () => {
    test("returns false when no messages", () => {
      setConvexMock({});

      const { result } = renderHook(() => useChat({}));

      expect(result.current.isStreaming).toBe(false);
    });

    test("returns false when latest assistant has finishReason", () => {
      const messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi",
          isMainBranch: true,
          createdAt: 456,
          metadata: { finishReason: "stop" },
        },
      ];

      setConvexMock({});
      const { result } = renderHook(() =>
        useChat({ initialMessages: messages })
      );

      expect(result.current.isStreaming).toBe(false);
    });

    test("returns false when latest assistant has stopped flag", () => {
      const messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi",
          isMainBranch: true,
          createdAt: 456,
          metadata: { stopped: true },
        },
      ];

      setConvexMock({});
      const { result } = renderHook(() =>
        useChat({ initialMessages: messages })
      );

      expect(result.current.isStreaming).toBe(false);
    });

    test("returns true when latest assistant is streaming", () => {
      const messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi",
          status: "streaming",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      setConvexMock({});
      const { result } = renderHook(() =>
        useChat({ initialMessages: messages })
      );

      expect(result.current.isStreaming).toBe(true);
    });

    test("returns true when latest assistant is thinking", () => {
      const messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi",
          status: "thinking",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      setConvexMock({});
      const { result } = renderHook(() =>
        useChat({ initialMessages: messages })
      );

      expect(result.current.isStreaming).toBe(true);
    });

    test("returns false when latest message is not assistant", () => {
      const messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          id: "msg-2",
          role: "user",
          content: "How are you?",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      setConvexMock({});
      const { result } = renderHook(() =>
        useChat({ initialMessages: messages })
      );

      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe("message operations", () => {
    test("sendMessage calls chat handlers in server mode", async () => {
      const mockSendMessage = mock(async () => ({}));
      setConvexMock({
        useAction: () => mockSendMessage,
        useMutation: () =>
          mock(async () => {
            /* no-op mock */
          }),
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      await act(async () => {
        await result.current.sendMessage({ content: "Hello" });
      });

      expect(mockSendMessage).toHaveBeenCalled();
    });

    test("deleteMessage calls mutation", async () => {
      const mockDeleteMutation = mock(async () => {
        /* no-op mock */
      });
      setConvexMock({
        useMutation: () => mockDeleteMutation,
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      await act(async () => {
        await result.current.deleteMessage("msg-1");
      });

      expect(mockDeleteMutation).toHaveBeenCalledWith({ id: "msg-1" });
    });

    test("stopGeneration calls StreamingCoordinator.stop", () => {
      const mockStopMutation = mock(async () => {
        /* no-op mock */
      });
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      act(() => {
        result.current.stopGeneration();
      });

      // Should NOT call mutation anymore
      expect(mockStopMutation).not.toHaveBeenCalled();
      // Should call StreamingCoordinator.stop
      expect(StreamingCoordinator.stop).toHaveBeenCalled();
    });

    test("saveConversation calls action and returns result", async () => {
      const mockSaveAction = mock(async () => "conv-new");
      const userModel = {
        _id: "model-1" as any,
        userId: "user-123" as any,
        modelId: "gpt-4",
        provider: "openai",
        name: "GPT-4",
        supportsImages: false,
        supportsReasoning: true,
        supportsTools: true,
        contextLength: 8192,
      };

      // Override the spy for this test
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValueOnce([
        userModel,
        mock(),
      ]);
      setConvexMock({
        useAction: () => mockSaveAction,
      });

      const { result } = renderHook(() =>
        useChat({
          initialMessages: [
            {
              id: "msg-1",
              role: "user",
              content: "Hello",
              isMainBranch: true,
              createdAt: 123,
            },
          ],
        })
      );

      const conversationId =
        await result.current.saveConversation("Test title");

      expect(mockSaveAction).toHaveBeenCalledWith({
        messages: result.current.messages,
        title: "Test title",
      });
      expect(conversationId).toBe("conv-new");
    });

    test("saveConversation throws error when no save handler", async () => {
      setConvexMock({});

      const { result } = renderHook(() => useChat({}));

      await expect(result.current.saveConversation()).rejects.toThrow(
        "Model not loaded"
      );
    });
  });

  describe("model and options", () => {
    test("returns selected model", () => {
      const selectedModel = { modelId: "gpt-4", provider: "openai" };
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue([
        selectedModel,
        mock(),
      ]);

      setConvexMock({});
      const { result } = renderHook(() => useChat({}));

      expect(result.current.selectedModel).toBe(selectedModel);

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue([
        { modelId: "gemini-2.0-flash", provider: "google" },
        mock(),
      ]);
    });

    test("creates model options from selected model", () => {
      const selectedModel = { modelId: "claude-3", provider: "anthropic" };
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue([
        selectedModel,
        mock(),
      ]);

      setConvexMock({});
      const { result } = renderHook(() => useChat({}));

      // The model options are internal, but we can verify the selectedModel is returned
      expect(result.current.selectedModel).toBe(selectedModel);

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue([
        { modelId: "gemini-2.0-flash", provider: "google" },
        mock(),
      ]);
    });
  });

  describe("error handling", () => {
    test("handles model not loaded gracefully", () => {
      // When no selected model and no user model capabilities
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue([
        null,
        mock(),
      ]);
      setUserDataMock({ user: null }); // No user

      setConvexMock({});
      const { result } = renderHook(() => useChat({}));

      // Should throw synchronously when no model selected
      expect(() => result.current.sendMessage({ content: "test" })).toThrow(
        "No model selected"
      );

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue([
        { modelId: "gemini-2.0-flash", provider: "google" },
        mock(),
      ]);
    });
  });
});
