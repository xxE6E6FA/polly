import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Backdrop } from "@/components/ui/backdrop";
import { Button } from "@/components/ui/button";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { getFileLanguage } from "@/lib/file-utils";

import type { Attachment } from "@/types";

type AttachmentGalleryDialogProps = {
  attachments: ReadonlyArray<Attachment>;
  currentAttachment: Attachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttachmentChange?: (attachment: Attachment) => void;
};

export const AttachmentGalleryDialog = ({
  attachments,
  currentAttachment,
  open,
  onOpenChange,
  onAttachmentChange,
}: AttachmentGalleryDialogProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Find the current attachment index
  const currentAttachmentIndex = useMemo(() => {
    if (!currentAttachment) {
      return 0;
    }
    const index = attachments.findIndex(
      attachment =>
        attachment.url === currentAttachment.url ||
        attachment.name === currentAttachment.name
    );
    return index >= 0 ? index : 0;
  }, [attachments, currentAttachment]);

  // Update current index when current attachment changes
  useEffect(() => {
    setCurrentIndex(currentAttachmentIndex);
  }, [currentAttachmentIndex]);

  const currentDisplayAttachment = attachments[currentIndex];
  const isImage = currentDisplayAttachment?.type === "image";

  // Navigation functions
  const goToPrevious = useCallback(() => {
    const newIndex =
      currentIndex > 0 ? currentIndex - 1 : attachments.length - 1;
    setCurrentIndex(newIndex);
    onAttachmentChange?.(attachments[newIndex]);
  }, [currentIndex, attachments, onAttachmentChange]);

  const goToNext = useCallback(() => {
    const newIndex =
      currentIndex < attachments.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    onAttachmentChange?.(attachments[newIndex]);
  }, [currentIndex, attachments, onAttachmentChange]);

  const goToAttachment = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      onAttachmentChange?.(attachments[index]);
    },
    [attachments, onAttachmentChange]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          goToPrevious();
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          goToNext();
          break;
        }
        case "Escape": {
          event.preventDefault();
          onOpenChange(false);
          break;
        }
        case "Home": {
          event.preventDefault();
          goToAttachment(0);
          break;
        }
        case "End": {
          event.preventDefault();
          goToAttachment(attachments.length - 1);
          break;
        }
        default: {
          // Do nothing for other keys
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    goToPrevious,
    goToNext,
    onOpenChange,
    goToAttachment,
    attachments.length,
  ]);

  if (!currentDisplayAttachment) {
    return null;
  }

  const getFileUrl = (attachment: Attachment) => {
    return (
      attachment.url ||
      (attachment.content && attachment.mimeType
        ? `data:${attachment.mimeType};base64,${attachment.content}`
        : undefined)
    );
  };

  const fileUrl = getFileUrl(currentDisplayAttachment);

  const renderAttachmentContent = () => {
    switch (currentDisplayAttachment.type) {
      case "pdf": {
        if (!fileUrl) {
          return null;
        }
        return (
          <iframe
            src={fileUrl}
            className="h-full w-full rounded-lg border-0"
            title={`PDF preview: ${currentDisplayAttachment.name}`}
          />
        );
      }

      case "image": {
        if (!fileUrl) {
          return null;
        }
        return (
          <div className="flex h-full w-full items-center justify-center pointer-events-none">
            <img
              src={fileUrl}
              alt={currentDisplayAttachment.name}
              className="max-h-full max-w-full object-contain pointer-events-auto"
              draggable={false}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              tabIndex={-1}
            />
          </div>
        );
      }

      case "text": {
        if (!currentDisplayAttachment.content) {
          return null;
        }

        const language = getFileLanguage(currentDisplayAttachment.name);
        const isCodeFile = language !== "text";

        return (
          <div className="h-full w-full overflow-y-auto p-8">
            <StreamingMarkdown isStreaming={false}>
              {isCodeFile
                ? `\`\`\`${language}\n${currentDisplayAttachment.content}\n\`\`\``
                : currentDisplayAttachment.content}
            </StreamingMarkdown>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <Backdrop className="z-50" variant="heavy" />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center focus:outline-none 
                     data-[state=open]:animate-in data-[state=closed]:animate-out 
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                     data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
                     data-[state=open]:duration-300 data-[state=closed]:duration-200"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="lg"
            onClick={e => {
              e.stopPropagation();
              onOpenChange(false);
            }}
            className="absolute right-4 top-4 z-20 h-10 w-10 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-all duration-200 hover:scale-110"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </Button>

          {/* Navigation buttons - only show when there are multiple attachments */}
          {attachments.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="lg"
                onClick={e => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-all duration-200 hover:scale-110"
                aria-label="Previous attachment"
              >
                <CaretLeftIcon className="h-6 w-6" />
              </Button>

              <Button
                variant="ghost"
                size="lg"
                onClick={e => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-all duration-200 hover:scale-110"
                aria-label="Next attachment"
              >
                <CaretRightIcon className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* Attachment content + clickable backdrop area */}
          <div
            className="flex h-full w-full items-center justify-center p-8"
            onClick={e => {
              // For images, click anywhere to close; otherwise only true backdrop clicks
              if (isImage) {
                onOpenChange(false);
              } else if (e.target === e.currentTarget) {
                onOpenChange(false);
              }
            }}
            onKeyDown={e => {
              // Allow keyboard users to close dialog with Enter or Space
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (isImage) {
                  onOpenChange(false);
                } else if (e.target === e.currentTarget) {
                  onOpenChange(false);
                }
              }
            }}
            tabIndex={isImage ? 0 : -1}
          >
            <div
              key={
                currentDisplayAttachment.url || currentDisplayAttachment.name
              }
              className={`h-full w-full max-w-7xl transition-all duration-300 ease-out animate-in fade-in-0 zoom-in-95 ${
                isImage ? "pointer-events-none" : ""
              }`}
            >
              {renderAttachmentContent()}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
