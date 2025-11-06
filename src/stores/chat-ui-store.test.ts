import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { type ChatUIState, createChatUIStore } from "./chat-ui-store";

const originalConsoleError = console.error;
const originalDateNow = Date.now;
const originalMathRandom = Math.random;

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  let current = 1_000;
  Date.now = (() => {
    current += 1;
    return current;
  }) as typeof Date.now;
  let seq = 0;
  Math.random = (() => {
    seq += 1;
    return (seq % 100) / 100;
  }) as typeof Math.random;

  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
  Date.now = originalDateNow;
  Math.random = originalMathRandom;
});

afterAll(() => {
  console.error = originalConsoleError;
  Date.now = originalDateNow;
  Math.random = originalMathRandom;
});

function getState(store: ReturnType<typeof createChatUIStore>) {
  return store.getState() as ChatUIState;
}

describe("chat-ui-store", () => {
  test("setters update flags and clearOnSend resets fullscreen + multiline", () => {
    const store = createChatUIStore();
    const state = getState(store);

    state.setFullscreen(true);
    state.setMultiline(true);
    state.setTransitioning(true);

    expect(getState(store).isFullscreen).toBe(true);
    expect(getState(store).isMultiline).toBe(true);
    expect(getState(store).isTransitioning).toBe(true);

    state.clearOnSend();

    expect(getState(store).isFullscreen).toBe(false);
    expect(getState(store).isMultiline).toBe(false);
    expect(getState(store).isTransitioning).toBe(true);
  });

  test("pushHistory trims to last 50 entries and deduplicates adjacent items", () => {
    const store = createChatUIStore();
    const state = getState(store);

    state.pushHistory("conv-1", "first");
    state.pushHistory("conv-1", "first");
    state.pushHistory("conv-1", "second");

    const firstHistory = getState(store).historyByConversation["conv-1"];
    expect(firstHistory?.map(entry => entry.input)).toEqual([
      "first",
      "second",
    ]);

    for (let i = 0; i < 60; i++) {
      state.pushHistory("conv-1", `message-${i}`);
    }

    const cappedHistory = getState(store).historyByConversation["conv-1"];
    expect(cappedHistory).toHaveLength(50);
    expect(cappedHistory?.[0]?.input).toBe("message-10");
    expect(cappedHistory?.[49]?.input).toBe("message-59");

    expect(getState(store).historyIndexByConversation["conv-1"]).toBeNull();
  });

  test("navigateHistory walks entries, respects bounds, and resets/clears indices", () => {
    const store = createChatUIStore();
    const state = getState(store);

    expect(state.navigateHistory("conv-2", "prev")).toBeNull();

    state.pushHistory("conv-2", "alpha");
    state.pushHistory("conv-2", "beta");
    state.pushHistory("conv-2", "gamma");

    expect(state.navigateHistory("conv-2", "prev")).toBe("gamma");
    expect(state.navigateHistory("conv-2", "prev")).toBe("beta");
    expect(state.navigateHistory("conv-2", "prev")).toBe("alpha");
    expect(state.navigateHistory("conv-2", "prev")).toBe("alpha");
    expect(getState(store).historyIndexByConversation["conv-2"]).toBe(0);

    expect(state.navigateHistory("conv-2", "next")).toBe("beta");
    expect(state.navigateHistory("conv-2", "next")).toBe("gamma");
    expect(state.navigateHistory("conv-2", "next")).toBe("gamma");

    state.resetHistoryIndex("conv-2");
    expect(getState(store).historyIndexByConversation["conv-2"]).toBeNull();

    state.clearHistory("conv-2");
    expect(getState(store).historyByConversation["conv-2"]).toBeUndefined();
    expect(
      getState(store).historyIndexByConversation["conv-2"]
    ).toBeUndefined();
  });
});
