import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { ChatStreamRequest } from "@/types";

const createBasicLanguageModelMock = mock(() => ({ kind: "mock-lm" }));
const getProviderReasoningConfigMock = mock(() => ({
  providerOptions: { x: 1 },
}));
const streamTextMock = mock();
const smoothStreamMock = mock();

mock.module("@shared/ai-provider-factory", () => ({
  createBasicLanguageModel: createBasicLanguageModelMock,
}));

mock.module("@shared/reasoning-config", () => ({
  getProviderReasoningConfig: getProviderReasoningConfigMock,
}));

mock.module("ai", () => ({
  streamText: streamTextMock,
  smoothStream: smoothStreamMock,
}));

let streamChat: typeof import("./browser-streaming").streamChat;

beforeAll(async () => {
  mock.restore();
  const mod = (await import("./browser-streaming?bun-real")) as any;
  streamChat = mod.streamChat;
});

beforeEach(() => {
  createBasicLanguageModelMock.mockReset();
  createBasicLanguageModelMock.mockImplementation(() => ({ kind: "mock-lm" }));
  getProviderReasoningConfigMock.mockReset();
  getProviderReasoningConfigMock.mockImplementation(() => ({
    providerOptions: { x: 1 },
  }));
  smoothStreamMock.mockReset();
  streamTextMock.mockReset();
  streamTextMock.mockImplementation((options: any): any => {
    options.onChunk?.({
      chunk: { type: "reasoning-delta", text: "think" },
    });

    async function* gen() {
      yield await Promise.resolve("chunk1");
      if (options.abortSignal?.aborted) {
        return;
      }
      yield await Promise.resolve("chunk2");
    }

    return {
      textStream: gen(),
      warnings: [],
      usage: {},
      sources: [],
      files: [],
      finishReason: "stop",
      // biome-ignore lint/style/useNamingConvention: external API field uses snake case
      experimental_providerMetadata: {},
    };
  });
});

afterAll(() => {
  mock.restore();
});

describe("browser-streaming.streamChat", () => {
  test("converts attachments, streams content, and surfaces reasoning deltas", async () => {
    const callbacks = {
      onContent: mock(),
      onFinish: mock(),
      onError: mock(),
      onReasoning: mock(),
    };

    const req: ChatStreamRequest = {
      model: { modelId: "gpt", provider: "openai", supportsReasoning: true },
      apiKeys: { openai: "sk-xxx" },
      messages: [
        {
          role: "user",
          content: "Hello",
          attachments: [
            {
              type: "image",
              name: "img.png",
              content: "AAA",
              mimeType: "image/png",
              url: "blob:img",
              size: 1024,
            },
            {
              type: "text",
              name: "note.txt",
              content: "textbody",
              url: "blob:txt",
              size: 8,
            },
            {
              type: "pdf",
              name: "doc.pdf",
              extractedText: "pdf text",
              url: "blob:pdf",
              size: 2048,
            },
          ],
        },
      ],
      options: { temperature: 0.5, maxTokens: 42 },
      callbacks,
    };

    await streamChat(req);

    // Streamed chunks captured
    expect(callbacks.onContent).toHaveBeenCalledWith("chunk1");
    expect(callbacks.onContent).toHaveBeenCalledWith("chunk2");
    expect(callbacks.onReasoning).toHaveBeenCalledWith("think");
    expect(callbacks.onFinish).toHaveBeenCalledWith("stop");

    // Ensure conversion passed to streamText
    const call = streamTextMock.mock.calls.at(-1)?.[0];
    expect(call).toBeDefined();
    expect(call?.messages).toHaveLength(1);
    const m = call?.messages?.[0];
    expect(m).toBeDefined();
    expect(m?.role).toBe("user");
    expect(Array.isArray(m?.content)).toBe(true);
    expect(m?.content[0]).toEqual({ type: "text", text: "Hello" });
    expect(m?.content[1]).toEqual({
      type: "image",
      image: "data:image/png;base64,AAA",
    });
    expect(m?.content[2]).toEqual({ type: "text", text: "textbody" });
    expect(m?.content[3]).toEqual({ type: "text", text: "pdf text" });
  });

  test("throws if API key missing for provider", async () => {
    const req: ChatStreamRequest = {
      model: { modelId: "gpt", provider: "openai" },
      apiKeys: {},
      messages: [{ role: "user", content: "hi" }],
      callbacks: {
        onContent: mock(),
        onFinish: mock(),
        onError: mock(),
      },
    };

    await expect(streamChat(req)).rejects.toThrow(/No API key/);
  });

  test("respects abort signal and stops early", async () => {
    const callbacks = {
      onContent: mock(),
      onFinish: mock(),
      onError: mock(),
    };
    const controller = new AbortController();

    // Override streamText for this test to abort after first yield
    streamTextMock.mockImplementationOnce((options: any): any => {
      options.onChunk?.({ chunk: { type: "text", textDelta: "x" } });
      const ctrl = controller;
      async function* gen() {
        yield await Promise.resolve("chunk1");
        ctrl.abort();
        if (options.abortSignal?.aborted) {
          return;
        }
        yield await Promise.resolve("chunk2");
      }
      return { textStream: gen() };
    });

    const req: ChatStreamRequest = {
      model: { modelId: "gpt", provider: "openai" },
      apiKeys: { openai: "sk-xxx" },
      messages: [{ role: "user", content: "hi" }],
      callbacks,
      options: {},
    };

    await streamChat(req, controller);

    // Only the first chunk expected due to abort
    expect(callbacks.onContent).toHaveBeenCalledWith("chunk1");
    // chunk2 should not be delivered
    expect(callbacks.onContent).not.toHaveBeenCalledWith("chunk2");
    expect(callbacks.onFinish).toHaveBeenCalledWith("stop");
  });
});
