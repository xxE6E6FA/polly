import { useChatInputStore } from "@/stores/chat-input-store";

export function useReasoningConfig() {
  const config = useChatInputStore(s => s.reasoningConfig);
  const setReasoningConfig = useChatInputStore(s => s.setReasoningConfig);
  return [config, setReasoningConfig] as const;
}
