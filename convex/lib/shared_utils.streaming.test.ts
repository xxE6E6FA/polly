import { describe, it, expect, vi, beforeEach } from "vitest";

import { api } from "../_generated/api";
import {
  setConversationStreaming,
  setConversationStreamingForAction,
} from "./shared_utils";

describe("shared_utils streaming helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setConversationStreaming(true) bumps updatedAt and sets flag", async () => {
    const patch = vi.fn(async () => {});
    const ctx: any = { db: { patch } };
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    await setConversationStreaming(ctx, "c1" as any, true);

    expect(patch).toHaveBeenCalledWith("c1", {
      isStreaming: true,
      updatedAt: now,
    });
  });

  it("setConversationStreaming(false) clears flag without touching updatedAt", async () => {
    const patch = vi.fn(async () => {});
    const ctx: any = { db: { patch } };

    await setConversationStreaming(ctx, "c1" as any, false);

    expect(patch).toHaveBeenCalledWith("c1", {
      isStreaming: false,
    });
  });

  it("setConversationStreamingForAction proxies to public mutation", async () => {
    const runMutation = vi.fn(async () => {});
    const ctx: any = { runMutation };
    await setConversationStreamingForAction(ctx, "c1" as any, true);
    expect(runMutation).toHaveBeenCalledWith(api.conversations.setStreaming, {
      conversationId: "c1",
      isStreaming: true,
    });
  });
});

