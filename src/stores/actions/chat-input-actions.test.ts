import type { Id } from "@convex/_generated/dataModel";
import { describe, expect, it } from "vitest";
import { getChatKey, useChatInputStore } from "@/stores/chat-input-store";
import type { Attachment } from "@/types";
import {
  appendAttachments,
  removeAttachmentAt,
  setPersona,
  setTemperature,
} from "./chat-input-actions";

describe("stores/actions/chat-input-actions", () => {
  it("append/remove attachments works and ignores invalid index", () => {
    const key = getChatKey("c1");
    useChatInputStore.getState().setAttachments(key, []);
    appendAttachments("c1", [
      { type: "image", url: "u", name: "n", size: 1 } as Attachment,
    ]);
    expect(useChatInputStore.getState().attachmentsByKey[key]?.length).toBe(1);
    removeAttachmentAt("c1", 1); // no-op
    expect(useChatInputStore.getState().attachmentsByKey[key]?.length).toBe(1);
    removeAttachmentAt("c1", 0);
    expect(useChatInputStore.getState().attachmentsByKey[key]?.length).toBe(0);
  });

  it("set persona and temperature delegate to store", () => {
    const key = getChatKey("c2");
    setPersona("c2", "p1" as Id<"personas">);
    expect(useChatInputStore.getState().selectedByKey[key]).toBe("p1");
    setTemperature("c2", 0.6);
    expect(useChatInputStore.getState().temperatureByKey[key]).toBe(0.6);
  });
});
