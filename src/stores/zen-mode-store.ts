import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createStore, type StoreApi } from "zustand/vanilla";

type ConversationKey = string | null;

type OpenParams = {
  conversationId: ConversationKey;
  messageId: string;
  conversationTitle?: string | null;
};

export type ZenModeState = {
  isOpen: boolean;
  conversationId: ConversationKey;
  activeMessageId: string | null;
  conversationTitle: string | null;
  open: (params: OpenParams) => void;
  setActive: (messageId: string) => void;
  close: () => void;
};

type ZenModeStoreApi = StoreApi<ZenModeState>;

const createZenModeState = (
  set: ZenModeStoreApi["setState"],
  get: ZenModeStoreApi["getState"]
): ZenModeState => ({
  isOpen: false,
  conversationId: null,
  activeMessageId: null,
  conversationTitle: null,
  open: ({ conversationId, messageId, conversationTitle }) => {
    set({
      isOpen: true,
      conversationId,
      activeMessageId: messageId,
      conversationTitle: conversationTitle ?? null,
    });
  },
  setActive: messageId => {
    const { isOpen, activeMessageId } = get();
    if (!isOpen || activeMessageId === messageId) {
      return;
    }
    set({ activeMessageId: messageId });
  },
  close: () => {
    set({
      isOpen: false,
      conversationId: null,
      activeMessageId: null,
      conversationTitle: null,
    });
  },
});

export const createZenModeStore = () =>
  createStore<ZenModeState>()((set, get) => createZenModeState(set, get));

let zenModeStoreApi: ZenModeStoreApi = createZenModeStore();

type ZenModeSelector<T> = (state: ZenModeState) => T;

type UseZenModeStore = {
  <T>(selector: ZenModeSelector<T>, equalityFn?: (a: T, b: T) => boolean): T;
  getState: ZenModeStoreApi["getState"];
  setState: ZenModeStoreApi["setState"];
  subscribe: ZenModeStoreApi["subscribe"];
};

function useZenModeStoreBase<T>(
  selector: ZenModeSelector<T>,
  equalityFn?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(
    zenModeStoreApi,
    selector,
    equalityFn ?? shallow
  );
}

export const useZenModeStore = Object.assign(useZenModeStoreBase, {
  getState: () => zenModeStoreApi.getState(),
  setState: (...args: Parameters<ZenModeStoreApi["setState"]>) =>
    zenModeStoreApi.setState(...args),
  subscribe: (...args: Parameters<ZenModeStoreApi["subscribe"]>) =>
    zenModeStoreApi.subscribe(...args),
}) as UseZenModeStore;

export const getZenModeStore = () => zenModeStoreApi;

export const setZenModeStoreApi = (store: ZenModeStoreApi) => {
  zenModeStoreApi = store;
};

export const resetZenModeStoreApi = () => {
  zenModeStoreApi = createZenModeStore();
};
