import { SpinnerGapIcon, XIcon } from "@phosphor-icons/react";
import { memo, useState } from "react";
import { ImageThumbnail } from "@/components/files/file-display";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type PendingUpload,
  useUploadProgressStore,
} from "@/stores/upload-progress-store";
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

interface AttachmentDisplayProps {
  attachments: readonly Attachment[];
  onRemoveAttachment: (index: number) => void;
}

/** Check if an attachment is still uploading by matching filename */
function isAttachmentUploading(
  attachment: Attachment,
  pendingUploads: Map<string, PendingUpload>
): boolean {
  // Check if any pending upload matches this attachment's name
  for (const [, upload] of pendingUploads) {
    if (upload.fileName === attachment.name) {
      return true;
    }
  }
  return false;
}

function AttachmentDisplayInner({
  attachments,
  onRemoveAttachment,
}: AttachmentDisplayProps) {
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
  const pendingUploads = useUploadProgressStore(s => s.pendingUploads);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-2">
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => {
            const isUploading = isAttachmentUploading(
              attachment,
              pendingUploads
            );

            return (
              <div
                key={`${attachment.name}-${index}`}
                className={cn(
                  "group relative flex items-center gap-2 rounded-lg shadow-sm transition-all duration-200",
                  attachment.type === "image"
                    ? "p-1.5 ring-1 ring-emerald-200/30 bg-emerald-50/50 hover:bg-emerald-100/50 dark:ring-emerald-800/30 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
                    : "px-2.5 py-1 text-xs ring-1 ring-slate-200/30 bg-slate-50/50 hover:bg-slate-100/50 dark:ring-slate-800/30 dark:bg-slate-950/20 dark:hover:bg-slate-900/30",
                  isUploading && "ring-blue-200/50 dark:ring-blue-800/50"
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "flex items-center flex-1 min-w-0 cursor-pointer",
                    attachment.type === "image" ? "gap-2" : "gap-1.5"
                  )}
                  onClick={() => !isUploading && setPreviewFile(attachment)}
                  aria-label={
                    attachment.type === "image" ? "📷" : attachment.name
                  }
                >
                  <div className="relative">
                    <ImageThumbnail
                      attachment={attachment}
                      className={cn(
                        attachment.type === "image" ? "h-12 w-12" : "h-4 w-4",
                        isUploading && "opacity-60"
                      )}
                    />
                    {/* Loading overlay for uploading attachments */}
                    {isUploading && attachment.type === "image" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <SpinnerGapIcon className="h-5 w-5 animate-spin text-blue-500" />
                      </div>
                    )}
                  </div>
                  {/* Only show name for non-image attachments with middle truncation */}
                  {attachment.type !== "image" && (
                    <span
                      className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                      title={attachment.name}
                    >
                      {isUploading && (
                        <SpinnerGapIcon className="h-3 w-3 animate-spin text-blue-500" />
                      )}
                      {truncateMiddle(attachment.name, 16)}
                    </span>
                  )}
                </button>

                {/* Delete button - positioned absolutely on desktop, inline on mobile */}
                <Button
                  className={cn(
                    "rounded-full p-0 transition-all duration-200",
                    "hover:bg-destructive/90 hover:text-destructive-foreground",
                    "sm:absolute sm:opacity-0 sm:group-hover:opacity-100",
                    "sm:shadow-sm sm:ring-1 sm:ring-border/20",
                    "bg-background dark:bg-background",
                    "flex items-center justify-center",
                    attachment.type === "image"
                      ? "h-5 w-5 sm:-right-1.5 sm:-top-1.5"
                      : "h-4 w-4 sm:-right-1 sm:-top-1"
                  )}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => onRemoveAttachment(index)}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <XIcon
                    className={
                      attachment.type === "image" ? "h-3 w-3" : "h-2.5 w-2.5"
                    }
                  />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <AttachmentGalleryDialog
        attachments={attachments}
        currentAttachment={previewFile}
        open={!!previewFile}
        onOpenChange={open => {
          if (!open) {
            setPreviewFile(null);
          }
        }}
        onAttachmentChange={setPreviewFile}
      />
    </>
  );
}

export const AttachmentDisplay = memo(AttachmentDisplayInner);
