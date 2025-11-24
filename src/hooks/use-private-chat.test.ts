import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePrivateChat } from "./use-private-chat";

// Mock dependencies
const mockGetApiKey = mock(async () => "test-api-key");
mock.module("@/lib/ai/private-api-keys", () => ({
  usePrivateApiKeys: () => ({
    getApiKey: mockGetApiKey,
  }),
}));

// Mock AI SDK
const mockStreamText = mock();
mock.module("ai", () => ({
  streamText: mockStreamText,
}));

import * as AIProviderFactory from "@shared/ai-provider-factory";

// Mock shared utils

mock.module("@shared/streaming-utils", () => ({
  createSmoothStreamTransform: mock(() => ({})),
}));

mock.module("@/lib/ai/private-message-utils", () => ({
  convertChatMessagesToCoreMessages: mock(() => []),
}));

describe("usePrivateChat", () => {
  beforeEach(() => {
    mockGetApiKey.mockClear();
    mockStreamText.mockClear();
    spyOn(AIProviderFactory, "createBasicLanguageModel").mockImplementation(
      () => ({}) as any
    );
  });

  test("stop() aborts the stream without crashing", async () => {
    // Create a stream we can control
    let controller: ReadableStreamDefaultController<any>;
    const stream = new ReadableStream({
      start(c) {
        controller = c;
      },
    });

    // Mock streamText to return our controlled stream
    mockStreamText.mockReturnValue({
      textStream: stream,
    });

    const { result } = renderHook(() =>
      usePrivateChat({
        modelId: "gpt-4",
        provider: "openai",
      })
    );

    // Start sending a message but don't await it yet
    let sendMessagePromise: Promise<void>;
    await act(() => {
      sendMessagePromise = result.current.sendMessage("Hello");
    });

    // Enqueue a chunk to get into the loop
    await act(() => {
      controller!.enqueue({ type: "text-delta", text: "Hi" });
    });

    expect(result.current.status).toBe("streaming");

    // Call stop
    act(() => {
      result.current.stop();
    });

    // Close the stream to allow the loop to exit if it hasn't already
    await act(() => {
      controller!.close();
    });

    // Now await the promise to ensure it resolves/rejects cleanly
    await act(async () => {
      await sendMessagePromise;
    });

    expect(result.current.status).toBe("idle");
  });
});
