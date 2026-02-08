import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/types";
import {
  type AspectRatioValue,
  type ImageRetryParams,
  ImageRetryPopover,
} from "./image-retry-popover";

export type { AspectRatioValue, ImageRetryParams };

type MessageErrorProps = {
  message: ChatMessage;
  messageId: string;
  /** Callback for retrying text message errors */
  onRetry?: (messageId: string) => void;
  /** Callback for retrying image generation errors */
  onRetryImage?: (messageId: string, params: ImageRetryParams) => void;
};

export function MessageError({
  message,
  messageId,
  onRetry,
  onRetryImage,
}: MessageErrorProps) {
  const hasImageError =
    message.imageGeneration?.status === "failed" ||
    message.imageGeneration?.status === "canceled";
  const hasTextError = message.status === "error" && message.error;

  if (!(hasImageError || hasTextError)) {
    return null;
  }

  const errorMessage = hasImageError
    ? message.imageGeneration?.error
    : message.error;
  const errorTitle = hasImageError
    ? `Image generation ${
        message.imageGeneration?.status === "canceled" ? "canceled" : "failed"
      }`
    : "Message failed";

  if (!errorMessage) {
    return null;
  }

  const showRetry = hasImageError ? onRetryImage : onRetry;

  const renderRetryButton = () => {
    if (hasImageError && onRetryImage) {
      return (
        <ImageRetryPopover
          currentModel={message.imageGeneration?.metadata?.model}
          currentAspectRatio={
            message.imageGeneration?.metadata?.params?.aspectRatio
          }
          onRetry={params => onRetryImage(messageId, params)}
          className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/20"
        />
      );
    }
    if (onRetry) {
      return (
        <Button
          variant="danger-subtle"
          size="sm"
          onClick={() => onRetry(messageId)}
        >
          <ArrowCounterClockwiseIcon className="size-3.5" />
          Retry message
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="mt-4 rounded-lg border border-danger-border bg-danger-bg p-4">
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0 text-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-danger">{errorTitle}</h4>
          <p className="mt-1 text-sm text-danger">{errorMessage}</p>
          {showRetry && <div className="mt-3">{renderRetryButton()}</div>}
        </div>
      </div>
    </div>
  );
}
