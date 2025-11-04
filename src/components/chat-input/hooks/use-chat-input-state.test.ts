import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as chatAttachmentsModule from "@/hooks/use-chat-attachments";
import * as chatInputPreservationModule from "@/hooks/use-chat-input-preservation";
import * as chatUIStoreModule from "@/stores/chat-ui-store";
import { useChatInputState } from "./use-chat-input-state";

const useChatHistoryMock = mock();
const useChatAttachmentsMock = mock();
const useChatInputPreservationMock = mock();

let useChatHistorySpy: ReturnType<typeof spyOn>;
let useChatAttachmentsSpy: ReturnType<typeof spyOn>;
let useChatInputPreservationSpy: ReturnType<typeof spyOn>;
let consoleErrorSpy: ReturnType<typeof spyOn>;

describe("useChatInputState", () => {
  beforeEach(() => {
    useChatHistoryMock.mockReset();
    useChatAttachmentsMock.mockReset();
    useChatAttachmentsMock.mockReturnValue({
      attachments: [],
      setAttachments: mock(),
    });
    useChatInputPreservationMock.mockReset();
    useChatInputPreservationMock.mockReturnValue({
      setChatInputState: mock(),
      getChatInputState: mock().mockReturnValue({ input: "" }),
      clearChatInputState: mock(),
    });

    useChatHistorySpy = spyOn(
      chatUIStoreModule,
      "useChatHistory"
    ).mockImplementation(useChatHistoryMock);
    useChatAttachmentsSpy = spyOn(
      chatAttachmentsModule,
      "useChatAttachments"
    ).mockImplementation(useChatAttachmentsMock);
    useChatInputPreservationSpy = spyOn(
      chatInputPreservationModule,
      "useChatInputPreservation"
    ).mockImplementation(useChatInputPreservationMock);

    // Suppress React act() warnings for this test suite
    const originalError = console.error;
    consoleErrorSpy = spyOn(console, "error").mockImplementation(
      (message, ...args) => {
        if (typeof message === "string" && message.includes("act(")) {
          return;
        }
        originalError(message, ...args);
      }
    );
  });

  afterEach(() => {
    useChatHistorySpy.mockRestore();
    useChatAttachmentsSpy.mockRestore();
    useChatInputPreservationSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
  test("integrates history handlers and reset helpers", async () => {
    const prev = mock().mockReturnValue("prev text");
    const next = mock().mockReturnValue(null);
    const resetIndex = mock();
    useChatHistoryMock.mockReturnValue({
      prev,
      next,
      resetIndex,
      push: mock(),
      clear: mock(),
    });

    let result: any;

    await act(async () => {
      const hookResult = renderHook(
        ({ cid }) =>
          useChatInputState({
            conversationId: cid,
            hasExistingMessages: false,
          }),
        { initialProps: { cid: undefined as Id<"conversations"> | undefined } }
      );
      result = hookResult.result;

      // Wait for any initial state updates to complete
      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });

    // History navigation hooks
    const upHandled = result.current.handleHistoryNavigation();
    expect(upHandled).toBe(true);
    const downHandled = result.current.handleHistoryNavigationDown();
    expect(downHandled).toBe(false);

    // Input change delegates
    act(() => {
      result.current.handleInputChange("hello");
    });

    // Reset input state calls resetIndex
    act(() => {
      result.current.resetInputState();
    });
    expect(resetIndex).toHaveBeenCalled();
  });
});
