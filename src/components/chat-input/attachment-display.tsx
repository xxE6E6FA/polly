import { XIcon } from "@phosphor-icons/react";
import { memo, useState } from "react";
import { ImageThumbnail } from "@/components/file-display";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { Button } from "@/components/ui/button";
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

interface AttachmentDisplayProps {
  attachments: ReadonlyArray<Attachment>;
  onRemoveAttachment: (index: number) => void;
}

function AttachmentDisplayInner({
  attachments,
  onRemoveAttachment,
}: AttachmentDisplayProps) {
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-2">
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={`${attachment.name}-${index}`}
              className={cn(
                "group relative flex items-center gap-2 rounded-lg shadow-sm transition-all duration-200",
                attachment.type === "image"
                  ? "p-1.5 ring-1 ring-emerald-200/30 bg-emerald-50/50 hover:bg-emerald-100/50 dark:ring-emerald-800/30 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
                  : "px-2.5 py-1 text-xs ring-1 ring-slate-200/30 bg-slate-50/50 hover:bg-slate-100/50 dark:ring-slate-800/30 dark:bg-slate-950/20 dark:hover:bg-slate-900/30"
              )}
            >
              <div
                className={cn(
                  "flex items-center flex-1 min-w-0 cursor-pointer",
                  attachment.type === "image" ? "gap-2" : "gap-1.5"
                )}
                onClick={() => setPreviewFile(attachment)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreviewFile(attachment);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <ImageThumbnail
                  attachment={attachment}
                  className={
                    attachment.type === "image" ? "h-12 w-12" : "h-4 w-4"
                  }
                  onClick={() => setPreviewFile(attachment)}
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
          ))}
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
