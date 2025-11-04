import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatMessage } from "@/types";
import { createOverlaysMock, mockModuleWithRestore } from "../../test/utils";
import type { ModelOptions, PrivateChatConfig } from "./chat-handlers";

const createMock = mock;

let createServerChatHandlers: typeof import("./chat-handlers").createServerChatHandlers;
let createPrivateChatHandlers: typeof import("./chat-handlers").createPrivateChatHandlers;

const overlaysModule = createOverlaysMock();
const overlays = overlaysModule.overlays;
let startAuthorStreamMock: ReturnType<typeof mock>;
let streamChatMock: ReturnType<typeof mock>;
let getChatKeyMock: ReturnType<typeof mock>;
let getSelectedPersonaIdFromStoreMock: ReturnType<typeof mock>;

await mockModuleWithRestore("@/lib/utils", actual => ({
  ...actual,
  cleanAttachmentsForConvex: <T>(a: T) => a,
}));

await mockModuleWithRestore("@/stores/stream-overlays", () =>
  overlaysModule.factory()
);

await mockModuleWithRestore("@/stores/chat-input-store", actual => ({
  ...actual,
  getChatKey: (...args: unknown[]) => getChatKeyMock(...args),
  getSelectedPersonaIdFromStore: (...args: unknown[]) =>
    getSelectedPersonaIdFromStoreMock(...args),
}));

await mockModuleWithRestore(
  "./http-stream",
  actual => ({
    ...actual,
    startAuthorStream: (...args: unknown[]) => startAuthorStreamMock(...args),
  }),
  { from: import.meta.url }
);

await mockModuleWithRestore(
  "./browser-streaming",
  actual => ({
    ...actual,
    streamChat: (...args: unknown[]) => streamChatMock(...args),
  }),
  { from: import.meta.url }
);

const originalEnv = (import.meta as { env?: unknown }).env;
const baseEnv: Record<string, unknown> =
  typeof originalEnv === "object" && originalEnv !== null
    ? { ...(originalEnv as Record<string, unknown>) }
    : {};
baseEnv.VITE_CONVEX_URL = "https://convex";

beforeAll(async () => {
  startAuthorStreamMock = mock(async () => ({
    abortController: new AbortController(),
  }));
  streamChatMock = mock(() => Promise.resolve());
  getChatKeyMock = mock(() => "ckey");
  getSelectedPersonaIdFromStoreMock = mock(() => "persona-1");

  Object.defineProperty(import.meta, "env", {
    value: baseEnv,
    configurable: true,
  });

  await Promise.resolve();
  await Promise.resolve();
  const mod = await import("./chat-handlers?bun-real");
  if (!(mod.createServerChatHandlers && mod.createPrivateChatHandlers)) {
    throw new Error(
      `Failed to import chat-handlers: createServerChatHandlers=${typeof mod.createServerChatHandlers}, createPrivateChatHandlers=${typeof mod.createPrivateChatHandlers}, module keys=${Object.keys(mod).join(", ")}`
    );
  }
  createServerChatHandlers = mod.createServerChatHandlers;
  createPrivateChatHandlers = mod.createPrivateChatHandlers;
});

beforeEach(() => {
  startAuthorStreamMock.mockClear();
  streamChatMock.mockClear();
  getChatKeyMock.mockClear();
  getSelectedPersonaIdFromStoreMock.mockClear();
  for (const fn of Object.values(overlays)) {
    fn.mockClear();
  }
});

