import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  NotePencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type React from "react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ActionButtonProps = {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  ariaLabel?: string;
};

const ActionButton = memo(
  ({
    icon,
    tooltip,
    onClick,
    disabled,
    title,
    className,
    ariaLabel,
  }: ActionButtonProps) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={cn(
              "btn-action h-7 w-7 transition-all duration-200 ease-out",
              "motion-safe:hover:scale-105",
              "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms }",
              className
            )}
            disabled={disabled}
            size="sm"
            title={title}
            variant="ghost"
            aria-label={ariaLabel || tooltip}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
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

export const MessageActions = memo(
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
      "flex items-center gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
      "translate-y-0 sm:translate-y-1 sm:group-hover:translate-y-0",
      "transition-all duration-300 ease-out",
      "@media (prefers-reduced-motion: reduce) { transition-duration: 0ms; opacity: 100; transform: none }",
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
            ariaLabel={
              isCopied
                ? "Message copied to clipboard"
                : "Copy message to clipboard"
            }
            icon={
              isCopied ? (
                <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )
            }
            onClick={copyToClipboard}
          />

          {onEditMessage && (
            <ActionButton
              disabled={isEditing}
              icon={
                <NotePencilIcon className="h-3.5 w-3.5" aria-hidden="true" />
              }
              tooltip="Edit message"
              ariaLabel="Edit this message"
              onClick={onEditMessage}
            />
          )}

          {onRetryMessage && (
            <ActionButton
              disabled={isEditing || isRetrying || isStreaming}
              title={isUser ? "Retry from this message" : "Retry this response"}
              icon={
                <ArrowCounterClockwiseIcon
                  className={cn(
                    "h-3.5 w-3.5",
                    isRetrying && "motion-safe:animate-spin-reverse",
                    "@media (prefers-reduced-motion: reduce) { animation: none }"
                  )}
                  aria-hidden="true"
                />
              }
              tooltip={
                isUser ? "Retry from this message" : "Retry this response"
              }
              ariaLabel={
                isUser
                  ? "Retry conversation from this message"
                  : "Regenerate this response"
              }
              onClick={onRetryMessage}
            />
          )}

          {onDeleteMessage && (
            <ActionButton
              className="btn-action-destructive"
              disabled={isEditing || isDeleting || isStreaming}
              icon={<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              title="Delete message"
              tooltip="Delete message"
              ariaLabel="Delete this message permanently"
              onClick={onDeleteMessage}
            />
          )}
        </div>

        {!isUser &&
          (model && provider === "openrouter" ? (
            <a
              className="text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
              href={`https://openrouter.ai/${model}`}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={`View ${model} model details on OpenRouter`}
            >
              {model}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/70">
              {model || "Assistant"}
            </span>
          ))}
      </div>
    );
  }
);

MessageActions.displayName = "MessageActions";
