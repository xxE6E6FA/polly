import { describe, expect, test } from "bun:test";
import { internal } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("messages.updateImageGeneration streaming flag", () => {
  test("clears conversation isStreaming when image generation reaches a terminal status", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });
    const conversationId = await t.db.insert("conversations", {
      title: "Image conversation",
      userId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const messageId = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      model: "replicate",
      provider: "replicate",
      isMainBranch: true,
      createdAt: Date.now(),
      imageGeneration: { status: "starting" },
    });

    await t.runMutation(internal.messages.updateImageGeneration, {
      messageId,
      status: "succeeded",
      output: ["https://example.com/image.png"],
    });

    const conversation = await t.db.get(conversationId);
    expect(conversation?.isStreaming).toBe(false);
  });

  test("keeps conversation isStreaming true for in-progress statuses", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
    });
    const conversationId = await t.db.insert("conversations", {
      title: "Image conversation",
      userId,
      isStreaming: true,
      isArchived: false,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const messageId = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      model: "replicate",
      provider: "replicate",
      isMainBranch: true,
      createdAt: Date.now(),
      imageGeneration: { status: "starting" },
    });

    await t.runMutation(internal.messages.updateImageGeneration, {
      messageId,
      status: "processing",
    });

    const conversation = await t.db.get(conversationId);
    expect(conversation?.isStreaming).toBe(true);
  });
});
