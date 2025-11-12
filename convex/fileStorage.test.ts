import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  deleteFileHandler,
  deleteMultipleFilesHandler,
  generateUploadUrlHandler,
  getFileMetadataHandler,
  getFileUrlHandler,
  getUserFileStatsHandler,
  getUserFilesHandler,
} from "./fileStorage";

describe("fileStorage: generateUploadUrl", () => {
  test("generates upload URL", async () => {
    const mockUrl = "https://example.com/upload/abc123";

    const ctx = makeConvexCtx({
      storage: {
        generateUploadUrl: mock(() => Promise.resolve(mockUrl)),
      },
    });

    const result = await generateUploadUrlHandler(ctx as MutationCtx);

    expect(result).toBe(mockUrl);
    expect(ctx.storage.generateUploadUrl).toHaveBeenCalled();
  });
});

describe("fileStorage: getFileMetadata", () => {
  test("returns file metadata and URL", async () => {
    const storageId = "storage-123" as Id<"_storage">;
    const mockMetadata = {
      _id: storageId,
      _creationTime: Date.now(),
      sha256: "abc123",
      size: 1024,
      contentType: "image/png",
    };
    const mockUrl = "https://example.com/file.png";

    const ctx = makeConvexCtx({
      db: {
        system: {
          get: mock(() => Promise.resolve(mockMetadata)),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve(mockUrl)),
      },
    });

    const result = await getFileMetadataHandler(ctx as QueryCtx, {
      storageId,
    });

    expect(result).toEqual({
      storageId,
      url: mockUrl,
      metadata: mockMetadata,
    });
  });

  test("throws error when file not found", async () => {
    const storageId = "storage-123" as Id<"_storage">;

    const ctx = makeConvexCtx({
      db: {
        system: {
          get: mock(() => Promise.resolve(null)),
        },
      } as any,
    });

    await expect(
      getFileMetadataHandler(ctx as QueryCtx, { storageId })
    ).rejects.toThrow("File not found");
  });

  test("throws error when URL generation fails", async () => {
    const storageId = "storage-123" as Id<"_storage">;
    const mockMetadata = {
      _id: storageId,
      _creationTime: Date.now(),
      sha256: "abc123",
      size: 1024,
      contentType: "image/png",
    };

    const ctx = makeConvexCtx({
      db: {
        system: {
          get: mock(() => Promise.resolve(mockMetadata)),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      getFileMetadataHandler(ctx as QueryCtx, { storageId })
    ).rejects.toThrow("Failed to get file URL");
  });
});

describe("fileStorage: getFileUrl", () => {
  test("returns file URL from storage", async () => {
    const storageId = "storage-123" as Id<"_storage">;
    const mockUrl = "https://example.com/file.png";

    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() => Promise.resolve(mockUrl)),
      },
    });

    const result = await getFileUrlHandler(ctx as QueryCtx, { storageId });

    expect(result).toBe(mockUrl);
    expect(ctx.storage.getUrl).toHaveBeenCalledWith(storageId);
  });
});

describe("fileStorage: deleteFile", () => {
  test("deletes file from storage", async () => {
    const storageId = "storage-123" as Id<"_storage">;

    const ctx = makeConvexCtx({
      storage: {
        delete: mock(() => Promise.resolve(undefined)),
      },
    });

    await deleteFileHandler(ctx as MutationCtx, { storageId });

    expect(ctx.storage.delete).toHaveBeenCalledWith(storageId);
  });
});

