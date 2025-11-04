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

export type StreamOverlayState = {
  overlays: OverlayMap; // content overlays
  reasoning: OverlayMap; // reasoning overlays
  status: StatusMap; // ephemeral status per message
  tools: ToolMap; // tool events during stream
  citations: CitationsMap; // ephemeral citations overlay
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
    set: (messageId, content) =>
      set(state => ({ overlays: { ...state.overlays, [messageId]: content } })),
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
  setState: streamOverlaysStoreApi.setState,
  subscribe: streamOverlaysStoreApi.subscribe.bind(streamOverlaysStoreApi),
}) as UseStreamOverlays;

export const getStreamOverlaysStore = () => streamOverlaysStoreApi;

export const setStreamOverlaysStoreApi = (store: StreamOverlayStoreApi) => {
  streamOverlaysStoreApi = store;
};

export const resetStreamOverlaysStoreApi = () => {
  streamOverlaysStoreApi = createStreamOverlaysStore();
};
