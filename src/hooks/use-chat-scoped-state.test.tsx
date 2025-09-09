import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useChatInputStore } from "@/stores/chat-input-store";
import type { Attachment } from "@/types";
import { renderHook } from "../test/hook-utils";
import { useChatScopedState } from "./use-chat-scoped-state";

describe("useChatScopedState", () => {
  beforeEach(() => {
    // Reset store slices used by the hook
    useChatInputStore.setState({
      attachmentsByKey: {} as Record<string, Attachment[]>,
      temperatureByKey: {} as Record<string, number | undefined>,
      selectedByKey: {} as Record<string, Id<"personas"> | null>,
    });
  });

  it("reads and writes scoped state per conversation key", () => {
    const { result, rerender } = renderHook(() => useChatScopedState("c1"));

    // Defaults
    expect(result.current.key).toBe("c1");
    expect(result.current.attachments).toEqual([]);
    expect(result.current.temperature).toBeUndefined();
    expect(result.current.selectedPersonaId).toBeNull();

    // Write attachments
    act(() => {
      result.current.setAttachmentsForKey([
        { type: "text", url: "", name: "a.txt", size: 1 } as Attachment,
      ]);
    });
    rerender();
    expect(result.current.attachments).toHaveLength(1);

    // Write temperature
    act(() => {
      result.current.setTemperatureForKey(0.5);
    });
    expect(result.current.temperature).toBe(0.5);

    // Write persona id
    act(() => {
      result.current.setSelectedPersonaIdForKey("p1" as Id<"personas">);
    });
    expect(result.current.selectedPersonaId).toBe("p1");
  });

  it("uses global key when conversationId is null/undefined", () => {
    const r1 = renderHook(() => useChatScopedState(undefined));
    const r2 = renderHook(() => useChatScopedState(null));
    expect(r1.result.current.key).toBe("global");
    expect(r2.result.current.key).toBe("global");
  });
});
