import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  createOverlaysMock,
  flushAll,
  mockFetchNDJSON,
  mockGlobalFetchOnce,
  withFakeTimers,
} from "../../test/utils";

let startAuthorStream: typeof import("./http-stream").startAuthorStream;

type OverlayMocks = ReturnType<typeof createOverlaysMock>["overlays"];

const overlaysMock = createOverlaysMock();
const overlays = overlaysMock.overlays as OverlayMocks;
mock.module("@/stores/stream-overlays", overlaysMock.factory);

const defaultArgs = {
  convexUrl: "https://convex",
  conversationId: "c1",
  assistantMessageId: "m1",
} as const;

function startStream(
  overrides: Partial<Parameters<typeof startAuthorStream>[0]> = {}
) {
  return startAuthorStream({ ...defaultArgs, ...overrides });
}

beforeAll(async () => {
  mock.restore();
  const mod = (await import(
    "./http-stream?bun-real"
  )) as typeof import("./http-stream");
  startAuthorStream = mod.startAuthorStream;
});

beforeEach(() => {
  for (const fn of Object.values(overlays)) {
    fn.mockClear();
  }
});

afterAll(() => {
  mock.restore();
});

describe("http-stream.startAuthorStream", () => {
  test("returns null on non-ok response (429)", async () => {
    const { restore } = mockGlobalFetchOnce({
      ok: false,
      status: 429,
      headers: { "content-type": "text/plain" },
      text: async () => "rate limit",
    });

    const res = await startStream();
    expect(res ?? null).toBeNull();
    restore();
  });

  test("returns null on unexpected content-type", async () => {
    const { restore } = mockGlobalFetchOnce({
      ok: true,
      headers: { "content-type": "text/plain" },
    });
    const res = await startStream();
    expect(res ?? null).toBeNull();
    restore();
  });

  test("returns handle when ok but body missing", async () => {
    const { restore } = mockGlobalFetchOnce({
      ok: true,
      headers: { "content-type": "application/x-ndjson" },
      body: null,
    });
    const handle = await startStream();
    expect(handle).not.toBeNull();
    expect(handle?.abortController).toBeDefined();
    restore();
  });

  test("streams NDJSON events and updates overlays", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "content", d: "hi" },
      { t: "reasoning", d: "think" },
      { t: "status", status: "searching" },
    ]);

    const handle = await startStream();
    expect(handle).not.toBeNull();

    // allow the async reader loop to process
    await flushAll();

    expect(overlays.append).toHaveBeenCalledWith("m1", "hi");
    expect(overlays.appendReasoning).toHaveBeenCalledWith("m1", "think");
    expect(overlays.setStatus).toHaveBeenCalledWith("m1", "searching");

    restore();
  });

  test("clears overlays on end without finish event", async () => {
    const { restore } = mockFetchNDJSON([{ t: "content", d: "x" }]);

    await startStream();

    await flushAll();

    expect(overlays.clear).toHaveBeenCalledWith("m1");
    expect(overlays.clearReasoning).toHaveBeenCalledWith("m1");
    expect(overlays.clearStatus).toHaveBeenCalledWith("m1");
    expect(overlays.clearCitations).toHaveBeenCalledWith("m1");
    expect(overlays.clearTools).toHaveBeenCalledWith("m1");

    restore();
  });

  test("schedules clearing after finish event", async () => {
    await withFakeTimers(async () => {
      const { restore } = mockFetchNDJSON([{ t: "finish" }]);
      await startStream();
      await flushAll({ microtasks: 1, timersMs: 300 });
      expect(overlays.clear).toHaveBeenCalledWith("m1");
      expect(overlays.clearReasoning).toHaveBeenCalledWith("m1");
      expect(overlays.clearStatus).toHaveBeenCalledWith("m1");
      expect(overlays.clearCitations).toHaveBeenCalledWith("m1");
      expect(overlays.clearTools).toHaveBeenCalledWith("m1");
      restore();
    });
  });

  test("invokes onFinish callback when finish arrives", async () => {
    const { restore } = mockFetchNDJSON([{ t: "finish", reason: "stop" }]);
    const onFinish = mock();
    await startStream({ onFinish });
    await flushAll();
    expect(onFinish).toHaveBeenCalledWith("stop");
    restore();
  });

  test("handles tool_call events", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "tool_call", name: "calc", args: { x: 1 } },
    ]);

    await startStream();
    await flushAll();
    expect(overlays.pushToolEvent).toHaveBeenCalledWith("m1", {
      t: "tool_call",
      name: "calc",
      args: { x: 1 },
    });
    restore();
  });

  test("handles tool_result events", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "tool_result", name: "calc", ok: true, count: 1 },
    ]);

    await startStream();
    await flushAll();
    expect(overlays.pushToolEvent).toHaveBeenCalledWith("m1", {
      t: "tool_result",
      name: "calc",
      ok: true,
      count: 1,
    });
    restore();
  });

  test("handles citations events", async () => {
    const { restore } = mockFetchNDJSON([
      { t: "citations", citations: [{ url: "u", title: "t" }] },
    ]);

    await startStream();
    await flushAll();
    expect(overlays.setCitations).toHaveBeenCalledWith("m1", [
      { url: "u", title: "t" },
    ]);

    restore();
  });
});
