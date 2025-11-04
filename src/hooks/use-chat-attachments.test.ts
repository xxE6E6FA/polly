import { afterAll, describe, expect, mock, test } from "bun:test";
import { act } from "@testing-library/react";
import {
  createChatInputStore,
  setChatInputStoreApi,
} from "@/stores/chat-input-store";
import { setupZustandTestStore } from "@/test/zustand";
import { renderHook } from "../test/hook-utils";
import { useChatAttachments } from "./use-chat-attachments";

const useClearOnConversationChangeMock = mock();

mock.module("./use-clear-on-conversation-change", () => ({
  useClearOnConversationChange: (...args: unknown[]) =>
    useClearOnConversationChangeMock(...args),
}));

afterAll(() => {
  mock.restore();
});

const getStore = setupZustandTestStore({
  createStore: () => createChatInputStore(),
  setStore: setChatInputStoreApi,
});

describe("useChatAttachments", () => {
  test("reads attachments for key and exposes set/clear", () => {
    const store = getStore();
    store.setState({
      attachmentsByKey: {
        global: [{ type: "text", url: "u", name: "n", size: 1, content: "c" }],
      },
    });

    const { result } = renderHook(() => useChatAttachments());
    expect(result.current.attachments).toHaveLength(1);

    act(() => {
      result.current.setAttachments(prev => [
        ...prev,
        { type: "image", url: "u2", name: "n2", size: 2 },
      ]);
    });
    expect(store.getState().attachmentsByKey.global).toHaveLength(2);

    act(() => {
      result.current.clearAttachments();
    });
    expect(store.getState().attachmentsByKey.global).toBeUndefined();
    expect(useClearOnConversationChangeMock).toHaveBeenCalled();
  });
});
