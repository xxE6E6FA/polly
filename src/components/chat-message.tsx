import React, { memo, useCallback, useState } from "react";

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  NotePencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { Citations } from "@/components/citations";
import { ConvexFileDisplay } from "@/components/convex-file-display";
import { Reasoning } from "@/components/reasoning";
import { Button } from "@/components/ui/button";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type ChatMessage as ChatMessageType } from "@/types";

type ChatMessageProps = {
  message: ChatMessageType;
  isStreaming?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
};

type ActionButtonProps = {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
};

const ActionButton = memo(
  ({
    icon,
    tooltip,
    onClick,
    disabled,
    title,
    className,
  }: ActionButtonProps) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled={disabled}
          size="sm"
          title={title}
          variant="action"
          className={cn(
            "h-8 w-8 p-0 transition-all duration-200 hover:scale-110",
            className
          )}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
);

ActionButton.displayName = "ActionButton";

type MessageActionsProps = {
  isUser: boolean;
  isStreaming: boolean;
  isEditing?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  copyToClipboard: () => void;
  onEditMessage?: () => void;
  onRetryMessage?: () => void;
  onDeleteMessage?: () => void;
  model?: string;
  provider?: string;
  className?: string;
};

const MessageActions = memo(
  ({
    isUser,
    isStreaming,
    isEditing = false,
    isCopied,
    isRetrying,
    isDeleting,
    copyToClipboard,
    onEditMessage,
    onRetryMessage,
    onDeleteMessage,
    model,
    provider,
    className,
  }: MessageActionsProps) => {
    if (isStreaming) {
      return null;
    }

    const containerClassName = cn(
      "flex items-center gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 translate-y-0 sm:translate-y-1 sm:group-hover:translate-y-0 transition-all duration-300 ease-out",
      isUser && isEditing && "opacity-0 pointer-events-none translate-y-2",
      isUser && "justify-end mt-1.5",
      className
    );

    return (
      <div className={containerClassName}>
        <div className="flex items-center gap-1">
          <ActionButton
            disabled={isEditing}
            tooltip="Copy message"
            icon={
              isCopied ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )
            }
            onClick={copyToClipboard}
          />

          {onEditMessage && (
            <ActionButton
              disabled={isEditing}
              icon={<NotePencilIcon className="h-3.5 w-3.5" />}
              tooltip="Edit message"
              onClick={onEditMessage}
            />
          )}

          {onRetryMessage && (
            <ActionButton
              disabled={isEditing || isRetrying || isStreaming}
              title={isUser ? "Retry from this message" : "Retry this response"}
              icon={
                <ArrowCounterClockwiseIcon
                  className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin-reverse" : ""}`}
                />
              }
              tooltip={
                isUser ? "Retry from this message" : "Retry this response"
              }
              onClick={onRetryMessage}
            />
          )}

          {onDeleteMessage && (
            <ActionButton
              className="btn-action-destructive"
              disabled={isEditing || isDeleting || isStreaming}
              icon={<TrashIcon className="h-3.5 w-3.5" />}
              title="Delete message"
              tooltip="Delete message"
              onClick={onDeleteMessage}
            />
          )}
        </div>

        {!isUser && (
          <>
            {model && provider === "openrouter" ? (
              <a
                className="text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground"
                href={`https://openrouter.ai/${model}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {model}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground/70">
                {model || "Assistant"}
              </span>
            )}
          </>
        )}
      </div>
    );
  }
);

MessageActions.displayName = "MessageActions";

const ChatMessageComponent = ({
  message,
  isStreaming = false,
  onEditMessage,
  onRetryMessage,
  onDeleteMessage,
}: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isCopied, setIsCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const reasoning = message.reasoning;
  const displayContent = message.content;

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [message.content]);

  const handleEditStart = useCallback(() => {
    setIsEditing(true);
    setEditContent(message.content);
  }, [message.content]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent(message.content);
  }, [message.content]);

  const handleEditSave = useCallback(() => {
    if (onEditMessage) {
      onEditMessage(message.id, editContent);
    }
    setIsEditing(false);
  }, [onEditMessage, message.id, editContent]);

  const handleRetry = useCallback(async () => {
    if (onRetryMessage && !isRetrying) {
      setIsRetrying(true);
      try {
        await onRetryMessage(message.id);
      } finally {
        setIsRetrying(false);
      }
    }
  }, [onRetryMessage, message.id, isRetrying]);

  const handleDelete = useCallback(async () => {
    if (onDeleteMessage && !isDeleting) {
      setIsDeleting(true);
      try {
        await onDeleteMessage(message.id);
      } finally {
        setIsDeleting(false);
      }
    }
  }, [onDeleteMessage, message.id, isDeleting]);

  const renderAttachments = useCallback(
    (
      attachments: typeof message.attachments,
      variant: "user" | "assistant" = "user"
    ) => {
      if (!attachments?.length) {
        return null;
      }

      if (variant === "user") {
        return (
          <div className="mt-2 space-y-2">
            {attachments.map((attachment, index) => (
              <ConvexFileDisplay
                key={attachment.name || attachment.url || `attachment-${index}`}
                attachment={attachment}
                className="mb-2"
              />
            ))}
          </div>
        );
      }

      // Assistant attachments - simplified style
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={attachment.name || attachment.url || `attachment-${index}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground">{attachment.name}</span>
            </div>
          ))}
        </div>
      );
    },
    [message]
  );

  return (
    <div
      data-message-role={message.role}
      className={cn(
        "group w-full px-3 py-2 sm:px-6 sm:py-2.5 transition-colors",
        "bg-transparent"
      )}
    >
      {isUser ? (
        <div className="flex justify-end">
          <div
            className={cn(
              "min-w-0 transition-all duration-300 ease-out",
              isEditing
                ? "w-[600px]"
                : "max-w-[32rem] sm:max-w-[36rem] lg:max-w-[40rem]"
            )}
          >
            <div
              className={cn(
                "transition-all duration-300 ease-out transform",
                isEditing
                  ? "rounded-xl border border-primary/30 bg-background p-4 sm:p-5 shadow-lg ring-1 ring-primary/10 w-full"
                  : "rounded-xl px-4 py-2.5 sm:px-5 sm:py-3 bg-muted/50 border border-border text-foreground shadow-sm hover:shadow-md hover:border-primary/30 w-fit ml-auto"
              )}
            >
              {isEditing ? (
                <div className="space-y-4">
                  <textarea
                    autoFocus
                    className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-foreground outline-none ring-0 transition-opacity duration-200 placeholder:text-muted-foreground/60 focus:ring-0 sm:text-base"
                    placeholder="Edit your message..."
                    value={editContent}
                    style={{
                      fontFamily: "inherit",
                      height: "auto",
                      minHeight: "3rem",
                    }}
                    onChange={e => setEditContent(e.target.value)}
                    onInput={e => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                  />
                  <div className="flex translate-y-0 transform justify-end gap-3 opacity-100 transition-all duration-200">
                    <Button
                      className="px-5 py-2 hover:scale-105"
                      size="sm"
                      variant="outline"
                      onClick={handleEditCancel}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="px-5 py-2 hover:scale-105"
                      size="sm"
                      variant="emerald"
                      onClick={handleEditSave}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words text-sm transition-all duration-300 ease-out sm:text-base">
                  {displayContent}
                  {renderAttachments(message.attachments, "user")}
                </div>
              )}
            </div>

            <MessageActions
              isUser
              copyToClipboard={copyToClipboard}
              isCopied={isCopied}
              isDeleting={isDeleting}
              isEditing={isEditing}
              isRetrying={isRetrying}
              isStreaming={isStreaming}
              onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
              onEditMessage={onEditMessage ? handleEditStart : undefined}
              onRetryMessage={onRetryMessage ? handleRetry : undefined}
            />
          </div>
        </div>
      ) : (
        <div className="w-full">
          <div className="min-w-0 flex-1">
            {reasoning && (
              <div className="mb-2.5">
                <Reasoning isLoading={isStreaming} reasoning={reasoning} />
              </div>
            )}

            <StreamingMarkdown isStreaming={isStreaming} messageId={message.id}>
              {displayContent}
            </StreamingMarkdown>

            {/* Show interrupted indicator */}
            {message.metadata?.stopped && !isStreaming && (
              <div className="mt-3 flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-amber-700 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-400">
                  <svg
                    className="h-3 w-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs font-medium">Stopped by user</span>
                </div>
              </div>
            )}

            {message.citations && message.citations.length > 0 && (
              <div className="mt-2.5">
                <Citations compact citations={message.citations} />
              </div>
            )}

            {renderAttachments(message.attachments, "assistant")}

            <MessageActions
              copyToClipboard={copyToClipboard}
              isCopied={isCopied}
              isDeleting={isDeleting}
              isRetrying={isRetrying}
              isStreaming={isStreaming}
              isUser={false}
              model={message.model}
              provider={message.provider}
              onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
              onRetryMessage={onRetryMessage ? handleRetry : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const ChatMessage = memo(ChatMessageComponent);
