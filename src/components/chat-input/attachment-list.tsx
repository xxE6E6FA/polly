import { XIcon } from "@phosphor-icons/react";

import { ConvexImageThumbnail } from "@/components/convex-file-display";
import { Button } from "@/components/ui/button";
import { type FileUploadProgress } from "@/hooks/use-convex-file-upload";
import { cn } from "@/lib/utils";
import { type Attachment } from "@/types";

type AttachmentListProps = {
  attachments: Attachment[];
  uploadProgress: Map<string, FileUploadProgress>;
  onRemoveAttachment: (index: number) => void;
  onPreviewFile: (attachment: Attachment) => void;
  canChat: boolean;
};

// Helper function to truncate filename in the middle
const truncateMiddle = (filename: string, maxLength: number = 20) => {
  if (filename.length <= maxLength) return filename;

  const lastDotIndex = filename.lastIndexOf(".");
  const extension = lastDotIndex > -1 ? filename.slice(lastDotIndex) : "";
  const nameWithoutExt =
    lastDotIndex > -1 ? filename.slice(0, lastDotIndex) : filename;

  // Calculate how many characters we can show from the start
  const availableSpace = maxLength - extension.length - 3; // 3 for "..."
  const startChars = Math.max(availableSpace, 5); // Show at least 5 chars from start

  return nameWithoutExt.slice(0, startChars) + "..." + extension;
};

export const AttachmentList = ({
  attachments,
  uploadProgress,
  onRemoveAttachment,
  onPreviewFile,
  canChat,
}: AttachmentListProps) => {
  if (attachments.length === 0 && uploadProgress.size === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2">
        {/* Show upload progress for files being uploaded */}
        {[...uploadProgress.values()].map((progress, index) => (
          <div
            key={`upload-${index}`}
            className="group flex items-center gap-2 rounded-lg border border-blue-200/20 bg-blue-50/50 p-1.5 text-xs shadow-sm dark:border-blue-800/20 dark:bg-blue-950/20"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-100/50 dark:bg-blue-900/30">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent opacity-60 dark:border-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="max-w-[100px] truncate font-medium text-foreground">
                {progress.file.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {progress.status === "uploading" && "Uploading..."}
                {progress.status === "processing" && "Processing..."}
                {progress.status === "pending" && "Preparing..."}
                {progress.progress > 0 && ` ${progress.progress}%`}
              </div>
            </div>
          </div>
        ))}

        {/* Show uploaded attachments */}
        {attachments.map((attachment, index) => (
          <div
            key={attachment.name || attachment.url || `attachment-${index}`}
            className={cn(
              "group relative flex items-center gap-2 rounded-lg border p-1.5 text-xs shadow-sm transition-all duration-200",
              attachment.type === "image"
                ? "border-emerald-200/30 bg-emerald-50/50 hover:bg-emerald-100/50 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
                : "border-slate-200/30 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-800/30 dark:bg-slate-950/20 dark:hover:bg-slate-900/30"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 flex-1 min-w-0",
                attachment.type === "image" && "cursor-pointer"
              )}
              onClick={() =>
                attachment.type === "image" && onPreviewFile(attachment)
              }
            >
              <ConvexImageThumbnail
                attachment={attachment}
                className="h-8 w-8"
                onClick={() =>
                  attachment.type === "image" && onPreviewFile(attachment)
                }
              />
              {/* Only show name for non-image attachments with middle truncation */}
              {attachment.type !== "image" && (
                <span
                  className="font-medium text-foreground"
                  title={attachment.name}
                >
                  {truncateMiddle(attachment.name)}
                </span>
              )}
            </div>

            {/* Delete button - positioned absolutely on desktop, inline on mobile */}
            <Button
              className={cn(
                "h-5 w-5 rounded-full p-0 transition-all duration-200",
                "hover:bg-destructive/90 hover:text-destructive-foreground",
                "sm:absolute sm:-right-1.5 sm:-top-1.5 sm:opacity-0 sm:group-hover:opacity-100",
                "sm:shadow-sm sm:ring-1 sm:ring-border/20",
                "bg-background dark:bg-background",
                "flex items-center justify-center"
              )}
              disabled={!canChat}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onRemoveAttachment(index)}
            >
              <XIcon className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
