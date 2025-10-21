import type { Id } from "@convex/_generated/dataModel";
import type { ForwardedRef } from "react";
import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChatAttachments } from "@/hooks/use-chat-attachments";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useOnline } from "@/hooks/use-online";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import { useChatHistory } from "@/stores/chat-ui-store";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
import { ChatInputBottomBar } from "./components/chat-input-bottom-bar";
import { ChatInputContainer } from "./components/chat-input-container";
import {
  useChatInputDragDrop,
  useChatInputImageGeneration,
  useChatInputSubmission,
} from "./hooks";
import { TextInputSection } from "./sections/text-input-section";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => void;
  onSendAsNewConversation?: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => Promise<ConversationId | undefined>;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  isArchived?: boolean;
  onTemperatureChange?: (temperature: number | undefined) => void;
  messages?: ChatMessage[];
  userMessageContents?: string[];
  autoFocus?: boolean;
  conversationPersonaId?: Id<"personas"> | null;
  isLikelyImageConversation?: boolean;
}

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
  getCurrentReasoningConfig: () => ReasoningConfig;
};

const ChatInputInner = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      onSendMessage,
      onSendAsNewConversation,
      conversationId,
      hasExistingMessages = false,
      isLoading = false,
      isStreaming = false,
      onStop,
      isArchived = false,
      messages,
      userMessageContents,
      autoFocus = false,
      isLikelyImageConversation = false,
    },
    ref
  ) => {
    const { canSendMessage } = useUserDataContext();
    const { hasReplicateApiKey } = useReplicateApiKey();
    const { isPrivateMode } = usePrivateMode();
    const { attachments, setAttachments, clearAttachments } =
      useChatAttachments(conversationId);
    const { selectedPersonaId, temperature } =
      useChatScopedState(conversationId);
    const [input, setInput] = useState<string>("");
    const [reasoningConfig] = useReasoningConfig();
    const [generationMode, setGenerationMode] = useGenerationMode();
    const { params: imageParams } = useImageParams();

    const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [selectedModel] = useSelectedModel();
    const online = useOnline();
    const notificationDialog = useNotificationDialog();
    const [activeQuote, setActiveQuote] = useState<string | null>(null);

    const {
      selectedImageModel,
      handleImageGenerationSubmit,
      handleSendAsNewConversation: handleImageGenerationSendAsNew,
    } = useChatInputImageGeneration({
      conversationId,
      selectedPersonaId,
      input,
      imageParams,
      generationMode,
      onResetInputState: () => {
        setInput("");
        setAttachments([]);
      },
      attachments,
    });

    const { isProcessing, submit, handleSendAsNewConversation } =
      useChatInputSubmission({
        conversationId,
        selectedPersonaId,
        temperature,
        onSendMessage,
        onSendAsNewConversation,
        handleImageGenerationSubmit,
        handleImageGenerationSendAsNew,
        onResetInputState: () => {
          setInput("");
          setAttachments([]);
          setActiveQuote(null);
        },
      });

    const { isDragOver, handleDragOver, handleDragLeave, handleDrop } =
      useChatInputDragDrop({
        canSend: canSendMessage,
        isLoading,
        isStreaming,
        onProcessFiles: async (files: FileList) => {
          const { processFilesForAttachments } = await import(
            "@/lib/process-files"
          );
          const newAttachments = await processFilesForAttachments(
            files,
            selectedModel,
            args =>
              notificationDialog.notify({
                ...args,
                description: args.description || "",
              })
          );
          if (newAttachments.length > 0) {
            const { appendAttachments } = await import(
              "@/stores/actions/chat-input-actions"
            );
            appendAttachments(conversationId, newAttachments);
          }
        },
      });

    useEffect(() => {
      if (
        (isPrivateMode || !hasReplicateApiKey) &&
        generationMode === "image"
      ) {
        setGenerationMode("text");
      }
    }, [isPrivateMode, hasReplicateApiKey, generationMode, setGenerationMode]);

    // If this conversation clearly involves image generation, default to image mode
    // to ensure follow-ups trigger Replicate instead of text chat. Only apply once
    // per conversation so subsequent manual user switches are respected.
    const autoAppliedForConversationRef = useRef<ConversationId | null>(null);
    useEffect(() => {
      // Reset tracker when navigating between conversations (including undefined -> id)
      if (autoAppliedForConversationRef.current !== conversationId) {
        autoAppliedForConversationRef.current = null;
      }

      const shouldAutoSwitch =
        hasExistingMessages &&
        isLikelyImageConversation &&
        generationMode === "text" &&
        hasReplicateApiKey &&
        !isPrivateMode &&
        autoAppliedForConversationRef.current == null;

      if (shouldAutoSwitch) {
        setGenerationMode("image");
        autoAppliedForConversationRef.current = conversationId ?? null;
      }
      // Only re-evaluate when the conversation context or heuristic changes; avoid
      // triggering on unrelated state updates to preserve user choice.
    }, [
      conversationId,
      hasExistingMessages,
      isLikelyImageConversation,
      hasReplicateApiKey,
      isPrivateMode,
      generationMode,
      setGenerationMode,
    ]);

    const userMessages = useMemo(() => {
      if (userMessageContents) {
        return userMessageContents;
      }

      const sourceMessages = messages || [];
      if (!sourceMessages || sourceMessages.length === 0) {
        return [];
      }

      const userMessages: string[] = [];
      for (let i = sourceMessages.length - 1; i >= 0; i--) {
        const msg = sourceMessages[i];
        if (msg.role === "user") {
          userMessages.push(msg.content);
        }
      }

      return userMessages;
    }, [userMessageContents, messages]);

    const history = useChatHistory(conversationId);
    const lastHydratedIdRef = useRef<ConversationId>(null);
    const lastHydratedCountRef = useRef<number>(0);
    useEffect(() => {
      if (!(conversationId && hasExistingMessages)) {
        return;
      }
      const count = userMessages?.length ?? 0;
      if (count === 0) {
        return;
      }
      if (
        lastHydratedIdRef.current === conversationId &&
        lastHydratedCountRef.current === count
      ) {
        return;
      }
      history.clear();
      for (const msg of [...userMessages].reverse()) {
        const t = msg.trim();
        if (t.length > 0) {
          history.push(t);
        }
      }
      history.resetIndex();
      lastHydratedIdRef.current = conversationId;
      lastHydratedCountRef.current = count;
    }, [
      conversationId,
      hasExistingMessages,
      userMessages,
      history.clear,
      history.push,
      history.resetIndex,
    ]);

    const handleSubmit = useCallback(async () => {
      const trimmed = input.trim();
      const content = activeQuote
        ? `${activeQuote}\n\n${trimmed}`.trim()
        : trimmed;
      await submit(content, [...attachments], generationMode);
      if (trimmed.length > 0) {
        history.push(trimmed);
        history.resetIndex();
      }
      setInput("");
      clearAttachments();
      setActiveQuote(null);
    }, [
      submit,
      input,
      attachments,
      generationMode,
      clearAttachments,
      history,
      activeQuote,
    ]);

    const handleSendAsNew = useCallback(
      async (
        shouldNavigate = true,
        personaId?: Id<"personas"> | null,
        customReasoningConfig?: ReasoningConfig
      ) => {
        const content = activeQuote
          ? `${activeQuote}\n\n${input}`.trim()
          : input;
        await handleSendAsNewConversation(
          content,
          [...attachments],
          shouldNavigate,
          personaId,
          customReasoningConfig,
          generationMode
        );
        setInput("");
        clearAttachments();
        setActiveQuote(null);
      },
      [
        handleSendAsNewConversation,
        input,
        attachments,
        clearAttachments,
        activeQuote,
        generationMode,
      ]
    );

    const dynamicPlaceholder = useMemo(() => {
      if (!online) {
        return "Offline — reconnect to send";
      }
      if (generationMode === "image") {
        return "Describe your image...";
      }
      if (isPrivateMode) {
        return "Private mode...";
      }
      if (isArchived) {
        return "Archived conversation";
      }
      return "Ask anything...";
    }, [generationMode, isPrivateMode, isArchived, online]);

    const chatInputStateClass = useMemo(() => {
      if (!(canSendMessage && online)) {
        return "chat-input-disabled";
      }
      if (isPrivateMode) {
        return "chat-input-private";
      }
      return "chat-input-enabled";
    }, [canSendMessage, isPrivateMode, online]);

    const immediateHasText = input.trim().length > 0 || attachments.length > 0;
    const deferredInputHasText = useDeferredValue(immediateHasText);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          inlineTextareaRef.current?.focus();
        },
        addQuote: (quote: string) => {
          setActiveQuote(quote);
          setTimeout(() => inlineTextareaRef.current?.focus(), 0);
        },
        setInput,
        getCurrentReasoningConfig: () => reasoningConfig,
      }),
      [reasoningConfig]
    );

    return (
      <ChatInputContainer
        className={chatInputStateClass}
        isDragOver={isDragOver}
        canSend={canSendMessage}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TextInputSection
          onSubmit={handleSubmit}
          textareaRef={inlineTextareaRef}
          placeholder={dynamicPlaceholder}
          disabled={
            isLoading ||
            isStreaming ||
            isProcessing ||
            !canSendMessage ||
            !online
          }
          autoFocus={autoFocus}
          value={input}
          onValueChange={setInput}
          hasExistingMessages={hasExistingMessages}
          conversationId={conversationId}
          canSend={canSendMessage && online}
          generationMode={generationMode}
          hasReplicateApiKey={hasReplicateApiKey}
          selectedImageModel={selectedImageModel}
          quote={activeQuote ?? undefined}
          onClearQuote={() => setActiveQuote(null)}
        />

        <ChatInputBottomBar
          canSend={canSendMessage && online}
          isStreaming={isStreaming}
          isLoading={isLoading}
          isProcessing={isProcessing}
          hasExistingMessages={hasExistingMessages}
          conversationId={conversationId}
          hasInputText={deferredInputHasText}
          onSend={handleSubmit}
          onStop={onStop}
          onSendAsNewConversation={handleSendAsNew}
          hasReplicateApiKey={hasReplicateApiKey}
          isPrivateMode={isPrivateMode}
          selectedImageModel={selectedImageModel}
        />
      </ChatInputContainer>
    );
  }
);

export const ChatInput = forwardRef(
  (props: ChatInputProps, ref: ForwardedRef<ChatInputRef>) => {
    const { user } = useUserDataContext();

    if (user === undefined) {
      return null;
    }

    return <ChatInputInner {...props} ref={ref} />;
  }
);

ChatInput.displayName = "ChatInput";
