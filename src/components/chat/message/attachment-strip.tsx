import { XIcon } from "@phosphor-icons/react";
import { memo, useCallback } from "react";
import { FileDisplay, ImageThumbnail } from "@/components/files/file-display";
import { truncateMiddle } from "@/lib";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

type AttachmentStripProps = {
  attachments?: Attachment[];
  variant?: "user" | "assistant";
  onPreviewFile?: (attachment: Attachment) => void;
  onRemove?: (index: number) => void;
  className?: string;
  /** Optional render prop for custom overlay (e.g., upload progress) */
  renderOverlay?: (attachment: Attachment, index: number) => React.ReactNode;
};

const AttachmentStripComponent = ({
  attachments,
  variant = "user",
  onPreviewFile,
  onRemove,
  className,
  renderOverlay,
}: AttachmentStripProps) => {
  const handleFileClick = useCallback(
    (attachment: Attachment) => {
      if (onPreviewFile) {
        onPreviewFile(attachment);
      }
    },
    [onPreviewFile]
  );

  if (!attachments?.length) {
    return null;
  }

  if (variant === "user") {
    const images = attachments.filter(att => att.type === "image");
    const files = attachments.filter(att => att.type !== "image");

    return (
      <div className={cn("mt-2 stack-sm", className)}>
        {/* Images - horizontal thumbnails */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((attachment, index) => (
              <button
                key={attachment.name || attachment.url || `image-${index}`}
                type="button"
                className={cn(
                  "relative h-12 w-12 cursor-pointer overflow-hidden rounded-lg",
                  "ring-1 ring-border/30 hover:ring-primary/50",
                  "transition-all duration-200 hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                onClick={() => handleFileClick(attachment)}
              >
                <ImageThumbnail attachment={attachment} className="h-12 w-12" />
              </button>
            ))}
          </div>
        )}

        {/* Files - compact pills */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((attachment, index) => (
              <FileDisplay
                key={attachment.name || attachment.url || `file-${index}`}
                attachment={attachment}
                onClick={() => handleFileClick(attachment)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Assistant attachments - compact style with thumbnails
  return (
    <div className={cn("mt-2 flex flex-wrap gap-2", className)}>
      {attachments.map((attachment, index) => {
        const isVisual =
          attachment.type === "image" ||
          (attachment.type === "video" && !!attachment.thumbnail);
        return (
          <div
            key={attachment.name || attachment.url || `attachment-${index}`}
            className="group relative flex h-14 items-center"
          >
            <button
              className={cn(
                "flex h-full items-center overflow-hidden rounded-md transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isVisual ? "p-0" : "gap-2 pl-2 pr-1 bg-muted/50 hover:bg-muted"
              )}
              onClick={() => handleFileClick(attachment)}
              type="button"
            >
              <div className="relative">
                <ImageThumbnail
                  attachment={attachment}
                  className={cn(
                    isVisual ? "h-14 w-14" : "h-5 w-5",
                    renderOverlay?.(attachment, index) && "opacity-50"
                  )}
                />
                {renderOverlay?.(attachment, index)}
              </div>
              {/* Only show name for non-visual attachments */}
              {!isVisual && (
                <>
                  <span
                    className="text-xs text-foreground/80"
                    title={attachment.name}
                  >
                    {truncateMiddle(attachment.name, 16)}
                  </span>
                  {onRemove && (
                    <button
                      type="button"
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full",
                        "text-muted-foreground hover:bg-black/70 hover:text-white",
                        "sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                      )}
                      onClick={e => {
                        e.stopPropagation();
                        onRemove(index);
                      }}
                      aria-label={`Remove ${attachment.name}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  )}
                </>
              )}
            </button>
            {/* Overlay close button for visual media only */}
            {isVisual && onRemove && (
              <button
                type="button"
                className={cn(
                  "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full",
                  "bg-black/70 text-white hover:bg-destructive",
                  "sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                )}
                onClick={e => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                aria-label={`Remove ${attachment.name}`}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const AttachmentStrip = memo(AttachmentStripComponent, (prev, next) => {
  if (prev.variant !== next.variant || prev.className !== next.className) {
    return false;
  }
  if (prev.onPreviewFile !== next.onPreviewFile) {
    return false;
  }
  if (prev.onRemove !== next.onRemove) {
    return false;
  }
  if (prev.renderOverlay !== next.renderOverlay) {
    return false;
  }
  const a = prev.attachments || [];
  const b = next.attachments || [];
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.url !== b[i]?.url || a[i]?.name !== b[i]?.name) {
      return false;
    }
  }
  return true;
});
