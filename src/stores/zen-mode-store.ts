import { create } from "zustand";

type ConversationKey = string | null;

type OpenParams = {
  conversationId: ConversationKey;
  messageId: string;
  conversationTitle?: string | null;
};

type ZenModeState = {
  isOpen: boolean;
  conversationId: ConversationKey;
  activeMessageId: string | null;
  conversationTitle: string | null;
  open: (params: OpenParams) => void;
  setActive: (messageId: string) => void;
  close: () => void;
};

export const useZenModeStore = create<ZenModeState>((set, get) => ({
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
}));
