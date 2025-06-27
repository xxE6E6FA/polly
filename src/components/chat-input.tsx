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

import { Link, useNavigate } from "react-router";

import { XIcon } from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";

import { AttachmentList } from "@/components/chat-input/attachment-list";
import { InputControls } from "@/components/chat-input/input-controls";
import { ConvexFileDisplay } from "@/components/convex-file-display";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NotificationDialog } from "@/components/ui/notification-dialog";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useUser } from "@/hooks/use-user";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type AIModel, type Attachment } from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";

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
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: string,
    personaPrompt?: string | null,
    personaId?: Id<"personas"> | null
  ) => Promise<void>;
  onInputStart?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  conversationId?: string;
  hasExistingMessages?: boolean;
};

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
};

// Constants for shared styles
const WARNING_BANNER_CLASSES =
  "absolute -top-8 left-1/2 transform -translate-x-1/2 z-10";
const WARNING_CONTENT_CLASSES =
  "inline-flex items-center gap-2 p-2.5 rounded-md transition-all duration-200 text-xs shadow-lg h-8 whitespace-nowrap";
const WARNING_BUTTON_CLASSES = "p-0.5 rounded transition-colors duration-150";

// Warning Banner Component
const WarningBanner = React.memo<{
  type: "warning" | "error";
  onDismiss?: () => void;
  children: React.ReactNode;
}>(({ type, onDismiss, children }) => {
  const isWarning = type === "warning";
  const colorClasses = isWarning
    ? "bg-amber-50 dark:bg-amber-950/90 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 backdrop-blur-sm"
    : "bg-red-50 dark:bg-red-950/90 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 backdrop-blur-sm";

  const buttonHoverClasses = isWarning
    ? "hover:bg-amber-100 dark:hover:bg-amber-900/50"
    : "hover:bg-red-100 dark:hover:bg-red-900/50";

  return (
    <div className={WARNING_BANNER_CLASSES}>
      <div className={cn(WARNING_CONTENT_CLASSES, colorClasses)}>
        <div>{children}</div>
        {onDismiss && (
          <button
            aria-label="Dismiss"
            className={cn(WARNING_BUTTON_CLASSES, buttonHoverClasses)}
            onClick={onDismiss}
          >
            <XIcon className="h-3.5 w-3.5 hover:opacity-80" />
          </button>
        )}
      </div>
    </div>
  );
});

WarningBanner.displayName = "WarningBanner";

