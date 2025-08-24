import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { useCallback, useEffect, useState } from "react";
import type { GenerationMode, ImageGenerationParams } from "@/types";

export function useChatInputImageGenerationParams() {
  const [generationMode, setGenerationMode] = useState<GenerationMode>("text");

  const [imageParams, setImageParams] = useState<ImageGenerationParams>({
    prompt: "",
    model: IMAGE_GENERATION_DEFAULTS.MODEL,
    aspectRatio: IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO,
    steps: IMAGE_GENERATION_DEFAULTS.STEPS,
    guidanceScale: IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE,
    count: IMAGE_GENERATION_DEFAULTS.COUNT,
    negativePrompt: IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT,
  });

  const [negativePromptEnabled, setNegativePromptEnabled] = useState(false);

  // Sync negative prompt toggle state with imageParams.negativePrompt
  useEffect(() => {
    const hasNegativePrompt =
      imageParams.negativePrompt &&
      imageParams.negativePrompt.trim().length > 0;
    setNegativePromptEnabled(!!hasNegativePrompt);
  }, [imageParams.negativePrompt]);

  const handleNegativePromptEnabledChange = useCallback((enabled: boolean) => {
    setNegativePromptEnabled(enabled);
    if (!enabled) {
      setImageParams(prev => ({ ...prev, negativePrompt: "" }));
    }
  }, []);

  const handleNegativePromptValueChange = useCallback((value: string) => {
    setImageParams(prev => ({ ...prev, negativePrompt: value }));
  }, []);

  const resetImageParams = useCallback(() => {
    setImageParams(prev => ({ ...prev, negativePrompt: "" }));
    setNegativePromptEnabled(false);
  }, []);

  return {
    generationMode,
    imageParams,
    negativePromptEnabled,
    setGenerationMode,
    setImageParams,
    setNegativePromptEnabled,
    handleNegativePromptEnabledChange,
    handleNegativePromptValueChange,
    resetImageParams,
  };
}
