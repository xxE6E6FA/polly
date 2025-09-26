import type { Id } from "@convex/_generated/dataModel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types";

// Hoist environment variable setup to run before all imports
vi.hoisted(() => {
  Object.defineProperty(import.meta, "env", {
    // biome-ignore lint/style/useNamingConvention: Environment variable name must match Vite's convention
    value: { VITE_CONVEX_URL: "https://convex" },
    configurable: true,
  });
});

import { streamChat } from "./browser-streaming";
import type { PrivateChatConfig } from "./chat-handlers";
import {
  createPrivateChatHandlers,
  createServerChatHandlers,
  type ModelOptions,
} from "./chat-handlers";
import { startAuthorStream } from "./http-stream";

type TestOverlays = {
  set: ReturnType<typeof vi.fn>;
  setReasoning: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  setCitations: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  appendReasoning: ReturnType<typeof vi.fn>;
  pushToolEvent: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  clearReasoning: ReturnType<typeof vi.fn>;
  clearStatus: ReturnType<typeof vi.fn>;
  clearCitations: ReturnType<typeof vi.fn>;
  clearTools: ReturnType<typeof vi.fn>;
};

declare global {
  // eslint-disable-next-line no-var
  var __testOverlays: TestOverlays;
}

vi.mock("@/lib/utils", () => ({
  cleanAttachmentsForConvex: <T>(a: T) => a,
}));

vi.mock("@/stores/stream-overlays", async () => {
  const { createOverlaysMock } = await import("../../test/utils");
  const mock = createOverlaysMock();
  // Store overlays reference for tests
  globalThis.__testOverlays = mock.overlays as unknown as TestOverlays;
  return mock.factory();
});

vi.mock("@/stores/chat-input-store", () => ({
  getChatKey: vi.fn(() => "ckey"),
  getSelectedPersonaIdFromStore: vi.fn(() => "persona-1"),
}));

vi.mock("./http-stream", () => ({
  startAuthorStream: vi.fn(async () => ({
    abortController: new AbortController(),
  })),
}));

vi.mock("./browser-streaming", () => ({
  streamChat: vi.fn(() => Promise.resolve()),
}));

describe("chat-handlers (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessage builds payload and starts HTTP stream", async () => {
    const actions = {
      sendMessage: vi
        .fn()
        .mockResolvedValue({ userMessageId: "u1", assistantMessageId: "a1" }),
      editAndResend: vi.fn(),
      retryFromMessage: vi.fn(),
      deleteMessage: vi.fn(),
      stopGeneration: vi.fn(),
    };
    const modelOptions: ModelOptions = {
      model: "gpt",
      provider: "openai",
      temperature: 0.3,
    };

    const getAuthToken = vi.fn(() => "token");
    const handlers = createServerChatHandlers(
      "conv-1",
      actions,
      modelOptions,
      getAuthToken
    );
    await handlers.sendMessage({
      content: "hello",
      temperature: 0.5,
      personaId: "p1" as Id<"personas">,
      useWebSearch: true,
    });

    expect(actions.sendMessage).toHaveBeenCalled();
    const payload = actions.sendMessage.mock.calls[0][0];
    expect(payload).toMatchObject({
      conversationId: "conv-1",
      content: "hello",
      model: "gpt",
      provider: "openai",
      temperature: 0.5,
      useWebSearch: true,
      personaId: "p1",
    });

    expect(vi.mocked(startAuthorStream)).toHaveBeenCalled();
    const args = vi.mocked(startAuthorStream).mock.calls[0][0];
    expect(args).toMatchObject({
      conversationId: "conv-1",
      assistantMessageId: "a1",
      modelId: "gpt",
      provider: "openai",
      personaId: "p1",
    });
  });

  it("retryFromMessage aborts prior stream, clears overlays, and restarts HTTP stream", async () => {
    const actions = {
      sendMessage: vi.fn(),
      editAndResend: vi.fn(),
      retryFromMessage: vi.fn().mockResolvedValue({ assistantMessageId: "a2" }),
      deleteMessage: vi.fn(),
      stopGeneration: vi.fn(),
    };
    const modelOptions: ModelOptions = { model: "gpt", provider: "openai" };
    const getAuthToken = vi.fn(() => "t");
    const handlers = createServerChatHandlers(
      "conv-2",
      actions,
      modelOptions,
      getAuthToken
    );

    // Prime internal abort controller by sending once
    actions.sendMessage.mockResolvedValueOnce({
      userMessageId: "u1",
      assistantMessageId: "a1",
    });
    await handlers.sendMessage({ content: "x" });

    await handlers.retryFromMessage("msg-1");

    expect(globalThis.__testOverlays.set).toHaveBeenCalledWith("msg-1", "");
    expect(globalThis.__testOverlays.setReasoning).toHaveBeenCalledWith(
      "msg-1",
      ""
    );
    expect(globalThis.__testOverlays.setStatus).toHaveBeenCalledWith(
      "msg-1",
      "thinking"
    );
    expect(globalThis.__testOverlays.clearCitations).toHaveBeenCalledWith(
      "msg-1"
    );
    expect(globalThis.__testOverlays.clearTools).toHaveBeenCalledWith("msg-1");

    expect(vi.mocked(startAuthorStream)).toHaveBeenCalled();
    const args = vi.mocked(startAuthorStream).mock.calls.at(-1)?.[0];
    expect(args).toMatchObject({
      conversationId: "conv-2",
      assistantMessageId: "a2",
      personaId: "persona-1",
    });
  });

  it("retryFromMessage does not start HTTP stream for replicate provider", async () => {
    const actions = {
      sendMessage: vi.fn(),
      editAndResend: vi.fn(),
      retryFromMessage: vi
        .fn()
        .mockResolvedValue({ assistantMessageId: "img-assistant" }),
      deleteMessage: vi.fn(),
      stopGeneration: vi.fn(),
    };
    const modelOptions: ModelOptions = { model: "gpt", provider: "openai" };
    const handlers = createServerChatHandlers(
      "conv-img",
      actions,
      modelOptions,
      vi.fn(() => "token")
    );

    await handlers.retryFromMessage("img-user", {
      model: "artist/model",
      provider: "replicate",
    });

    expect(actions.retryFromMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-img",
        messageId: "img-user",
        model: "artist/model",
        provider: "replicate",
      })
    );
    expect(vi.mocked(startAuthorStream)).not.toHaveBeenCalled();
  });

  it("editMessage does not start HTTP stream for replicate provider", async () => {
    const actions = {
      sendMessage: vi.fn(),
      editAndResend: vi
        .fn()
        .mockResolvedValue({ assistantMessageId: "img-edit" }),
      retryFromMessage: vi.fn(),
      deleteMessage: vi.fn(),
      stopGeneration: vi.fn(),
    };
    const handlers = createServerChatHandlers(
      "conv-edit",
      actions,
      { model: "gpt", provider: "openai" },
      vi.fn(() => "token")
    );

    vi.mocked(startAuthorStream).mockClear();

    await handlers.editMessage("img-user", "updated prompt", {
      model: "artist/model",
      provider: "replicate",
    });

    expect(actions.editAndResend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "img-user",
        newContent: "updated prompt",
        model: "artist/model",
        provider: "replicate",
      })
    );
    expect(vi.mocked(startAuthorStream)).not.toHaveBeenCalled();
  });

  it("stopGeneration aborts HTTP stream and notifies server", async () => {
    const actions = {
      sendMessage: vi
        .fn()
        .mockResolvedValue({ userMessageId: "u1", assistantMessageId: "a1" }),
      editAndResend: vi.fn(),
      retryFromMessage: vi.fn(),
      deleteMessage: vi.fn(),
      stopGeneration: vi.fn(),
    };
    const handlers = createServerChatHandlers("conv-3", actions, {
      model: "gpt",
      provider: "openai",
    });
    await handlers.sendMessage({ content: "x" });
    handlers.stopGeneration();
    expect(actions.stopGeneration).toHaveBeenCalledWith({
      conversationId: "conv-3",
    });
  });
});

