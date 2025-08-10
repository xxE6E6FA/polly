import { memo, useCallback } from "react";
import { FileDisplay, ImageThumbnail } from "@/components/file-display";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

const truncateMiddle = (filename: string, maxLength = 20) => {
  if (filename.length <= maxLength) {
    return filename;
  }

  const lastDotIndex = filename.lastIndexOf(".");
  const extension = lastDotIndex > -1 ? filename.slice(lastDotIndex) : "";
  const nameWithoutExt =
    lastDotIndex > -1 ? filename.slice(0, lastDotIndex) : filename;

  // Calculate how many characters we can show from the start
  const availableSpace = maxLength - extension.length - 3; // 3 for "..."
  const startChars = Math.max(availableSpace, 5); // Show at least 5 chars from start

  return `${nameWithoutExt.slice(0, startChars)}...${extension}`;
};

type AttachmentStripProps = {
  attachments?: Attachment[];
  variant?: "user" | "assistant";
  onPreviewFile?: (attachment: Attachment) => void;
  className?: string;
};

const AttachmentStripComponent = ({
  attachments,
  variant = "user",
  onPreviewFile,
  className,
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
    return (
      <div className={`mt-2 space-y-2 ${className || ""}`}>
        {attachments.map((attachment, index) => (
          <FileDisplay
            key={attachment.name || attachment.url || `attachment-${index}`}
            attachment={attachment}
            className="mb-2"
            onClick={() => handleFileClick(attachment)}
          />
        ))}
      </div>
    );
  }

  // Assistant attachments - enhanced style with image thumbnails
  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${className || ""}`}>
      {attachments.map((attachment, index) => (
        <button
          key={attachment.name || attachment.url || `attachment-${index}`}
          className={cn(
            "group relative flex items-center gap-2 rounded-lg border shadow-sm transition-all duration-200 cursor-pointer hover:shadow-md",
            attachment.type === "image"
              ? "p-1.5 border-emerald-200/30 bg-emerald-50/50 hover:bg-emerald-100/50 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
              : "px-2.5 py-1 text-xs border-slate-200/30 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-800/30 dark:bg-slate-950/20 dark:hover:bg-slate-900/30"
          )}
          onClick={() => handleFileClick(attachment)}
          type="button"
        >
          <div
            className={cn(
              "flex items-center flex-1 min-w-0",
              attachment.type === "image" ? "gap-2" : "gap-1.5"
            )}
          >
            <ImageThumbnail
              attachment={attachment}
              className={attachment.type === "image" ? "h-12 w-12" : "h-4 w-4"}
              onClick={() => handleFileClick(attachment)}
            />
            {/* Only show name for non-image attachments with middle truncation */}
            {attachment.type !== "image" && (
              <span
                className="text-xs font-medium text-foreground"
                title={attachment.name}
              >
                {truncateMiddle(attachment.name, 16)}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

export const AttachmentStrip = memo(AttachmentStripComponent, (prev, next) => {
  if (prev.variant !== next.variant || prev.className !== next.className) {
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
  return prev.onPreviewFile === next.onPreviewFile;
});
