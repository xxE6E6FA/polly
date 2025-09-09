import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushAll,
  mockFetchNDJSON,
  mockGlobalFetchOnce,
  withFakeTimers,
} from "../../test/utils";
import { startAuthorStream } from "./http-stream";

type TestOverlays = {
  append: ReturnType<typeof vi.fn>;
  appendReasoning: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  clearReasoning: ReturnType<typeof vi.fn>;
  clearStatus: ReturnType<typeof vi.fn>;
  clearCitations: ReturnType<typeof vi.fn>;
  clearTools: ReturnType<typeof vi.fn>;
  setCitations: ReturnType<typeof vi.fn>;
  pushToolEvent: ReturnType<typeof vi.fn>;
};

declare global {
  // eslint-disable-next-line no-var
  var __testOverlays: TestOverlays;
}

vi.mock("@/stores/stream-overlays", async () => {
  const { createOverlaysMock } = await import("../../test/utils");
  const mock = createOverlaysMock();
  // Store overlays reference for tests
  globalThis.__testOverlays = mock.overlays as unknown as TestOverlays;
  return mock.factory();
});

describe("http-stream.startAuthorStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null on non-ok response (429)", async () => {
    const { restore } = mockGlobalFetchOnce({
      ok: false,
      status: 429,
      headers: { get: () => "text/plain" },
      text: async () => "rate limit",
    });

    const res = await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    expect(res).toBeNull();
    restore();
  });

  it("returns null on unexpected content-type", async () => {
    const { restore } = mockGlobalFetchOnce({
      ok: true,
      headers: { get: () => "text/plain" },
    });
    const res = await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    expect(res).toBeNull();
    restore();
  });

  it("returns handle when ok but body missing", async () => {
    const { restore } = mockGlobalFetchOnce({
      ok: true,
      headers: { get: () => "application/x-ndjson" },
      body: null,
    });
    const handle = await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    expect(handle).not.toBeNull();
    expect(handle?.abortController).toBeInstanceOf(AbortController);
    restore();
  });

  it("streams NDJSON events and updates overlays", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "content", d: "hi" },
      { t: "reasoning", d: "think" },
      { t: "status", status: "searching" },
    ]);

    const handle = await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    expect(handle).not.toBeNull();

    // allow the async reader loop to process
    await flushAll();

    expect(globalThis.__testOverlays.append).toHaveBeenCalledWith("m1", "hi");
    expect(globalThis.__testOverlays.appendReasoning).toHaveBeenCalledWith(
      "m1",
      "think"
    );
    expect(globalThis.__testOverlays.setStatus).toHaveBeenCalledWith(
      "m1",
      "searching"
    );

    restore();
  });

  it("clears overlays on end without finish event", async () => {
    const { restore } = mockFetchNDJSON([{ t: "content", d: "x" }]);

    await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });

    await flushAll();

    expect(globalThis.__testOverlays.clear).toHaveBeenCalledWith("m1");
    expect(globalThis.__testOverlays.clearReasoning).toHaveBeenCalledWith("m1");
    expect(globalThis.__testOverlays.clearStatus).toHaveBeenCalledWith("m1");
    expect(globalThis.__testOverlays.clearCitations).toHaveBeenCalledWith("m1");
    expect(globalThis.__testOverlays.clearTools).toHaveBeenCalledWith("m1");

    restore();
  });

  it("schedules clearing after finish event", async () => {
    await withFakeTimers(async () => {
      const { restore } = mockFetchNDJSON([{ t: "finish" }]);
      await startAuthorStream({
        convexUrl: "https://convex",
        conversationId: "c1",
        assistantMessageId: "m1",
      });
      await flushAll({ microtasks: 1, timersMs: 300 });
      expect(globalThis.__testOverlays.clear).toHaveBeenCalledWith("m1");
      expect(globalThis.__testOverlays.clearReasoning).toHaveBeenCalledWith(
        "m1"
      );
      expect(globalThis.__testOverlays.clearStatus).toHaveBeenCalledWith("m1");
      expect(globalThis.__testOverlays.clearCitations).toHaveBeenCalledWith(
        "m1"
      );
      expect(globalThis.__testOverlays.clearTools).toHaveBeenCalledWith("m1");
      restore();
    });
  });

  it("handles tool_call events", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "tool_call", name: "calc", args: { x: 1 } },
    ]);

    await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    await flushAll();
    expect(globalThis.__testOverlays.pushToolEvent).toHaveBeenCalledWith("m1", {
      t: "tool_call",
      name: "calc",
      args: { x: 1 },
    });
    restore();
  });

  it("handles tool_result events", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "tool_result", name: "calc", ok: true, count: 1 },
    ]);

    await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    await flushAll();
    expect(globalThis.__testOverlays.pushToolEvent).toHaveBeenCalledWith("m1", {
      t: "tool_result",
      name: "calc",
      ok: true,
      count: 1,
    });
    restore();
  });

  it("handles citations events", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "citations", citations: [{ url: "u", title: "t" }] },
    ]);

    await startAuthorStream({
      convexUrl: "https://convex",
      conversationId: "c1",
      assistantMessageId: "m1",
    });
    await flushAll();
    expect(globalThis.__testOverlays.setCitations).toHaveBeenCalledWith("m1", [
      { url: "u", title: "t" },
    ]);

    restore();
  });
});
