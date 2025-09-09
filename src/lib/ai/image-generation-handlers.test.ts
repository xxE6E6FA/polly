import type { Id } from "@convex/_generated/dataModel";
import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import {
  handleImageGeneration,
  retryImageGeneration,
} from "./image-generation-handlers";

describe("image-generation-handlers", () => {
  it("handleImageGeneration creates assistant message and triggers action", async () => {
    const mutation = vi.fn().mockResolvedValue("msg-1");
    const action = vi.fn().mockResolvedValue(undefined);
    const convexClient = { mutation, action } as unknown as ConvexReactClient;

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

    // Created assistant message with imageGeneration metadata
    expect(mutation).toHaveBeenCalled();
    const [, createPayload] = mutation.mock.calls[0];
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

  it("handleImageGeneration surfaces friendly error for missing Replicate API key", async () => {
    const mutation = vi.fn().mockResolvedValue("msg-1");
    const action = vi
      .fn()
      .mockRejectedValue(new ConvexError("No Replicate API key configured"));
    const convexClient = { mutation, action } as unknown as ConvexReactClient;

    await expect(
      handleImageGeneration(
        convexClient,
        "conv-1" as Id<"conversations">,
        "user-msg" as Id<"messages">,
        "cat",
        { model: "m", aspectRatio: "1:1", steps: 1, guidanceScale: 1, count: 1 }
      )
    ).rejects.toThrow(
      /No Replicate API key found\. Please add one in Settings → API Keys\./
    );
  });

  it("handleImageGeneration rethrows other errors with message", async () => {
    const mutation = vi.fn().mockResolvedValue("msg-1");
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    const convexClient = { mutation, action } as unknown as ConvexReactClient;

    await expect(
      handleImageGeneration(
        convexClient,
        "conv-1" as Id<"conversations">,
        "user-msg" as Id<"messages">,
        "cat",
        { model: "m", aspectRatio: "1:1", steps: 1, guidanceScale: 1, count: 1 }
      )
    ).rejects.toThrow(/boom/);
  });

  it("retryImageGeneration calls action with original params", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const convexClient = { action } as unknown as ConvexReactClient;

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
