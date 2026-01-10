import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextFilePreview } from "@/components/ui/text-file-preview";

import type { Attachment } from "@/types";

type AttachmentGalleryDialogProps = {
  attachments: readonly Attachment[];
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
    // Prefer matching by storageId when available, then URL, then name
    let index = -1;
    if (currentAttachment.storageId) {
      index = attachments.findIndex(
        att => att.storageId === currentAttachment.storageId
      );
    }
    if (index === -1 && currentAttachment.url) {
      index = attachments.findIndex(att => att.url === currentAttachment.url);
    }
    if (index === -1 && currentAttachment.name) {
      index = attachments.findIndex(att => att.name === currentAttachment.name);
    }
    return index >= 0 ? index : 0;
  }, [attachments, currentAttachment]);

  // Update current index when current attachment changes
  useEffect(() => {
    setCurrentIndex(currentAttachmentIndex);
  }, [currentAttachmentIndex]);

  const currentDisplayAttachment = attachments[currentIndex];
  const isImage = currentDisplayAttachment?.type === "image";

  // Resolve Convex storage URL for the currently displayed attachment, if needed
  const convexFileUrl = useQuery(
    api.fileStorage.getFileUrl,
    currentDisplayAttachment?.storageId
      ? { storageId: currentDisplayAttachment.storageId as Id<"_storage"> }
      : "skip"
  );

  // Navigation functions
  const goToPrevious = useCallback(() => {
    if (attachments.length === 0) {
      return;
    }
    const newIndex =
      currentIndex > 0 ? currentIndex - 1 : attachments.length - 1;
    const target = attachments[newIndex];
    if (!target) {
      return;
    }
    setCurrentIndex(newIndex);
    onAttachmentChange?.(target);
  }, [currentIndex, attachments, onAttachmentChange]);

  const goToNext = useCallback(() => {
    if (attachments.length === 0) {
      return;
    }
    const newIndex =
      currentIndex < attachments.length - 1 ? currentIndex + 1 : 0;
    const target = attachments[newIndex];
    if (!target) {
      return;
    }
    setCurrentIndex(newIndex);
    onAttachmentChange?.(target);
  }, [currentIndex, attachments, onAttachmentChange]);

  const goToAttachment = useCallback(
    (index: number) => {
      if (attachments.length === 0) {
        return;
      }
      const target = attachments[index];
      if (!target) {
        return;
      }
      setCurrentIndex(index);
      onAttachmentChange?.(target);
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

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
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
    // Prefer Convex storage URL when storageId is present
    if (attachment.storageId) {
      return convexFileUrl ?? undefined;
    }
    if (attachment.url) {
      return attachment.url;
    }
    if (attachment.content && attachment.mimeType) {
      return `data:${attachment.mimeType};base64,${attachment.content}`;
    }
    return undefined;
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
          return (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-xs text-muted-foreground">
                Loading image…
              </div>
            </div>
          );
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

        return (
          <div className="flex h-full w-full items-center justify-center p-8">
            <TextFilePreview
              content={currentDisplayAttachment.content}
              filename={currentDisplayAttachment.name}
              className="max-h-full max-w-4xl"
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Backdrop
          className="fixed inset-0 z-modal bg-background/95 backdrop-blur-md
                     data-[state=open]:animate-in data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                     data-[open]:animate-in data-[closed]:animate-out
                     data-[closed]:fade-out-0 data-[open]:fade-in-0
                     [animation-duration:200ms]"
        />

        {/* Full-screen popup container */}
        <Dialog.Popup
          className="fixed inset-0 z-modal flex items-center justify-center focus:outline-none"
          aria-label={`Preview: ${currentDisplayAttachment.name}`}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="lg"
            onClick={e => {
              e.stopPropagation();
              onOpenChange(false);
            }}
            className="absolute right-4 top-4 z-20 h-10 w-10 rounded-full bg-foreground/50 text-background backdrop-blur-sm hover:bg-foreground/70 transition-all duration-200 hover:scale-110"
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
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-foreground/50 text-background backdrop-blur-sm hover:bg-foreground/70 transition-all duration-200 hover:scale-110"
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
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-foreground/50 text-background backdrop-blur-sm hover:bg-foreground/70 transition-all duration-200 hover:scale-110"
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
              className={`h-full w-full max-w-7xl transition-all duration-300 ease-out animate-in fade-in-0 ${
                isImage ? "pointer-events-none" : ""
              }`}
            >
              {renderAttachmentContent()}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
