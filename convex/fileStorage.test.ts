import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  createUserFileEntriesHandler,
  deleteFileHandler,
  deleteMultipleFilesHandler,
  generateUploadUrlHandler,
  getFileMetadataHandler,
  getFileUrlHandler,
  getUserFileStatsHandler,
  getUserFilesHandler,
} from "./fileStorage";

describe("fileStorage: createUserFileEntries", () => {
  test("creates userFile entries for message attachments", async () => {
    const userId = "user-123" as Id<"users">;
    const messageId = "msg-123" as Id<"messages">;
    const conversationId = "conv-123" as Id<"conversations">;
    const storageId = "storage-123" as Id<"_storage">;

    const filterChain = {
      unique: mock(() => Promise.resolve(null)),
    };

    const queryChain = {
      withIndex: mock(() => queryChain),
      filter: mock(() => filterChain),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => queryChain),
        insert: mock(() => Promise.resolve("uf-123" as Id<"userFiles">)),
      } as any,
    });

    const result = await createUserFileEntriesHandler(ctx as MutationCtx, {
      userId,
      messageId,
      conversationId,
      attachments: [
        {
          type: "image",
          url: "",
          name: "test.png",
          size: 1024,
          storageId,
          mimeType: "image/png",
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.entryIds).toHaveLength(1);
    expect(ctx.db.insert).toHaveBeenCalledWith("userFiles", {
      userId,
      storageId,
      messageId,
      conversationId,
      type: "image",
      isGenerated: false,
      name: "test.png",
      size: 1024,
      mimeType: "image/png",
      createdAt: expect.any(Number),
      url: "",
      content: undefined,
      thumbnail: undefined,
      textFileId: undefined,
      extractedText: undefined,
      extractionError: undefined,
      generatedImageSource: undefined,
      generatedImageModel: undefined,
      generatedImagePrompt: undefined,
    });
  });

  test("skips attachments without storageId", async () => {
    const userId = "user-123" as Id<"users">;
    const messageId = "msg-123" as Id<"messages">;
    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => ({})),
        insert: mock(() => Promise.resolve("uf-123" as Id<"userFiles">)),
      } as any,
    });

    const result = await createUserFileEntriesHandler(ctx as MutationCtx, {
      userId,
      messageId,
      conversationId,
      attachments: [
        {
          type: "text",
          url: "",
          name: "test.txt",
          size: 512,
          content: "Test content",
          // No storageId
        },
      ],
    });

    expect(result.created).toBe(0);
    expect(result.entryIds).toHaveLength(0);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  test("skips duplicate entries", async () => {
    const userId = "user-123" as Id<"users">;
    const messageId = "msg-123" as Id<"messages">;
    const conversationId = "conv-123" as Id<"conversations">;
    const storageId = "storage-123" as Id<"_storage">;
    const existingId = "uf-existing" as Id<"userFiles">;

    const filterChain = {
      unique: mock(() =>
        Promise.resolve({
          _id: existingId,
          _creationTime: Date.now(),
          userId,
          storageId,
          messageId,
          conversationId,
          type: "image" as const,
          isGenerated: false,
          name: "test.png",
          size: 1024,
          createdAt: Date.now(),
        })
      ),
    };

    const queryChain = {
      withIndex: mock(() => queryChain),
      filter: mock(() => filterChain),
    };

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => queryChain),
        insert: mock(() => Promise.resolve("uf-new" as Id<"userFiles">)),
      } as any,
    });

    const result = await createUserFileEntriesHandler(ctx as MutationCtx, {
      userId,
      messageId,
      conversationId,
      attachments: [
        {
          type: "image",
          url: "",
          name: "test.png",
          size: 1024,
          storageId,
          mimeType: "image/png",
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.entryIds).toContain(existingId);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  test("creates separate entries for different messages with same storageId", async () => {
    const userId = "user-123" as Id<"users">;
    const messageId1 = "msg-123" as Id<"messages">;
    const messageId2 = "msg-456" as Id<"messages">;
    const conversationId = "conv-123" as Id<"conversations">;
    const storageId = "storage-123" as Id<"_storage">;

    // First call returns null (no existing entry), second call also returns null
    const filterChain = {
      unique: mock(() => Promise.resolve(null)),
    };

    const queryChain = {
      withIndex: mock(() => queryChain),
      filter: mock(() => filterChain),
    };

    const insertedIds = ["uf-1" as Id<"userFiles">, "uf-2" as Id<"userFiles">];
    let insertCount = 0;

    const ctx = makeConvexCtx({
      db: {
        query: mock(() => queryChain),
        insert: mock(() =>
          Promise.resolve(insertedIds[insertCount++] as Id<"userFiles">)
        ),
      } as any,
    });

    // Create entry for first message
    const result1 = await createUserFileEntriesHandler(ctx as MutationCtx, {
      userId,
      messageId: messageId1,
      conversationId,
      attachments: [
        {
          type: "image",
          url: "",
          name: "test.png",
          size: 1024,
          storageId,
          mimeType: "image/png",
        },
      ],
    });

    // Create entry for second message (same storageId)
    const result2 = await createUserFileEntriesHandler(ctx as MutationCtx, {
      userId,
      messageId: messageId2,
      conversationId,
      attachments: [
        {
          type: "image",
          url: "",
          name: "test.png",
          size: 1024,
          storageId,
          mimeType: "image/png",
        },
      ],
    });

    // Both should create new entries (not reuse)
    expect(result1.created).toBe(1);
    expect(result2.created).toBe(1);
    expect(result1.entryIds[0]).toBe("uf-1");
    expect(result2.entryIds[0]).toBe("uf-2");
    // Insert should be called twice, not reused
    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
  });
});

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

  function createMockUserFile(
    overrides: Partial<Doc<"userFiles">> = {}
  ): Doc<"userFiles"> {
    return {
      _id: "uf-123" as Id<"userFiles">,
      _creationTime: Date.now(),
      userId,
      storageId,
      messageId,
      conversationId,
      type: "image",
      isGenerated: false,
      name: "test.png",
      size: 1024,
      mimeType: "image/png",
      createdAt: Date.now(),
      ...overrides,
    };
  }

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
      userId,
      role: "user",
      content: "Test message",
      createdAt: Date.now(),
      attachments: [
        {
          type: "image",
          name: "test.png",
          size: 1024,
          storageId,
        },
      ],
      ...overrides,
    };
  }

  test("returns empty array when user not authenticated", async () => {
    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve(null)),
      },
    });

    await expect(
      getUserFilesHandler(ctx as QueryCtx, {
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).rejects.toThrow("Not authenticated");
  });

  test("returns user files with image attachments", async () => {
    const userFile = createMockUserFile();
    const conversation = createMockConversation();
    const message = createMockMessage();

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      paginate: mock(() =>
        Promise.resolve({
          page: [userFile],
          isDone: true,
          continueCursor: "",
        })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        get: mock((id: Id<any>) => {
          if (id === conversationId) {
            return Promise.resolve(conversation);
          }
          if (id === messageId) {
            return Promise.resolve(message);
          }
          return Promise.resolve(null);
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

    const result = await getUserFilesHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 50, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].storageId).toBe(storageId);
    expect(result.page[0].attachment.type).toBe("image");
    expect(result.page[0].conversationName).toBe("Test Conversation");
    expect(result.isDone).toBe(true);
  });

  test("filters files by type", async () => {
    const pdfFile = createMockUserFile({
      _id: "uf-pdf" as Id<"userFiles">,
      storageId: "storage-pdf" as Id<"_storage">,
      type: "pdf",
      name: "test.pdf",
      size: 2048,
      mimeType: "application/pdf",
    });

    const conversation = createMockConversation();
    const message = createMockMessage({
      attachments: [
        {
          type: "pdf",
          name: "test.pdf",
          size: 2048,
          storageId: "storage-pdf" as Id<"_storage">,
        },
      ],
    });

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      paginate: mock(() =>
        Promise.resolve({
          page: [pdfFile],
          isDone: true,
          continueCursor: "",
        })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        get: mock((id: Id<any>) => {
          if (id === conversationId) {
            return Promise.resolve(conversation);
          }
          if (id === messageId) {
            return Promise.resolve(message);
          }
          return Promise.resolve(null);
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: "storage-pdf" as Id<"_storage">,
              _creationTime: Date.now(),
              sha256: "abc123",
              size: 2048,
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
      paginationOpts: { numItems: 50, cursor: null },
      fileType: "pdf",
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].attachment.type).toBe("pdf");
  });

  test("excludes generated images when includeGenerated is false", async () => {
    const uploadedFile = createMockUserFile({
      _id: "uf-uploaded" as Id<"userFiles">,
      storageId: "storage-uploaded" as Id<"_storage">,
      name: "uploaded.png",
      size: 2048,
      isGenerated: false,
    });

    const conversation = createMockConversation();
    const message = createMockMessage({
      attachments: [
        {
          type: "image",
          name: "uploaded.png",
          size: 2048,
          storageId: "storage-uploaded" as Id<"_storage">,
        },
      ],
    });

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      paginate: mock(() =>
        Promise.resolve({
          page: [uploadedFile],
          isDone: true,
          continueCursor: "",
        })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        get: mock((id: Id<any>) => {
          if (id === conversationId) {
            return Promise.resolve(conversation);
          }
          if (id === messageId) {
            return Promise.resolve(message);
          }
          return Promise.resolve(null);
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: "storage-uploaded" as Id<"_storage">,
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
      paginationOpts: { numItems: 50, cursor: null },
      fileType: "image",
      includeGenerated: false,
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].attachment.name).toBe("uploaded.png");
  });

  test("respects limit parameter", async () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      createMockUserFile({
        _id: `uf-${i}` as Id<"userFiles">,
        storageId: `storage-${i}` as Id<"_storage">,
        name: `test-${i}.png`,
      })
    );

    const conversation = createMockConversation();
    const message = createMockMessage();

    const queryChain = {
      withIndex: mock(() => queryChain),
      order: mock(() => queryChain),
      paginate: mock(() =>
        Promise.resolve({
          page: files.slice(0, 3),
          isDone: false,
          continueCursor: "cursor-3",
        })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        get: mock((id: Id<any>) => {
          if (id === conversationId) {
            return Promise.resolve(conversation);
          }
          if (id === messageId) {
            return Promise.resolve(message);
          }
          return Promise.resolve(null);
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

    const result = await getUserFilesHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 3, cursor: null },
    });

    expect(result.page.length).toBeLessThanOrEqual(3);
    expect(result.isDone).toBe(false);
  });

  test("handles text attachments without storageId", async () => {
    const textFile = createMockUserFile({
      _id: "uf-text" as Id<"userFiles">,
      storageId: "storage-text" as Id<"_storage">,
      type: "text",
      name: "test.txt",
      size: 512,
      mimeType: "text/plain",
    });

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
      paginate: mock(() =>
        Promise.resolve({
          page: [textFile],
          isDone: true,
          continueCursor: "",
        })
      ),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        get: mock((id: Id<any>) => {
          if (id === conversationId) {
            return Promise.resolve(conversation);
          }
          if (id === messageId) {
            return Promise.resolve(message);
          }
          return Promise.resolve(null);
        }),
        system: {
          get: mock(() =>
            Promise.resolve({
              _id: "storage-text" as Id<"_storage">,
              _creationTime: Date.now(),
              sha256: "abc123",
              size: 512,
              contentType: "text/plain",
            })
          ),
        },
      } as any,
      storage: {
        getUrl: mock(() => Promise.resolve("https://example.com/test.txt")),
      },
    });

    const result = await getUserFilesHandler(ctx as QueryCtx, {
      paginationOpts: { numItems: 50, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].attachment.type).toBe("text");
  });
});

