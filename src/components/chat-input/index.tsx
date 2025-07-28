import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
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
import { TemperaturePicker } from "@/components/temperature-picker";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { getDefaultReasoningConfig } from "@/lib/message-reasoning-utils";
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
      hasExistingMessages = false,
      isLoading = false,
      isStreaming = false,
      onStop,
      placeholder = "Ask me anything...",
      currentReasoningConfig,
      currentTemperature,
      onTemperatureChange,
    },
    ref
  ) => {
    const { user, canSendMessage } = useUserDataContext();

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
    const _generateSummaryAction = useAction(
      api.conversationSummary.generateConversationSummary
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
    const [reasoningConfig, setReasoningConfigState] =
      useState<ReasoningConfig>(() => {
        if (shouldUsePreservedState) {
          return chatInputState.reasoningConfig;
        }
        return getDefaultReasoningConfig();
      });
    const [temperature, setTemperatureState] = useState<number | undefined>(
      () =>
        shouldUsePreservedState
          ? chatInputState.temperature
          : currentTemperature
    );

    // Initialize file upload hook
    const { uploadFile } = useConvexFileUpload();

    // Custom function to upload attachments to Convex storage
    const uploadAttachmentsToConvex = useCallback(
      async (attachmentsToUpload: Attachment[]): Promise<Attachment[]> => {
        if (isPrivateMode) {
          // In private mode, convert base64 content to data URLs for local use
          return attachmentsToUpload.map(attachment => {
            if (attachment.content && attachment.mimeType && !attachment.url) {
              return {
                ...attachment,
                url: `data:${attachment.mimeType};base64,${attachment.content}`,
                contentType: attachment.mimeType, // AI SDK expects contentType field
              };
            }
            return attachment;
          });
        }

        const uploadedAttachments: Attachment[] = [];

        for (const attachment of attachmentsToUpload) {
          if (attachment.type === "text" || attachment.storageId) {
            uploadedAttachments.push(attachment);
          } else if (attachment.content && attachment.mimeType) {
            try {
              // Convert Base64 back to File object for upload
              const byteCharacters = atob(attachment.content);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const file = new File([byteArray], attachment.name, {
                type: attachment.mimeType,
              });

              const uploadedAttachment = await uploadFile(file);
              uploadedAttachments.push(uploadedAttachment);
            } catch {
              uploadedAttachments.push(attachment);
            }
          } else {
            uploadedAttachments.push(attachment);
          }
        }

        return uploadedAttachments;
      },
      [isPrivateMode, uploadFile]
    );

    // Sync state updates to preserved state
    useEffect(() => {
      if (!shouldUsePreservedState) {
        return;
      }

      setChatInputState({
        selectedPersonaId,
        input,
        reasoningConfig,
        attachments,
        temperature,
      });
    }, [
      shouldUsePreservedState,
      setChatInputState,
      selectedPersonaId,
      input,
      reasoningConfig,
      attachments,
      temperature,
    ]);

    useEffect(() => {
      if (conversationId && !shouldUsePreservedState) {
        setReasoningConfigState(getDefaultReasoningConfig());
      } else if (currentReasoningConfig && shouldUsePreservedState) {
        setReasoningConfigState(currentReasoningConfig);
      }
    }, [conversationId, shouldUsePreservedState, currentReasoningConfig]);

    // State setters with preservation
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
      (newValue: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
        const value =
          typeof newValue === "function" ? newValue(attachments) : newValue;
        setAttachmentsState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ attachments: value });
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

    const setTemperature = useCallback(
      (value: number | undefined) => {
        setTemperatureState(value);
        if (shouldUsePreservedState) {
          setChatInputState({ temperature: value });
        }
        onTemperatureChange?.(value);
      },
      [shouldUsePreservedState, setChatInputState, onTemperatureChange]
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
    const [isUploading, setIsUploading] = useState(false);

    const submit = useCallback(async () => {
      if (input.trim().length === 0 && attachments.length === 0) {
        return;
      }

      setIsUploading(true);

      try {
        // Upload attachments to Convex storage if not in private mode
        const processedAttachments =
          await uploadAttachmentsToConvex(attachments);

        onSendMessage(
          input.trim(),
          processedAttachments,
          selectedPersonaId,
          reasoningConfig.enabled ? reasoningConfig : undefined,
          temperature
        );

        setInput("");
        setAttachments([]);
        textareaRef.current?.focus();
        if (shouldUsePreservedState) {
          clearChatInputState();
        }
      } catch (error) {
        console.error("Failed to send message:", error);
      } finally {
        setIsUploading(false);
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
      uploadAttachmentsToConvex,
      temperature,
    ]);

    const handleSendAsNewConversation = useCallback(
      async (
        shouldNavigate = true,
        personaId?: Id<"personas"> | null,
        reasoningConfig?: ReasoningConfig
      ) => {
        if (onSendAsNewConversation) {
          const currentInput = textareaRef.current?.value || "";

          try {
            // Generate summary if we have a current conversation
            let contextSummary: string | undefined;
            if (conversationId) {
              try {
                contextSummary = await _generateSummaryAction({
                  conversationId,
                  maxTokens: 150,
                });
              } catch (error) {
                console.error("Failed to generate summary:", error);
              }
            }

            // Upload attachments to Convex storage if not in private mode
            const processedAttachments =
              await uploadAttachmentsToConvex(attachments);

            const newConversationId = await onSendAsNewConversation(
              currentInput,
              shouldNavigate,
              processedAttachments,
              contextSummary,
              conversationId,
              personaId,
              reasoningConfig,
              temperature
            );

            if (newConversationId) {
              setInput("");
              setAttachments([]);
              if (shouldUsePreservedState) {
                clearChatInputState();
              }
            }
          } catch (error) {
            console.error("Failed to send as new conversation:", error);
          }
        }
      },
      [
        onSendAsNewConversation,
        attachments,
        uploadAttachmentsToConvex,
        conversationId,
        _generateSummaryAction,
        setInput,
        setAttachments,
        shouldUsePreservedState,
        clearChatInputState,
        temperature,
      ]
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

    let chatInputStateClass: string;
    if (!canSend) {
      chatInputStateClass = "chat-input-disabled";
    } else if (isPrivateMode) {
      chatInputStateClass = "chat-input-private";
    } else {
      chatInputStateClass = "chat-input-enabled";
    }

    return (
      <div
        className={cn(
          "relative px-3 pb-2 pt-1 sm:px-6 sm:pb-3",
          hasExistingMessages && "pt-6 sm:pt-7"
        )}
      >
        <div className="mx-auto w-full max-w-3xl">
          <WarningBanners hasExistingMessages={hasExistingMessages} />

          <div
            className={cn(
              "chat-input-container rounded-xl p-2 sm:p-2.5 transition-all duration-700",
              chatInputStateClass
            )}
          >
            <AttachmentDisplay
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
            />

            <div className="flex items-end gap-3">
              <div className="flex-1 flex items-center">
                <ChatInputField
                  value={input}
                  onChange={setInput}
                  onSubmit={submit}
                  textareaRef={textareaRef}
                  placeholder={placeholder}
                  disabled={isLoading || isStreaming || isUploading || !canSend}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/20 pt-2">
              <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
                <PersonaSelector
                  conversationId={conversationId}
                  hasExistingMessages={hasExistingMessages}
                  selectedPersonaId={selectedPersonaId}
                  onPersonaSelect={setSelectedPersonaId}
                />
                {canSend && <ModelPicker />}
                {canSend && (
                  <TemperaturePicker
                    temperature={temperature}
                    onTemperatureChange={setTemperature}
                    disabled={isLoading || isStreaming}
                  />
                )}
                {canSend && selectedModel && isUserModel(selectedModel) ? (
                  <ReasoningPicker
                    model={selectedModel}
                    config={reasoningConfig}
                    onConfigChange={setReasoningConfig}
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                {canSend && (
                  <FileUploadButton
                    disabled={isLoading || isStreaming || isUploading}
                    onAddAttachments={addAttachments}
                    isSubmitting={false}
                  />
                )}
                <SendButtonGroup
                  canSend={canSend}
                  isStreaming={Boolean(isStreaming)}
                  isLoading={Boolean(isLoading || isUploading)}
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
