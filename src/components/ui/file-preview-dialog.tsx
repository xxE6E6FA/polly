import { XIcon } from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Backdrop } from "@/components/ui/backdrop";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { getFileLanguage } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

type FilePreviewDialogProps = {
  attachment: Attachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl?: string;
};

type DialogHeaderProps = {
  title: string;
  onClose: () => void;
};

const DialogHeader = ({ title, onClose }: DialogHeaderProps) => (
  <div className="flex items-center justify-between border-b px-6 py-4">
    <h2 className="text-lg font-semibold">{title}</h2>
    <button
      onClick={onClose}
      className="rounded-md p-2 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Close preview"
    >
      <XIcon className="h-5 w-5" />
    </button>
  </div>
);

function formatTextContent(
  attachmentName: string,
  attachmentContent: string
): string {
  const language = getFileLanguage(attachmentName);
  return language !== "text"
    ? `\`\`\`${language}\n${attachmentContent}\n\`\`\``
    : attachmentContent;
}

export const FilePreviewDialog = ({
  attachment,
  open,
  onOpenChange,
  imageUrl,
}: FilePreviewDialogProps) => {
  if (!attachment) {
    return null;
  }

  const fileUrl =
    imageUrl ||
    attachment.url ||
    (attachment.content && attachment.mimeType
      ? `data:${attachment.mimeType};base64,${attachment.content}`
      : undefined);

  const renderContent = () => {
    switch (attachment.type) {
      case "pdf":
        if (!fileUrl) {
          return null;
        }
        return (
          <div className="flex h-[90vh] flex-col overflow-hidden rounded-xl bg-background shadow-md">
            <DialogHeader
              title={attachment.name}
              onClose={() => onOpenChange(false)}
            />
            <div className="flex-1 overflow-hidden">
              <iframe
                src={fileUrl}
                className="h-full w-full border-0"
                title={`PDF preview: ${attachment.name}`}
              />
            </div>
          </div>
        );

      case "image":
        if (!fileUrl) {
          return null;
        }
        return (
          <div className="relative overflow-hidden rounded-xl bg-background shadow-md">
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-opacity hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Close preview"
            >
              <XIcon className="h-5 w-5" />
            </button>
            <img
              src={fileUrl}
              alt={attachment.name}
              className={cn("max-h-[85vh] w-full object-contain", "rounded-xl")}
              draggable={false}
            />
          </div>
        );

      case "text":
        if (!attachment.content) {
          return null;
        }
        return (
          <div className="flex h-full max-h-[85vh] flex-col overflow-hidden rounded-xl bg-background shadow-md">
            <DialogHeader
              title={attachment.name}
              onClose={() => onOpenChange(false)}
            />
            <div className="overflow-y-auto p-6">
              <StreamingMarkdown isStreaming={false}>
                {formatTextContent(attachment.name, attachment.content)}
              </StreamingMarkdown>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) {
    return null;
  }

  const contentClassNames = {
    pdf: "fixed left-[50%] top-[50%] z-50 max-h-[95vh] w-[95vw] max-w-6xl translate-x-[-50%] translate-y-[-50%] focus:outline-none",
    image:
      "fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[90vw] max-w-5xl translate-x-[-50%] translate-y-[-50%] focus:outline-none",
    text: "fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[90vw] max-w-4xl translate-x-[-50%] translate-y-[-50%] focus:outline-none",
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <Backdrop className="z-50" variant="heavy" />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content
          className={contentClassNames[attachment.type]}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          {content}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
