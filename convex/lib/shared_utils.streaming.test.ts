import { describe, test, expect, spyOn, afterEach, mock } from "bun:test";

import { api } from "../_generated/api";
import {
  setConversationStreaming,
  setConversationStreamingForAction,
} from "./shared_utils";

describe("shared_utils streaming helpers", () => {
  afterEach(() => {
    mock.restore();
  });

  test("setConversationStreaming(true) bumps updatedAt and sets flag", async () => {
    const patch = mock(async () => {});
    const ctx: any = { db: { patch } };
    const now = Date.now();
    const dateSpy = spyOn(Date, "now").mockReturnValue(now);

    await setConversationStreaming(ctx, "c1" as any, true);

    expect(patch).toHaveBeenCalledWith("c1", {
      isStreaming: true,
      updatedAt: now,
    });
    dateSpy.mockRestore?.();
  });

  test("setConversationStreaming(false) clears flag without touching updatedAt", async () => {
    const patch = mock(async () => {});
    const ctx: any = { db: { patch } };

    await setConversationStreaming(ctx, "c1" as any, false);

    expect(patch).toHaveBeenCalledWith("c1", {
      isStreaming: false,
    });
  });

  test("setConversationStreamingForAction proxies to public mutation", async () => {
    const runMutation = mock(async () => {});
    const ctx: any = { runMutation };
    await setConversationStreamingForAction(ctx, "c1" as any, true);
    expect(runMutation).toHaveBeenCalledWith(api.conversations.setStreaming, {
      conversationId: "c1",
      isStreaming: true,
    });
  });
});

