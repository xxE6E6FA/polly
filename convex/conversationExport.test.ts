import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  hydrateExportDataWithAttachments,
  scheduleBackgroundExportHandler,
} from "./conversationExport";

describe("conversationExport.scheduleBackgroundExport", () => {
  test("throws error for unauthenticated user", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      scheduleBackgroundExportHandler(ctx as ActionCtx, {
        conversationIds: ["conv-1" as Id<"conversations">],
        jobId: "job-123",
      })
    ).rejects.toThrow("User not authenticated");
  });

  test("schedules export job successfully", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationIds = [
      "conv-1" as Id<"conversations">,
      "conv-2" as Id<"conversations">,
    ];
    const jobId = "job-123";

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      runMutation: mock(() => Promise.resolve()),
      scheduler: {
        runAfter: mock(() => Promise.resolve()),
      },
    });

    await scheduleBackgroundExportHandler(ctx as ActionCtx, {
      conversationIds,
      jobId,
      includeAttachmentContent: true,
    });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        jobId,
        userId,
        type: "export",
        totalItems: 2,
        conversationIds,
        includeAttachments: true,
        title: expect.stringContaining("Export"),
        description: expect.stringContaining("conversations"),
      })
    );
  });

  test("defaults includeAttachmentContent to false", async () => {
    const userId = "user-123" as Id<"users">;
    const conversationIds = ["conv-1" as Id<"conversations">];

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      runMutation: mock(() => Promise.resolve()),
      scheduler: {
        runAfter: mock(() => Promise.resolve()),
      },
    });

    await scheduleBackgroundExportHandler(ctx as ActionCtx, {
      conversationIds,
      jobId: "job-123",
    });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        includeAttachments: undefined,
        title: expect.stringContaining("Export"),
        description: expect.stringContaining("conversation"),
      })
    );
  });
});

describe("conversationExport.hydrateExportDataWithAttachments", () => {
  test("returns data unchanged when includeAttachments is false", async () => {
    const exportData = [
      {
        conversation: {
          title: "Test Conversation",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isArchived: false,
          isPinned: false,
        },
        messages: [
          {
            role: "user",
            content: "Hello",
            createdAt: Date.now(),
            model: "gpt-4",
            provider: "openai",
            reasoning: undefined,
            attachments: [{ id: "att-1", type: "image" }],
          },
        ],
      },
    ];

    const ctx = makeConvexCtx();

    const result = await hydrateExportDataWithAttachments(
      ctx as ActionCtx,
      exportData,
      false
    );

    expect(result).toEqual(exportData);
  });

  test("hydrates attachments when includeAttachments is true", async () => {
    const exportData = [
      {
        id: "conv-1",
        title: "Test Conversation",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Hello",
            attachments: [
              {
                id: "att-1",
                storageId: "storage-123",
                type: "image",
                name: "image.png",
                url: null,
              },
            ],
          },
        ],
      },
    ];

    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() => Promise.resolve("https://storage.example.com/file")),
        get: mock(() =>
          Promise.resolve(new Blob(["dummy"], { type: "image/png" }))
        ),
      },
    });

    const result = await hydrateExportDataWithAttachments(
      ctx as ActionCtx,
      exportData,
      true
    );

    expect(result[0].messages[0].attachments[0].url).toBe(
      "data:image/png;base64,ZHVtbXk="
    );
    expect(ctx.storage.get).toHaveBeenCalledWith("storage-123");
  });

  test("handles attachments without storageId", async () => {
    const exportData = [
      {
        id: "conv-1",
        title: "Test Conversation",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Hello",
            attachments: [
              {
                id: "att-1",
                type: "text",
                name: "file.txt",
                content: "file content",
              },
            ],
          },
        ],
      },
    ];

    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() => Promise.resolve("https://storage.example.com/file")),
      },
    });

    const result = await hydrateExportDataWithAttachments(
      ctx as ActionCtx,
      exportData,
      true
    );

    // Text attachments without storageId get converted to data URLs
    expect(result[0].messages[0].attachments[0].url).toBe(
      "data:text/plain; charset=utf-8;base64,ZmlsZSBjb250ZW50"
    );
    expect(ctx.storage.getUrl).not.toHaveBeenCalled();
  });

  test("handles multiple attachments and messages", async () => {
    const exportData = [
      {
        id: "conv-1",
        title: "Test Conversation",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Hello",
            attachments: [
              {
                id: "att-1",
                storageId: "storage-1",
                type: "image",
                name: "image.png",
                url: null,
              },
              {
                id: "att-2",
                type: "text",
                name: "text.txt",
                content: "text content",
              },
            ],
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "Hi there",
            attachments: [],
          },
        ],
      },
    ];

    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.example.com/file-1")
        ),
        get: mock(() =>
          Promise.resolve(new Blob(["dummy"], { type: "image/png" }))
        ),
      },
    });

    const result = await hydrateExportDataWithAttachments(
      ctx as ActionCtx,
      exportData,
      true
    );

    expect(result[0].messages[0].attachments[0].url).toBe(
      "data:image/png;base64,ZHVtbXk="
    );
    expect(result[0].messages[0].attachments[1].url).toBe(
      "data:text/plain; charset=utf-8;base64,dGV4dCBjb250ZW50"
    );
    expect(result[0].messages[1].attachments).toEqual([]);
    expect(ctx.storage.get).toHaveBeenCalledTimes(1);
  });

  test("handles empty export data", async () => {
    const ctx = makeConvexCtx();

    const result = await hydrateExportDataWithAttachments(
      ctx as ActionCtx,
      [],
      true
    );

    expect(result).toEqual([]);
  });
});
