import { beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { getChatInputStore, getChatKey } from "@/stores/chat-input-store";
import type { Attachment, ConversationId } from "@/types";
import { useChatAttachments } from "./use-chat-attachments";

beforeEach(() => {
  localStorage.clear();
});

const makeAttachment = (suffix: string): Attachment => ({
  type: "text",
  url: `https://example.com/${suffix}`,
  name: `file-${suffix}.txt`,
  size: 1,
  content: suffix,
});

describe("useChatAttachments", () => {
  test.serial("reads and updates attachments per conversation", () => {
    const conversationId = "use-chat-attachments:conv-1" as ConversationId;
    const { result } = renderHook(({ id }) => useChatAttachments(id), {
      initialProps: { id: conversationId },
    });

    expect(result.current.attachments).toEqual([]);

    act(() => {
      result.current.setAttachments([makeAttachment("a"), makeAttachment("b")]);
    });

    expect(result.current.attachments).toHaveLength(2);

    act(() => {
      result.current.setAttachments(prev => [...prev, makeAttachment("c")]);
    });

    expect(result.current.attachments).toHaveLength(3);
    const store = getChatInputStore().getState();
    expect(store.attachmentsByKey[getChatKey(conversationId)]).toHaveLength(3);

    act(() => {
      result.current.clearAttachments();
    });

    expect(result.current.attachments).toEqual([]);
  });

  test.serial(
    "clears previous conversation attachments when id changes",
    () => {
      const keyOne = "use-chat-attachments:conv-1" as ConversationId;
      const keyTwo = "use-chat-attachments:conv-2" as ConversationId;
      const { result, rerender } = renderHook(
        ({ id }) => useChatAttachments(id),
        {
          initialProps: { id: keyOne },
        }
      );

      act(() => {
        result.current.setAttachments([makeAttachment("pending")]);
      });

      expect(result.current.attachments).toHaveLength(1);

      act(() => {
        rerender({ id: keyTwo });
      });

      const store = getChatInputStore().getState();
      expect(store.attachmentsByKey[getChatKey(keyOne)]).toBeUndefined();
      expect(result.current.attachments).toEqual([]);
    }
  );
});
