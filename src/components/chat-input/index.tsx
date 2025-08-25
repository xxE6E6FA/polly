import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

import { useQuery } from "convex/react";
import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  AIModel,
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
import { ChatInputBottomBar } from "./components/chat-input-bottom-bar";
import { ChatInputContainer } from "./components/chat-input-container";
import {
  AttachmentProvider,
  useAttachments,
} from "./context/attachment-context";
import {
  ChatInputProvider,
  useChatInputContext,
  useChatInputUIContext,
} from "./context/chat-input-context";
import {
  useChatInputDragDrop,
  useChatInputImageGeneration,
  useChatInputSubmission,
} from "./hooks";
import { TextInputSection } from "./sections/text-input-section";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

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
  placeholder?: string;
  currentReasoningConfig?: ReasoningConfig;
  currentTemperature?: number;
  onTemperatureChange?: (temperature: number | undefined) => void;
  messages?: ChatMessage[];
  userMessageContents?: string[];
  autoFocus?: boolean;
  conversationPersonaId?: Id<"personas"> | null;
}

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
  getCurrentReasoningConfig: () => ReasoningConfig;
};

const getNewQuotedValue = (currentValue: string, quote: string) => {
  return currentValue ? `${currentValue}\n\n${quote}\n\n` : `${quote}\n\n`;
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
      placeholder = "Ask anything...",
      messages,
      userMessageContents,
      autoFocus = false,
    },
    ref
  ) => {
    const { user, canSendMessage } = useUserDataContext();
    const { hasReplicateApiKey } = useReplicateApiKey();
    const { isPrivateMode } = usePrivateMode();
    const {
      attachments,
      selectedModel,
      processFiles,
      addAttachments,
      uploadAttachmentsToConvex,
    } = useAttachments();
    const {
      input,
      selectedPersonaId,
      reasoningConfig,
      temperature,
      setInput,
      resetInputState,
    } = useChatInputContext();
    const { generationMode, imageParams, setGenerationMode } =
      useChatInputUIContext();

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Get personas
    const personasRaw = useQuery(api.personas.list, user?._id ? {} : "skip");
    const personas = useMemo(
      () => (Array.isArray(personasRaw) ? personasRaw : []),
      [personasRaw]
    );

    // Use the new image generation hook
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
      onResetInputState: resetInputState,
    });

    // Use the new submission hook
    const { isProcessing, submit, handleSendAsNewConversation } =
      useChatInputSubmission({
        conversationId,
        selectedPersonaId,
        reasoningConfig,
        temperature,
        onSendMessage,
        onSendAsNewConversation,
        uploadAttachmentsToConvex,
        handleImageGenerationSubmit,
        handleImageGenerationSendAsNew,
        onResetInputState: resetInputState,
      });

    // Use the new drag and drop hook
    const { isDragOver, handleDragOver, handleDragLeave, handleDrop } =
      useChatInputDragDrop({
        canSend: canSendMessage,
        isLoading,
        isStreaming,
        onProcessFiles: processFiles,
      });

    // Handle private mode and replicate API key restrictions
    useEffect(() => {
      if (
        (isPrivateMode || !hasReplicateApiKey) &&
        generationMode === "image"
      ) {
        setGenerationMode("text");
      }
    }, [isPrivateMode, hasReplicateApiKey, generationMode, setGenerationMode]);

    // Get user messages for history navigation
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

    // Handle submission
    const handleSubmit = useCallback(async () => {
      await submit(input, attachments, generationMode);
    }, [submit, input, attachments, generationMode]);

    // Handle send as new conversation
    const handleSendAsNew = useCallback(
      async (
        shouldNavigate = true,
        personaId?: Id<"personas"> | null,
        customReasoningConfig?: ReasoningConfig
      ) => {
        await handleSendAsNewConversation(
          input,
          attachments,
          shouldNavigate,
          personaId,
          customReasoningConfig
        );
      },
      [handleSendAsNewConversation, input, attachments]
    );

    // Determine dynamic placeholder based on generation mode
    const dynamicPlaceholder = useMemo(() => {
      if (generationMode === "image") {
        return "Describe your image...";
      }
      return placeholder;
    }, [generationMode, placeholder]);

    // Determine chat input state class
    const chatInputStateClass = useMemo(() => {
      if (!canSendMessage) {
        return "chat-input-disabled";
      }
      if (isPrivateMode) {
        return "chat-input-private";
      }
      return "chat-input-enabled";
    }, [canSendMessage, isPrivateMode]);

    const deferredInputHasText = useDeferredValue(
      input.trim().length > 0 || attachments.length > 0
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        addQuote: (quote: string) => {
          const currentValue = textareaRef.current?.value.trim() || "";
          const newValue = getNewQuotedValue(currentValue, quote);
          setInput(newValue);
          setTimeout(() => textareaRef.current?.focus(), 0);
        },
        setInput,
        getCurrentReasoningConfig: () => reasoningConfig,
      }),
      [setInput, reasoningConfig]
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
          textareaRef={textareaRef}
          placeholder={selectedPersonaId ? "" : dynamicPlaceholder}
          disabled={isLoading || isStreaming || isProcessing || !canSendMessage}
          autoFocus={autoFocus}
          hasExistingMessages={hasExistingMessages}
          personas={personas}
          canSend={canSendMessage}
          generationMode={generationMode}
          hasReplicateApiKey={hasReplicateApiKey}
          selectedImageModel={selectedImageModel}
          userMessages={userMessages}
        />

        <ChatInputBottomBar
          canSend={canSendMessage}
          isStreaming={isStreaming}
          isLoading={isLoading}
          isProcessing={isProcessing}
          hasExistingMessages={hasExistingMessages}
          conversationId={conversationId}
          hasInputText={deferredInputHasText}
          onSend={handleSubmit}
          onStop={onStop}
          onSendAsNewConversation={handleSendAsNew}
          hasApiKeys={canSendMessage}
          hasEnabledModels={canSendMessage}
          selectedModel={selectedModel as AIModel | null}
          onAddAttachments={addAttachments}
          hasReplicateApiKey={hasReplicateApiKey}
          isPrivateMode={isPrivateMode}
          onSubmit={handleSubmit}
        />
      </ChatInputContainer>
    );
  }
);

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (props, ref) => {
    const { user } = useUserDataContext();
    const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
    const selectedModel: AvailableModel | null = useMemo(() => {
      if (selectedModelRaw) {
        return selectedModelRaw;
      }
      return get(CACHE_KEYS.selectedModel, null);
    }, [selectedModelRaw]);

    if (user === undefined) {
      return null;
    }

    return (
      <ChatInputProvider
        conversationId={props.conversationId}
        hasExistingMessages={props.hasExistingMessages}
        currentReasoningConfig={props.currentReasoningConfig}
        currentTemperature={props.currentTemperature}
      >
        <AttachmentProvider selectedModel={selectedModel as AIModel | null}>
          <ChatInputInner {...props} ref={ref} />
        </AttachmentProvider>
      </ChatInputProvider>
    );
  }
);

ChatInput.displayName = "ChatInput";
