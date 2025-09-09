import { describe, it, expect, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(async () => "u1"),
}));
vi.mock("./message_handling", () => ({
  createMessage: vi.fn(async () => "mid"),
  incrementUserMessageStats: vi.fn(async () => {}),
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import { createMessage, incrementUserMessageStats } from "./message_handling";
import { processAttachmentsForStorage, executeStreamingActionForRetry } from "./streaming";

describe("conversation/streaming", () => {
  it("processAttachmentsForStorage ensures url field present", async () => {
    const atts = [
      { url: "", name: "a", type: "text", size: 1 },
      { url: "u", name: "b", type: "image", size: 2 },
    ] as any;
    const res = await processAttachmentsForStorage({} as any, atts);
    expect(res[0].url).toBe("");
    expect(res[1].url).toBe("u");
  });

  it("executeStreamingActionForRetry creates assistant message, sets streaming, and increments stats", async () => {
    const runMutation = vi.fn(async () => {});
    const ctx: any = { runMutation, scheduler: { runAfter: vi.fn() } };
    const out = await executeStreamingActionForRetry(ctx, {
      conversationId: "c1" as any,
      model: "m",
      provider: "openai",
      conversation: {} as any,
      contextMessages: [],
      useWebSearch: false,
    });
    expect(out.assistantMessageId).toBe("mid");
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), { conversationId: "c1", isStreaming: true });
    expect(createMessage).toHaveBeenCalled();
    expect(incrementUserMessageStats).toHaveBeenCalled();

    // Not authenticated path
    (getAuthUserId as unknown as any).mockResolvedValueOnce(null);
    await expect(executeStreamingActionForRetry(ctx, { conversationId: "c1" as any, model: "m", provider: "openai", conversation: {}, contextMessages: [], useWebSearch: false })).rejects.toBeInstanceOf(Error);
  });
});
