import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { FILE_LIMITS } from "@shared/file-constants";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
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
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import {
  convertImageToWebP,
  getFileLanguage,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { getDefaultReasoningConfig } from "@/lib/message-reasoning-utils";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
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
  messages?: ChatMessage[]; // Add messages prop for history navigation
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
      messages,
    },
    ref
  ) => {
    const { user, canSendMessage } = useUserDataContext();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prevIsStreamingRef = useRef(isStreaming);
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

    // History navigation state - optimized for performance
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [originalInput, setOriginalInput] = useState("");

    // Lazy-load conversation messages only when history navigation is used
    const { messages: conversationMessages } = useChatMessages({
      conversationId,
      onError: () => {
        // Handle errors gracefully - history navigation is optional
      },
    });

    // Initialize file upload hook
    const { uploadFile } = useConvexFileUpload();
    const notificationDialog = useNotificationDialog();

    // Drag and drop state
    const [isDragOver, setIsDragOver] = useState(false);

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

              const uploadResult = await uploadFile(file);
              uploadedAttachments.push({
                ...attachment,
                storageId: uploadResult.storageId,
                url: uploadResult.url,
              });
            } catch (error) {
              console.error("Failed to upload attachment:", error);
              // Keep the original attachment without storageId for fallback
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

    // Remove the synchronous state sync effect - this was causing input lag
    // State preservation is now handled by the debounced setInput function

    useEffect(() => {
      if (conversationId && !shouldUsePreservedState) {
        setReasoningConfigState(getDefaultReasoningConfig());
      } else if (currentReasoningConfig && shouldUsePreservedState) {
        setReasoningConfigState(currentReasoningConfig);
      }
    }, [conversationId, shouldUsePreservedState, currentReasoningConfig]);

    // Debounced state preservation to avoid excessive local storage writes
    const preservationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-focus input after streaming completes - optimal UX
    useEffect(() => {
      // Focus input when streaming transitions from true to false
      if (prevIsStreamingRef.current && !isStreaming) {
        // Small delay to ensure DOM is updated and avoid interrupting any final updates
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            // Subtle visual cue that input is ready for typing
            textareaRef.current.style.transform = "scale(1.001)";
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.style.transform = "";
              }
            }, 200);
          }
        }, 50);
      }
      prevIsStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (preservationTimeoutRef.current) {
          clearTimeout(preservationTimeoutRef.current);
        }
      };
    }, []);

    const setInput = useCallback(
      (value: string) => {
        setInputState(value);

        // Debounce state preservation for better performance during fast typing
        if (shouldUsePreservedState) {
          if (preservationTimeoutRef.current) {
            clearTimeout(preservationTimeoutRef.current);
          }

          preservationTimeoutRef.current = setTimeout(() => {
            setChatInputState({ input: value });
            preservationTimeoutRef.current = null;
          }, 150); // 150ms debounce for state preservation
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

    // Optimized user messages for history navigation - limited processing
    const userMessages = useMemo(() => {
      const sourceMessages = messages || conversationMessages;
      if (!sourceMessages || sourceMessages.length === 0) {
        return [];
      }

      // Efficient processing limited to last 10 user messages for performance
      const userContents: string[] = [];
      for (
        let i = sourceMessages.length - 1;
        i >= 0 && userContents.length < 10;
        i--
      ) {
        const msg = sourceMessages[i];
        if (msg.role === "user" && msg.content) {
          userContents.push(msg.content);
        }
      }
      return userContents;
    }, [messages, conversationMessages]);

    // Optimized history navigation (Up = older messages)
    const handleHistoryNavigation = useCallback(() => {
      if (userMessages.length === 0) {
        return false;
      }

      // Store original input on first navigation
      if (historyIndex === -1) {
        setOriginalInput(input);
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex < userMessages.length) {
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);

        // Optimized cursor positioning
        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 0);

        return true;
      }

      return false;
    }, [historyIndex, input, userMessages, setInput]);

    // Optimized reverse history navigation (Down = newer messages)
    const handleHistoryNavigationDown = useCallback(() => {
      if (historyIndex <= -1) {
        return false;
      }

      const nextIndex = historyIndex - 1;

      if (nextIndex === -1) {
        // Return to original input
        setHistoryIndex(-1);
        setInput(originalInput);

        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 0);

        return true;
      }

      if (nextIndex >= 0) {
        // Navigate to newer message in history
        setHistoryIndex(nextIndex);
        setInput(userMessages[nextIndex]);

        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.setSelectionRange(
              textarea.value.length,
              textarea.value.length
            );
          }
        }, 0);

        return true;
      }

      return false;
    }, [historyIndex, originalInput, userMessages, setInput]);

    // Optimized input change with efficient history reset
    const handleInputChange = useCallback(
      (value: string) => {
        // Reset history state only when user is actively typing (not navigating)
        if (historyIndex !== -1 && value !== userMessages[historyIndex]) {
          setHistoryIndex(-1);
          setOriginalInput("");
        }
        setInput(value);
      },
      [historyIndex, userMessages, setInput]
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

    // Process files for drag and drop
    const processFiles = useCallback(
      async (files: FileList) => {
        const newAttachments: Attachment[] = [];

        // Check if model is properly selected and typed
        const validModel =
          isUserModel(selectedModel) &&
          selectedModel.provider &&
          selectedModel.modelId
            ? selectedModel
            : null;

        for (const file of Array.from(files)) {
          // Check file size
          if (file.size > FILE_LIMITS.MAX_SIZE_BYTES) {
            notificationDialog.notify({
              title: "File Too Large",
              description: `File ${file.name} exceeds the ${Math.round(
                FILE_LIMITS.MAX_SIZE_BYTES / (1024 * 1024)
              )}MB limit.`,
              type: "error",
            });
            continue;
          }

          // Check if we have a valid model for file type checking
          if (!validModel) {
            notificationDialog.notify({
              title: "No Model Selected",
              description: "Please select a model to upload files.",
              type: "error",
            });
            continue;
          }

          const fileSupport = isFileTypeSupported(file.type, validModel);
          if (!fileSupport.supported) {
            notificationDialog.notify({
              title: "Unsupported File Type",
              description: `File ${file.name} is not supported by the current model.`,
              type: "error",
            });
            continue;
          }

          try {
            if (fileSupport.category === "text") {
              const textContent = await readFileAsText(file);
              newAttachments.push({
                type: "text",
                url: "",
                name: file.name,
                size: file.size,
                content: textContent,
                language: getFileLanguage(file.name),
              });
            } else if (fileSupport.category === "pdf") {
              // For PDFs, we'll rely on the file upload hook to handle extraction
              // This is just a placeholder - the actual processing happens in useFileUpload
              const base64Content = await readFileAsBase64(file);
              newAttachments.push({
                type: "pdf",
                url: "",
                name: file.name,
                size: file.size,
                content: base64Content,
                mimeType: file.type,
              });
            } else {
              let base64Content: string;
              let mimeType = file.type;

              if (fileSupport.category === "image") {
                try {
                  const converted = await convertImageToWebP(file);
                  base64Content = converted.base64;
                  mimeType = converted.mimeType;
                } catch {
                  base64Content = await readFileAsBase64(file);
                }
              } else {
                base64Content = await readFileAsBase64(file);
              }

              newAttachments.push({
                type: fileSupport.category as "image" | "pdf" | "text",
                url: "",
                name: file.name,
                size: file.size,
                content: base64Content,
                mimeType,
              });
            }
          } catch {
            notificationDialog.notify({
              title: "File Upload Failed",
              description: `Failed to process ${file.name}`,
              type: "error",
            });
          }
        }

        if (newAttachments.length > 0) {
          addAttachments(newAttachments);
        }
      },
      [selectedModel, notificationDialog, addAttachments]
    );

    const removeAttachment = useCallback(
      (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
      },
      [setAttachments]
    );

    const canSend = canSendMessage;
    const [isUploading, setIsUploading] = useState(false);

    // Drag and drop event handlers
    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragOver) {
          setIsDragOver(true);
        }
      },
      [isDragOver]
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Only set drag over to false if we're leaving the container
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const isOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;

      if (isOutside) {
        setIsDragOver(false);
      }
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!canSend || isLoading || isStreaming) {
          return;
        }

        const files = e.dataTransfer.files;
        if (files.length > 0) {
          await processFiles(files);
        }
      },
      [canSend, isLoading, isStreaming, processFiles]
    );

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
      } catch (_error) {
        // Chat error is handled by the streaming hook
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
              } catch (_error) {
                // Summary generation failed, continue without summary
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
          } catch (_error) {
            // Conversation creation error is handled by the main flow
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
              "relative chat-input-container rounded-xl p-2 sm:p-2.5",
              // Performance: Remove expensive transitions for better input responsiveness
              "contain-layout will-change-[transform,opacity]",
              chatInputStateClass,
              isDragOver && canSend && "ring-2 ring-primary/50 bg-primary/5"
            )}
            style={{
              // Force GPU acceleration for the main container
              transform: "translate3d(0, 0, 0)",
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragOver && canSend && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
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

            <AttachmentDisplay
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
            />

            <div className="flex items-end gap-3">
              <div className="flex-1 flex items-center contain-layout">
                <ChatInputField
                  value={input}
                  onChange={handleInputChange}
                  onSubmit={submit}
                  textareaRef={textareaRef}
                  placeholder={placeholder}
                  disabled={isLoading || isStreaming || isUploading || !canSend}
                  onHistoryNavigation={handleHistoryNavigation}
                  onHistoryNavigationDown={handleHistoryNavigationDown}
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
