import { useChatInputStore } from "@/stores/chat-input-store";

export function useGenerationMode() {
  const mode = useChatInputStore(s => s.generationMode);
  const setMode = useChatInputStore(s => s.setGenerationMode);
  return [mode, setMode] as const;
}

export function useImageParams() {
  const params = useChatInputStore(s => s.imageParams);
  const setParams = useChatInputStore(s => s.setImageParams);
  const negativePromptEnabled = useChatInputStore(s => s.negativePromptEnabled);
  const setNegativePromptEnabled = useChatInputStore(
    s => s.setNegativePromptEnabled
  );
  return {
    params,
    setParams,
    negativePromptEnabled,
    setNegativePromptEnabled,
  } as const;
}
