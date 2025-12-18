import { describe, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useAssistantDisplayPhase } from "./use-assistant-display-phase";

describe("useAssistantDisplayPhase", () => {
  describe("basic phase detection", () => {
    test("returns loading phase when no content and active status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "thinking",
          hasContent: false,
          hasReasoning: false,
        })
      );

      expect(result.current.phase).toBe("loading");
      expect(result.current.isActive).toBe(true);
    });

    test("returns streaming phase when has content and active status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "streaming",
          hasContent: true,
          hasReasoning: false,
        })
      );

      expect(result.current.phase).toBe("streaming");
      expect(result.current.isActive).toBe(true);
    });

    test("returns complete phase when done status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "done",
          hasContent: true,
          hasReasoning: false,
        })
      );

      expect(result.current.phase).toBe("complete");
      expect(result.current.isActive).toBe(false);
    });

    test("returns complete phase when stopped status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "stopped",
          hasContent: false,
          hasReasoning: false,
        })
      );

      expect(result.current.phase).toBe("complete");
      expect(result.current.isActive).toBe(false);
    });

    test("returns reasoning phase when has reasoning but no content", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "thinking",
          hasContent: false,
          hasReasoning: true,
        })
      );

      expect(result.current.phase).toBe("reasoning");
      expect(result.current.isActive).toBe(true);
    });

    test("returns error phase for error status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "error",
          hasContent: false,
          hasReasoning: false,
        })
      );

      expect(result.current.phase).toBe("error");
    });

    test("returns complete when has content but no active status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: undefined,
          hasContent: true,
          hasReasoning: false,
        })
      );

      expect(result.current.phase).toBe("complete");
      expect(result.current.isActive).toBe(false);
    });
  });

  describe("status labels", () => {
    test("returns Thinking label for thinking status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "thinking",
          hasContent: false,
          hasReasoning: false,
        })
      );

      expect(result.current.statusLabel).toBe("Thinking…");
    });

    test("returns Searching label for searching status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "searching",
          hasContent: false,
          hasReasoning: false,
        })
      );

      expect(result.current.statusLabel).toBe("Searching…");
    });

    test("returns Reading label for reading_pdf status", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "reading_pdf",
          hasContent: false,
          hasReasoning: false,
        })
      );

      expect(result.current.statusLabel).toBe("Reading…");
    });

    test("returns undefined label when complete", () => {
      const { result } = renderHook(() =>
        useAssistantDisplayPhase({
          messageStatus: "done",
          hasContent: true,
          hasReasoning: false,
        })
      );

      expect(result.current.statusLabel).toBeUndefined();
    });
  });
});
