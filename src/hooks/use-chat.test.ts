import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { act, waitFor } from "@testing-library/react";
import { renderHook } from "../test/hook-utils";
import { mockModuleWithRestore } from "../test/utils";

let useSelectedModelMock: ReturnType<typeof mock>;
let isUserModelMock: ReturnType<typeof mock>;
let useUserDataContextMock: ReturnType<typeof mock>;
let useQueryMock: ReturnType<typeof mock>;
let useActionMock: ReturnType<typeof mock>;
let useMutationMock: ReturnType<typeof mock>;
let useAuthTokenMock: ReturnType<typeof mock>;

let streamChatMock = mock(async () => undefined);
let startAuthorStreamMock = mock(async () => null);

let sendMessageActionMock: ReturnType<typeof mock>;
let editAndResendActionMock: ReturnType<typeof mock>;
let retryFromMessageActionMock: ReturnType<typeof mock>;
let saveConversationActionMock: ReturnType<typeof mock>;
let getDecryptedApiKeyActionMock: ReturnType<typeof mock>;
let stopGenerationMutationMock: ReturnType<typeof mock>;
let deleteMessageMutationMock: ReturnType<typeof mock>;

await mockModuleWithRestore("@convex/_generated/api", () => ({
  api: {
    apiKeys: {
      getDecryptedApiKey: "apiKeys:getDecryptedApiKey",
    },
    messages: {
      list: "messages:list",
      remove: "messages:remove",
    },
    conversations: {
      sendMessage: "conversations:sendMessage",
      editAndResendMessage: "conversations:editAndResendMessage",
      retryFromMessage: "conversations:retryFromMessage",
      savePrivateConversation: "conversations:savePrivateConversation",
      stopGeneration: "conversations:stopGeneration",
    },
  },
}));

const { api } = await import("@convex/_generated/api");

await mockModuleWithRestore("@convex-dev/auth/react", actual => ({
  ...actual,
  useAuthToken: (...args: unknown[]) => useAuthTokenMock(...args),
}));

await mockModuleWithRestore("@/lib/ai/browser-streaming", actual => {
  streamChatMock = mock((options: any) => {
    const callbacks = options?.callbacks ?? {};
    const onContent =
      typeof callbacks.onContent === "function"
        ? callbacks.onContent
        : undefined;
    if (onContent) {
      onContent("hi");
    }
    const onFinish =
      typeof callbacks.onFinish === "function" ? callbacks.onFinish : undefined;
    if (onFinish) {
      onFinish("stop");
    }
  });
  return {
    ...actual,
    streamChat: (...args: unknown[]) => streamChatMock(...args),
  };
});

await mockModuleWithRestore("@/lib/ai/http-stream", actual => {
  startAuthorStreamMock = mock(async () => null);
  return {
    ...actual,
    startAuthorStream: (...args: unknown[]) => startAuthorStreamMock(...args),
  };
});

await mockModuleWithRestore("@/hooks/use-selected-model", actual => ({
  ...actual,
  useSelectedModel: (...args: unknown[]) => useSelectedModelMock(...args),
}));

await mockModuleWithRestore("@/lib/type-guards", actual => ({
  ...actual,
  isUserModel: (...args: unknown[]) => isUserModelMock(...args),
}));

await mockModuleWithRestore("@/providers/user-data-context", actual => ({
  ...actual,
  useUserDataContext: (...args: unknown[]) => useUserDataContextMock(...args),
}));

