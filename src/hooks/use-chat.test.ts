import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { renderHook } from "../test/hook-utils";

let useSelectedModelMock: ReturnType<typeof mock>;
let createChatHandlersMock: ReturnType<typeof mock>;
let isUserModelMock: ReturnType<typeof mock>;
let useUserDataContextMock: ReturnType<typeof mock>;
let useQueryMock: ReturnType<typeof mock>;
let useActionMock: ReturnType<typeof mock>;
let useMutationMock: ReturnType<typeof mock>;
let useAuthTokenMock: ReturnType<typeof mock>;

mock.module("@/lib/ai/chat-handlers", () => ({
  createChatHandlers: (...args: unknown[]) => createChatHandlersMock(...args),
}));
mock.module("@/hooks/use-selected-model", () => ({
  useSelectedModel: (...args: unknown[]) => useSelectedModelMock(...args),
}));
mock.module("@/lib/type-guards", () => ({
  isUserModel: (...args: unknown[]) => isUserModelMock(...args),
}));
mock.module("@/providers/user-data-context", () => ({
  useUserDataContext: (...args: unknown[]) => useUserDataContextMock(...args),
}));
mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useAction: (...args: unknown[]) => useActionMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));
mock.module("@convex-dev/auth/react", () => ({
  useAuthToken: (...args: unknown[]) => useAuthTokenMock(...args),
}));

import { useSelectedModel } from "@/hooks/use-selected-model";
import { createChatHandlers } from "@/lib/ai/chat-handlers";
import { isUserModel } from "@/lib/type-guards";
import { mapServerMessageToChatMessage, useChat } from "./use-chat";

describe("mapServerMessageToChatMessage", () => {
  test("preserves error fields from the server", () => {
    const serverMessage = {
      _id: "m1",
      role: "assistant",
      content: "",
      status: "error",
      statusText: "Model unavailable",
      error: "No endpoints found for x-ai/grok-4-fast:free.",
      parentId: undefined,
      isMainBranch: true,
      sourceConversationId: undefined,
      useWebSearch: false,
      attachments: [],
      citations: [],
      metadata: {},
      createdAt: 0,
    } as unknown as Doc<"messages">;

    const mapped = mapServerMessageToChatMessage(serverMessage);
    expect(mapped.status).toBe("error");
    expect(mapped.statusText).toBe("Model unavailable");
    expect(mapped.error).toBe("No endpoints found for x-ai/grok-4-fast:free.");
  });
});

describe("useChat", () => {
  beforeEach(() => {
    useSelectedModelMock = mock();
    createChatHandlersMock = mock();
    isUserModelMock = mock();
    useUserDataContextMock = mock(() => ({ user: { isAnonymous: false } }));
    useQueryMock = mock(() => undefined);
    useActionMock = mock(() => mock());
    useMutationMock = mock(() => mock());
    useAuthTokenMock = mock(() => null);
  });

  test("uses server mode when conversationId provided and wires handlers", async () => {
    useSelectedModelMock.mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "test" },
    ]);
    isUserModelMock.mockReturnValue(false);
    const sendSpy = mock();
    createChatHandlersMock.mockReturnValue({
      sendMessage: sendSpy,
      stopGeneration: mock(),
    });

    const { result } = renderHook(() =>
      useChat({ conversationId: "c1" as Id<"conversations"> })
    );
    // Should call our handler when invoked
    await act(async () => {
      await result.current.sendMessage({ content: "x" });
    });
    expect(sendSpy).toHaveBeenCalled();
    // Verify mode selection
    expect(createChatHandlersMock.mock.calls.length).toBeGreaterThan(0);
    const call = createChatHandlersMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.type).toBe("server");
    expect(call.conversationId).toBe("c1");
    expect(call.actions).toBeDefined();
  });

  test("uses private mode when user model selected and updates messages via handler", async () => {
    // Provide a user model
    useSelectedModelMock.mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "x" },
    ]);
    isUserModelMock.mockReturnValue(true);

    // Mock chat handlers to append an assistant message via provided config
    createChatHandlersMock.mockImplementation((mode: unknown) => {
      const m = mode as {
        type: string;
        config?: {
          setMessages: (
            msgs: Array<{ id: string; role: string; content: string }>
          ) => void;
        };
      };
      if (m.type === "private") {
        return {
          sendMessage: () => {
            m.config?.setMessages([
              { id: "a1", role: "assistant", content: "hi" },
            ]);
          },
          stopGeneration: mock(),
          saveConversation: mock(),
          editMessage: mock(),
          retryFromMessage: mock(),
          deleteMessage: mock(),
        };
      }
      return { sendMessage: mock(), stopGeneration: mock() };
    });

    const { result } = renderHook(() => useChat({}));
    await act(async () => {
      await result.current.sendMessage({ content: "x" });
    });
    expect(result.current.messages).toHaveLength(1);
    // Mode captured
    expect(createChatHandlersMock.mock.calls.length).toBeGreaterThan(0);
    const call = createChatHandlersMock.mock.calls[0]?.[0];
    expect(call.type).toBe("private");
    expect(call.config).toBeDefined();
  });

  test("throws when model not loaded in private mode context", async () => {
    useSelectedModelMock.mockReturnValue([null]);
    isUserModelMock.mockReturnValue(false);
    createChatHandlersMock.mockReturnValue({});

    const { result } = renderHook(() => useChat({}));
    await expect(result.current.sendMessage({ content: "x" })).rejects.toThrow(
      /No model selected/
    );
  });

  test("marks loading false when no conversation is selected", () => {
    useSelectedModelMock.mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "custom" },
    ]);
    isUserModelMock.mockReturnValue(true);
    createChatHandlersMock.mockReturnValue({
      sendMessage: mock(),
      stopGeneration: mock(),
      retryFromMessage: mock(),
      editMessage: mock(),
      deleteMessage: mock(),
      saveConversation: mock(),
    });

    const { result } = renderHook(() => useChat({}));

    expect(result.current.isLoading).toBe(false);
  });
});
