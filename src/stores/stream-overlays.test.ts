import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { StreamOverlayState } from "./stream-overlays";
import {
  createStreamOverlaysStore,
  getStreamOverlaysStore,
  resetStreamOverlaysStoreApi,
  setStreamOverlaysStoreApi,
} from "./stream-overlays";

const originalConsoleError = console.error;

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  setStreamOverlaysStoreApi(createStreamOverlaysStore());
  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
  resetStreamOverlaysStoreApi();
});

afterAll(() => {
  console.error = originalConsoleError;
  resetStreamOverlaysStoreApi();
});

function getState() {
  return getStreamOverlaysStore().getState() as StreamOverlayState;
}

describe("stream-overlays-store", () => {
  test("content overlays append and clear per message", () => {
    const state = getState();

    state.set("msg-1", "Hello");
    state.append("msg-1", " world");

    expect(getState().overlays["msg-1"]).toBe("Hello world");

    state.clear("msg-1");
    expect(getState().overlays["msg-1"]).toBeUndefined();
  });

  test("reasoning overlays append independently", () => {
    const state = getState();

    state.setReasoning("msg-2", "Thinking...");
    state.appendReasoning("msg-2", "done");

    expect(getState().reasoning["msg-2"]).toBe("Thinking...done");

    state.clearReasoning("msg-2");
    expect(getState().reasoning["msg-2"]).toBeUndefined();
  });

  test("status setters update and clearing removes keys", () => {
    const state = getState();

    state.setStatus("msg-3", "loading");
    expect(getState().status["msg-3"]).toBe("loading");

    state.clearStatus("msg-3");
    expect(getState().status["msg-3"]).toBeUndefined();
  });

  test("pushToolEvent accumulates events and clearTools resets", () => {
    const state = getState();

    state.pushToolEvent("msg-4", { t: "tool_call", name: "search" });
    state.pushToolEvent("msg-4", {
      t: "tool_result",
      name: "search",
      ok: true,
    });

    expect(getState().tools["msg-4"]).toEqual([
      { t: "tool_call", name: "search" },
      { t: "tool_result", name: "search", ok: true },
    ]);

    state.clearTools("msg-4");
    expect(getState().tools["msg-4"]).toBeUndefined();
  });

  test("citations setters store arrays and clear removes entry", () => {
    const state = getState();

    const citations = [{ url: "https://example.com", title: "Example" }];
    state.setCitations("msg-5", citations);

    expect(getState().citations["msg-5"]).toEqual(citations);

    state.clearCitations("msg-5");
    expect(getState().citations["msg-5"]).toBeUndefined();
  });
});