export const ChatInput = React.memo(
  forwardRef<ChatInputRef, ChatInputProps>((props, ref) => {
    const hasEnabledModels = useQuery(api.userModels.hasUserModels, {});
    const selectedModel = useSelectedModel();
    const hasApiKeys = useQuery(api.apiKeys.hasAnyApiKey, {});
    const generateConversationSummary = useAction(
      api.conversationSummary.generateConversationSummary
    );

    const [input, setInput] = useState("");
    const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
    const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(
      new Set()
    );

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputControlsRef = useRef<{ handleSubmit: () => void } | null>(null);

    const { user } = useUser();
    const { createNewConversationWithResponse } = useCreateConversation();
    const navigate = useNavigate();

    const {
      messageCount,
      remainingMessages,
      hasMessageLimit,
      canSendMessage,
      isAnonymous,
      monthlyUsage,
      hasUserApiKeys,
      hasUnlimitedCalls,
    } = useUser();

    const handleSend = useCallback(
      async (
        content: string,
        attachments?: Attachment[],
        useWebSearch?: boolean,
        personaId?: Id<"personas"> | null,
        reasoningConfig?: ReasoningConfig
      ) => {
        if (props.conversationId && props.onSendMessage) {
          props.onSendMessage(
            content,
            attachments,
            useWebSearch,
            personaId,
            reasoningConfig
          );
          // Refocus the textarea after sending message in existing conversation
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 0);
        } else {
          const conversationId = await createNewConversationWithResponse({
            firstMessage: content,
            personaId,
            userId: user?._id,
            attachments,
            useWebSearch,
            generateTitle: true,
            // TODO: Add reasoningConfig support for new conversations
          });
          if (conversationId) {
            navigate(ROUTES.CHAT_CONVERSATION(conversationId));
          }
        }
      },
      [props, createNewConversationWithResponse, user?._id, navigate]
    );

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
      uploadProgress,
      handleFileUpload,
      removeAttachment,
      clearAttachments,
      buildMessageContent,
      getBinaryAttachments,
      notificationDialog,
    } = useFileUpload({ currentModel });

    // Memoize placeholder text calculation
    const placeholderText = useMemo(() => {
      if (props.placeholder) {
        return props.placeholder;
      }

      if (!canSendMessage && hasMessageLimit) {
        if (isAnonymous) {
          return "Message limit reached. Sign in to continue chatting...";
        }
        return hasUserApiKeys
          ? "Monthly Polly model limit reached. Use BYOK models or wait for reset..."
          : "Monthly limit reached. Add API keys to use BYOK models...";
      }

      if (hasApiKeys === undefined || hasEnabledModels === undefined) {
        return "Loading...";
      }

      return "Ask me anything...";
    }, [
      props.placeholder,
      canSendMessage,
      hasMessageLimit,
      isAnonymous,
      hasUserApiKeys,
      hasApiKeys,
      hasEnabledModels,
    ]);

    // Create a key based on messageCount for warning dismissal
    const warningDismissalKey = `warning-${messageCount}`;

    // Memoize warning states
    const warningStates = useMemo(
      () => ({
        showLimitWarning:
          hasMessageLimit &&
          messageCount > 0 &&
          canSendMessage &&
          !dismissedWarnings.has(warningDismissalKey) &&
          !hasUnlimitedCalls,
        showLimitReached:
          hasMessageLimit && !canSendMessage && !hasUnlimitedCalls,
      }),
      [
        hasMessageLimit,
        messageCount,
        canSendMessage,
        dismissedWarnings,
        warningDismissalKey,
        hasUnlimitedCalls,
      ]
    );

    // Memoize warning messages
    const warningMessages = useMemo(() => {
      const limitWarningMessage = isAnonymous ? (
        <>
          {remainingMessages} message{remainingMessages === 1 ? "" : "s"}{" "}
          remaining •{" "}
          <Link
            className="font-medium underline underline-offset-2 hover:no-underline"
            to={ROUTES.AUTH}
          >
            Sign in
          </Link>{" "}
          for unlimited chats
        </>
      ) : hasUnlimitedCalls ? (
        "You have unlimited messages"
      ) : (
        <>
          {monthlyUsage?.remainingMessages || 0} monthly message
          {monthlyUsage?.remainingMessages === 1 ? "" : "s"} remaining •
          {hasUserApiKeys
            ? " Use BYOK models for unlimited chats"
            : " Add API keys for unlimited chats"}
        </>
      );

      const limitReachedMessage = isAnonymous ? (
        <>
          Message limit reached.{" "}
          <Link
            className="font-medium underline underline-offset-2 hover:no-underline"
            to={ROUTES.AUTH}
          >
            Sign in
          </Link>{" "}
          to continue chatting without limits.
        </>
      ) : (
        <>
          Monthly Polly model limit reached.
          {hasUserApiKeys
            ? " Use your BYOK models to continue chatting."
            : " Add API keys to access BYOK models."}
        </>
      );

      return { limitWarningMessage, limitReachedMessage };
    }, [
      isAnonymous,
      remainingMessages,
      hasUnlimitedCalls,
      monthlyUsage?.remainingMessages,
      hasUserApiKeys,
    ]);

    const clearInput = useCallback(() => {
      setInput("");
      // Ensure textarea maintains focus after clearing
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }, []);

    // New callback for sending to a new conversation
    const handleSendAsNewConversation = useCallback(
      async (navigate: boolean) => {
        if (!input.trim() && attachments.length === 0) {
          return;
        }

        if (props.onSendMessageToNewConversation && props.conversationId) {
          const messageContent = buildMessageContent(input);
          const binaryAttachments = getBinaryAttachments();

          // Generate a summary of the current conversation for context
          let contextSummary: string | undefined;
          try {
            contextSummary = await generateConversationSummary({
              conversationId: props.conversationId as Id<"conversations">,
              maxTokens: 150,
            });
          } catch (error) {
            console.error("Failed to generate conversation summary:", error);
            // Continue without summary if generation fails
          }

          await props.onSendMessageToNewConversation(
            messageContent,
            navigate,
            binaryAttachments.length > 0 ? binaryAttachments : undefined,
            contextSummary,
            props.conversationId, // SourceConversationId
            null, // PersonaPrompt
            null // PersonaId - could be passed from state if needed
          );

          clearInput();
          clearAttachments();

          // Refocus textarea after clearing
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 0);
        }
      },
      [
        props,
        input,
        attachments,
        buildMessageContent,
        getBinaryAttachments,
        clearInput,
        clearAttachments,
        generateConversationSummary,
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

    const handleDismissWarning = useCallback(() => {
      setDismissedWarnings(prev => new Set([...prev, warningDismissalKey]));
    }, [warningDismissalKey]);

    const handlePreviewFileClose = useCallback((open: boolean) => {
      if (!open) {
        setPreviewFile(null);
      }
    }, []);

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
          "rounded-xl p-3 sm:p-4 transition-all duration-300",
          canSendMessage
            ? "chat-input-container"
            : "border border-border bg-muted/50 dark:bg-muted/30 opacity-75"
        ),
      [canSendMessage]
    );

    // Memoize textarea classes
    const textareaClasses = useMemo(
      () =>
        cn(
          "w-full resize-none bg-transparent border-0 outline-none ring-0 focus:ring-0 text-base sm:text-sm leading-relaxed transition-opacity duration-200 min-h-[24px] max-h-[100px] overflow-y-auto py-1",
          canSendMessage
            ? "placeholder:text-muted-foreground/60"
            : "placeholder:text-muted-foreground cursor-not-allowed"
        ),
      [canSendMessage]
    );

    return (
      <div className="relative px-3 pb-3 pt-2 sm:px-6 sm:pb-6">
        <div className="mx-auto w-full max-w-3xl">
          {warningStates.showLimitWarning &&
            !warningStates.showLimitReached && (
              <WarningBanner type="warning" onDismiss={handleDismissWarning}>
                {warningMessages.limitWarningMessage}
              </WarningBanner>
            )}

          {warningStates.showLimitReached && (
            <WarningBanner type="error">
              {warningMessages.limitReachedMessage}
            </WarningBanner>
          )}

          <form onSubmit={handleFormSubmit}>
            <div className={formClasses}>
              <AttachmentList
                attachments={attachments}
                canChat={canSendMessage}
                uploadProgress={uploadProgress}
                onPreviewFile={setPreviewFile}
                onRemoveAttachment={removeAttachment}
              />

              <div className="flex items-end gap-3">
                <div className="group relative flex-1">
                  <textarea
                    ref={textareaRef}
                    className={textareaClasses}
                    disabled={props.isLoading || !canSendMessage}
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
                canChat={canSendMessage}
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
                onSendMessage={handleSend}
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

        <Dialog
          open={Boolean(previewFile)}
          onOpenChange={handlePreviewFileClose}
        >
          <DialogContent className="max-h-[90vh] p-0 sm:max-w-4xl">
            <div className="p-6">
              {previewFile && (
                <ConvexFileDisplay
                  attachment={previewFile}
                  className="flex justify-center"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  })
);

ChatInput.displayName = "ChatInput";
