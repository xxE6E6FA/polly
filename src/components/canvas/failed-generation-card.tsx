import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowClockwiseIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { type CSSProperties, useState } from "react";
import { TrashIcon } from "@/components/animate-ui/icons/trash";
import {
  type ImageRetryParams,
  ImageRetryPopover,
} from "@/components/chat/message/image-retry-popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type FailedGenerationCardProps = {
  generationId?: Id<"generations">;
  status: string;
  model?: string;
  error?: string;
  aspectRatio?: string;
  onDelete?: () => void;
  /** Only show image-to-image models in the retry model picker */
  imageToImageOnly?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function FailedGenerationCard({
  generationId,
  status,
  model,
  error,
  aspectRatio,
  onDelete,
  imageToImageOnly,
  className,
  style,
}: FailedGenerationCardProps) {
  const retryGeneration = useMutation(api.generations.retryGeneration);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!generationId) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryGeneration({ id: generationId });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRetryWithParams = async (params: ImageRetryParams) => {
    if (!generationId) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryGeneration({
        id: generationId,
        model: params.model,
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5",
        className
      )}
      style={style}
    >
      {aspectRatio && (
        <div style={{ aspectRatio: formatAspectRatio(aspectRatio) }} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <span className="text-xs font-medium text-destructive">
          {status === "canceled" ? "Canceled" : "Failed"}
        </span>
        {model && (
          <span className="text-xs text-muted-foreground">
            {formatModelName(model)}
          </span>
        )}
        {error && (
          <p className="line-clamp-2 text-center text-[10px] text-destructive/70">
            {error}
          </p>
        )}
        {generationId && (
          <div className="flex items-center gap-0.5 rounded-lg bg-background/80 p-0.5 shadow-sm ring-1 ring-border/40">
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ArrowClockwiseIcon className="size-3.5" />
              Retry
            </button>
            <div className="h-4 w-px bg-border/50" />
            <ImageRetryPopover
              currentModel={model}
              currentAspectRatio={aspectRatio || "1:1"}
              onRetry={handleRetryWithParams}
              hideAspectRatio
              autoRetryOnSelect
              imageToImageOnly={imageToImageOnly}
              trigger={<CaretDownIcon className="size-3" />}
              className="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            />
            <div className="h-4 w-px bg-border/50" />
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label="Delete generation"
                  className="inline-flex items-center justify-center rounded-md size-7 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <TrashIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function formatAspectRatio(ratio?: string): string {
  if (!ratio) {
    return "1/1";
  }
  const [w, h] = ratio.split(":").map(Number);
  if (w && h) {
    return `${w}/${h}`;
  }
  return "1/1";
}

function formatModelName(model?: string): string {
  if (!model) {
    return "";
  }
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}
