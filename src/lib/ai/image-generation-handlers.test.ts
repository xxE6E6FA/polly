import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";

const apiMock = {
  messages: { create: "messages:create" },
  conversations: { setStreaming: "conversations:setStreaming" },
  ai: {
    replicate: { generateImage: "ai:replicate:generateImage" },
  },
} as const;

mock.module("@convex/_generated/api", () => ({ api: apiMock }));

let handleImageGeneration: typeof import("./image-generation-handlers").handleImageGeneration;
let retryImageGeneration: typeof import("./image-generation-handlers").retryImageGeneration;

beforeAll(async () => {
  const mod = (await import(
    "./image-generation-handlers?bun-real"
  )) as typeof import("./image-generation-handlers");
  handleImageGeneration = mod.handleImageGeneration;
  retryImageGeneration = mod.retryImageGeneration;
});

afterAll(() => {
  mock.restore();
});

describe("image-generation-handlers", () => {
  test("handleImageGeneration creates assistant message and triggers action", async () => {
    const mutation = mock().mockResolvedValue("msg-1");
    const action = mock().mockResolvedValue(undefined);
    const convexClient = {
      mutation,
      action,
    } as unknown as ConvexReactClient;

    const params = {
      model: "black-forest-labs/flux",
      prompt: "A cat",
      aspectRatio: "1:1" as const,
      steps: 28,
      guidanceScale: 3.5,
      seed: 123,
      negativePrompt: "",
      count: 2,
    };

    await handleImageGeneration(
      convexClient,
      "conv-1" as Id<"conversations">,
      "user-msg" as Id<"messages">,
      params.prompt,
      params
    );

    expect(mutation).toHaveBeenCalledTimes(2);

    const [createCall, streamingCall] = mutation.mock.calls;
    const [, createPayload] = createCall;
    expect(createPayload).toMatchObject({
      conversationId: "conv-1",
      role: "assistant",
      status: "streaming",
      model: "replicate",
      provider: "replicate",
      imageGeneration: {
        status: "starting",
        metadata: {
          model: params.model,
          prompt: params.prompt,
          params: {
            aspectRatio: params.aspectRatio,
            steps: params.steps,
            guidanceScale: params.guidanceScale,
            seed: params.seed,
            negativePrompt: params.negativePrompt,
            count: params.count,
          },
        },
      },
    });

    // Conversation marked as streaming immediately
    const [, streamingPayload] = streamingCall;
    expect(streamingPayload).toEqual({
      conversationId: "conv-1",
      isStreaming: true,
    });

    // Action called with returned assistant message id and params
    expect(action).toHaveBeenCalled();
    const [, actionPayload] = action.mock.calls[0];
    expect(actionPayload).toEqual({
      conversationId: "conv-1",
      messageId: "msg-1",
      prompt: params.prompt,
      model: params.model,
      params: {
        aspectRatio: params.aspectRatio,
        steps: params.steps,
        guidanceScale: params.guidanceScale,
        seed: params.seed,
        negativePrompt: params.negativePrompt,
        count: params.count,
      },
    });
  });

  test("handleImageGeneration surfaces friendly error for missing Replicate API key", async () => {
    const mutation = mock().mockResolvedValue("msg-1");
    const action = mock().mockRejectedValue(
      new ConvexError("No Replicate API key configured")
    );
    const convexClient = {
      mutation,
      action,
    } as unknown as ConvexReactClient;

    await expect(
      handleImageGeneration(
        convexClient,
        "conv-1" as Id<"conversations">,
        "user-msg" as Id<"messages">,
        "cat",
        {
          prompt: "cat",
          model: "m",
          aspectRatio: "1:1",
          steps: 1,
          guidanceScale: 1,
          count: 1,
        }
      )
    ).rejects.toThrow(
      /No Replicate API key found\. Please add one in Settings → API Keys\./
    );
  });

  test("handleImageGeneration rethrows other errors with message", async () => {
    const mutation = mock().mockResolvedValue("msg-1");
    const action = mock().mockRejectedValue(new Error("boom"));
    const convexClient = {
      mutation,
      action,
    } as unknown as ConvexReactClient;

    await expect(
      handleImageGeneration(
        convexClient,
        "conv-1" as Id<"conversations">,
        "user-msg" as Id<"messages">,
        "cat",
        {
          prompt: "cat",
          model: "m",
          aspectRatio: "1:1",
          steps: 1,
          guidanceScale: 1,
          count: 1,
        }
      )
    ).rejects.toThrow(/boom/);
  });

  test("retryImageGeneration calls action with original params", async () => {
    const mutation = mock().mockResolvedValue(undefined);
    const action = mock().mockResolvedValue(undefined);
    const convexClient = {
      action,
      mutation,
    } as unknown as ConvexReactClient;

    await retryImageGeneration(
      convexClient,
      "conv-2" as Id<"conversations">,
      "msg-2" as Id<"messages">,
      {
        prompt: "p",
        model: "m",
        params: { aspectRatio: "16:9", steps: 20, guidanceScale: 4, count: 1 },
      }
    );

    expect(mutation).toHaveBeenCalledTimes(1);
    const [, streamingPayload] = mutation.mock.calls[0];
    expect(streamingPayload).toEqual({
      conversationId: "conv-2",
      isStreaming: true,
    });

    const [, payload] = action.mock.calls[0];
    expect(payload).toEqual({
      conversationId: "conv-2",
      messageId: "msg-2",
      prompt: "p",
      model: "m",
      params: { aspectRatio: "16:9", steps: 20, guidanceScale: 4, count: 1 },
    });
  });
});
