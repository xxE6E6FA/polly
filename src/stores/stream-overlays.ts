import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";

type OverlayMap = Record<string, string>;
type StatusMap = Record<string, string | undefined>;
type ToolEvent =
  | { t: "tool_call"; name: string; args?: unknown }
  | { t: "tool_result"; name: string; ok?: boolean; count?: number };
type ToolMap = Record<string, ToolEvent[]>;
type CitationsMap = Record<string, Array<{ url: string; title?: string }>>;

export type StreamOverlayUpdates = {
  content?: string;
  contentDelta?: string;
  reasoning?: string;
  reasoningDelta?: string;
  status?: string;
  citations?: Array<{ url: string; title?: string }>;
  toolEvent?: ToolEvent;
};

export type StreamOverlayState = {
  overlays: OverlayMap; // content overlays
  reasoning: OverlayMap; // reasoning overlays
  status: StatusMap; // ephemeral status per message
  tools: ToolMap; // tool events during stream
  citations: CitationsMap; // ephemeral citations overlay

  // Simplified batch update API
  update: (messageId: string, updates: StreamOverlayUpdates) => void;
  clearAll: (messageId: string) => void;

  // Original methods (kept for backward compatibility)
  set: (messageId: string, content: string) => void;
  append: (messageId: string, delta: string) => void;
  clear: (messageId: string) => void;
  setReasoning: (messageId: string, content: string) => void;
  appendReasoning: (messageId: string, delta: string) => void;
  clearReasoning: (messageId: string) => void;
  setStatus: (messageId: string, status?: string) => void;
  clearStatus: (messageId: string) => void;
  pushToolEvent: (messageId: string, evt: ToolEvent) => void;
  clearTools: (messageId: string) => void;
  setCitations: (
    messageId: string,
    citations: Array<{ url: string; title?: string }>
  ) => void;
  clearCitations: (messageId: string) => void;
};

type StreamOverlayStoreApi = StoreApi<StreamOverlayState>;