describe("chat-handlers (server)", () => {
  test("sendMessage builds payload and starts HTTP stream", async () => {
    const actions = {
      sendMessage: mock().mockResolvedValue({
        userMessageId: "u1",
        assistantMessageId: "a1",
      }),
      editAndResend: createMock(),
      retryFromMessage: createMock(),
      deleteMessage: createMock(),
      stopGeneration: createMock(),
    };
    const modelOptions: ModelOptions = {
      model: "gpt",
      provider: "openai",
      temperature: 0.3,
    };

    const getAuthToken = createMock(() => "token");
    const handlers = createServerChatHandlers(
      "conv-1" as Id<"conversations">,
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

    expect(startAuthorStreamMock).toHaveBeenCalled();
    const args = startAuthorStreamMock.mock.calls[0][0];
    expect(args).toMatchObject({
      conversationId: "conv-1",
      assistantMessageId: "a1",
      modelId: "gpt",
      provider: "openai",
      personaId: "p1",
    });
  });

  test("retryFromMessage aborts prior stream, clears overlays, and restarts HTTP stream", async () => {
    const actions = {
      sendMessage: createMock(),
      editAndResend: createMock(),
      retryFromMessage: createMock().mockResolvedValue({
        assistantMessageId: "a2",
      }),
      deleteMessage: createMock(),
      stopGeneration: createMock(),
    };
    const modelOptions: ModelOptions = { model: "gpt", provider: "openai" };
    const getAuthToken = createMock(() => "t");
    const handlers = createServerChatHandlers(
      "conv-2" as Id<"conversations">,
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

    expect(overlays.set).toHaveBeenCalledWith("msg-1", "");
    expect(overlays.setReasoning).toHaveBeenCalledWith("msg-1", "");
    expect(overlays.setStatus).toHaveBeenCalledWith("msg-1", "thinking");
    expect(overlays.clearCitations).toHaveBeenCalledWith("msg-1");
    expect(overlays.clearTools).toHaveBeenCalledWith("msg-1");

    expect(startAuthorStreamMock).toHaveBeenCalled();
    const args = startAuthorStreamMock.mock.calls.at(-1)?.[0];
    expect(args).toMatchObject({
      conversationId: "conv-2",
      assistantMessageId: "a2",
      personaId: "persona-1",
    });
  });

  test("retryFromMessage does not start HTTP stream for replicate provider", async () => {
    const actions = {
      sendMessage: createMock(),
      editAndResend: mock(),
      retryFromMessage: mock().mockResolvedValue({
        assistantMessageId: "img-assistant",
      }),
      deleteMessage: mock(),
      stopGeneration: mock(),
    };
    const modelOptions: ModelOptions = { model: "gpt", provider: "openai" };
    const handlers = createServerChatHandlers(
      "conv-img" as Id<"conversations">,
      actions,
      modelOptions,
      createMock(() => "token")
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
    expect(startAuthorStreamMock).not.toHaveBeenCalled();
  });

  test("editMessage does not start HTTP stream for replicate provider", async () => {
    const actions = {
      sendMessage: createMock(),
      editAndResend: mock().mockResolvedValue({
        assistantMessageId: "img-edit",
      }),
      retryFromMessage: mock(),
      deleteMessage: mock(),
      stopGeneration: mock(),
    };
    const handlers = createServerChatHandlers(
      "conv-edit" as Id<"conversations">,
      actions,
      { model: "gpt", provider: "openai" },
      createMock(() => "token")
    );

    startAuthorStreamMock.mockClear();

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
    expect(startAuthorStreamMock).not.toHaveBeenCalled();
  });

  test("stopGeneration aborts HTTP stream and notifies server", async () => {
    const actions = {
      sendMessage: mock().mockResolvedValue({
        userMessageId: "u1",
        assistantMessageId: "a1",
      }),
      editAndResend: createMock(),
      retryFromMessage: createMock(),
      deleteMessage: createMock(),
      stopGeneration: createMock(),
    };
    const handlers = createServerChatHandlers(
      "conv-3" as Id<"conversations">,
      actions,
      {
        model: "gpt",
        provider: "openai",
      }
    );
    await handlers.sendMessage({ content: "x" });
    handlers.stopGeneration();
    expect(actions.stopGeneration).toHaveBeenCalledWith({
      conversationId: "conv-3",
    });
  });
});

describe("chat-handlers (private)", () => {
  test("sendMessage appends user and assistant, then streams", async () => {
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
      saveConversationAction: createMock(),
      getDecryptedApiKey: createMock().mockResolvedValue("sk-xxx"),
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
    expect(streamChatMock).toHaveBeenCalled();
    const args = streamChatMock.mock.calls[0][0];
    expect(args.model).toEqual({ modelId: "gpt", provider: "openai" });
    expect(args.messages[0]).toMatchObject({ role: "user", content: "hello" });
  });

  test("retryFromMessage (assistant) clears content and restreams into same id", async () => {
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
      saveConversationAction: createMock(),
      getDecryptedApiKey: createMock().mockResolvedValue("sk-xxx"),
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
    const call = streamChatMock.mock.calls.at(-1)?.[0];
    expect(call).toBeDefined();
    expect(call?.messages).toHaveLength(1);
    expect(call?.messages[0]).toMatchObject({ role: "user", content: "q" });
  });
});

afterAll(() => {
  if (originalEnv === undefined) {
    (import.meta as { env?: unknown }).env = undefined;
  } else {
    Object.defineProperty(import.meta, "env", {
      value: originalEnv,
      configurable: true,
    });
  }
  mock.restore();
});
