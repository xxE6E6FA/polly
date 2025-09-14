import { beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test/helpers";

type Attachment = {
  type: "image" | "pdf" | "text";
  url: string;
  name: string;
  size: number;
  content?: string;
  thumbnail?: string;
  storageId?: Id<"_storage">;
  mimeType?: string;
  textFileId?: Id<"_storage">;
  extractedText?: string;
  extractionError?: string;
  generatedImage?: {
    isGenerated: boolean;
    source: string;
  };
};

// Silence logger in tests
vi.mock("./lib/logger", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("messages.addAttachments de-duplication", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips duplicate generated-image URLs across multiple calls", async () => {
    const t = await makeConvexTest();

    const userId = await t.db.insert("users", { name: "Test" });
    const now = Date.now();
    const conversationId = await t.db.insert("conversations", {
      title: "Test convo",
      userId,
      createdAt: now,
      updatedAt: now,
    });

    const messageId = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      isMainBranch: true,
      createdAt: now,
    });

    const genA = {
      type: "image" as const,
      url: "https://example.com/a.jpg",
      name: "a.jpg",
      size: 1,
      generatedImage: { isGenerated: true, source: "replicate" },
    };

    const genB = {
      type: "image" as const,
      url: "https://example.com/b.jpg",
      name: "b.jpg",
      size: 1,
      generatedImage: { isGenerated: true, source: "replicate" },
    };

    // First write stores A
    await t.mutation(internal.messages.addAttachments, {
      messageId,
      attachments: [genA],
    });

    // Second write attempts to store A again and B
    await t.mutation(internal.messages.addAttachments, {
      messageId,
      attachments: [genA, genB],
    });

    const message = await t.db.get(messageId);
    const urls = (message?.attachments || [])
      .filter((a: Attachment) => a.type === "image")
      .map((a: Attachment) => a.url);

    // Should only contain A and B once each
    expect(urls.sort()).toEqual([genA.url, genB.url].sort());
  });

  it("deduplicates repeated URLs within a single call", async () => {
    const t = await makeConvexTest();

    const userId = await t.db.insert("users", { name: "Test" });
    const now = Date.now();
    const conversationId = await t.db.insert("conversations", {
      title: "Test convo",
      userId,
      createdAt: now,
      updatedAt: now,
    });

    const messageId = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      isMainBranch: true,
      createdAt: now,
    });

    const genA = {
      type: "image" as const,
      url: "https://example.com/a.jpg",
      name: "a.jpg",
      size: 1,
      generatedImage: { isGenerated: true, source: "replicate" },
    };

    await t.mutation(internal.messages.addAttachments, {
      messageId,
      attachments: [genA, { ...genA }, { ...genA }],
    });

    const message = await t.db.get(messageId);
    const urls = (message?.attachments || [])
      .filter((a: Attachment) => a.type === "image")
      .map((a: Attachment) => a.url);

    expect(urls).toEqual([genA.url]);
  });
});
