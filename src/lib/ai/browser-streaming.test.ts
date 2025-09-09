import { streamText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatStreamRequest } from "@/types";
import { streamChat } from "./browser-streaming";

vi.mock("@shared/ai-provider-factory", () => ({
  createBasicLanguageModel: vi.fn(() => ({ kind: "mock-lm" })),
}));

vi.mock("@shared/reasoning-config", () => ({
  getProviderReasoningConfig: vi.fn(() => ({ providerOptions: { x: 1 } })),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
  smoothStream: vi.fn(),
}));

describe("browser-streaming.streamChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behavior for streamText
    type MockStreamOptions = {
      abortSignal?: AbortSignal;
      onChunk?: (arg: { chunk: { type?: string; textDelta?: string } }) => void;
    };

    vi.mocked(streamText).mockImplementation((options: MockStreamOptions) => {
      // Trigger reasoning chunk if handler provided
      options.onChunk?.({ chunk: { type: "reasoning", textDelta: "think" } });

      async function* gen() {
        // ensure at least one await for async generator lint rule
        // eslint-disable-next-line no-await-in-loop
        yield await Promise.resolve("chunk1");
        // cooperatively break if aborted
        if (options.abortSignal?.aborted) {
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        yield await Promise.resolve("chunk2");
      }
      return {
        textStream: gen(),
        warnings: [],
        usage: {},
        sources: [],
        files: [],
        finishReason: "stop",
        // biome-ignore lint/style/useNamingConvention: matches external shape
        experimental_providerMetadata: {},
      };
    });
  });

  it("converts attachments, streams content, and surfaces reasoning deltas", async () => {
    const callbacks = {
      onContent: vi.fn(),
      onFinish: vi.fn(),
      onError: vi.fn(),
      onReasoning: vi.fn(),
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
            },
            { type: "text", name: "note.txt", content: "textbody" },
            { type: "pdf", name: "doc.pdf", extractedText: "pdf text" },
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
    const call = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(call.messages).toHaveLength(1);
    const m = call.messages?.[0];
    expect(m.role).toBe("user");
    expect(Array.isArray(m.content)).toBe(true);
    expect(m.content[0]).toBe("Hello");
    expect(m.content[1]).toEqual({
      type: "image",
      data: "data:image/png;base64,AAA",
    });
    expect(m.content[2]).toEqual({ type: "text", text: "textbody" });
    expect(m.content[3]).toEqual({ type: "text", text: "pdf text" });
  });

  it("throws if API key missing for provider", async () => {
    const req: ChatStreamRequest = {
      model: { modelId: "gpt", provider: "openai" },
      apiKeys: {},
      messages: [{ role: "user", content: "hi" }],
      callbacks: {
        onContent: vi.fn(),
        onFinish: vi.fn(),
        onError: vi.fn(),
      },
    };

    await expect(streamChat(req)).rejects.toThrow(/No API key/);
  });

  it("respects abort signal and stops early", async () => {
    const callbacks = {
      onContent: vi.fn(),
      onFinish: vi.fn(),
      onError: vi.fn(),
    };
    const controller = new AbortController();

    // Override streamText for this test to abort after first yield
    vi.mocked(streamText).mockImplementationOnce(
      (options: MockStreamOptions) => {
        options.onChunk?.({ chunk: { type: "text", textDelta: "x" } });
        const ctrl = controller;
        async function* gen() {
          // eslint-disable-next-line no-await-in-loop
          yield await Promise.resolve("chunk1");
          ctrl.abort();
          if (options.abortSignal?.aborted) {
            return;
          }
          // eslint-disable-next-line no-await-in-loop
          yield await Promise.resolve("chunk2");
        }
        return { textStream: gen() };
      }
    );

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