function createStreamOverlayState(
  set: StreamOverlayStoreApi["setState"],
  get: StreamOverlayStoreApi["getState"]
): StreamOverlayState {
  return {
    overlays: {},
    reasoning: {},
    status: {},
    tools: {},
    citations: {},

    // Simplified batch update method
    update: (messageId, updates) => {
      set(state => {
        const newState: Partial<StreamOverlayState> = {};

        // Handle content updates
        if (updates.content !== undefined) {
          newState.overlays = {
            ...state.overlays,
            [messageId]: updates.content,
          };
        } else if (updates.contentDelta !== undefined) {
          const currentContent = state.overlays[messageId] ?? "";
          newState.overlays = {
            ...state.overlays,
            [messageId]: currentContent + updates.contentDelta,
          };
        }

        // Handle reasoning updates
        if (updates.reasoning !== undefined) {
          newState.reasoning = {
            ...state.reasoning,
            [messageId]: updates.reasoning,
          };
        } else if (updates.reasoningDelta !== undefined) {
          const currentReasoning = state.reasoning[messageId] ?? "";
          newState.reasoning = {
            ...state.reasoning,
            [messageId]: currentReasoning + updates.reasoningDelta,
          };
        }

        // Handle status update
        if (updates.status !== undefined) {
          newState.status = { ...state.status, [messageId]: updates.status };
        }

        // Handle citations update
        if (updates.citations !== undefined) {
          newState.citations = {
            ...state.citations,
            [messageId]: updates.citations,
          };
        }

        // Handle tool event (push to array)
        if (updates.toolEvent !== undefined) {
          const currentTools = state.tools[messageId] || [];
          newState.tools = {
            ...state.tools,
            [messageId]: [...currentTools, updates.toolEvent],
          };
        }

        return newState as StreamOverlayState;
      });
    },

    // Clear all overlays for a message at once
    clearAll: messageId => {
      set(state => {
        const newOverlays = { ...state.overlays };
        const newReasoning = { ...state.reasoning };
        const newStatus = { ...state.status };
        const newTools = { ...state.tools };
        const newCitations = { ...state.citations };

        delete newOverlays[messageId];
        delete newReasoning[messageId];
        delete newStatus[messageId];
        delete newTools[messageId];
        delete newCitations[messageId];

        return {
          overlays: newOverlays,
          reasoning: newReasoning,
          status: newStatus,
          tools: newTools,
          citations: newCitations,
        } as StreamOverlayState;
      });
    },

    set: (messageId, content) =>
      set(state => ({
        overlays: { ...state.overlays, [messageId]: content },
      })),
    append: (messageId, delta) => {
      const current = get().overlays[messageId] ?? "";
      set(state => ({
        overlays: { ...state.overlays, [messageId]: current + delta },
      }));
    },
    clear: messageId =>
      set(state => {
        if (!(messageId in state.overlays)) {
          return state;
        }
        const next = { ...state.overlays };
        delete next[messageId];
        return { ...state, overlays: next } as StreamOverlayState;
      }),
    setReasoning: (messageId, content) =>
      set(state => ({
        reasoning: { ...state.reasoning, [messageId]: content },
      })),
    appendReasoning: (messageId, delta) => {
      const current = get().reasoning[messageId] ?? "";
      set(state => ({
        reasoning: { ...state.reasoning, [messageId]: current + delta },
      }));
    },
    clearReasoning: messageId =>
      set(state => {
        if (!(messageId in state.reasoning)) {
          return state;
        }
        const next = { ...state.reasoning };
        delete next[messageId];
        return { ...state, reasoning: next } as StreamOverlayState;
      }),
    setStatus: (messageId, status) =>
      set(state => ({ status: { ...state.status, [messageId]: status } })),
    clearStatus: messageId =>
      set(state => {
        if (!(messageId in state.status)) {
          return state;
        }
        const next = { ...state.status };
        delete next[messageId];
        return { ...state, status: next } as StreamOverlayState;
      }),
    pushToolEvent: (messageId, evt) =>
      set(state => {
        const current = state.tools[messageId] || [];
        return {
          tools: { ...state.tools, [messageId]: [...current, evt] },
        } as StreamOverlayState;
      }),
    clearTools: messageId =>
      set(state => {
        if (!(messageId in state.tools)) {
          return state;
        }
        const next = { ...state.tools };
        delete next[messageId];
        return { ...state, tools: next } as StreamOverlayState;
      }),
    setCitations: (messageId, citations) =>
      set(state => ({
        citations: { ...state.citations, [messageId]: citations },
      })),
    clearCitations: messageId =>
      set(state => {
        if (!(messageId in state.citations)) {
          return state;
        }
        const next = { ...state.citations };
        delete next[messageId];
        return { ...state, citations: next } as StreamOverlayState;
      }),
  };
}

export const createStreamOverlaysStore = () =>
  createStore<StreamOverlayState>()((set, get) =>
    createStreamOverlayState(set, get)
  );

let streamOverlaysStoreApi: StreamOverlayStoreApi = createStreamOverlaysStore();

type StreamOverlaySelector<T> = (state: StreamOverlayState) => T;

type UseStreamOverlays = {
  <T>(
    selector: StreamOverlaySelector<T>,
    equalityFn?: (a: T, b: T) => boolean
  ): T;
  getState: StreamOverlayStoreApi["getState"];
  setState: StreamOverlayStoreApi["setState"];
  subscribe: StreamOverlayStoreApi["subscribe"];
};

function useStreamOverlaysBase<T>(
  selector: StreamOverlaySelector<T>,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    streamOverlaysStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

export const useStreamOverlays = Object.assign(useStreamOverlaysBase, {
  getState: () => streamOverlaysStoreApi.getState(),
  setState: (...args: Parameters<StreamOverlayStoreApi["setState"]>) =>
    streamOverlaysStoreApi.setState(...args),
  subscribe: (...args: Parameters<StreamOverlayStoreApi["subscribe"]>) =>
    streamOverlaysStoreApi.subscribe(...args),
}) as UseStreamOverlays;

export const getStreamOverlaysStore = () => streamOverlaysStoreApi;

export const setStreamOverlaysStoreApi = (store: StreamOverlayStoreApi) => {
  streamOverlaysStoreApi = store;
};

export const resetStreamOverlaysStoreApi = () => {
  streamOverlaysStoreApi = createStreamOverlaysStore();
};
