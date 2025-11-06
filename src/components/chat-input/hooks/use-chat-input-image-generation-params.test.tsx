import { describe, expect, test } from "bun:test";
import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChatInputImageGenerationParams } from "@/components/chat-input/hooks/use-chat-input-image-generation-params";

describe("useChatInputImageGenerationParams", () => {
  test("initializes with image generation defaults", async () => {
    const { result } = renderHook(() => useChatInputImageGenerationParams());

    await waitFor(() => {
      expect(result.current.generationMode).toBe("text");
      expect(result.current.imageParams).toEqual({
        prompt: "",
        model: IMAGE_GENERATION_DEFAULTS.MODEL,
        aspectRatio: IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO,
        steps: IMAGE_GENERATION_DEFAULTS.STEPS,
        guidanceScale: IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE,
        count: IMAGE_GENERATION_DEFAULTS.COUNT,
        negativePrompt: IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT,
      });
      expect(result.current.negativePromptEnabled).toBe(false);
    });
  });

  test("enables negative prompt when value provided", async () => {
    const { result } = renderHook(() => useChatInputImageGenerationParams());

    act(() => {
      result.current.handleNegativePromptValueChange("no crowns");
    });

    await waitFor(() => {
      expect(result.current.imageParams.negativePrompt).toBe("no crowns");
    });
    expect(result.current.negativePromptEnabled).toBe(true);
  });

  test("disabling negative prompt clears value and flag", async () => {
    const { result } = renderHook(() => useChatInputImageGenerationParams());

    act(() => {
      result.current.handleNegativePromptValueChange("dramatic lighting");
    });

    await waitFor(() => {
      expect(result.current.negativePromptEnabled).toBe(true);
    });

    act(() => {
      result.current.handleNegativePromptEnabledChange(false);
    });

    await waitFor(() => {
      expect(result.current.imageParams.negativePrompt).toBe("");
      expect(result.current.negativePromptEnabled).toBe(false);
    });
  });

  test("resetImageParams clears negative prompt state", async () => {
    const { result } = renderHook(() => useChatInputImageGenerationParams());

    act(() => {
      result.current.setImageParams(prev => ({
        ...prev,
        negativePrompt: "low contrast",
      }));
    });

    await waitFor(() => {
      expect(result.current.negativePromptEnabled).toBe(true);
    });

    act(() => {
      result.current.resetImageParams();
    });

    await waitFor(() => {
      expect(result.current.imageParams.negativePrompt).toBe("");
      expect(result.current.negativePromptEnabled).toBe(false);
    });
  });
});
