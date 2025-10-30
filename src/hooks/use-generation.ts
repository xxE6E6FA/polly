import { useShallow } from "zustand/shallow";
import { useChatInputStore } from "@/stores/chat-input-store";

export function useGenerationMode() {
  return useChatInputStore(
    useShallow(s => [s.generationMode, s.setGenerationMode] as const)
  );
}

export function useImageParams() {
  return useChatInputStore(
    useShallow(s => ({
      params: s.imageParams,
      setParams: s.setImageParams,
      negativePromptEnabled: s.negativePromptEnabled,
      setNegativePromptEnabled: s.setNegativePromptEnabled,
    }))
  );
}
