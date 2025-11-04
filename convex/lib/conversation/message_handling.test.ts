import { test, expect, beforeEach, mock } from "bun:test";
import type { Mock } from "bun:test";
import { mockModuleWithRestore } from "../../../src/test/utils";

// Mock auth util to control getAuthUserId in access checks
await mockModuleWithRestore("@convex-dev/auth/server", () => ({
  getAuthUserId: mock(async () => "u1"),
}));

// Mock logger to avoid noisy output in failure branches
await mockModuleWithRestore(
  import.meta.resolve("../logger"),
  () => ({
    log: {
      warn: mock(),
      info: mock(),
      debug: mock(),
      error: mock(),
      streamStart: mock(),
      streamReasoning: mock(),
      streamComplete: mock(),
      streamError: mock(),
      streamAbort: mock(),
    },
  })
);

// Mock api module to prevent undefined reference errors
await mockModuleWithRestore(
  import.meta.resolve("../../_generated/api"),
  () => ({
    api: {
      messages: {
        remove: "messages.remove",
        removeMultiple: "messages.removeMultiple",
        getAllInConversation: "messages.getAllInConversation",
        create: "messages.create",
      },
      personas: {
        get: "personas.get",
      },
      conversations: {
        get: "conversations.get",
        createConversation: "conversations.createConversation",
      },
      userModels: {
        getModelByID: "userModels.getModelByID",
      },
      users: {
        incrementMessage: "users.incrementMessage",
      },
      titleGeneration: {
        generateTitle: "titleGeneration.generateTitle",
      },
    },
  })
);

