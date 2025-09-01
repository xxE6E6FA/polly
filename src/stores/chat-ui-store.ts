import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ConversationId = string | null | undefined;

type HistoryEntry = {
  id: string;
  input: string;
  createdAt: number;
};

type ChatUIState = {
  // View-only UI flags
  isFullscreen: boolean;
  isMultiline: boolean;
  isTransitioning: boolean;

  // Per-conversation lightweight input history (up/down arrows)
  historyByConversation: Record<string, HistoryEntry[]>;
  historyIndexByConversation: Record<string, number | null>;

  // Actions
  setFullscreen: (v: boolean) => void;
  setMultiline: (v: boolean) => void;
  setTransitioning: (v: boolean) => void;
  clearOnSend: () => void;

  pushHistory: (conversationId: ConversationId, input: string) => void;
  navigateHistory: (
    conversationId: ConversationId,
    direction: "prev" | "next"
  ) => string | null;
  resetHistoryIndex: (conversationId: ConversationId) => void;
  clearHistory: (conversationId: ConversationId) => void;
};

export const useChatUIStore = create<ChatUIState>()(
  devtools((set, get) => ({
    isFullscreen: false,
    isMultiline: false,
    isTransitioning: false,
    historyByConversation: {},
    historyIndexByConversation: {},

    setFullscreen: v => set({ isFullscreen: v }),
    setMultiline: v => set({ isMultiline: v }),
    setTransitioning: v => set({ isTransitioning: v }),
    clearOnSend: () => set({ isFullscreen: false, isMultiline: false }),

    pushHistory: (conversationId, input) => {
      if (!conversationId) {
        return;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry: HistoryEntry = { id, input, createdAt: Date.now() };
      const map = { ...get().historyByConversation };
      const list = map[conversationId] ? [...map[conversationId]] : [];
      // Avoid duplicate adjacent entries
      if (list.length === 0 || list[list.length - 1]?.input !== input) {
        list.push(entry);
      }
      map[conversationId] = list.slice(-50); // keep last 50
      set({ historyByConversation: map });
      // Reset index to end
      const idxMap = { ...get().historyIndexByConversation };
      idxMap[conversationId] = null;
      set({ historyIndexByConversation: idxMap });
    },

    navigateHistory: (conversationId, direction) => {
      if (!conversationId) {
        return null;
      }
      const list = get().historyByConversation[conversationId] || [];
      if (list.length === 0) {
        return null;
      }

      const idxMap = { ...get().historyIndexByConversation };
      const current = idxMap[conversationId];
      let nextIndex: number;
      if (current == null) {
        nextIndex = direction === "prev" ? list.length - 1 : 0; // start from end or start
      } else {
        nextIndex = direction === "prev" ? current - 1 : current + 1;
      }
      nextIndex = Math.max(0, Math.min(list.length - 1, nextIndex));
      idxMap[conversationId] = nextIndex;
      set({ historyIndexByConversation: idxMap });
      return list[nextIndex]?.input ?? null;
    },

    resetHistoryIndex: conversationId => {
      if (!conversationId) {
        return;
      }
      const idxMap = { ...get().historyIndexByConversation };
      idxMap[conversationId] = null;
      set({ historyIndexByConversation: idxMap });
    },

    clearHistory: conversationId => {
      if (!conversationId) {
        return;
      }
      const map = { ...get().historyByConversation };
      delete map[conversationId];
      const idxMap = { ...get().historyIndexByConversation };
      delete idxMap[conversationId];
      set({ historyByConversation: map, historyIndexByConversation: idxMap });
    },
  }))
);

export const useChatFullscreenUI = () => {
  return useChatUIStore(s => ({
    isFullscreen: s.isFullscreen,
    isMultiline: s.isMultiline,
    isTransitioning: s.isTransitioning,
    setFullscreen: s.setFullscreen,
    setMultiline: s.setMultiline,
    setTransitioning: s.setTransitioning,
    clearOnSend: s.clearOnSend,
  }));
};

export const useChatHistory = (conversationId: ConversationId) => {
  const pushHistory = useChatUIStore(s => s.pushHistory);
  const navigateHistory = useChatUIStore(s => s.navigateHistory);
  const resetHistoryIndex = useChatUIStore(s => s.resetHistoryIndex);
  const clearHistory = useChatUIStore(s => s.clearHistory);
  return {
    push: (input: string) => pushHistory(conversationId, input),
    prev: () => navigateHistory(conversationId, "prev"),
    next: () => navigateHistory(conversationId, "next"),
    resetIndex: () => resetHistoryIndex(conversationId),
    clear: () => clearHistory(conversationId),
  };
};
