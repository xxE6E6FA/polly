import type { Id } from "@convex/_generated/dataModel";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useChatInputDragDrop,
  useChatInputImageGeneration,
  useChatInputPaste,
  useChatInputState,
  useChatInputSubmission,
  useSpeechInput,
} from "@/hooks/chat-ui";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useOnline } from "@/hooks/use-online";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { SpeechInputProvider } from "@/providers/speech-input-context";
import { useUserDataContext } from "@/providers/user-data-context";
import { useChatHistory } from "@/stores/chat-ui-store";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
import { ChatInputBottomBar } from "./chat-input-bottom-bar";
import { TextInputSection } from "./text-input-section";

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

const ChatInputInner = ({
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
  conversationPersonaId,
  ref,
}: ChatInputProps & { ref?: React.Ref<ChatInputRef> }) => {
  // Unified state management
  const {
    attachments,
    setAttachments,
    clearAttachments,
    selectedPersonaId,
    temperature,
    reasoningConfig,
    generationMode,
    setGenerationMode,
    imageParams,
    selectedModel,
    canSendMessage,
  } = useChatInputState(conversationId);

  // Component-local state (not in store)
  const [input, setInput] = useState<string>("");
  const [activeQuote, setActiveQuote] = useState<string | null>(null);

  const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { hasReplicateApiKey } = useReplicateApiKey();
  const { isPrivateMode } = usePrivateMode();
  const online = useOnline();

  // File upload hook with eager upload support
  const { handleFileUpload } = useFileUpload({
    currentModel: selectedModel ?? undefined,
    privateMode: isPrivateMode,
    conversationId: conversationId ?? undefined,
  });

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
      onProcessFiles: handleFileUpload,
    });

  const { handlePaste } = useChatInputPaste({
    canSend: canSendMessage,
    isLoading,
    isStreaming,
    onProcessFiles: handleFileUpload,
  });

  // Force back to text mode if in private mode (image gen not supported)
  // Allow image mode if user has Replicate key OR selected model is free
  const canUseImageMode =
    hasReplicateApiKey || (selectedImageModel?.free ?? false);
  useEffect(() => {
    if ((isPrivateMode || !canUseImageMode) && generationMode === "image") {
      setGenerationMode("text");
    }
  }, [isPrivateMode, canUseImageMode, generationMode, setGenerationMode]);

  // Auto-switch to image mode for image generation conversations
  // WHY: When users continue an image generation conversation, we want to keep them
  // in image mode so follow-ups trigger Replicate instead of switching to text chat.
  // We only do this once per conversation to respect manual user mode changes.
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
      canUseImageMode &&
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
    canUseImageMode,
    isPrivateMode,
    generationMode,
    setGenerationMode,
  ]);

  // Extract user messages for history navigation
  // WHY: Users can use arrow keys to navigate through their previous messages.
  // We extract just the user messages (not assistant) in reverse chronological order.
  const userMessages = (() => {
    if (userMessageContents) {
      return userMessageContents;
    }

    const sourceMessages = messages || [];
    if (!sourceMessages || sourceMessages.length === 0) {
      return [];
    }

    const result: string[] = [];
    for (let i = sourceMessages.length - 1; i >= 0; i--) {
      const msg = sourceMessages[i];
      if (!msg || msg.role !== "user") {
        continue;
      }
      const content = typeof msg.content === "string" ? msg.content : "";
      result.push(content);
    }

    return result;
  })();

  // Hydrate history with existing messages for arrow key navigation
  // WHY: When a user opens an existing conversation, we populate the history stack
  // with their previous messages so they can use arrow keys to cycle through them.
  // We only do this once per conversation (tracked by refs) to avoid resetting
  // the user's navigation position when new messages arrive.
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
    // Skip if already hydrated with same conversation and message count
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
      const content = activeQuote ? `${activeQuote}\n\n${input}`.trim() : input;
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

  const dynamicPlaceholder = (() => {
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
  })();

  // Simple conditional - React Compiler will optimize if needed
  const chatInputStateClass =
    canSendMessage && online ? "" : "chat-input-disabled";

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

  const handleTranscriptionInsert = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed === "Silence.") {
      return;
    }
    setInput(trimmed);
  };

  const speechInput = useSpeechInput({
    onTranscription: handleTranscriptionInsert,
  });

  return (
    <SpeechInputProvider value={speechInput}>
      <div className="mx-auto w-full max-w-3xl chat-input-footer-backdrop">
        <div
          className={cn(
            "relative chat-input-container outline-none",
            chatInputStateClass,
            isDragOver &&
              canSendMessage &&
              "ring-2 ring-primary/50 bg-primary/5"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver && canSendMessage && (
            <div className="absolute inset-0 z-chat-input flex items-center justify-center bg-primary/10 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-primary">
                <svg
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm font-medium">Drop files to upload</p>
              </div>
            </div>
          )}

          <TextInputSection
            onSubmit={handleSubmit}
            textareaRef={inlineTextareaRef}
            placeholder={dynamicPlaceholder}
            disabled={
              isLoading ||
              isProcessing ||
              !canSendMessage ||
              !online ||
              speechInput.isRecording ||
              speechInput.isTranscribing
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
            onPaste={handlePaste}
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
            conversationPersonaId={conversationPersonaId}
          />
        </div>
      </div>
      <div
        className={cn(
          "mx-auto w-full max-w-3xl px-4 overflow-hidden transition-all duration-300 ease-in-out",
          isPrivateMode
            ? cn("max-h-20 opacity-100", hasExistingMessages ? "mt-1" : "mt-2")
            : "max-h-0 opacity-0 mt-0"
        )}
      >
        <p className="text-xs text-muted-foreground text-center pb-2 sm:pb-0">
          Messages are not saved to the server, but may be analyzed by the AI
          provider.
        </p>
      </div>
    </SpeechInputProvider>
  );
};

export const ChatInput = ({
  ref,
  ...props
}: ChatInputProps & { ref?: React.Ref<ChatInputRef> }) => {
  const { user } = useUserDataContext();

  if (user === undefined) {
    // Return skeleton placeholder to prevent layout shift while loading
    return (
      <div className="mx-auto w-full max-w-3xl chat-input-footer-backdrop">
        <div className="chat-input-container chat-input-disabled opacity-50">
          <div className="min-h-[52px] px-4 py-3">
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return <ChatInputInner {...props} ref={ref} />;
};
