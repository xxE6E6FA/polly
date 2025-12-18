import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Doc } from "convex/_generated/dataModel";
import { setConvexMock, setUserDataMock } from "../../test/global-mocks";

// Import after global mocks are set up
const { mapServerMessageToChatMessage, useChat } = await import("./use-chat");

// Mock the useSelectedModel hook using spyOn instead of mock.module
const mockUseSelectedModel = mock(() => ({
  selectedModel: { modelId: "gemini-2.0-flash", provider: "google" },
  selectModel: mock(),
}));

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

    test("stopGeneration calls mutation", () => {
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

      // Should call the stop mutation
      expect(mockStopMutation).toHaveBeenCalledWith({
        conversationId: "conv-123",
      });
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
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValueOnce({
        selectedModel: userModel,
        selectModel: mock(),
      });
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
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel,
        selectModel: mock(),
      });

      setConvexMock({});
      const { result } = renderHook(() => useChat({}));

      expect(result.current.selectedModel).toBe(selectedModel);

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel: { modelId: "gemini-2.0-flash", provider: "google" },
        selectModel: mock(),
      });
    });

    test("creates model options from selected model", () => {
      const selectedModel = { modelId: "claude-3", provider: "anthropic" };
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel,
        selectModel: mock(),
      });

      setConvexMock({});
      const { result } = renderHook(() => useChat({}));

      // The model options are internal, but we can verify the selectedModel is returned
      expect(result.current.selectedModel).toBe(selectedModel);

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel: { modelId: "gemini-2.0-flash", provider: "google" },
        selectModel: mock(),
      });
    });
  });

  describe("error handling", () => {
    test("handles model not loaded gracefully", () => {
      // When no selected model and no user model capabilities
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel: null,
        selectModel: mock(),
      });
      setUserDataMock({ user: null }); // No user

      setConvexMock({});
      const { result } = renderHook(() => useChat({}));

      // Should throw synchronously when no model selected
      expect(() => result.current.sendMessage({ content: "test" })).toThrow(
        "No model selected"
      );

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel: { modelId: "gemini-2.0-flash", provider: "google" },
        selectModel: mock(),
      });
    });
  });

  describe("retry functionality", () => {
    test("retryFromMessage calls the retry action", async () => {
      const mockRetryAction = mock(async () => ({
        userMessageId: "msg-1",
        assistantMessageId: "msg-3",
      }));
      setConvexMock({
        useAction: () => mockRetryAction,
        useMutation: () => mock(async () => undefined),
      });

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
          content: "Hi there",
          status: "done",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: messages,
        })
      );

      await act(async () => {
        await result.current.retryFromMessage("msg-2");
      });

      expect(mockRetryAction).toHaveBeenCalled();
    });

    test("retryFromMessage throws when no model selected", async () => {
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel: null,
        selectModel: mock(),
      });

      setConvexMock({});

      const { result } = renderHook(() =>
        useChat({ conversationId: "conv-123" })
      );

      await expect(result.current.retryFromMessage("msg-1")).rejects.toThrow(
        "No model selected"
      );

      // Reset spy
      spyOn(selectedModelModule, "useSelectedModel").mockReturnValue({
        selectedModel: { modelId: "gemini-2.0-flash", provider: "google" },
        selectModel: mock(),
      });
    });
  });

  describe("stop then retry scenarios", () => {
    test("can retry after stopping a message", async () => {
      const mockStopMutation = mock(async () => undefined);
      const mockRetryAction = mock(async () => ({
        userMessageId: "msg-1",
        assistantMessageId: "msg-3",
      }));

      setConvexMock({
        useAction: () => mockRetryAction,
        useMutation: () => mockStopMutation,
      });

      const streamingMessages = [
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
          content: "Partial...",
          status: "streaming",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: streamingMessages,
        })
      );

      // First, stop the streaming
      act(() => {
        result.current.stopGeneration();
      });

      expect(result.current.isStreaming).toBe(false);
      expect(result.current.messages[1]?.metadata?.stopped).toBe(true);

      // Then retry
      await act(async () => {
        await result.current.retryFromMessage("msg-2");
      });

      expect(mockRetryAction).toHaveBeenCalled();
    });

    test("stop clears streaming state before retry can start new stream", () => {
      const mockStopMutation = mock(async () => undefined);

      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      // Message in thinking phase (no content yet)
      const thinkingMessages = [
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
          content: "",
          status: "thinking",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: thinkingMessages,
        })
      );

      // Verify initially streaming
      expect(result.current.isStreaming).toBe(true);

      // Stop
      act(() => {
        result.current.stopGeneration();
      });

      // Should immediately show as not streaming
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.messages[1]?.status).toBe("done");
    });
  });

  describe("stop during different phases", () => {
    test("stop during thinking phase updates message correctly", () => {
      const mockStopMutation = mock(async () => undefined);
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

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
          content: "",
          status: "thinking",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: messages,
        })
      );

      act(() => {
        result.current.stopGeneration();
      });

      const stoppedMessage = result.current.messages[1];
      expect(stoppedMessage?.status).toBe("done");
      expect(stoppedMessage?.metadata?.stopped).toBe(true);
      expect(stoppedMessage?.metadata?.finishReason).toBe("user_stopped");
    });

    test("stop during streaming phase preserves partial content", () => {
      const mockStopMutation = mock(async () => undefined);
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

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
          content: "Here is a partial response that was",
          status: "streaming",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: messages,
        })
      );

      act(() => {
        result.current.stopGeneration();
      });

      const stoppedMessage = result.current.messages[1];
      // Content should be preserved
      expect(stoppedMessage?.content).toBe(
        "Here is a partial response that was"
      );
      expect(stoppedMessage?.status).toBe("done");
      expect(stoppedMessage?.metadata?.stopped).toBe(true);
    });

    test("stop during searching phase updates message correctly", () => {
      const mockStopMutation = mock(async () => undefined);
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      const messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Search for something",
          isMainBranch: true,
          createdAt: 123,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "",
          status: "searching",
          isMainBranch: true,
          createdAt: 456,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: messages,
        })
      );

      expect(result.current.isStreaming).toBe(true);

      act(() => {
        result.current.stopGeneration();
      });

      expect(result.current.isStreaming).toBe(false);
      expect(result.current.messages[1]?.status).toBe("done");
      expect(result.current.messages[1]?.metadata?.stopped).toBe(true);
    });

    test("stop preserves existing metadata", () => {
      const mockStopMutation = mock(async () => undefined);
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

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
          content: "Response",
          status: "streaming",
          isMainBranch: true,
          createdAt: 456,
          metadata: {
            timeToFirstTokenMs: 150,
            model: "gpt-4",
          },
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: messages,
        })
      );

      act(() => {
        result.current.stopGeneration();
      });

      const stoppedMessage = result.current.messages[1];
      // Original metadata should be preserved
      expect(stoppedMessage?.metadata?.timeToFirstTokenMs).toBe(150);
      expect(stoppedMessage?.metadata?.model).toBe("gpt-4");
      // New metadata should be added
      expect(stoppedMessage?.metadata?.stopped).toBe(true);
      expect(stoppedMessage?.metadata?.finishReason).toBe("user_stopped");
    });
  });

  describe("stop mechanism with optimistic update", () => {
    test("stopGeneration optimistically updates message status to done", () => {
      const mockStopMutation = mock(async () => {
        /* no-op mock */
      });
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      const streamingMessages = [
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

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: streamingMessages,
        })
      );

      // Before stop - message is streaming
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.messages[1]?.status).toBe("streaming");

      // Call stop
      act(() => {
        result.current.stopGeneration();
      });

      // Immediately after stop - message should be optimistically updated
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.messages[1]?.status).toBe("done");
      expect(result.current.messages[1]?.metadata?.stopped).toBe(true);
      expect(result.current.messages[1]?.metadata?.finishReason).toBe(
        "user_stopped"
      );
    });

    test("stopGeneration calls the mutation", () => {
      const mockStopMutation = mock(async () => {
        /* no-op mock */
      });
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      const streamingMessages = [
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

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: streamingMessages,
        })
      );

      act(() => {
        result.current.stopGeneration();
      });

      expect(mockStopMutation).toHaveBeenCalledWith({
        conversationId: "conv-123",
      });
    });

    test("stopGeneration does nothing if no assistant message", () => {
      const mockStopMutation = mock(async () => {
        /* no-op mock */
      });
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      const userOnlyMessages = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          isMainBranch: true,
          createdAt: 123,
        },
      ];

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: userOnlyMessages,
        })
      );

      act(() => {
        result.current.stopGeneration();
      });

      // Messages unchanged
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.role).toBe("user");

      // Mutation still called
      expect(mockStopMutation).toHaveBeenCalled();
    });

    test("multiple rapid stop calls update message once", () => {
      const mockStopMutation = mock(async () => {
        /* no-op mock */
      });
      setConvexMock({
        useMutation: () => mockStopMutation,
      });

      const streamingMessages = [
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

      const { result } = renderHook(() =>
        useChat({
          conversationId: "conv-123",
          initialMessages: streamingMessages,
        })
      );

      // Call stop multiple times rapidly
      act(() => {
        result.current.stopGeneration();
        result.current.stopGeneration();
        result.current.stopGeneration();
      });

      // Message should be stopped
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.messages[1]?.metadata?.stopped).toBe(true);

      // Mutation called 3 times
      expect(mockStopMutation).toHaveBeenCalledTimes(3);
    });
  });
});