describe("fileStorage: deleteMultipleFiles", () => {
  const userId = "user-123" as Id<"users">;
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
    const userFiles = [
      {
        _id: "uf-1" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: storageIds[0],
        messageId: "msg-123" as Id<"messages">,
        conversationId: "conv-123" as Id<"conversations">,
        type: "image" as const,
        isGenerated: false,
        name: "test1.png",
        size: 1024,
        createdAt: Date.now(),
      },
      {
        _id: "uf-2" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: storageIds[1],
        messageId: "msg-123" as Id<"messages">,
        conversationId: "conv-123" as Id<"conversations">,
        type: "image" as const,
        isGenerated: false,
        name: "test2.png",
        size: 2048,
        createdAt: Date.now(),
      },
    ];

    // Create a query chain that handles multiple calls during ownership verification
    let callCount = 0;
    const queryChain = {
      withIndex: mock(() => queryChain),
      unique: mock(() => {
        const file = userFiles[callCount];
        callCount++;
        return Promise.resolve(file || null);
      }),
      collect: mock(() => Promise.resolve([])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        delete: mock(() => Promise.resolve(undefined)),
      } as any,
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
    const conversationId = "conv-123" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;

    const userFiles = [
      {
        _id: "uf-1" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: storageIds[0],
        messageId,
        conversationId,
        type: "image" as const,
        isGenerated: false,
        name: "test1.png",
        size: 1024,
        createdAt: Date.now(),
      },
      {
        _id: "uf-2" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: storageIds[1],
        messageId,
        conversationId,
        type: "image" as const,
        isGenerated: false,
        name: "test2.png",
        size: 2048,
        createdAt: Date.now(),
      },
    ];

    const message = {
      _id: messageId,
      _creationTime: Date.now(),
      conversationId,
      userId,
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

    // Track ownership verification calls and DB deletion calls
    let ownershipCheckCount = 0;
    let dbDeletionCount = 0;

    const queryChain = {
      withIndex: mock(() => queryChain),
      unique: mock(() => {
        // Return owned files during ownership verification phase
        if (ownershipCheckCount < storageIds.length) {
          const file = userFiles[ownershipCheckCount];
          ownershipCheckCount++;
          return Promise.resolve(file || null);
        }
        // Return owned files during DB deletion verification phase
        if (dbDeletionCount < storageIds.length) {
          const file = userFiles[dbDeletionCount];
          dbDeletionCount++;
          return Promise.resolve(file || null);
        }
        return Promise.resolve(null);
      }),
      collect: mock(() => Promise.resolve([message])),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
        patch: mock(() => Promise.resolve(undefined)),
        delete: mock(() => Promise.resolve(undefined)),
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
    const conversationId = "conv-123" as Id<"conversations">;
    const otherConversationId = "conv-456" as Id<"conversations">;
    const messageId = "msg-123" as Id<"messages">;
    const otherMessageId = "msg-456" as Id<"messages">;

    const userFiles = [
      {
        _id: "uf-1" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: storageIds[0],
        messageId,
        conversationId,
        type: "image" as const,
        isGenerated: false,
        name: "test.png",
        size: 1024,
        createdAt: Date.now(),
      },
      {
        _id: "uf-2" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId: otherUserId,
        storageId: storageIds[1],
        messageId: otherMessageId,
        conversationId: otherConversationId,
        type: "image" as const,
        isGenerated: false,
        name: "other.png",
        size: 2048,
        createdAt: Date.now(),
      },
    ];

    const userMessage = {
      _id: messageId,
      _creationTime: Date.now(),
      conversationId,
      userId,
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

    // Track ownership verification calls and DB deletion calls
    let ownershipCheckCount = 0;
    let dbDeletionCount = 0;
    let isQueryingMessages = false;

    const queryChain = {
      withIndex: mock(() => queryChain),
      unique: mock(() => {
        // Return owned files during ownership verification phase
        if (ownershipCheckCount < storageIds.length) {
          const file = userFiles.find(
            f =>
              f.storageId ===
                storageIds[ownershipCheckCount % storageIds.length] &&
              f.userId === userId
          );
          ownershipCheckCount++;
          return Promise.resolve(file || null);
        }
        // Return owned files during DB deletion verification phase
        if (dbDeletionCount < storageIds.length) {
          const file = userFiles.find(
            f =>
              f.storageId === storageIds[dbDeletionCount % storageIds.length] &&
              f.userId === userId
          );
          dbDeletionCount++;
          return Promise.resolve(file || null);
        }
        return Promise.resolve(null);
      }),
      collect: mock(() => {
        // Return messages if querying for messages, otherwise userFiles
        if (isQueryingMessages) {
          return Promise.resolve([userMessage]);
        }
        return Promise.resolve(userFiles.filter(f => f.userId === userId));
      }),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock((table: string) => {
          isQueryingMessages = table === "messages";
          return queryChain;
        }),
        patch: mock(() => Promise.resolve(undefined)),
        delete: mock(() => Promise.resolve(undefined)),
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
    const userFiles = [
      {
        _id: "uf-1" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: "storage-1" as Id<"_storage">,
        messageId: "msg-1" as Id<"messages">,
        conversationId,
        type: "image" as const,
        isGenerated: false,
        name: "test1.png",
        size: 1024,
        createdAt: Date.now(),
      },
      {
        _id: "uf-2" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: "storage-2" as Id<"_storage">,
        messageId: "msg-1" as Id<"messages">,
        conversationId,
        type: "pdf" as const,
        isGenerated: false,
        name: "test.pdf",
        size: 2048,
        createdAt: Date.now(),
      },
      {
        _id: "uf-3" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: "storage-3" as Id<"_storage">,
        messageId: "msg-2" as Id<"messages">,
        conversationId,
        type: "text" as const,
        isGenerated: false,
        name: "test.txt",
        size: 512,
        createdAt: Date.now(),
      },
    ];

    const queryChain = {
      withIndex: mock(() => queryChain),
      collect: mock(() => Promise.resolve(userFiles)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
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
    const userFiles = [
      {
        _id: "uf-1" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: "storage-1" as Id<"_storage">,
        messageId: "msg-1" as Id<"messages">,
        conversationId,
        type: "image" as const,
        isGenerated: true,
        name: "generated.png",
        size: 2048,
        createdAt: Date.now(),
      },
      {
        _id: "uf-2" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: "storage-2" as Id<"_storage">,
        messageId: "msg-1" as Id<"messages">,
        conversationId,
        type: "image" as const,
        isGenerated: false,
        name: "uploaded.png",
        size: 1024,
        createdAt: Date.now(),
      },
    ];

    const queryChain = {
      withIndex: mock(() => queryChain),
      collect: mock(() => Promise.resolve(userFiles)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
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
    const _otherUserId = "user-456" as Id<"users">;

    const userFiles = [
      {
        _id: "uf-1" as Id<"userFiles">,
        _creationTime: Date.now(),
        userId,
        storageId: "storage-1" as Id<"_storage">,
        messageId: "msg-1" as Id<"messages">,
        conversationId,
        type: "image" as const,
        isGenerated: false,
        name: "user.png",
        size: 1024,
        createdAt: Date.now(),
      },
    ];

    const queryChain = {
      withIndex: mock(() => queryChain),
      collect: mock(() => Promise.resolve(userFiles)),
    };

    const ctx = makeConvexCtx({
      auth: {
        getUserIdentity: mock(() => Promise.resolve({ subject: userId })),
      },
      db: {
        query: mock(() => queryChain),
      } as any,
    });

    const result = await getUserFileStatsHandler(ctx as QueryCtx);

    expect(result.totalFiles).toBe(1);
    expect(result.totalSize).toBe(1024);
    expect(result.typeCounts.image).toBe(1);
  });
});