describe("fileStorage: getUserFiles", () => {
  const userId = "user-123" as Id<"users">;
  const conversationId = "conv-123" as Id<"conversations">;
  const messageId = "msg-123" as Id<"messages">;
  const storageId = "storage-123" as Id<"_storage">;

  function createMockConversation(
    overrides: Partial<Doc<"conversations">> = {}
  ): Doc<"conversations"> {
    return {
      _id: conversationId,
      _creationTime: Date.now(),
      userId,
      title: "Test Conversation",
      modelId: "test-model",
      providerId: "openai",
      archived: false,
      ...overrides,
    };
  }

  function createMockMessage(
    overrides: Partial<Doc<"messages">> = {}
  ): Doc<"messages"> {
    return {
      _id: messageId,
      _creationTime: Date.now(),
      conversationId,
      role: "user",
      content: "Test message",
      createdAt: Date.now(),
      ...overrides,
    };
  }

  test("returns empty array when user not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(getUserFilesHandler(ctx as QueryCtx, {})).rejects.toThrow(
      "Not authenticated"
    );
  });

  test("returns user files with image attachments", async () => {
    const conversation = createMockConversation();
    const message = createMockMessage({
      attachments: [
        {
          type: "image",
          name: "test.png",
          size: 1024,
          storageId,
        },
      ],
    });

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([message])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: storageId,
              _creationTime: Date.now(),
              sha256: "abc123",
              size: 1024,
              contentType: "image/png",
            })
          ),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve("https://example.com/test.png")),
      },
    });

    const result = await getUserFilesHandler(ctx as QueryCtx, {});

    expect(result.files).toHaveLength(1);
    expect(result.files[0].storageId).toBe(storageId);
    expect(result.files[0].attachment.type).toBe("image");
    expect(result.files[0].conversationName).toBe("Test Conversation");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("filters files by type", async () => {
    const conversation = createMockConversation();
    const message = createMockMessage({
      attachments: [
        {
          type: "image",
          name: "test.png",
          size: 1024,
          storageId: "storage-1" as Id<"_storage">,
        },
        {
          type: "pdf",
          name: "test.pdf",
          size: 2048,
          storageId: "storage-2" as Id<"_storage">,
        },
      ],
    });

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([message])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: storageId,
              _creationTime: Date.now(),
              sha256: "abc123",
              size: 1024,
              contentType: "application/pdf",
            })
          ),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve("https://example.com/test.pdf")),
      },
    });

    const result = await getUserFilesHandler(ctx as QueryCtx, {
      fileType: "pdf",
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].attachment.type).toBe("pdf");
  });

  test("excludes generated images when includeGenerated is false", async () => {
    const conversation = createMockConversation();
    const message = createMockMessage({
      attachments: [
        {
          type: "image",
          name: "generated.png",
          size: 1024,
          storageId: "storage-1" as Id<"_storage">,
          generatedImage: {
            isGenerated: true,
            provider: "dalle",
            model: "dall-e-3",
          },
        },
        {
          type: "image",
          name: "uploaded.png",
          size: 2048,
          storageId: "storage-2" as Id<"_storage">,
        },
      ],
    });

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([message])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: storageId,
              _creationTime: Date.now(),
              sha256: "abc123",
              size: 2048,
              contentType: "image/png",
            })
          ),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve("https://example.com/uploaded.png")),
      },
    });

    const result = await getUserFilesHandler(ctx as QueryCtx, {
      fileType: "image",
      includeGenerated: false,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].attachment.name).toBe("uploaded.png");
  });

  test("respects limit parameter", async () => {
    const conversation = createMockConversation();
    const messages = Array.from({ length: 5 }, (_, i) =>
      createMockMessage({
        _id: `msg-${i}` as Id<"messages">,
        attachments: [
          {
            type: "image",
            name: `test-${i}.png`,
            size: 1024,
            storageId: `storage-${i}` as Id<"_storage">,
          },
        ],
      })
    );

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve(messages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: storageId,
              _creationTime: Date.now(),
              sha256: "abc123",
              size: 1024,
              contentType: "image/png",
            })
          ),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve("https://example.com/test.png")),
      },
    });

    const result = await getUserFilesHandler(ctx as QueryCtx, { limit: 3 });

    expect(result.files.length).toBeLessThanOrEqual(3);
  });

  test("handles text attachments without storageId", async () => {
    const conversation = createMockConversation();
    const message = createMockMessage({
      attachments: [
        {
          type: "text",
          name: "test.txt",
          size: 512,
          content: "Test content",
        },
      ],
    });

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([message])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
      } as any,
    });

    const result = await getUserFilesHandler(ctx as QueryCtx, {});

    expect(result.files).toHaveLength(1);
    expect(result.files[0].storageId).toBeNull();
    expect(result.files[0].url).toBeNull();
    expect(result.files[0].attachment.type).toBe("text");
  });
});

