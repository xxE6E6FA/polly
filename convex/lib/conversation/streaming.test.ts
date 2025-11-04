import { describe, test, expect, mock, type Mock } from "bun:test";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createMessage, incrementUserMessageStats } from "./message_handling";
import { processAttachmentsForStorage, executeStreamingActionForRetry } from "./streaming";
   
mock.module("@convex-dev/auth/server", () => ({
  getAuthUserId: mock(async () => "u1"),
}));
mock.module("./message_handling", () => ({
  createMessage: mock(async () => "mid"),
  incrementUserMessageStats: mock(async () => {}),
}));

describe("conversation/streaming", () => {
  test("processAttachmentsForStorage ensures url field present", async () => {
    const atts = [
      { url: "", name: "a", type: "text", size: 1 },
      { url: "u", name: "b", type: "image", size: 2 },
    ] as any;
  const res = await processAttachmentsForStorage({} as any, atts);
  expect(res.length).toBeGreaterThanOrEqual(2);
  expect(res[0]?.url).toBe("");
  expect(res[1]?.url).toBe("u");
  });

  test("executeStreamingActionForRetry creates assistant message, sets streaming, and increments stats", async () => {
    const runMutation = mock(async () => {});
    const ctx: any = { runMutation, scheduler: { runAfter: mock() } };
    const out = await executeStreamingActionForRetry(ctx, {
      conversationId: "c1" as any,
      model: "m",
      provider: "openai",
      conversation: {} as any,
      contextMessages: [],
      useWebSearch: false,
    });
    expect(out.assistantMessageId).toBe("mid" as any);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), { conversationId: "c1", isStreaming: true });
    expect(createMessage).toHaveBeenCalled();
    expect(incrementUserMessageStats).toHaveBeenCalled();

    // Not authenticated path
    const authMock = getAuthUserId as unknown as Mock<
      () => Promise<string | null>
    >;
    authMock.mockResolvedValueOnce(null);
    await expect(executeStreamingActionForRetry(ctx, { conversationId: "c1" as any, model: "m", provider: "openai", conversation: {} as any, contextMessages: [], useWebSearch: false })).rejects.toBeInstanceOf(Error);
  });
});
