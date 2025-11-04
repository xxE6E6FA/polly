import { describe, expect, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import {
  createChatInputStore,
  getChatKey,
  setChatInputStoreApi,
} from "@/stores/chat-input-store";
import { setupZustandTestStore } from "@/test/zustand";
import type { Attachment } from "@/types";
import { renderHook } from "../test/hook-utils";
import { useChatScopedState } from "./use-chat-scoped-state";

const getStore = setupZustandTestStore({
  createStore: () => createChatInputStore(),
  setStore: setChatInputStoreApi,
});

describe("useChatScopedState", () => {
  test("reads and writes scoped state per conversation key", () => {
    const store = getStore();
    const { result } = renderHook(() => useChatScopedState("c1"));

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
    expect(result.current.attachments).toHaveLength(1);
    expect(store.getState().attachmentsByKey[result.current.key]).toHaveLength(
      1
    );

    // Write temperature
    act(() => {
      result.current.setTemperatureForKey(0.5);
    });
    expect(result.current.temperature).toBe(0.5);
    expect(store.getState().temperatureByKey[result.current.key]).toBe(0.5);

    // Write persona id
    const personaId = "p1" as Id<"personas">;
    act(() => {
      result.current.setSelectedPersonaIdForKey(personaId);
    });
    expect(result.current.selectedPersonaId).toBe(personaId);
    expect(store.getState().selectedByKey[result.current.key]).toBe(personaId);
  });

  test("uses global key when conversationId is null/undefined", () => {
    const r1 = renderHook(() => useChatScopedState(undefined));
    const r2 = renderHook(() => useChatScopedState(null));
    expect(r1.result.current.key).toBe(getChatKey(undefined));
    expect(r2.result.current.key).toBe(getChatKey(null));
  });
});
