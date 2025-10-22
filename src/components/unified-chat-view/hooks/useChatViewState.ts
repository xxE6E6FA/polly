import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import type { ChatInputRef } from "@/components/chat-input";
import type { VirtualizedChatMessagesRef } from "@/components/virtualized-chat-messages";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useToast } from "@/providers/toast-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";

interface UseChatViewStateOptions {
  conversationId?: ConversationId;
  messages: ChatMessage[];
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}

export function useChatViewState({
  conversationId,
  messages,
  onSendMessage,
  onDeleteMessage,
}: UseChatViewStateOptions) {
  // Mutations
  const unarchiveConversation = useMutation(api.conversations.patch);

  // Hooks
  const managedToast = useToast();

  // Refs
  const virtualizedMessagesRef = useRef<VirtualizedChatMessagesRef>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const hasInitializedScroll = useRef(false);

  // UI state
  const { selection, lockSelection, unlockSelection } = useTextSelection();
  const confirmationDialog = useConfirmationDialog();

  // Computed state
  const isEmpty = messages.length === 0;

  // Reset scroll initialization when conversation changes
  useEffect(() => {
    if (conversationId) {
      hasInitializedScroll.current = false;
    }
  }, [conversationId]);

  // Handle outline navigation
  const handleOutlineNavigate = useCallback(
    (messageId: string, headingId?: string) => {
      if (virtualizedMessagesRef.current) {
        virtualizedMessagesRef.current.scrollToMessage(messageId, headingId);
      }
    },
    []
  );

  // Get current reasoning config from chat input
  const getCurrentReasoningConfig = useCallback(():
    | ReasoningConfig
    | undefined => {
    if (chatInputRef.current?.getCurrentReasoningConfig) {
      const config = chatInputRef.current.getCurrentReasoningConfig();
      if (config.enabled) {
        return config;
      }
    }
    return undefined;
  }, []);

  // Handle message sending with input focus
  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig,
      temperature?: number
    ) => {
      await onSendMessage(
        content,
        attachments,
        personaId,
        reasoningConfig,
        temperature
      );

      // Refocus the textarea after sending
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
    },
    [onSendMessage]
  );

  // Handle delete message with confirmation
  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      confirmationDialog.confirm(
        {
          title: "Delete message",
          description: "Are you sure you want to delete this message?",
          confirmText: "Delete",
          variant: "destructive",
        },
        () => onDeleteMessage(messageId)
      );
    },
    [confirmationDialog, onDeleteMessage]
  );

  // Handle quote selection
  const handleQuoteSelection = useCallback(() => {
    if (selection?.text && chatInputRef.current) {
      lockSelection();
      // Always format as markdown quote
      const quoted = selection.text
        .split("\n")
        .map(line => `> ${line}`)
        .join("\n");
      chatInputRef.current.addQuote(quoted);
    }
  }, [selection?.text, lockSelection]);

  // Handle unarchive conversation
  const handleUnarchive = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    try {
      await unarchiveConversation({
        id: conversationId,
        updates: { isArchived: false },
        setUpdatedAt: true,
      });
      managedToast.success("Conversation restored", {
        description: "You can now continue chatting.",
        id: `restore-${conversationId}`,
      });
    } catch (_error) {
      managedToast.error("Failed to restore conversation", {
        description: "Unable to restore conversation. Please try again.",
        id: `restore-error-${conversationId}`,
      });
    }
  }, [conversationId, unarchiveConversation, managedToast]);

  // Clean up text selection on unmount
  useEffect(() => {
    return () => {
      unlockSelection();
    };
  }, [unlockSelection]);

  return {
    // Refs
    virtualizedMessagesRef,
    messagesContainerRef,
    chatInputRef,
    // UI state
    selection,
    confirmationDialog,
    isEmpty,

    // Handlers
    handleOutlineNavigate,
    handleSendMessage,
    handleDeleteMessage,
    handleQuoteSelection,
    handleUnarchive,
    lockSelection,
    unlockSelection,
    getCurrentReasoningConfig,
  };
}
