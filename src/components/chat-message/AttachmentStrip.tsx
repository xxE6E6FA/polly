import { useCallback } from "react";
import { FileDisplay } from "@/components/file-display";
import type { Attachment } from "@/types";

type AttachmentStripProps = {
  attachments?: Attachment[];
  variant?: "user" | "assistant";
  onPreviewFile?: (attachment: Attachment) => void;
  className?: string;
};

export const AttachmentStrip = ({
  attachments,
  variant = "user",
  onPreviewFile,
  className,
}: AttachmentStripProps) => {
  const handleFileClick = useCallback(
    (attachment: Attachment) => {
      if (
        onPreviewFile &&
        (attachment.type === "text" || attachment.type === "pdf")
      ) {
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

  // Assistant attachments - simplified style
  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${className || ""}`}>
      {attachments.map((attachment, index) => (
        <div
          key={attachment.name || attachment.url || `attachment-${index}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs"
        >
          <span className="text-muted-foreground">{attachment.name}</span>
        </div>
      ))}
    </div>
  );
};
