import { useShallow } from "zustand/shallow";
import { useChatInputStore } from "@/stores/chat-input-store";

export function useReasoningConfig() {
  return useChatInputStore(
    useShallow(s => [s.reasoningConfig, s.setReasoningConfig] as const)
  );
}