import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../../_generated/dataModel";
import {
  handleMessageDeletion,
  findStreamingMessage,
  ensureStreamingCleared,
  deleteMessagesAfterIndex,
  resolveAttachmentUrls,
  buildUserMessageContent,
  getPersonaPrompt,
  createMessage,
  createConversation,
  incrementUserMessageStats,
  scheduleTitleGeneration,
  generateExportMetadata,
  mergeSystemPrompts,
  checkConversationAccess,
} from "./message_handling";

  beforeEach(() => {
    mock.clearAllMocks();
  });

  test("handleMessageDeletion deletes correctly for assistant retry and preserves context", async () => {
    const runMutation = mock(async () => {});
    const ctx: any = { runMutation };
    const msgs: any[] = [
      { _id: "m1", role: "user" },
      { _id: "m2", role: "assistant" },
      { _id: "mctx", role: "context" },
      { _id: "m3", role: "assistant" },
    ];
  await handleMessageDeletion(ctx, msgs, 1, "assistant");
  // Should delete m2 and m3, but not mctx
  const deleted = (runMutation.mock.calls as unknown[])
    .map(call => (call as any)?.[0])
    .filter(Boolean);
  expect(deleted.length).toBe(2);
  });

  test("handleMessageDeletion deletes assistant after edited user and subsequent messages (may include duplicates)", async () => {
    const runMutation = mock(async () => {});
    const ctx: any = { runMutation };
    const msgs: any[] = [
      { _id: "u1", role: "user" },
      { _id: "a1", role: "assistant" },
      { _id: "c1", role: "context" },
      { _id: "a2", role: "assistant" },
    ];
  await handleMessageDeletion(ctx, msgs, 0, "user");
  expect(runMutation).toHaveBeenCalledTimes(1);
  const firstCall = (runMutation.mock.calls as unknown[])[0] as
    | [unknown, { ids?: string[] } | undefined]
    | undefined;
  const ids = firstCall?.[1]?.ids ?? [];
  expect(ids).toContain("a1");
  expect(ids).toContain("a2");
  expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  test("findStreamingMessage finds first empty assistant message", () => {
    const msgs: any[] = [
      { role: "assistant", content: "done" },
      { role: "assistant", content: "" },
    ];
    const res = findStreamingMessage(msgs as any);
    expect(res?.content).toBe("");
  });

  test("ensureStreamingCleared patches conversation when db present and errors without db", async () => {
    const patch = mock(async () => {});
    await ensureStreamingCleared({ db: { patch } } as any, "c1" as any);
    expect(patch).toHaveBeenCalledWith("c1", { isStreaming: false });
    expect(ensureStreamingCleared({} as any, "c1" as any)).rejects.toBeInstanceOf(Error);
  });

  test("deleteMessagesAfterIndex removes messages after target id", async () => {
    const runQuery = mock(async () => [
      { _id: "m1" },
      { _id: "m2" },
      { _id: "m3" },
    ]);
    const runMutation = mock(async () => {});
    await deleteMessagesAfterIndex({ runQuery, runMutation } as any, "c1" as any, "m1" as any);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), { ids: ["m2", "m3"] });

    // id not found → no deletion
    runMutation.mockClear();
    await deleteMessagesAfterIndex({ runQuery, runMutation } as any, "c1" as any, "missing" as any);
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("resolveAttachmentUrls resolves storage urls and validates fields", async () => {
    const storage = { getUrl: mock(async () => "https://file") };
    const ctx: any = { storage };
    const atts: any[] = [
      { storageId: "s1", name: "a.png", type: "image", size: 1 },
      { url: "https://x", name: "b.txt", type: "text", size: 2 },
    ];
  const res = await resolveAttachmentUrls(ctx, atts);
  expect(res[0]?.url).toBe("https://file");
  await expect(
    resolveAttachmentUrls(ctx, [{ name: "x", type: "text", size: 1 } as any])
  ).rejects.toBeInstanceOf(Error);
  });

  test("buildUserMessageContent appends text/pdf content and returns images separately", async () => {
    const storage = { getUrl: mock(async () => "https://img") };
    const ctx: any = { storage };
    const res = await buildUserMessageContent(ctx, "Hello", [
      { storageId: "s1", name: "pic.png", type: "image", size: 1 },
      { url: "u", name: "doc.pdf", type: "pdf", size: 2, content: "PDFTEXT" },
      { url: "u", name: "text.txt", type: "text", size: 1, content: "TXT" },
    ] as any);
    expect(res.content).toContain("Content from doc.pdf");
    expect(res.content).toContain("TXT");
  expect(res.resolvedAttachments?.[0]?.url).toBe("https://img");
  });

  test("getPersonaPrompt returns prompt string or empty when missing", async () => {
    const runQuery = mock(async () => ({ prompt: "P" }));
    expect(await getPersonaPrompt({ runQuery } as any, "p1" as any)).toBe("P");
    expect(await getPersonaPrompt({ runQuery } as any, undefined)).toBe("");
  });

  test("createMessage proxies to mutation", async () => {
    const runMutation = mock(async () => "mid");
    expect(await createMessage({ runMutation } as any, {} as any)).toBe("mid" as any);
  });

  test("createConversation proxies to mutation and extracts conversationId", async () => {
    const runMutation = mock(async () => ({ conversationId: "cid" }));
    expect(await createConversation({ runMutation } as any, {} as any)).toBe("cid" as any);
  });

  test("scheduleTitleGeneration schedules and catches errors", async () => {
    const previous = process.env.CONVEX_ENABLE_SCHEDULER_IN_TEST;
    process.env.CONVEX_ENABLE_SCHEDULER_IN_TEST = "true";
    try {
      const runAfter = mock(async () => {});
      await scheduleTitleGeneration({ scheduler: { runAfter } } as any, "c1" as any, 10);
      expect(runAfter).toHaveBeenCalled();
      const failing = mock(async () => {
        throw new Error("x");
      });
      await scheduleTitleGeneration({ scheduler: { runAfter: failing } } as any, "c1" as any, 10);
    } finally {
      if (previous === undefined) {
        delete process.env.CONVEX_ENABLE_SCHEDULER_IN_TEST;
      } else {
        process.env.CONVEX_ENABLE_SCHEDULER_IN_TEST = previous;
      }
    }
  });

  test("generateExportMetadata and mergeSystemPrompts output expected shape", () => {
    const meta = generateExportMetadata({ _id: "c1", title: "T", createdAt: 1000 } as any, 2, 1);
    expect(meta.conversationId).toBe("c1");
    expect(meta.messageCount).toBe(2);
    const merged = mergeSystemPrompts("base", "persona");
    expect(merged).toContain("base");
    expect(merged).toContain("persona");
  });

  test("checkConversationAccess boolean overload and legacy overload behaviors", async () => {
    // boolean overload with owner access
  const authMock = getAuthUserId as unknown as Mock<() => Promise<string | null>>;
  authMock.mockImplementation(async () => "u1");
    const ctxDb: any = { db: { get: mock(async () => ({ _id: "c", userId: "u1" })) } };
  const res1 = await checkConversationAccess(ctxDb, "c" as any, true);
  expect(res1.hasAccess).toBe(true);
  expect(String(res1.conversation?._id)).toBe("c");
  expect(String(res1.conversation?.userId)).toBe("u1");
  expect(res1.isDeleted ?? false).toBe(false);

    // boolean overload when not owner
    authMock.mockImplementation(async () => "u2");
    const res2 = await checkConversationAccess(ctxDb, "c" as any, true);
    expect(res2.hasAccess).toBe(false);
    expect(res2.conversation).toBeNull();

    // boolean overload when conversation missing
    authMock.mockImplementation(async () => "u1");
    const ctxMissing: any = { db: { get: mock(async () => null) } };
    const res3 = await checkConversationAccess(ctxMissing, "c" as any, true);
    expect(res3.isDeleted).toBe(true);

    // legacy overload success
    authMock.mockImplementation(async () => "u1");
  const legacyUserId = "u1" as Id<"users">;
  const c = await checkConversationAccess(ctxDb, "c" as any, legacyUserId);
  expect(String(c._id)).toBe("c");

    // Reset default mock implementation for subsequent tests
    authMock.mockImplementation(async () => "u1");
  });
