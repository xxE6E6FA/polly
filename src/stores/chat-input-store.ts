import type { Id } from "@convex/_generated/dataModel";
import { create } from "zustand";

type ConversationKey = string; // conversationId string or "global"

// Persona slice — consider adding more slices (temperature, reasoning) later
export type ChatInputPersonaState = {
  selectedByKey: Record<ConversationKey, Id<"personas"> | null>;
  setSelectedPersonaId: (
    key: ConversationKey,
    id: Id<"personas"> | null
  ) => void;
  clearKey: (key: ConversationKey) => void;
  clearAll: () => void;
};

// Temperature slice
export type ChatInputTemperatureState = {
  temperatureByKey: Record<ConversationKey, number | undefined>;
  setTemperature: (key: ConversationKey, value: number | undefined) => void;
  clearTemperatureKey: (key: ConversationKey) => void;
  clearAllTemperature: () => void;
};

export const GLOBAL_CHAT_INPUT_KEY = "global" as const;

// Centralized key helper used across the app
export function getChatKey(conversationId?: string | null): ConversationKey {
  return conversationId ?? GLOBAL_CHAT_INPUT_KEY;
}

type ChatInputStore = ChatInputPersonaState &
  ChatInputTemperatureState & {
    // Models slice
    selectedModel: import("@/types").AIModel | null;
    setSelectedModel: (model: import("@/types").AIModel | null) => void;
    // Generation & image params
    generationMode: import("@/types").GenerationMode;
    imageParams: import("@/types").ImageGenerationParams;
    negativePromptEnabled: boolean;
    setGenerationMode: (mode: import("@/types").GenerationMode) => void;
    setImageParams: (
      value:
        | import("@/types").ImageGenerationParams
        | ((
            prev: import("@/types").ImageGenerationParams
          ) => import("@/types").ImageGenerationParams)
    ) => void;
    setNegativePromptEnabled: (enabled: boolean) => void;
    // Reasoning config
    reasoningConfig: import("@/types").ReasoningConfig;
    setReasoningConfig: (cfg: import("@/types").ReasoningConfig) => void;
  };

export const useChatInputStore = create<
  ChatInputStore & {
    attachmentsByKey: Record<ConversationKey, import("@/types").Attachment[]>;
    setAttachments: (
      key: ConversationKey,
      value:
        | import("@/types").Attachment[]
        | ((
            prev: import("@/types").Attachment[]
          ) => import("@/types").Attachment[])
    ) => void;
    clearAttachmentsKey: (key: ConversationKey) => void;
  }
>(set => ({
  // Models slice
  selectedModel: null,
  setSelectedModel: model => set({ selectedModel: model }),

  // Generation & image params
  generationMode: "text",
  imageParams: { prompt: "", model: "" },
  negativePromptEnabled: false,
  setGenerationMode: mode => set({ generationMode: mode }),
  setImageParams: value =>
    set(state => ({
      imageParams:
        typeof value === "function"
          ? (
              value as (
                prev: import("@/types").ImageGenerationParams
              ) => import("@/types").ImageGenerationParams
            )(state.imageParams)
          : value,
    })),
  setNegativePromptEnabled: enabled => set({ negativePromptEnabled: enabled }),

  // Reasoning
  reasoningConfig: { enabled: false },
  setReasoningConfig: cfg => set({ reasoningConfig: cfg }),

  // Persona slice
  selectedByKey: {},
  setSelectedPersonaId: (key, id) =>
    set(state => {
      if (state.selectedByKey[key] === id) {
        return state;
      }
      return { selectedByKey: { ...state.selectedByKey, [key]: id } };
    }),
  clearKey: key =>
    set(state => {
      const next = { ...state.selectedByKey };
      delete next[key];
      return { selectedByKey: next };
    }),
  clearAll: () => set({ selectedByKey: {} }),

  // Temperature slice
  temperatureByKey: {},
  setTemperature: (key, value) =>
    set(state => {
      if (state.temperatureByKey[key] === value) {
        return state;
      }
      return { temperatureByKey: { ...state.temperatureByKey, [key]: value } };
    }),
  clearTemperatureKey: key =>
    set(state => {
      const next = { ...state.temperatureByKey };
      delete next[key];
      return { temperatureByKey: next };
    }),
  clearAllTemperature: () => set({ temperatureByKey: {} }),

  // Attachments slice
  attachmentsByKey: {} as Record<
    ConversationKey,
    import("@/types").Attachment[]
  >,
  setAttachments: (
    key: ConversationKey,
    value:
      | import("@/types").Attachment[]
      | ((
          prev: import("@/types").Attachment[]
        ) => import("@/types").Attachment[])
  ) =>
    set(state => {
      const prev = state.attachmentsByKey[key] ?? [];
      const next =
        typeof value === "function"
          ? (
              value as (
                prev: import("@/types").Attachment[]
              ) => import("@/types").Attachment[]
            )(prev)
          : value;
      if (prev === next) {
        return state;
      }
      if (
        Array.isArray(prev) &&
        Array.isArray(next) &&
        prev.length === next.length &&
        prev.every((item, i) => item === next[i])
      ) {
        return state;
      }
      return {
        attachmentsByKey: { ...state.attachmentsByKey, [key]: next },
      };
    }),
  clearAttachmentsKey: (key: ConversationKey) =>
    set(state => {
      const next = { ...state.attachmentsByKey };
      delete next[key];
      return { attachmentsByKey: next };
    }),
}));

export function makeChatInputKey(
  conversationId?: string,
  usePreserved?: boolean
): ConversationKey {
  // Only preserve when explicitly requested for new conversations without messages
  if (usePreserved) {
    return conversationId ?? GLOBAL_CHAT_INPUT_KEY;
  }
  // When not preserving, still return a stable key to allow optional usage,
  // but callers generally should not write to the store in this case.
  return conversationId ?? GLOBAL_CHAT_INPUT_KEY;
}

export function getSelectedPersonaIdFromStore(key: ConversationKey) {
  return useChatInputStore.getState().selectedByKey[key] ?? null;
}
