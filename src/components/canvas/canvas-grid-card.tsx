import { api } from "@convex/_generated/api";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CanvasImage } from "@/types";

type CanvasGridCardProps = {
  image: CanvasImage;
  onClick?: () => void;
};

export function CanvasGridCard({ image, onClick }: CanvasGridCardProps) {
  // Pending/processing states
  if (
    image.status === "pending" ||
    image.status === "starting" ||
    image.status === "processing"
  ) {
    return <PendingCard image={image} />;
  }

  // Failed state
  if (image.status === "failed" || image.status === "canceled") {
    return <FailedCard image={image} />;
  }

  // Succeeded state
  return <SucceededCard image={image} onClick={onClick} />;
}

function PendingCard({ image }: { image: CanvasImage }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/40 bg-muted/30">
      <div
        className="animate-pulse bg-muted/50"
        style={{ aspectRatio: formatAspectRatio(image.aspectRatio) }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <Spinner />
        <span className="text-xs font-medium text-muted-foreground">
          {formatModelName(image.model)}
        </span>
        {image.prompt && (
          <p className="line-clamp-2 text-center text-xs text-muted-foreground/70">
            {image.prompt}
          </p>
        )}
      </div>
    </div>
  );
}

function FailedCard({ image }: { image: CanvasImage }) {
  const retryGeneration = useMutation(api.generations.retryGeneration);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!image.generationId) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryGeneration({ id: image.generationId });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5">
      <div style={{ aspectRatio: formatAspectRatio(image.aspectRatio) }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        <span className="text-xs font-medium text-destructive">
          {image.status === "canceled" ? "Canceled" : "Failed"}
        </span>
        {image.model && (
          <span className="text-xs text-muted-foreground">
            {formatModelName(image.model)}
          </span>
        )}
        {image.generationId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isRetrying}
            className="gap-1.5"
          >
            <ArrowClockwiseIcon className="size-3.5" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function SucceededCard({
  image,
  onClick,
}: {
  image: CanvasImage;
  onClick?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border/40 bg-muted/30 transition-shadow hover:shadow-md cursor-zoom-in"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
    >
      <img
        src={image.imageUrl}
        alt={image.prompt || "Generated image"}
        className="block w-full"
        loading="lazy"
      />
      {/* Hover overlay */}
      {isHovered && (
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
          {image.prompt && (
            <p className="line-clamp-3 text-xs text-white/90">{image.prompt}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/60">
            {image.model && <span>{formatModelName(image.model)}</span>}
            {image.seed !== undefined && <span>Seed: {image.seed}</span>}
            {image.duration !== undefined && (
              <span>{image.duration.toFixed(1)}s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Converts "16:9" → "16/9" for CSS aspect-ratio, defaults to "1/1". */
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
  // "owner/name" → "name"
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}
