import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  createZenModeStore,
  getZenModeStore,
  resetZenModeStoreApi,
  setZenModeStoreApi,
  type ZenModeState,
} from "./zen-mode-store";

const originalConsoleError = console.error;

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  setZenModeStoreApi(createZenModeStore());
  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
  resetZenModeStoreApi();
});

afterAll(() => {
  console.error = originalConsoleError;
  resetZenModeStoreApi();
});

function getState() {
  return getZenModeStore().getState() as ZenModeState;
}

describe("zen-mode-store", () => {
  test("open populates state and close resets everything", () => {
    const state = getState();
    expect(state.isOpen).toBe(false);

    state.open({
      conversationId: "conv-1",
      messageId: "msg-1",
      conversationTitle: "Test conversation",
    });

    const opened = getState();
    expect(opened.isOpen).toBe(true);
    expect(opened.conversationId).toBe("conv-1");
    expect(opened.activeMessageId).toBe("msg-1");
    expect(opened.conversationTitle).toBe("Test conversation");

    opened.close();

    const closed = getState();
    expect(closed.isOpen).toBe(false);
    expect(closed.conversationId).toBeNull();
    expect(closed.activeMessageId).toBeNull();
    expect(closed.conversationTitle).toBeNull();
  });

  test("setActive only updates when window is open and message differs", () => {
    const state = getState();

    state.setActive("msg-ignored");
    expect(getState().activeMessageId).toBeNull();

    state.open({
      conversationId: "conv-2",
      messageId: "msg-initial",
    });

    state.setActive("msg-initial");
    expect(getState().activeMessageId).toBe("msg-initial");

    state.setActive("msg-next");
    expect(getState().activeMessageId).toBe("msg-next");
  });
});
