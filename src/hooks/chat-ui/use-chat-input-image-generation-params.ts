import { IMAGE_GENERATION_DEFAULTS } from "@shared/constants";
import { useCallback, useState } from "react";
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

  // Derive negativePromptEnabled from imageParams instead of using state
  const negativePromptEnabled = !!(
    imageParams.negativePrompt && imageParams.negativePrompt.trim().length > 0
  );

  const handleNegativePromptEnabledChange = useCallback((enabled: boolean) => {
    if (!enabled) {
      setImageParams(prev => ({ ...prev, negativePrompt: "" }));
    }
  }, []);

  const handleNegativePromptValueChange = useCallback((value: string) => {
    setImageParams(prev => ({ ...prev, negativePrompt: value }));
  }, []);

  const resetImageParams = useCallback(() => {
    setImageParams(prev => ({ ...prev, negativePrompt: "" }));
  }, []);

  return {
    generationMode,
    imageParams,
    negativePromptEnabled,
    setGenerationMode,
    setImageParams,
    handleNegativePromptEnabledChange,
    handleNegativePromptValueChange,
    resetImageParams,
  };
}
