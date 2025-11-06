import { describe, expect, test } from "bun:test";
import type { Doc } from "convex/_generated/dataModel";
import { mapServerMessageToChatMessage } from "./use-chat";

describe("mapServerMessageToChatMessage", () => {
  test("converts Convex message to chat message", () => {
    const serverMessage = {
      // biome-ignore lint/style/useNamingConvention: Convex system field
      _id: "msg-1",
      conversationId: "conv-1",
      role: "assistant",
      content: "Hello",
      status: "completed",
      statusText: "done",
      reasoning: "chain",
      model: "model-x",
      provider: "openai",
      parentId: undefined,
      isMainBranch: true,
      sourceConversationId: undefined,
      useWebSearch: false,
      attachments: [],
      citations: [],
      metadata: { custom: true },
      imageGeneration: {
        prompt: "A cat",
        status: "processing",
      },
      error: undefined,
      createdAt: 123,
    } as unknown as Doc<"messages">;

    const result = mapServerMessageToChatMessage(serverMessage);
    expect(result).toMatchObject({
      id: "msg-1",
      role: "assistant",
      content: "Hello",
      status: "completed",
      metadata: { custom: true },
      imageGeneration: {
        prompt: "A cat",
        status: "processing",
      },
      createdAt: 123,
    });
  });

  test("handles missing optional fields", () => {
    const serverMessage = {
      // biome-ignore lint/style/useNamingConvention: Convex system field
      _id: "msg-2",
      conversationId: "conv-1",
      role: "user",
      content: "Hi",
      isMainBranch: false,
      attachments: undefined,
      citations: undefined,
      createdAt: 99,
    } as unknown as Doc<"messages">;

    const result = mapServerMessageToChatMessage(serverMessage);
    expect(result.error).toBeUndefined();
    expect(result.attachments).toBeUndefined();
    expect(result.imageGeneration).toBeUndefined();
  });
});
