import { useShallow } from "zustand/shallow";
import {
  type ChatInputStoreState,
  useChatInputStore,
} from "@/stores/chat-input-store";

export const selectReasoningConfig = (state: ChatInputStoreState) =>
  [state.reasoningConfig, state.setReasoningConfig] as const;

export function useReasoningConfig() {
  return useChatInputStore(useShallow(selectReasoningConfig));
}
