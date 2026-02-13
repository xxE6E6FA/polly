import { memo, useCallback, useState } from "react";
import { AttachmentStrip } from "@/components/chat/message/attachment-strip";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import {
  type PendingUpload,
  useUploadProgressStore,
} from "@/stores/upload-progress-store";
import type { Attachment } from "@/types";

interface AttachmentDisplayProps {
  attachments: readonly Attachment[];
  onRemoveAttachment: (index: number) => void;
}

/** Find the pending upload matching this attachment by filename */
function findPendingUpload(
  attachment: Attachment,
  pendingUploads: Map<string, PendingUpload>
): PendingUpload | undefined {
  for (const [, upload] of pendingUploads) {
    if (upload.fileName === attachment.name) {
      return upload;
    }
  }
  return undefined;
}

/** SVG circular progress indicator */
function UploadProgressRing({ progress }: { progress: number }) {
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="-rotate-90"
      aria-label={`Uploading: ${progress}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/30"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-info transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}

function AttachmentDisplayInner({
  attachments,
  onRemoveAttachment,
}: AttachmentDisplayProps) {
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
  const pendingUploads = useUploadProgressStore(s => s.pendingUploads);

  const renderUploadOverlay = useCallback(
    (attachment: Attachment) => {
      const pending = findPendingUpload(attachment, pendingUploads);
      if (!pending) {
        return null;
      }

      return (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <UploadProgressRing progress={pending.progress} />
        </div>
      );
    },
    [pendingUploads]
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <AttachmentStrip
        attachments={attachments as Attachment[]}
        className="mt-0 mb-2 flex-nowrap overflow-x-auto"
        onPreviewFile={setPreviewFile}
        onRemove={onRemoveAttachment}
        renderOverlay={renderUploadOverlay}
      />

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
