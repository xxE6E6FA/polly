import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import type { ChatMessage } from "@/types";

type MessageErrorProps = {
  message: ChatMessage;
  messageId: string;
  onRetry?: (messageId: string) => void;
};

export function MessageError({
  message,
  messageId,
  onRetry,
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

  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/30 dark:bg-red-950/20">
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
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
          <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
            {errorTitle}
          </h4>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </p>
          {onRetry && (
            <div className="mt-3">
              <button
                onClick={() => onRetry(messageId)}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 dark:bg-red-800/20 dark:text-red-200 dark:hover:bg-red-800/30"
              >
                <ArrowCounterClockwiseIcon className="h-3.5 w-3.5" />
                {hasImageError ? "Retry generation" : "Retry message"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
