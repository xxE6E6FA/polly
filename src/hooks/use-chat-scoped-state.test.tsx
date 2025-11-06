import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act, renderHook, waitFor } from "@testing-library/react";
import React, { type PropsWithChildren } from "react";
import {
  createChatInputStore,
  getChatInputStore,
  setChatInputStoreApi,
} from "@/stores/chat-input-store";
import type { Attachment } from "@/types";
import { TestProviders } from "../../test/TestProviders";
import { useChatScopedState } from "./use-chat-scoped-state";

function wrapper({ children }: PropsWithChildren) {
  return <TestProviders>{children}</TestProviders>;
}

const originalConsoleError = console.error;
let originalStore: ReturnType<typeof getChatInputStore>;

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  localStorage.clear();
  // Create isolated store instance for each test
  originalStore = getChatInputStore();
  setChatInputStoreApi(createChatInputStore());
});

afterAll(() => {
  console.error = originalConsoleError;
});

afterEach(() => {
  // Restore original store instance
  setChatInputStoreApi(originalStore);
});

describe("useChatScopedState", () => {
  test.serial(
    "defaults to global key and updates attachments for global scope",
    async () => {
      const { result } = renderHook(() => useChatScopedState(), {
        wrapper: wrapper,
      });

      expect(result.current.key).toBe("global");
      expect(result.current.attachments).toEqual([]);

      const newAttachment: Attachment = {
        type: "text",
        name: "memo.txt",
        url: "data://memo",
        size: 100,
      };

      act(() => {
        result.current.setAttachmentsForKey([newAttachment]);
      });

      await waitFor(() => {
        expect(result.current.attachments).toEqual([newAttachment]);
      });

      const storeAttachments =
        getChatInputStore().getState().attachmentsByKey["global"];
      expect(storeAttachments).toEqual([newAttachment]);
    }
  );

  test.serial(
    "scopes temperature and persona setters per conversation",
    async () => {
      const scopedConversationId = "use-chat-scoped-state:conv-1";
      const hook = renderHook<
        ReturnType<typeof useChatScopedState>,
        { conversationId?: string | null }
      >(
        ({ conversationId }) => useChatScopedState(conversationId ?? undefined),
        { wrapper: wrapper, initialProps: { conversationId: undefined } }
      );

      expect(hook.result.current.key).toBe("global");

      hook.rerender({ conversationId: scopedConversationId });

      await waitFor(() => {
        expect(hook.result.current.key).toBe(scopedConversationId);
      });

      expect(hook.result.current.temperature).toBeUndefined();
      expect(hook.result.current.selectedPersonaId).toBeNull();

      act(() => {
        hook.result.current.setTemperatureForKey(0.42);
        hook.result.current.setSelectedPersonaIdForKey(
          "persona-1" as Id<"personas">
        );
      });

      await waitFor(() => {
        expect(hook.result.current.temperature).toBe(0.42);
        expect(hook.result.current.selectedPersonaId).toBe(
          "persona-1" as Id<"personas">
        );
      });

      const store = getChatInputStore().getState();
      expect(store.temperatureByKey[scopedConversationId]).toBe(0.42);
      expect(store.selectedByKey[scopedConversationId]).toBe(
        "persona-1" as Id<"personas">
      );
      expect(store.temperatureByKey["global"]).toBeUndefined();
      expect(store.selectedByKey["global"]).toBeUndefined();
    }
  );

  test.serial(
    "supports functional attachment updates without leaking between conversations",
    () => {
      const storeApi = getChatInputStore();
      const convOneKey = "use-chat-scoped-state:conv-1";
      const convTwoKey = "use-chat-scoped-state:conv-2";

      act(() => {
        storeApi
          .getState()
          .setAttachments(convOneKey, [
            { type: "image", name: "one.png", url: "one.png", size: 100 },
          ]);
        storeApi.getState().setAttachments(convTwoKey, []);
      });

      const convOneHook = renderHook(() => useChatScopedState(convOneKey), {
        wrapper: wrapper,
      });
      const convTwoHook = renderHook(() => useChatScopedState(convTwoKey), {
        wrapper: wrapper,
      });

      expect(convOneHook.result.current.attachments).toEqual([
        { type: "image", name: "one.png", url: "one.png", size: 100 },
      ]);
      expect(convTwoHook.result.current.attachments).toEqual([]);

      act(() => {
        storeApi
          .getState()
          .setAttachments(convTwoKey, [
            { type: "pdf", name: "two.pdf", url: "two.pdf", size: 200 },
          ]);
      });

      expect(convTwoHook.result.current.attachments).toEqual([
        { type: "pdf", name: "two.pdf", url: "two.pdf", size: 200 },
      ]);
      expect(convOneHook.result.current.attachments).toEqual([
        { type: "image", name: "one.png", url: "one.png", size: 100 },
      ]);
    }
  );
});
