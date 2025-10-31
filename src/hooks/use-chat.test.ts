import type { Doc, Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("@/lib/ai/chat-handlers", () => ({ createChatHandlers: vi.fn() }));
vi.mock("@/hooks/use-selected-model", () => ({ useSelectedModel: vi.fn() }));
vi.mock("@/lib/type-guards", () => ({ isUserModel: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useAction: vi.fn(() => vi.fn()),
  useMutation: vi.fn(() => vi.fn()),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: vi.fn(() => null) }));
vi.mock("@/providers/user-data-context", () => ({
  useUserDataContext: vi.fn(() => ({ user: { isAnonymous: false } })),
}));

import { useSelectedModel } from "@/hooks/use-selected-model";
import { createChatHandlers } from "@/lib/ai/chat-handlers";
import { isUserModel } from "@/lib/type-guards";
import { mapServerMessageToChatMessage, useChat } from "./use-chat";

describe("mapServerMessageToChatMessage", () => {
  it("preserves error fields from the server", () => {
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
    vi.clearAllMocks();
  });

  it("uses server mode when conversationId provided and wires handlers", async () => {
    (useSelectedModel as unknown as vi.Mock).mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "test" },
    ]);
    (isUserModel as unknown as vi.Mock).mockReturnValue(false);
    const sendSpy = vi.fn();
    (createChatHandlers as unknown as vi.Mock).mockReturnValue({
      sendMessage: sendSpy,
      stopGeneration: vi.fn(),
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
    const call = (createChatHandlers as unknown as vi.Mock).mock.calls[0][0];
    expect(call.type).toBe("server");
    expect(call.conversationId).toBe("c1");
    expect(call.actions).toBeDefined();
  });

  it("uses private mode when user model selected and updates messages via handler", async () => {
    // Provide a user model
    (useSelectedModel as unknown as vi.Mock).mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "x" },
    ]);
    (isUserModel as unknown as vi.Mock).mockReturnValue(true);

    // Mock chat handlers to append an assistant message via provided config
    (createChatHandlers as unknown as vi.Mock).mockImplementation(
      (mode: unknown) => {
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
            stopGeneration: vi.fn(),
            saveConversation: vi.fn(),
            editMessage: vi.fn(),
            retryFromMessage: vi.fn(),
            deleteMessage: vi.fn(),
          };
        }
        return { sendMessage: vi.fn(), stopGeneration: vi.fn() };
      }
    );

    const { result } = renderHook(() => useChat({}));
    await act(async () => {
      await result.current.sendMessage({ content: "x" });
    });
    expect(result.current.messages).toHaveLength(1);
    // Mode captured
    const call = (createChatHandlers as unknown as vi.Mock).mock.calls[0][0];
    expect(call.type).toBe("private");
    expect(call.config).toBeDefined();
  });

  it("throws when model not loaded in private mode context", async () => {
    (useSelectedModel as unknown as vi.Mock).mockReturnValue([null]);
    (isUserModel as unknown as vi.Mock).mockReturnValue(false);
    (createChatHandlers as unknown as vi.Mock).mockReturnValue({});

    const { result } = renderHook(() => useChat({}));
    await expect(result.current.sendMessage({ content: "x" })).rejects.toThrow(
      /No model selected/
    );
  });

  it("marks loading false when no conversation is selected", () => {
    (useSelectedModel as unknown as vi.Mock).mockReturnValue([
      { _id: "m1", modelId: "gpt", provider: "openai", name: "custom" },
    ]);
    (isUserModel as unknown as vi.Mock).mockReturnValue(true);
    (createChatHandlers as unknown as vi.Mock).mockReturnValue({
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      retryFromMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      saveConversation: vi.fn(),
    });

    const { result } = renderHook(() => useChat({}));

    expect(result.current.isLoading).toBe(false);
  });
});