describe("fileStorage: deleteMultipleFiles", () => {
  const userId = "user-123" as Id<"users">;
  const conversationId = "conv-123" as Id<"conversations">;
  const messageId = "msg-123" as Id<"messages">;
  const storageIds = [
    "storage-1" as Id<"_storage">,
    "storage-2" as Id<"_storage">,
  ];

  test("throws error when user not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      deleteMultipleFilesHandler(ctx as MutationCtx, { storageIds })
    ).rejects.toThrow("Not authenticated");
  });

  test("deletes files from storage", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      storage: {
        delete: mock(() => Promise.resolve(undefined)),
      },
    });

    const result = await deleteMultipleFilesHandler(ctx as MutationCtx, {
      storageIds,
      updateMessages: false,
    });

    expect(result.deletedCount).toBe(2);
    expect(ctx.storage.delete).toHaveBeenCalledTimes(2);
  });

  test("updates messages when updateMessages is true", async () => {
    const conversation = {
      _id: conversationId,
      _creationTime: Date.now(),
      userId,
      title: "Test",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const message = {
      _id: messageId,
      _creationTime: Date.now(),
      conversationId,
      role: "user" as const,
      content: "Test",
      createdAt: Date.now(),
      attachments: [
        {
          type: "image" as const,
          name: "test1.png",
          size: 1024,
          storageId: storageIds[0],
        },
        {
          type: "image" as const,
          name: "test2.png",
          size: 2048,
          storageId: storageIds[1],
        },
        {
          type: "image" as const,
          name: "test3.png",
          size: 512,
          storageId: "storage-3" as Id<"_storage">,
        },
      ],
    };

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([message])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
        patch: mock(() => Promise.resolve(undefined)),
      } as any,
      storage: {
        delete: mock(() => Promise.resolve(undefined)),
      },
    });

    const result = await deleteMultipleFilesHandler(ctx as MutationCtx, {
      storageIds,
      updateMessages: true,
    });

    expect(result.deletedCount).toBe(2);
    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, {
      attachments: [
        {
          type: "image",
          name: "test3.png",
          size: 512,
          storageId: "storage-3",
        },
      ],
    });
  });

  test("skips messages from other users conversations", async () => {
    const otherUserId = "user-456" as Id<"users">;
    const userConversation = {
      _id: conversationId,
      _creationTime: Date.now(),
      userId,
      title: "User Conv",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const otherConversation = {
      _id: "conv-456" as Id<"conversations">,
      _creationTime: Date.now(),
      userId: otherUserId,
      title: "Other Conv",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const userMessage = {
      _id: messageId,
      _creationTime: Date.now(),
      conversationId,
      role: "user" as const,
      content: "Test",
      createdAt: Date.now(),
      attachments: [
        {
          type: "image" as const,
          name: "test.png",
          size: 1024,
          storageId: storageIds[0],
        },
      ],
    };

    const otherMessage = {
      _id: "msg-456" as Id<"messages">,
      _creationTime: Date.now(),
      conversationId: otherConversation._id,
      role: "user" as const,
      content: "Test",
      createdAt: Date.now(),
      attachments: [
        {
          type: "image" as const,
          name: "other.png",
          size: 2048,
          storageId: storageIds[1],
        },
      ],
    };

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([userConversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([userMessage, otherMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
        patch: mock(() => Promise.resolve(undefined)),
      } as any,
      storage: {
        delete: mock(() => Promise.resolve(undefined)),
      },
    });

    await deleteMultipleFilesHandler(ctx as MutationCtx, {
      storageIds,
      updateMessages: true,
    });

    // Only user's message should be patched
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
    expect(ctx.db.patch).toHaveBeenCalledWith(messageId, expect.anything());
  });
});

describe("fileStorage: getUserFileStats", () => {
  const userId = "user-123" as Id<"users">;
  const conversationId = "conv-123" as Id<"conversations">;

  test("throws error when user not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(getUserFileStatsHandler(ctx as QueryCtx)).rejects.toThrow(
      "Not authenticated"
    );
  });

  test("returns correct file statistics", async () => {
    const conversation = {
      _id: conversationId,
      _creationTime: Date.now(),
      userId,
      title: "Test",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const messages = [
      {
        _id: "msg-1" as Id<"messages">,
        _creationTime: Date.now(),
        conversationId,
        role: "user" as const,
        content: "Test",
        createdAt: Date.now(),
        attachments: [
          {
            type: "image" as const,
            name: "test1.png",
            size: 1024,
            storageId: "storage-1" as Id<"_storage">,
          },
          {
            type: "pdf" as const,
            name: "test.pdf",
            size: 2048,
            storageId: "storage-2" as Id<"_storage">,
          },
        ],
      },
      {
        _id: "msg-2" as Id<"messages">,
        _creationTime: Date.now(),
        conversationId,
        role: "user" as const,
        content: "Test",
        createdAt: Date.now(),
        attachments: [
          {
            type: "text" as const,
            name: "test.txt",
            size: 512,
            content: "Test content",
          },
        ],
      },
    ];

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve(messages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
      } as any,
    });

    const result = await getUserFileStatsHandler(ctx as QueryCtx);

    expect(result.totalFiles).toBe(3);
    expect(result.totalSize).toBe(3584); // 1024 + 2048 + 512
    expect(result.typeCounts).toEqual({
      image: 1,
      pdf: 1,
      text: 1,
    });
    expect(result.generatedImages).toEqual({
      count: 0,
      size: 0,
    });
  });

  test("counts generated images separately", async () => {
    const conversation = {
      _id: conversationId,
      _creationTime: Date.now(),
      userId,
      title: "Test",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const messages = [
      {
        _id: "msg-1" as Id<"messages">,
        _creationTime: Date.now(),
        conversationId,
        role: "user" as const,
        content: "Test",
        createdAt: Date.now(),
        attachments: [
          {
            type: "image" as const,
            name: "generated.png",
            size: 2048,
            storageId: "storage-1" as Id<"_storage">,
            generatedImage: {
              isGenerated: true,
              provider: "dalle",
              model: "dall-e-3",
            },
          },
          {
            type: "image" as const,
            name: "uploaded.png",
            size: 1024,
            storageId: "storage-2" as Id<"_storage">,
          },
        ],
      },
    ];

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([conversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve(messages)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
      } as any,
    });

    const result = await getUserFileStatsHandler(ctx as QueryCtx);

    expect(result.totalFiles).toBe(2);
    expect(result.totalSize).toBe(3072);
    expect(result.typeCounts.image).toBe(1); // Only the uploaded one
    expect(result.generatedImages).toEqual({
      count: 1,
      size: 2048,
    });
  });

  test("skips messages from other users", async () => {
    const otherUserId = "user-456" as Id<"users">;
    const userConversation = {
      _id: conversationId,
      _creationTime: Date.now(),
      userId,
      title: "User Conv",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const otherConversation = {
      _id: "conv-456" as Id<"conversations">,
      _creationTime: Date.now(),
      userId: otherUserId,
      title: "Other Conv",
      modelId: "test",
      providerId: "openai",
      archived: false,
    };

    const userMessage = {
      _id: "msg-1" as Id<"messages">,
      _creationTime: Date.now(),
      conversationId,
      role: "user" as const,
      content: "Test",
      createdAt: Date.now(),
      attachments: [
        {
          type: "image" as const,
          name: "user.png",
          size: 1024,
          storageId: "storage-1" as Id<"_storage">,
        },
      ],
    };

    const otherMessage = {
      _id: "msg-2" as Id<"messages">,
      _creationTime: Date.now(),
      conversationId: otherConversation._id,
      role: "user" as const,
      content: "Test",
      createdAt: Date.now(),
      attachments: [
        {
          type: "image" as const,
          name: "other.png",
          size: 2048,
          storageId: "storage-2" as Id<"_storage">,
        },
      ],
    };

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      collect: mock(() => Promise.resolve([userConversation])),
    };

    const messagesQueryChain = {
      withIndex: mock(() => messagesQueryChain),
      order: mock(() => messagesQueryChain),
      collect: mock(() => Promise.resolve([userMessage, otherMessage])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          if (table === "conversations") {
            return queryChain;
          }
          return messagesQueryChain;
        }),
      } as any,
    });

    const result = await getUserFileStatsHandler(ctx as QueryCtx);

    expect(result.totalFiles).toBe(1);
    expect(result.totalSize).toBe(1024);
    expect(result.typeCounts.image).toBe(1);
  });
});