describe("chat-handlers (private)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessage appends user and assistant, then streams", async () => {
    let msgs: ChatMessage[] = [];
    const setMessages = (
      updater: ChatMessage[] | ((p: ChatMessage[]) => ChatMessage[])
    ) => {
      msgs =
        typeof updater === "function"
          ? (updater as (p: ChatMessage[]) => ChatMessage[])(msgs)
          : (updater as ChatMessage[]);
    };
    const config: PrivateChatConfig = {
      messages: msgs,
      setMessages,
      saveConversationAction: vi.fn(),
      getDecryptedApiKey: vi.fn().mockResolvedValue("sk-xxx"),
      modelCapabilities: { modelId: "gpt", provider: "openai" },
    };
    const handlers = createPrivateChatHandlers(config, {
      model: "gpt",
      provider: "openai",
      temperature: 0.2,
    });

    await handlers.sendMessage({ content: "hello" });

    // Two messages in state: user then assistant placeholder
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: "user", content: "hello" });
    expect(msgs[1]).toMatchObject({ role: "assistant", content: "" });
    expect(vi.mocked(streamChat)).toHaveBeenCalled();
    const args = vi.mocked(streamChat).mock.calls[0][0];
    expect(args.model).toEqual({ modelId: "gpt", provider: "openai" });
    expect(args.messages[0]).toMatchObject({ role: "user", content: "hello" });
  });

  it("retryFromMessage (assistant) clears content and restreams into same id", async () => {
    let msgs: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "q",
        isMainBranch: true,
        createdAt: Date.now(),
      },
      {
        id: "a1",
        role: "assistant",
        content: "old",
        isMainBranch: true,
        createdAt: Date.now(),
      },
    ];
    const setMessages = (
      updater: ChatMessage[] | ((p: ChatMessage[]) => ChatMessage[])
    ) => {
      msgs =
        typeof updater === "function"
          ? (updater as (p: ChatMessage[]) => ChatMessage[])(msgs)
          : (updater as ChatMessage[]);
    };
    const config: PrivateChatConfig = {
      messages: msgs,
      setMessages,
      saveConversationAction: vi.fn(),
      getDecryptedApiKey: vi.fn().mockResolvedValue("sk-xxx"),
      modelCapabilities: { modelId: "gpt", provider: "openai" },
    };
    const handlers = createPrivateChatHandlers(config, {
      model: "gpt",
      provider: "openai",
    });

    await handlers.retryFromMessage("a1");

    // After clearing, state should keep user + cleared assistant
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ id: "a1", content: "" });
    // Stream called with context up to user message only
    const call = vi.mocked(streamChat).mock.calls.at(-1)?.[0];
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0]).toMatchObject({ role: "user", content: "q" });
  });
});
