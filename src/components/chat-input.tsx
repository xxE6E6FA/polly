import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useQuery } from "convex/react";
import { useLocation } from "react-router";

import { AttachmentList } from "@/components/chat-input/attachment-list";
import { PrivateModeToggle } from "@/components/chat-input/private-mode-toggle";
import { InputControls } from "@/components/chat-input/input-controls";
import { FilePreviewDialog } from "@/components/ui/file-preview-dialog";
import { NotificationDialog } from "@/components/ui/notification-dialog";
import { ChatWarningBanner } from "@/components/ui/chat-warning-banner";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useUser } from "@/hooks/use-user";
import { useChatWarnings } from "@/hooks/use-chat-warnings";
import { useChatVisualMode } from "@/hooks/use-chat-visual-mode";
import { useChatPlaceholder } from "@/hooks/use-chat-placeholder";
import { useChatSubmit } from "@/hooks/use-chat-submit";
import { cn } from "@/lib/utils";
import {
  type AIModel,
  type Attachment,
  type ConversationId,
  type ReasoningConfig,
} from "@/types";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

type ChatInputProps = {
  onSendMessage?: (
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  onSendMessageToNewConversation?: (
    content: string,
    shouldNavigate?: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaPrompt?: string | null,
    personaId?: Id<"personas"> | null
  ) => Promise<ConversationId | undefined>;
  onInputStart?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
};

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
};

