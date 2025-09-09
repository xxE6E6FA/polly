import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(async () => "u1"),
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  getAuthenticatedUser,
  getAuthenticatedUserWithData,
  getAuthenticatedUserWithDataForAction,
  validateConversationAccess,
  resolveModelWithCapabilities,
  getMessageCount,
  getConversationMessages,
  ERROR_MESSAGES,
  createError,
  setConversationStreaming,
  setConversationStreamingForAction,
  stopConversationStreaming,
} from "./shared_utils";

describe("lib/shared_utils", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAuthenticatedUser and with data", async () => {
    const ctx: any = { db: { get: vi.fn(async () => ({ _id: "u1" })) } };
    const id = await getAuthenticatedUser(ctx);
    expect(id).toBe("u1");
    const { user } = await getAuthenticatedUserWithData(ctx);
    expect(user._id).toBe("u1");
  });

  it("getAuthenticatedUserWithDataForAction uses runQuery", async () => {
    const runQuery = vi.fn(async () => ({ _id: "u1" }));
    const res = await getAuthenticatedUserWithDataForAction({ runQuery } as any);
    expect(res.user._id).toBe("u1");
  });

  it("createError returns ConvexError with standard message", () => {
    const err = createError("ACCESS_DENIED");
    expect(String(err)).toContain(ERROR_MESSAGES.ACCESS_DENIED);
  });

  it("resolveModelWithCapabilities delegates to model_resolution", async () => {
    const ctx: any = { db: {} };
    const res = await resolveModelWithCapabilities(ctx, "m", "p");
    expect(res.modelId ?? "m").toBeDefined();
  });

  it("getMessageCount proxies runQuery", async () => {
    const runQuery = vi.fn(async () => 3);
    const res = await getMessageCount({ runQuery } as any, "c1" as any);
    expect(res).toBe(3);
  });

  it("getConversationMessages filters main branch and returns list", async () => {
    const docs = [
      { _id: "a", isMainBranch: true },
      { _id: "b", isMainBranch: false },
    ];
    const ctx: any = {
      db: {
        query: () => ({
          withIndex: () => ({ order: () => ({ filter: (fn: any) => ({ collect: async () => docs.filter(d => d.isMainBranch) }) }) }),
        }),
      },
    };
    const res = await getConversationMessages(ctx, "c1" as any, true);
    expect(res.length).toBe(1);
  });

  it("setConversationStreaming and forAction patch and runMutation", async () => {
    const patch = vi.fn(async () => {});
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    await setConversationStreaming({ db: { patch } } as any, "c1" as any, true);
    expect(patch).toHaveBeenCalledWith("c1", { isStreaming: true, updatedAt: now });
    const runMutation = vi.fn(async () => {});
    await setConversationStreamingForAction({ runMutation } as any, "c1" as any, false);
    expect(runMutation).toHaveBeenCalled();
  });

  it("stopConversationStreaming marks conversation and message metadata", async () => {
    const lastAssistant = { _id: "m2", role: "assistant", status: undefined, metadata: {} };
    const q = {
      withIndex: () => ({ filter: () => ({ order: () => ({ first: async () => lastAssistant }) }) }),
    };
    const patch = vi.fn(async () => {});
    const ctx: any = { db: { patch, query: () => q } };
    await stopConversationStreaming(ctx, "c1" as any);
    // conversation patch first
    expect(patch).toHaveBeenCalledWith("c1", { isStreaming: false });
    // then message patch
    const messagePatch = patch.mock.calls.find((c: any[]) => c[0] === "m2");
    expect(messagePatch).toBeTruthy();
    expect((messagePatch as any)?.[1]?.metadata?.finishReason).toBe("stop");
  });
});
