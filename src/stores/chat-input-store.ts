import type { Id } from "@convex/_generated/dataModel";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  AIModel,
  Attachment,
  GenerationMode,
  ImageGenerationParams,
  ReasoningConfig,
} from "@/types";

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

export type ChatInputStoreState = ChatInputPersonaState &
  ChatInputTemperatureState & {
    // Models slice
    selectedModel: AIModel | null;
    setSelectedModel: (model: AIModel | null) => void;
    // Generation & image params
    generationMode: GenerationMode;
    imageParams: ImageGenerationParams;
    negativePromptEnabled: boolean;
    setGenerationMode: (mode: GenerationMode) => void;
    setImageParams: (
      value:
        | ImageGenerationParams
        | ((prev: ImageGenerationParams) => ImageGenerationParams)
    ) => void;
    setNegativePromptEnabled: (enabled: boolean) => void;
    // Reasoning config
    reasoningConfig: ReasoningConfig;
    setReasoningConfig: (cfg: ReasoningConfig) => void;
    // Attachments slice
    attachmentsByKey: Record<ConversationKey, Attachment[]>;
    setAttachments: (
      key: ConversationKey,
      value: Attachment[] | ((prev: Attachment[]) => Attachment[])
    ) => void;
    clearAttachmentsKey: (key: ConversationKey) => void;
  };

export type ChatInputStoreApi = StoreApi<ChatInputStoreState>;

function createChatInputState(
  set: ChatInputStoreApi["setState"],
  get: ChatInputStoreApi["getState"]
): ChatInputStoreState {
  return {
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
            ? (value as (prev: ImageGenerationParams) => ImageGenerationParams)(
                state.imageParams
              )
            : value,
      })),
    setNegativePromptEnabled: enabled =>
      set({ negativePromptEnabled: enabled }),

    // Reasoning
    reasoningConfig: { enabled: false },
    setReasoningConfig: cfg => set({ reasoningConfig: cfg }),

    // Persona slice
    selectedByKey: {},
    setSelectedPersonaId: (key, id) => {
      const current = get().selectedByKey[key];
      if (current === id) {
        return;
      }
      set(state => ({ selectedByKey: { ...state.selectedByKey, [key]: id } }));
    },
    clearKey: key =>
      set(state => {
        const next = { ...state.selectedByKey };
        delete next[key];
        return { selectedByKey: next };
      }),
    clearAll: () => set({ selectedByKey: {} }),

    // Temperature slice
    temperatureByKey: {},
    setTemperature: (key, value) => {
      const current = get().temperatureByKey[key];
      if (current === value) {
        return;
      }
      set(state => ({
        temperatureByKey: { ...state.temperatureByKey, [key]: value },
      }));
    },
    clearTemperatureKey: key =>
      set(state => {
        const next = { ...state.temperatureByKey };
        delete next[key];
        return { temperatureByKey: next };
      }),
    clearAllTemperature: () => set({ temperatureByKey: {} }),

    // Attachments slice
    attachmentsByKey: {},
    setAttachments: (key, value) => {
      const prev = get().attachmentsByKey[key] ?? [];
      const next =
        typeof value === "function"
          ? (value as (prev: Attachment[]) => Attachment[])(prev)
          : value;
      if (prev === next) {
        return;
      }
      if (
        Array.isArray(prev) &&
        Array.isArray(next) &&
        prev.length === next.length &&
        prev.every((item, i) => item === next[i])
      ) {
        return;
      }
      set(state => ({
        attachmentsByKey: { ...state.attachmentsByKey, [key]: next },
      }));
    },
    clearAttachmentsKey: key =>
      set(state => {
        const next = { ...state.attachmentsByKey };
        delete next[key];
        return { attachmentsByKey: next };
      }),
  };
}

export const createChatInputStore = (
  init?: Partial<ChatInputStoreState>
): ChatInputStoreApi =>
  createStore<ChatInputStoreState>()((set, get) => ({
    ...createChatInputState(set, get),
    ...init,
  }));

let chatInputStoreApi: ChatInputStoreApi = createChatInputStore();

type ChatInputSelector<T> = (state: ChatInputStoreState) => T;

type UseChatInputStore = {
  <T>(selector: ChatInputSelector<T>, equalityFn?: (a: T, b: T) => boolean): T;
  getState: ChatInputStoreApi["getState"];
  setState: ChatInputStoreApi["setState"];
  subscribe: ChatInputStoreApi["subscribe"];
};

function useChatInputStoreBase<T>(
  selector: ChatInputSelector<T>,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    chatInputStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

export const useChatInputStore = Object.assign(useChatInputStoreBase, {
  getState: () => chatInputStoreApi.getState(),
  setState: (...args: Parameters<ChatInputStoreApi["setState"]>) =>
    chatInputStoreApi.setState(...args),
  subscribe: (...args: Parameters<ChatInputStoreApi["subscribe"]>) =>
    chatInputStoreApi.subscribe(...args),
}) as UseChatInputStore;

export const getChatInputStore = () => chatInputStoreApi;

export const setChatInputStoreApi = (store: ChatInputStoreApi) => {
  chatInputStoreApi = store;
};

export const resetChatInputStoreApi = () => {
  chatInputStoreApi = createChatInputStore();
};

export const GLOBAL_CHAT_INPUT_KEY = "global" as const;

// Centralized key helper used across the app
export function getChatKey(conversationId?: string | null): ConversationKey {
  return conversationId ?? GLOBAL_CHAT_INPUT_KEY;
}

export function getSelectedPersonaIdFromStore(key: ConversationKey) {
  return chatInputStoreApi.getState().selectedByKey[key] ?? null;
}