export const ChatInput = React.memo(
  forwardRef<ChatInputRef, ChatInputProps>((props, ref) => {
    // Core state and refs
    const [input, setInput] = useState("");
    const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputControlsRef = useRef<{ handleSubmit: () => void } | null>(null);
    const location = useLocation();

    // User and model data
    const {
      canSendMessage,
      hasMessageLimit,
      isAnonymous,
      hasUserApiKeys,
      monthlyUsage,
      hasUnlimitedCalls,
    } = useUser();
    const { selectedModel } = useSelectedModel();
    const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});

    // Check if Polly model is selected and monthly limit is reached
    const isPollyLimitReached = useMemo(() => {
      return (
        selectedModel?.free &&
        monthlyUsage &&
        monthlyUsage.remainingMessages === 0 &&
        !hasUnlimitedCalls
      );
    }, [selectedModel, monthlyUsage, hasUnlimitedCalls]);

    // Override canSendMessage if Polly limit is reached
    const effectiveCanSendMessage = canSendMessage && !isPollyLimitReached;

    // Use our new hooks
    const visualMode = useChatVisualMode();
    const warnings = useChatWarnings();
    const defaultPlaceholder = useChatPlaceholder({
      placeholder: props.placeholder,
      canSendMessage: effectiveCanSendMessage,
      hasMessageLimit,
      isAnonymous,
      hasUserApiKeys,
    });

    const placeholderText = useMemo(() => {
      if (isPollyLimitReached) {
        return "Polly model limit reached. Switch to a BYOK model to continue.";
      }
      return defaultPlaceholder;
    }, [isPollyLimitReached, defaultPlaceholder]);

    // Submit logic via hook
    const { submit, submitToNewConversation } = useChatSubmit({
      conversationId: props.conversationId,
      onSendMessage: props.onSendMessage,
      onSendMessageToNewConversation: props.onSendMessageToNewConversation,
      onAfterSubmit: () => {
        // Refocus the textarea after sending message
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      },
    });

    const currentModel = useMemo(() => {
      if (!selectedModel) {
        return;
      }
      return {
        ...selectedModel,
        contextLength: selectedModel.contextLength,
        _id: selectedModel._id,
        _creationTime: selectedModel._creationTime,
        userId: selectedModel.userId,
      } as AIModel;
    }, [selectedModel]);

    const {
      attachments,
      handleFileUpload,
      removeAttachment,
      clearAttachments,
      buildMessageContent,
      getBinaryAttachments,
      notificationDialog,
    } = useFileUpload({ currentModel });

    const hasEnabledModels = useQuery(api.userModels.hasUserModels, {});

    // Get Convex file URL if the preview file has a storage ID
    const previewFileUrl = useQuery(
      api.fileStorage.getFileUrl,
      previewFile?.storageId
        ? { storageId: previewFile.storageId as Id<"_storage"> }
        : "skip"
    );

    // Determine the actual preview URL
    const previewImageUrl = useMemo(() => {
      if (!previewFile) return undefined;

      // If we have a storageId, use the Convex URL
      if (previewFile.storageId) {
        return previewFileUrl || undefined;
      }

      // For private mode files with Base64 content
      if (previewFile.content && previewFile.mimeType) {
        return `data:${previewFile.mimeType};base64,${previewFile.content}`;
      }

      // Fallback to regular URL
      return previewFile.url;
    }, [previewFile, previewFileUrl]);

    const clearInput = useCallback(() => {
      setInput("");
      // Ensure textarea maintains focus after clearing
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }, []);

    // Handle sending to a new conversation
    const handleSendAsNewConversation = useCallback(
      async (navigate: boolean) => {
        if (!input.trim() && attachments.length === 0) {
          return;
        }

        const messageContent = buildMessageContent(input);
        const binaryAttachments = getBinaryAttachments();

        const newConversationId = await submitToNewConversation(
          messageContent,
          binaryAttachments.length > 0 ? binaryAttachments : [],
          navigate
        );

        clearInput();
        clearAttachments();

        // Return the new conversation ID in case it's needed by the caller
        return newConversationId;
      },
      [
        input,
        attachments.length,
        buildMessageContent,
        getBinaryAttachments,
        submitToNewConversation,
        clearInput,
        clearAttachments,
      ]
    );

    const addQuote = useCallback((quote: string) => {
      setInput(prev => {
        const currentValue = prev.trim();
        return currentValue
          ? `${currentValue}\n\n${quote}\n\n`
          : `${quote}\n\n`;
      });

      setTimeout(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) {
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }, 0);
    }, []);

    const handleSubmit = useCallback(() => {
      if (inputControlsRef.current?.handleSubmit) {
        inputControlsRef.current.handleSubmit();
      }
    }, []);

    const handleFormSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmit();
      },
      [handleSubmit]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit]
    );

    const handlePreviewFileClose = useCallback((open: boolean) => {
      if (!open) {
        setPreviewFile(null);
      }
    }, []);

    const handlePrivateModeToggle = useCallback(() => {
      visualMode.toggleMode();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }, [visualMode]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        addQuote,
        setInput,
      }),
      [addQuote]
    );

    useLayoutEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
      }
    }, [input]);

    // Refocus textarea when streaming stops
    useEffect(() => {
      if (!props.isStreaming && !props.isLoading) {
        // Small delay to ensure DOM has settled
        const timeoutId = setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    }, [props.isStreaming, props.isLoading]);

    // Memoize form classes
    const formClasses = useMemo(
      () =>
        cn(
          "rounded-xl p-2.5 sm:p-3 transition-all duration-300",
          effectiveCanSendMessage
            ? visualMode.isPrivateMode
              ? "border-2 border-purple-500/60 bg-gradient-to-br from-purple-50/80 via-purple-25/50 to-amber-50/30 dark:from-purple-950/30 dark:via-purple-900/20 dark:to-amber-950/10 shadow-lg shadow-purple-500/20 dark:shadow-purple-500/10"
              : "chat-input-container border-2 border-blue-200/30 dark:border-blue-800/20 bg-gradient-to-br from-blue-50/20 to-green-50/10 dark:from-blue-950/10 dark:to-green-950/5"
            : "border border-border bg-muted/50 dark:bg-muted/30 opacity-75"
        ),
      [effectiveCanSendMessage, visualMode.isPrivateMode]
    );

    // Memoize textarea classes
    const textareaClasses = useMemo(
      () =>
        cn(
          "w-full resize-none bg-transparent border-0 outline-none ring-0 focus:ring-0 text-base sm:text-sm leading-relaxed transition-opacity duration-200 min-h-[24px] max-h-[100px] overflow-y-auto py-1",
          effectiveCanSendMessage
            ? "placeholder:text-muted-foreground/60"
            : "placeholder:text-muted-foreground cursor-not-allowed",
          // Add right padding when private mode toggle is shown
          location.pathname !== "/private" && !props.conversationId && "pr-14"
        ),
      [effectiveCanSendMessage, location.pathname, props.conversationId]
    );

    return (
      <div className="relative px-3 pb-2 pt-1 sm:px-6 sm:pb-3">
        <div className="mx-auto w-full max-w-3xl">
          {warnings.showLimitWarning && !warnings.showLimitReached && (
            <ChatWarningBanner
              type="warning"
              message={warnings.limitWarningMessage}
              onDismiss={warnings.dismissWarning}
            />
          )}

          {warnings.showLimitReached && (
            <ChatWarningBanner
              type="error"
              message={warnings.limitReachedMessage}
            />
          )}

          <form onSubmit={handleFormSubmit}>
            <div className={cn(formClasses, "relative overflow-hidden")}>
              {/* Private Mode Toggle - only show when not on /private route and not in a conversation */}
              {location.pathname !== "/private" && !props.conversationId && (
                <PrivateModeToggle
                  isPrivateMode={visualMode.isPrivateMode}
                  onToggle={handlePrivateModeToggle}
                />
              )}

              <AttachmentList
                attachments={attachments}
                canChat={effectiveCanSendMessage}
                onPreviewFile={setPreviewFile}
                onRemoveAttachment={removeAttachment}
              />

              <div className="flex items-end gap-3">
                <div className="group relative flex-1">
                  <textarea
                    ref={textareaRef}
                    className={textareaClasses}
                    disabled={
                      props.isLoading ||
                      props.isStreaming ||
                      !effectiveCanSendMessage
                    }
                    placeholder={placeholderText}
                    rows={1}
                    style={{ fontFamily: "inherit" }}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </div>

              <InputControls
                ref={inputControlsRef}
                attachments={attachments}
                buildMessageContent={buildMessageContent}
                canChat={effectiveCanSendMessage}
                clearAttachments={clearAttachments}
                clearInput={clearInput}
                conversationId={props.conversationId}
                currentModel={currentModel}
                getBinaryAttachments={getBinaryAttachments}
                handleFileUpload={handleFileUpload}
                hasApiKeys={hasApiKeys ?? false}
                hasEnabledModels={hasEnabledModels ?? false}
                hasExistingMessages={props.hasExistingMessages ?? false}
                input={input}
                isLoading={props.isLoading ?? false}
                isStreaming={props.isStreaming ?? false}
                selectedModel={selectedModel as AIModel | undefined}
                onInputStart={props.onInputStart}
                onSendAsNewConversation={handleSendAsNewConversation}
                onSendMessage={submit}
                onStop={props.onStop}
              />
            </div>
          </form>
        </div>

        <NotificationDialog
          actionText={notificationDialog.options.actionText}
          description={notificationDialog.options.description}
          open={notificationDialog.isOpen}
          title={notificationDialog.options.title}
          type={notificationDialog.options.type}
          onAction={notificationDialog.handleAction}
          onOpenChange={notificationDialog.handleOpenChange}
        />

        <FilePreviewDialog
          attachment={previewFile}
          imageUrl={previewImageUrl}
          open={Boolean(previewFile)}
          onOpenChange={handlePreviewFileClose}
        />
      </div>
    );
  })
);

ChatInput.displayName = "ChatInput";