await mockModuleWithRestore("convex/react", actual => ({
  ...actual,
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useAction: (...args: unknown[]) => useActionMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

const { mapServerMessageToChatMessage, useChat } = await import("./use-chat");

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
    isUserModelMock = mock();
    useUserDataContextMock = mock(() => ({ user: { isAnonymous: false } }));
    useQueryMock = mock(() => undefined);
    useAuthTokenMock = mock(() => null);

    sendMessageActionMock = mock(async () => ({
      assistantMessageId: "assistant-1",
      userMessageId: "user-1",
    }));
    editAndResendActionMock = mock(async () => ({
      assistantMessageId: "assistant-edit",
    }));
    retryFromMessageActionMock = mock(async () => ({
      assistantMessageId: "assistant-retry",
    }));
    saveConversationActionMock = mock(async () => "conversation-id");
    getDecryptedApiKeyActionMock = mock(async () => "api-key");
    stopGenerationMutationMock = mock(async () => undefined);
    deleteMessageMutationMock = mock(async () => undefined);

    const matches = (definition: unknown, ...candidates: unknown[]) =>
      candidates.some(candidate => definition === candidate);

    useActionMock = mock((definition: unknown) => {
      if (
        matches(
          definition,
          api.conversations.sendMessage,
          "conversations:sendMessage"
        )
      ) {
        return sendMessageActionMock;
      }
      if (
        matches(
          definition,
          api.conversations.editAndResendMessage,
          "conversations:editAndResendMessage"
        )
      ) {
        return editAndResendActionMock;
      }
      if (
        matches(
          definition,
          api.conversations.retryFromMessage,
          "conversations:retryFromMessage"
        )
      ) {
        return retryFromMessageActionMock;
      }
      if (
        matches(
          definition,
          api.conversations.savePrivateConversation,
          "conversations:savePrivateConversation"
        )
      ) {
        return saveConversationActionMock;
      }
      if (
        matches(
          definition,
          api.apiKeys.getDecryptedApiKey,
          "apiKeys:getDecryptedApiKey"
        )
      ) {
        return getDecryptedApiKeyActionMock;
      }
      return mock(async () => undefined);
    });

    useMutationMock = mock((definition: unknown) => {
      if (
        matches(
          definition,
          api.conversations.stopGeneration,
          "conversations:stopGeneration"
        )
      ) {
        return stopGenerationMutationMock;
      }
      if (matches(definition, api.messages.remove, "messages:remove")) {
        return deleteMessageMutationMock;
      }
      return mock(async () => undefined);
    });

    streamChatMock.mockClear();
    startAuthorStreamMock.mockClear();
  });

  test("uses server mode when conversationId provided and wires handlers", async () => {
    useSelectedModelMock.mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "test" },
    ]);
    isUserModelMock.mockReturnValue(false);

    const { result } = renderHook(() =>
      useChat({ conversationId: "c1" as Id<"conversations"> })
    );

    // Ensure all initial effects and useMemo hooks have executed
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendMessage({ content: "x" });
    });

    expect(sendMessageActionMock).toHaveBeenCalledTimes(1);
    expect(sendMessageActionMock.mock.calls[0]?.[0]).toMatchObject({
      conversationId: "c1",
      content: "x",
    });
    result.current.stopGeneration();
    expect(stopGenerationMutationMock).toHaveBeenCalledTimes(1);
    expect(stopGenerationMutationMock.mock.calls[0]?.[0]).toEqual({
      conversationId: "c1",
    });
    expect(startAuthorStreamMock).toHaveBeenCalledTimes(1);
  });

  test("uses private mode when user model selected and updates messages via handler", async () => {
    useSelectedModelMock.mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "x" },
    ]);
    isUserModelMock.mockReturnValue(true);

    const { result } = renderHook(() => useChat({}));

    // Ensure all initial effects and useMemo hooks have executed
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendMessage({ content: "x" });
    });

    expect(streamChatMock).toHaveBeenCalledTimes(1);
    const assistantMessages = result.current.messages.filter(
      message => message.role === "assistant"
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toContain("hi");
  });

  test("throws when model not loaded in private mode context", async () => {
    useSelectedModelMock.mockReturnValue([null]);
    isUserModelMock.mockReturnValue(false);

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

    const { result } = renderHook(() => useChat({}));

    expect(result.current.isLoading).toBe(false);
  });
});
