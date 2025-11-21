import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// Mock the http-stream module BEFORE importing StreamingCoordinator
const mockStartAuthorStream = mock(() =>
  Promise.resolve({ abortController: new AbortController() })
);
mock.module("./http-stream", () => ({
  startAuthorStream: mockStartAuthorStream,
}));

// Import the module under test after mocking dependencies
const { StreamingCoordinator } = await import("./streaming-coordinator");

describe("StreamingCoordinator", () => {
  beforeEach(() => {
    StreamingCoordinator.stop();
  });

  test("is a singleton", () => {
    expect(StreamingCoordinator).toBeDefined();
  });

  test("starts with no active stream", () => {
    expect(StreamingCoordinator.isStreaming()).toBe(false);
    expect(StreamingCoordinator.getCurrentStreamId()).toBeNull();
  });

  test("start() initiates a stream", async () => {
    const params = {
      convexUrl: "https://example.convex.cloud",
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    };

    const result = await StreamingCoordinator.start(params);

    expect(result).toBe(true);
    expect(StreamingCoordinator.isStreaming()).toBe(true);
    expect(StreamingCoordinator.getCurrentStreamId()).toBe("msg-1");
    expect(mockStartAuthorStream).toHaveBeenCalledWith(params);
  });

  test("stop() aborts the current stream", async () => {
    // Ensure we have a stream running
    await StreamingCoordinator.start({
      convexUrl: "https://example.convex.cloud",
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    });

    expect(StreamingCoordinator.isStreaming()).toBe(true);

    StreamingCoordinator.stop();

    expect(StreamingCoordinator.isStreaming()).toBe(false);
    expect(StreamingCoordinator.getCurrentStreamId()).toBeNull();
  });

  test("start() stops existing stream before starting new one", async () => {
    // Start first stream
    await StreamingCoordinator.start({
      convexUrl: "https://example.convex.cloud",
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    });

    const stopSpy = spyOn(StreamingCoordinator, "stop");

    // Start second stream
    await StreamingCoordinator.start({
      convexUrl: "https://example.convex.cloud",
      conversationId: "conv-1",
      assistantMessageId: "msg-2",
    });

    expect(stopSpy).toHaveBeenCalled();
    expect(StreamingCoordinator.getCurrentStreamId()).toBe("msg-2");
  });
});
