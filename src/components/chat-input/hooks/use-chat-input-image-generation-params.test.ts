import { describe, expect, test } from "bun:test";
import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";
import { useChatInputImageGenerationParams } from "./use-chat-input-image-generation-params";

describe("useChatInputImageGenerationParams", () => {
  test("initializes with defaults and tracks negative prompt state", () => {
    const { result } = renderHook(() => useChatInputImageGenerationParams());

    expect(result.current.generationMode).toBe("text");
    expect(result.current.imageParams).toMatchObject({
      model: IMAGE_GENERATION_DEFAULTS.MODEL,
      aspectRatio: IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO,
      steps: IMAGE_GENERATION_DEFAULTS.STEPS,
      guidanceScale: IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE,
      count: IMAGE_GENERATION_DEFAULTS.COUNT,
      negativePrompt: IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT,
    });
    expect(result.current.negativePromptEnabled).toBe(false);

    // Set a negative prompt toggles flag true
    act(() =>
      result.current.setImageParams(p => ({ ...p, negativePrompt: "no cats" }))
    );
    expect(result.current.negativePromptEnabled).toBe(true);

    // Explicitly disable clears negativePrompt
    act(() => result.current.handleNegativePromptEnabledChange(false));
    expect(result.current.negativePromptEnabled).toBe(false);
    expect(result.current.imageParams.negativePrompt).toBe("");

    // Changing negative prompt value updates params
    act(() => result.current.handleNegativePromptValueChange("no dogs"));
    expect(result.current.imageParams.negativePrompt).toBe("no dogs");

    // Reset clears negative prompt and disables flag
    act(() => result.current.resetImageParams());
    expect(result.current.negativePromptEnabled).toBe(false);
    expect(result.current.imageParams.negativePrompt).toBe("");
  });
});
