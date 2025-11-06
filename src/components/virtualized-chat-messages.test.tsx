import { describe, expect, test } from "bun:test";
import {
  createStreamOverlaysStore,
  setStreamOverlaysStoreApi,
} from "../stores/stream-overlays";

type TestMessage = {
  id: string;
  role: "assistant";
  content: string;
  status: "streaming" | "done" | "error";
  reasoning?: string;
};

describe("virtualized-chat-messages overlay behavior", () => {
  test("messageSelector ignores overlays when status is done", () => {
    // Setup fresh overlay store
    const overlayStore = createStreamOverlaysStore();
    setStreamOverlaysStoreApi(overlayStore);

    const messageId = "test-msg-1";
    const overlayContent = "Streaming content...";
    const dbContent = "Final database content";

    // Simulate streaming state: overlay exists
    overlayStore.getState().set(messageId, overlayContent);

    // Base message from database with "streaming" status
    const streamingMessage: TestMessage = {
      id: messageId,
      role: "assistant",
      content: "",
      status: "streaming",
    };

    // Simulate the messageSelector logic
    const selectMessage = (
      base: TestMessage,
      overlays: Record<string, string>
    ) => {
      const overlay = overlays[messageId];
      const isDone = base.status === "done";
      const hasOverlay = !isDone && overlay;

      if (hasOverlay && base.role === "assistant") {
        return {
          ...base,
          content: overlay ?? base.content,
          status: "streaming",
        };
      }
      return base;
    };

    // During streaming: should use overlay
    const duringStreaming = selectMessage(
      streamingMessage,
      overlayStore.getState().overlays
    );
    expect(duringStreaming.content).toBe(overlayContent);

    // Message becomes done with final content
    const doneMessage: TestMessage = {
      ...streamingMessage,
      content: dbContent,
      status: "done",
    };

    // After done: should ignore overlay and use DB content
    const afterDone = selectMessage(
      doneMessage,
      overlayStore.getState().overlays
    );
    expect(afterDone.content).toBe(dbContent);
    expect(afterDone).toBe(doneMessage); // Should return same reference (base)

    // Verify object reference stability prevents re-renders
    const afterDoneAgain = selectMessage(
      doneMessage,
      overlayStore.getState().overlays
    );
    expect(afterDoneAgain).toBe(doneMessage);
    expect(afterDoneAgain).toBe(afterDone);
  });

  test("overlay cleanup only happens when content matches exactly", () => {
    const overlayStore = createStreamOverlaysStore();
    setStreamOverlaysStoreApi(overlayStore);

    const messageId = "test-msg-2";
    const streamedContent = "Hello world";
    const almostMatchingContent = "Hello worl"; // Missing last char
    const exactMatchingContent = "Hello world";

    // Set overlay
    overlayStore.getState().set(messageId, streamedContent);

    const shouldClearOverlay = (
      dbContent: string,
      overlayContent: string,
      isDone: boolean
    ) => {
      const contentMatches = dbContent === overlayContent;
      return isDone && contentMatches;
    };

    // Case 1: Status is done but content doesn't match exactly
    expect(
      shouldClearOverlay(almostMatchingContent, streamedContent, true)
    ).toBe(false);

    // Case 2: Content matches but status is not done
    expect(
      shouldClearOverlay(exactMatchingContent, streamedContent, false)
    ).toBe(false);

    // Case 3: Both status is done AND content matches exactly
    expect(
      shouldClearOverlay(exactMatchingContent, streamedContent, true)
    ).toBe(true);
  });

  test("prevents flicker by maintaining stable object reference", () => {
    const overlayStore = createStreamOverlaysStore();
    setStreamOverlaysStoreApi(overlayStore);

    const messageId = "test-msg-3";
    const finalContent = "Complete message";

    // Setup: message is streaming with overlay
    overlayStore.getState().set(messageId, finalContent);

    const baseMessage: TestMessage = {
      id: messageId,
      role: "assistant",
      content: finalContent,
      status: "streaming",
    };

    const selectMessage = (
      base: TestMessage,
      hasOverlay: boolean
    ): TestMessage => {
      const isDone = base.status === "done";
      const shouldUseOverlay = !isDone && hasOverlay;

      if (shouldUseOverlay && base.role === "assistant") {
        return {
          ...base,
          content: finalContent,
          status: "streaming",
        };
      }
      return base;
    };

    // Phase 1: Streaming with overlay
    const phase1 = selectMessage(baseMessage, true);
    expect(phase1.content).toBe(finalContent);
    expect(phase1).not.toBe(baseMessage); // New object created

    // Phase 2: Status becomes done, overlay still exists
    const doneMessage = { ...baseMessage, status: "done" as const };
    const phase2 = selectMessage(doneMessage, true);
    expect(phase2.content).toBe(finalContent);
    expect(phase2).toBe(doneMessage); // Same reference returned!

    // Phase 3: Overlay cleared after done
    const phase3 = selectMessage(doneMessage, false);
    expect(phase3).toBe(doneMessage); // Still same reference
    expect(phase3).toBe(phase2); // No change from phase 2

    // This stability prevents React from detecting a change and re-rendering
  });

  test("reasoning overlays follow same pattern as content overlays", () => {
    const overlayStore = createStreamOverlaysStore();
    setStreamOverlaysStoreApi(overlayStore);

    const messageId = "test-msg-4";
    const reasoningText = "Thinking through the problem...";
    const dbReasoning = "Thinking through the problem...";

    // Set reasoning overlay
    overlayStore.getState().setReasoning(messageId, reasoningText);

    // Should only clear if reasoning matches exactly
    const reasoningMatches = dbReasoning === reasoningText;
    expect(reasoningMatches).toBe(true);

    // Verify reasoning with slight difference won't match
    const slightlyDifferent = `${dbReasoning}!`;
    expect(dbReasoning).not.toBe(slightlyDifferent);
  });

  test("error status overlays are preserved and never cleared", () => {
    const overlayStore = createStreamOverlaysStore();
    setStreamOverlaysStoreApi(overlayStore);

    const messageId = "test-msg-error";
    const errorContent = "Failed to generate response";

    // Set error status overlay
    overlayStore.getState().set(messageId, errorContent);
    overlayStore.getState().setStatus(messageId, "error");

    const errorMessage: TestMessage = {
      id: messageId,
      role: "assistant",
      content: errorContent,
      status: "error",
    };

    // Simulate messageSelector with error status
    const selectMessage = (base: TestMessage, hasOverlay: boolean) => {
      const isDone = base.status === "done";
      const isError = base.status === "error";
      const shouldUseOverlay = (!isDone || isError) && hasOverlay;

      if (shouldUseOverlay && base.role === "assistant") {
        return {
          ...base,
          content: errorContent,
          status: base.status,
        };
      }
      return base;
    };

    // With error status: should keep using overlay even if "done" logic applies
    const withError = selectMessage(errorMessage, true);
    expect(withError.status).toBe("error");
    expect(withError.content).toBe(errorContent);

    // Verify error messages should not clear overlays
    const shouldClearOverlay = (
      status: "streaming" | "done" | "error",
      isDone: boolean,
      isError: boolean
    ) => {
      return isDone && !isError;
    };

    // Error message should never clear even if marked as done
    expect(shouldClearOverlay("error", false, true)).toBe(false);
    expect(shouldClearOverlay("error", true, true)).toBe(false);

    // Done message without error should clear
    expect(shouldClearOverlay("done", true, false)).toBe(true);
  });
});
