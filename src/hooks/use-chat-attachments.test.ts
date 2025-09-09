import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("@/stores/chat-input-store", () => ({
  getChatKey: vi.fn(() => "global"),
  useChatInputStore: (sel: (state: unknown) => unknown) =>
    sel({
      attachmentsByKey: {
        global: [{ type: "text", url: "u", name: "n", size: 1, content: "c" }],
      },
      setAttachments: vi.fn(),
      clearAttachmentsKey: vi.fn(),
    }),
}));

vi.mock("./use-clear-on-conversation-change", () => ({
  useClearOnConversationChange: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useChatInputStore } from "@/stores/chat-input-store";
import { useChatAttachments } from "./use-chat-attachments";

describe("useChatAttachments", () => {
  it("reads attachments for key and exposes set/clear", () => {
    const { result } = renderHook(() => useChatAttachments());
    expect(result.current.attachments).toHaveLength(1);

    const _state =
      (useChatInputStore as { getState?: () => unknown }).getState?.() || {};
    expect(typeof result.current.setAttachments).toBe("function");
    expect(typeof result.current.clearAttachments).toBe("function");

    // call to ensure passthrough works; underlying spies live in closure
    result.current.setAttachments(prev => prev);
    result.current.clearAttachments();
  });
});
