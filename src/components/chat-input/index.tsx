import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ModelPicker } from "@/components/model-picker";
import { ReasoningConfigSelect } from "@/components/reasoning-config-select";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useChatWarnings } from "@/hooks/use-chat-warnings";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { useUserData } from "@/hooks/use-user-data";
import {
  getDefaultReasoningConfig,
  useLastMessageReasoningConfig,
} from "@/lib/message-reasoning-utils";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import type { Attachment, ConversationId, ReasoningConfig } from "@/types";
import { AttachmentDisplay } from "./attachment-display";
import { ChatInputField } from "./chat-input-field";
import { FileUploadButton } from "./file-upload-button";
import { PersonaSelector } from "./persona-selector";
import { SendButtonGroup } from "./send-button-group";
import { WarningBanners } from "./warning-banners";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  onSendAsNewConversation?: (
    content: string,
    navigate: boolean,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  currentReasoningConfig?: ReasoningConfig;
}

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
  getCurrentReasoningConfig: () => ReasoningConfig;
};

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      onSendMessage,
      onSendAsNewConversation,
      conversationId,
      hasExistingMessages,
      isLoading,
      isStreaming,
      onStop,
      placeholder,
      currentReasoningConfig,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { chatInputState, setChatInputState, clearChatInputState } =
      usePrivateMode();
    const selectedModel = usePersistentConvexQuery(
      "selected-model",
      api.userModels.getUserSelectedModel,
      {}
    );

    const shouldUsePreservedState = !(conversationId || hasExistingMessages);

    const [input, setInputState] = useState(() =>
      shouldUsePreservedState ? chatInputState.input : ""
    );
    const [attachments, setAttachmentsState] = useState<Attachment[]>(() =>
      shouldUsePreservedState ? chatInputState.attachments : []
    );
    const [selectedPersonaId, setSelectedPersonaIdState] =
      useState<Id<"personas"> | null>(() =>
        shouldUsePreservedState ? chatInputState.selectedPersonaId : null
      );
    // Get reasoning config from last user message in conversation
    const lastMessageReasoningConfig =
      useLastMessageReasoningConfig(conversationId);

    const [reasoningConfig, setReasoningConfigState] =
      useState<ReasoningConfig>(() => {
        // For existing conversations, use last message config
        if (conversationId && lastMessageReasoningConfig) {
          return lastMessageReasoningConfig;
        }

        // For new conversations (private mode), use preserved state
        if (shouldUsePreservedState) {
          return chatInputState.reasoningConfig;
        }

        // Default config
        return getDefaultReasoningConfig();
      });

    const [prevShouldUsePreservedState, setPrevShouldUsePreservedState] =
      useState(shouldUsePreservedState);

    if (prevShouldUsePreservedState !== shouldUsePreservedState) {
      setPrevShouldUsePreservedState(shouldUsePreservedState);

      if (shouldUsePreservedState) {
        setInputState(chatInputState.input);
        setAttachmentsState(chatInputState.attachments);
        setSelectedPersonaIdState(chatInputState.selectedPersonaId);
        setReasoningConfigState(chatInputState.reasoningConfig);
      } else if (conversationId && lastMessageReasoningConfig) {
        // When switching to an existing conversation, load its last message reasoning config
        setReasoningConfigState(lastMessageReasoningConfig);
      }
    }

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Handle conversation ID changes to load reasoning config from last message
    useEffect(() => {
      if (conversationId && !shouldUsePreservedState) {
        if (lastMessageReasoningConfig) {
          setReasoningConfigState(lastMessageReasoningConfig);
        } else {
          // Reset to default if no reasoning config exists in conversation
          setReasoningConfigState(getDefaultReasoningConfig());
        }
      }
    }, [conversationId, shouldUsePreservedState, lastMessageReasoningConfig]);

    // Sync with current reasoning config from chat service (for private chat)
    useEffect(() => {
      if (currentReasoningConfig && shouldUsePreservedState) {
        setReasoningConfigState(currentReasoningConfig);
      }
    }, [currentReasoningConfig, shouldUsePreservedState]);

    const userData = useUserData();
    const canSendMessage = userData?.canSendMessage ?? false;
    const { isPrivateMode } = usePrivateMode();
    const warnings = useChatWarnings();

    const hasWarnings = warnings.showLimitWarning || warnings.showLimitReached;

    const setInput = (value: string) => {
      setInputState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ input: value });
      }
    };

    const setAttachments = (
      value: Attachment[] | ((prev: Attachment[]) => Attachment[])
    ) => {
      const newValue = typeof value === "function" ? value(attachments) : value;
      setAttachmentsState(newValue);
      if (shouldUsePreservedState) {
        setChatInputState({ attachments: newValue });
      }
    };

    const setSelectedPersonaId = (value: Id<"personas"> | null) => {
      setSelectedPersonaIdState(value);
      if (shouldUsePreservedState) {
        setChatInputState({ selectedPersonaId: value });
      }
    };

    const setReasoningConfig = (value: ReasoningConfig) => {
      setReasoningConfigState(value);

      // Save to private mode state if needed (for new conversations)
      if (shouldUsePreservedState) {
        setChatInputState({ reasoningConfig: value });
      }
    };

    const addAttachments = (newAttachments: Attachment[]) => {
      setAttachments(prev => [...prev, ...newAttachments]);
    };

    const removeAttachment = (index: number) => {
      setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const submit = () => {
      if (
        (input.trim().length === 0 && attachments.length === 0) ||
        isSubmitting
      ) {
        return;
      }

      setIsSubmitting(true);
      try {
        onSendMessage(
          input.trim(),
          attachments,
          selectedPersonaId,
          reasoningConfig.enabled ? reasoningConfig : undefined
        );

        setInput("");
        setAttachments([]);
        textareaRef.current?.focus();

        if (shouldUsePreservedState) {
          clearChatInputState();
        }
      } catch (error) {
        console.error("Failed to submit message:", error);
      } finally {
        setIsSubmitting(false);
      }
    };

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      addQuote: (quote: string) => {
        const currentValue = textareaRef.current?.value.trim() || "";
        const newValue = currentValue
          ? `${currentValue}\n\n${quote}\n\n`
          : `${quote}\n\n`;
        setInput(newValue);
        setTimeout(() => textareaRef.current?.focus(), 0);
      },
      setInput,
      getCurrentReasoningConfig: () => reasoningConfig,
    }));

    const handleSendAsNewConversation = (
      navigate: boolean,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      if (onSendAsNewConversation) {
        const currentInput = textareaRef.current?.value || "";
        onSendAsNewConversation(
          currentInput,
          navigate,
          attachments,
          personaId,
          reasoningConfig
        );
      }
    };

    return (
      <div
        className={cn(
          "relative px-3 pb-2 pt-1 sm:px-6 sm:pb-3",
          hasExistingMessages && hasWarnings && "pt-6 sm:pt-7"
        )}
      >
        <div className="mx-auto w-full max-w-3xl">
          <WarningBanners
            warnings={{
              ...warnings,
              limitWarningMessage: warnings.limitWarningMessage || { text: "" },
              limitReachedMessage: warnings.limitReachedMessage || { text: "" },
            }}
            hasExistingMessages={hasExistingMessages}
          />

          <div
            className={cn(
              "rounded-xl p-2.5 sm:p-3 transition-all duration-700",
              canSendMessage
                ? isPrivateMode
                  ? "border-2 border-purple-500/60 bg-gradient-to-br from-purple-50/80 via-purple-25/50 to-amber-50/30 dark:from-purple-950/25 dark:via-purple-900/15 dark:to-amber-950/10"
                  : "chat-input-container"
                : "border border-border bg-muted/50 dark:bg-muted/30 opacity-75"
            )}
          >
            <AttachmentDisplay
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
            />

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <ChatInputField
                  value={input}
                  onChange={setInput}
                  onSubmit={submit}
                  textareaRef={textareaRef}
                  placeholder={placeholder}
                  disabled={isLoading || isStreaming || !canSendMessage}
                />
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/20 pt-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                <PersonaSelector
                  conversationId={conversationId}
                  hasExistingMessages={hasExistingMessages}
                  selectedPersonaId={selectedPersonaId}
                  onPersonaSelect={setSelectedPersonaId}
                />
                {canSendMessage && <ModelPicker />}
                {canSendMessage &&
                selectedModel &&
                isUserModel(selectedModel) ? (
                  <ReasoningConfigSelect
                    model={selectedModel}
                    config={reasoningConfig}
                    onConfigChange={setReasoningConfig}
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {canSendMessage && (
                  <FileUploadButton
                    disabled={isLoading || isStreaming}
                    onAddAttachments={addAttachments}
                    isSubmitting={isSubmitting}
                  />
                )}
                <SendButtonGroup
                  canSend={canSendMessage && !isSubmitting}
                  isStreaming={Boolean(isStreaming)}
                  isLoading={Boolean(isLoading)}
                  isSummarizing={isSubmitting}
                  hasExistingMessages={Boolean(hasExistingMessages)}
                  conversationId={conversationId}
                  hasInputText={
                    input.trim().length > 0 || attachments.length > 0
                  }
                  onSend={submit}
                  onStop={onStop}
                  onSendAsNewConversation={
                    onSendAsNewConversation
                      ? handleSendAsNewConversation
                      : undefined
                  }
                  hasApiKeys={canSendMessage}
                  hasEnabledModels={canSendMessage}
                  personaId={selectedPersonaId}
                  reasoningConfig={reasoningConfig}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ChatInput.displayName = "ChatInput";
