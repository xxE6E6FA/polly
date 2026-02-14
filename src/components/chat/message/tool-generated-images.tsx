import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Attachment, ToolCall } from "@/types";
import { ImageGenerationSkeleton } from "./image-generation-skeleton";

type ToolGeneratedImagesProps = {
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
  /** When true the message is still streaming — show skeletons for running tools. */
  isActive?: boolean;
  onPreviewFile?: (attachment: Attachment) => void;
};

/**
 * Renders tool-generated images inline in a text message bubble.
 * Placed between the activity stream and text content so images
 * interleave naturally: activity → images → text.
 *
 * Skeletons only appear while the message is actively streaming
 * (`isActive`) and no images have arrived yet.
 */
export function ToolGeneratedImages({
  toolCalls,
  attachments,
  isActive = false,
  onPreviewFile,
}: ToolGeneratedImagesProps) {
  const generatedImages = useMemo(
    () =>
      attachments?.filter(
        att => att.type === "image" && att.generatedImage?.isGenerated
      ) ?? [],
    [attachments]
  );

  // Only show skeletons when actively streaming, a tool is running,
  // AND no images have arrived yet (prevents overlap when attachment
  // mutation commits before tool-result status update).
  const showSkeleton = useMemo(() => {
    if (!isActive || generatedImages.length > 0) {
      return false;
    }
    return (
      toolCalls?.some(
        tc => tc.name === "generateImage" && tc.status === "running"
      ) ?? false
    );
  }, [toolCalls, isActive, generatedImages.length]);

  if (!showSkeleton && generatedImages.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      {/* Skeleton while generating (before any images arrive) */}
      {showSkeleton && (
        <div className="max-w-sm sm:max-w-md">
          <ImageGenerationSkeleton aspectRatio="1:1" />
        </div>
      )}

      {/* Completed generated images */}
      {generatedImages.length > 0 && (
        <div
          className={cn(
            "overflow-visible",
            generatedImages.length === 1
              ? "flex flex-col items-start"
              : "grid gap-4",
            generatedImages.length === 2 && "grid-cols-1 sm:grid-cols-2",
            generatedImages.length >= 3 && "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {generatedImages.map((attachment, index) => (
            <GeneratedImageCard
              key={attachment.storageId || attachment.url || `gen-img-${index}`}
              attachment={attachment}
              onPreviewFile={onPreviewFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single tool-generated image card with Convex storage URL resolution.
 * Uses a simple img tag — no skeleton overlay to avoid reserving extra space.
 */
function GeneratedImageCard({
  attachment,
  onPreviewFile,
}: {
  attachment: Attachment;
  onPreviewFile?: (attachment: Attachment) => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  const storageUrl = useQuery(
    api.fileStorage.getFileUrl,
    attachment.storageId
      ? { storageId: attachment.storageId as Id<"_storage"> }
      : "skip"
  );

  const imageUrl = storageUrl || attachment.url;

  if (!imageUrl) {
    return null;
  }

  return (
    <button
      type="button"
      className={cn(
        "max-w-sm sm:max-w-md rounded-lg overflow-hidden transition-all duration-300 ease-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-zoom-in",
        isLoaded
          ? "opacity-100 translate-y-0 shadow-lg hover:shadow-xl"
          : "opacity-0 translate-y-1"
      )}
      onClick={() => onPreviewFile?.(attachment)}
      aria-label="View full size image"
    >
      <img
        src={imageUrl}
        alt={attachment.generatedImage?.prompt || attachment.name}
        className="w-full rounded-lg"
        loading="lazy"
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
      />
    </button>
  );
}
