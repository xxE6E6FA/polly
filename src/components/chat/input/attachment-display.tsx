import { SpinnerGapIcon } from "@phosphor-icons/react";
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

  const renderUploadOverlay = useCallback(
    (attachment: Attachment) => {
      const isUploading = isAttachmentUploading(attachment, pendingUploads);
      if (!isUploading) {
        return null;
      }

      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <SpinnerGapIcon className="h-4 w-4 animate-spin text-blue-500" />
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
        variant="assistant"
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
