import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ModelPicker } from "@/components/model-picker";
import { ReasoningPicker } from "@/components/reasoning-picker";
import { useChatWarnings } from "@/hooks/use-chat-warnings";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import {
  getDefaultReasoningConfig,
  useLastMessageReasoningConfig,
} from "@/lib/message-reasoning-utils";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
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

const getNewQuotedValue = (currentValue: string, quote: string) => {
  return currentValue ? `${currentValue}\n\n${quote}\n\n` : `${quote}\n\n`;
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
    const { user, canSendMessage } = useUserDataContext();
    const warnings = useChatWarnings();
    const hasWarnings = warnings.showLimitWarning || warnings.showLimitReached;

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const {
      isPrivateMode,
      chatInputState,
      setChatInputState,
      clearChatInputState,
    } = usePrivateMode();
    const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
    const selectedModel = useMemo(() => {
      if (selectedModelRaw) {
        return selectedModelRaw;
      }
      return get(CACHE_KEYS.selectedModel, null);
    }, [selectedModelRaw]);
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
    const lastMessageReasoningConfig =
      useLastMessageReasoningConfig(conversationId);
    const [reasoningConfig, setReasoningConfigState] =
      useState<ReasoningConfig>(() => {
        if (conversationId && lastMessageReasoningConfig) {
          return lastMessageReasoningConfig;
        }
        if (shouldUsePreservedState) {
          return chatInputState.reasoningConfig;
        }
        return getDefaultReasoningConfig();
      });

    useEffect(() => {
      if (shouldUsePreservedState) {
        setInputState(chatInputState.input);
        setAttachmentsState(chatInputState.attachments);
        setSelectedPersonaIdState(chatInputState.selectedPersonaId);
        setReasoningConfigState(chatInputState.reasoningConfig);
      } else if (conversationId && lastMessageReasoningConfig) {
        setReasoningConfigState(lastMessageReasoningConfig);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      shouldUsePreservedState,
      chatInputState.selectedPersonaId,
      chatInputState.input,
      conversationId,
      lastMessageReasoningConfig,
      chatInputState.reasoningConfig,
      chatInputState.attachments,
    ]);

    useEffect(() => {
      if (conversationId && !shouldUsePreservedState) {
        if (lastMessageReasoningConfig) {
          setReasoningConfigState(lastMessageReasoningConfig);
        } else {
          setReasoningConfigState(getDefaultReasoningConfig());
        }
      } else if (currentReasoningConfig && shouldUsePreservedState) {
        setReasoningConfigState(currentReasoningConfig);
      }
    }, [
      conversationId,
      shouldUsePreservedState,
      lastMessageReasoningConfig,
      currentReasoningConfig,
    ]);

    const setInput = useCallback(
      (value: string) => {
        setInputState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ input: value });
        }
      },
      [shouldUsePreservedState, setChatInputState]
    );

    const setAttachments = useCallback(
      (value: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
        setAttachmentsState(prev => {
          const newValue = typeof value === "function" ? value(prev) : value;
          return newValue;
        });

        if (shouldUsePreservedState) {
          const newValue =
            typeof value === "function" ? value(attachments) : value;
          setChatInputState({ attachments: newValue });
        }
      },
      [shouldUsePreservedState, setChatInputState, attachments]
    );

    const setSelectedPersonaId = useCallback(
      (value: Id<"personas"> | null) => {
        setSelectedPersonaIdState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ selectedPersonaId: value });
        }
      },
      [shouldUsePreservedState, setChatInputState]
    );

    const setReasoningConfig = useCallback(
      (value: ReasoningConfig) => {
        setReasoningConfigState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ reasoningConfig: value });
        }
      },
      [shouldUsePreservedState, setChatInputState]
    );

    const addAttachments = useCallback(
      (newAttachments: Attachment[]) => {
        setAttachments(prev => [...prev, ...newAttachments]);
      },
      [setAttachments]
    );

    const removeAttachment = useCallback(
      (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
      },
      [setAttachments]
    );

    const canSend = canSendMessage;

    const submit = useCallback(() => {
      if (input.trim().length === 0 && attachments.length === 0) {
        return;
      }
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
    }, [
      input,
      attachments,
      selectedPersonaId,
      reasoningConfig,
      onSendMessage,
      setInput,
      setAttachments,
      shouldUsePreservedState,
      clearChatInputState,
    ]);

    const handleSendAsNewConversation = useCallback(
      (
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
      },
      [onSendAsNewConversation, attachments]
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

    if (user === undefined) {
      return null;
    }

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
              canSend
                ? isPrivateMode
                  ? "border-2 border-purple-500/60 bg-gradient-to-br from-purple-50/80 via-purple-25/50 to-amber-50/30 dark:from-purple-950/25 dark:via-purple-900/15 dark:to-amber-950/10"
                  : "border border-border bg-background"
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
                  disabled={isLoading || isStreaming || !canSend}
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
                {canSend && <ModelPicker />}
                {canSend && selectedModel && isUserModel(selectedModel) ? (
                  <ReasoningPicker
                    model={selectedModel}
                    config={reasoningConfig}
                    onConfigChange={setReasoningConfig}
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {canSend && (
                  <FileUploadButton
                    disabled={isLoading || isStreaming}
                    onAddAttachments={addAttachments}
                    isSubmitting={false}
                  />
                )}
                <SendButtonGroup
                  canSend={canSend}
                  isStreaming={Boolean(isStreaming)}
                  isLoading={Boolean(isLoading)}
                  isSummarizing={false}
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
                  hasApiKeys={canSend}
                  hasEnabledModels={canSend}
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
