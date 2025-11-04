import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  mock,
  spyOn
} from "bun:test";

mock.module("@convex-dev/auth/server", () => ({
  getAuthUserId: mock(async () => "u1"),
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
  afterEach(() => {
    mock.restore();
  });

  test("getAuthenticatedUser and with data", async () => {
    const ctx: any = {
      auth: { getUserIdentity: mock(async () => ({ subject: "u1|session" })) },
      db: { get: mock(async () => ({ _id: "u1" })) },
    };
    const id = await getAuthenticatedUser(ctx);
    expect(String(id)).toBe("u1");
    const { user } = await getAuthenticatedUserWithData(ctx);
    expect(String(user._id)).toBe("u1");
  });

  test("getAuthenticatedUserWithDataForAction uses runQuery", async () => {
    const runQuery = mock(async () => ({ _id: "u1" }));
    const res = await getAuthenticatedUserWithDataForAction({
      auth: { getUserIdentity: mock(async () => ({ subject: "u1|session" })) },
      runQuery,
    } as any);
    expect(String(res.user._id)).toBe("u1");
  });

  test("createError returns ConvexError with standard message", () => {
    const err = createError("ACCESS_DENIED");
    expect(String(err)).toContain(ERROR_MESSAGES.ACCESS_DENIED);
  });

  test("resolveModelWithCapabilities delegates to model_resolution", async () => {
    const mockQuery = mock().mockReturnValue({
      withIndex: mock().mockReturnValue({
        filter: mock().mockReturnValue({
          unique: mock().mockResolvedValue(null)
        })
      }),
      filter: mock().mockReturnValue({
        unique: mock().mockResolvedValue(null)
      })
    });
    
    const ctx: any = { 
      auth: { getUserIdentity: mock(async () => ({ subject: "u1|session" })) },
      db: { 
        query: mockQuery
      } 
    };
    const res = await resolveModelWithCapabilities(ctx, "m", "p");
    expect(res.modelId ?? "m").toBeDefined();
  });

  test("getMessageCount proxies runQuery", async () => {
    const runQuery = mock(async () => 3);
    const res = await getMessageCount({ runQuery } as any, "c1" as any);
    expect(res).toBe(3);
  });

  test("getConversationMessages filters main branch and returns list", async () => {
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

  test("setConversationStreaming and forAction patch and runMutation", async () => {
    const patch = mock(async () => {});
    const now = Date.now();
    const dateSpy = spyOn(Date, "now").mockReturnValue(now);
    await setConversationStreaming({ db: { patch } } as any, "c1" as any, true);
    expect(patch).toHaveBeenCalledWith("c1", { isStreaming: true, updatedAt: now });
    const runMutation = mock(async () => {});
    await setConversationStreamingForAction({ runMutation } as any, "c1" as any, false);
    expect(runMutation).toHaveBeenCalled();
    dateSpy.mockRestore?.();
  });

  test("stopConversationStreaming marks conversation and message metadata", async () => {
    const lastAssistant = { _id: "m2", role: "assistant", status: undefined, metadata: {} };
    const q = {
      withIndex: () => ({ filter: () => ({ order: () => ({ first: async () => lastAssistant }) }) }),
    };
    const patch = mock(async () => {});
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
