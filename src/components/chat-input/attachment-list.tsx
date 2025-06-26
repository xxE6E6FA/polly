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
            className="group flex items-center gap-2 rounded-lg border border-border/20 bg-muted px-2.5 py-1.5 text-xs shadow-sm"
          >
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-muted/30">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
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
            className="group flex items-center gap-2 rounded-lg border border-border/20 bg-muted px-2.5 py-1.5 text-xs shadow-sm transition-all duration-200 hover:bg-muted-foreground/10"
          >
            <button
              disabled={attachment.type !== "image"}
              type="button"
              className={cn(
                "flex items-center gap-2 flex-1 min-w-0",
                attachment.type === "image" && "cursor-pointer hover:opacity-75"
              )}
              onClick={() =>
                attachment.type === "image" && onPreviewFile(attachment)
              }
            >
              <ConvexImageThumbnail
                attachment={attachment}
                onClick={() =>
                  attachment.type === "image" && onPreviewFile(attachment)
                }
              />
              <span className="max-w-[120px] truncate font-medium text-foreground">
                {attachment.name}
              </span>
            </button>
            <Button
              className="h-4 w-4 rounded p-0 opacity-60 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 dark:hover:bg-destructive/20"
              disabled={!canChat}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onRemoveAttachment(index)}
            >
              <XIcon className="h-2.5 w-2.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
