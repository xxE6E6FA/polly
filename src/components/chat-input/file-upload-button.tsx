import { PaperclipIcon } from "@phosphor-icons/react";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { FILE_LIMITS } from "@/lib/file-constants";
import {
  convertImageToWebP,
  getFileLanguage,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

interface FileUploadButtonProps {
  disabled?: boolean;
  onAddAttachments: (attachments: Attachment[]) => void;
  isSubmitting: boolean;
}

export function FileUploadButton({
  disabled = false,
  onAddAttachments,
  isSubmitting,
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedModel } = useSelectedModel();
  const notificationDialog = useNotificationDialog();

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) {
        return;
      }

      const newAttachments: Attachment[] = [];

      for (const file of [...files]) {
        if (file.size > FILE_LIMITS.MAX_SIZE_BYTES) {
          notificationDialog.notify({
            title: "File Too Large",
            description: `File ${file.name} is too large. Maximum size is ${
              FILE_LIMITS.MAX_SIZE_BYTES / (1024 * 1024)
            }MB.`,
            type: "error",
          });
          continue;
        }

        const fileSupport = isFileTypeSupported(file.type, selectedModel);
        if (!fileSupport.supported) {
          notificationDialog.notify({
            title: "Unsupported File Type",
            description: `File ${file.name} is not supported by the current model.`,
            type: "error",
          });
          continue;
        }

        try {
          if (fileSupport.category === "text") {
            const textContent = await readFileAsText(file);
            newAttachments.push({
              type: "text",
              url: "",
              name: file.name,
              size: file.size,
              content: textContent,
              language: getFileLanguage(file.name),
            });
          } else {
            let base64Content: string;
            let mimeType = file.type;

            if (fileSupport.category === "image") {
              try {
                const converted = await convertImageToWebP(file);
                base64Content = converted.base64;
                mimeType = converted.mimeType;
              } catch {
                base64Content = await readFileAsBase64(file);
              }
            } else {
              base64Content = await readFileAsBase64(file);
            }

            newAttachments.push({
              type: fileSupport.category as "image" | "pdf" | "text",
              url: "",
              name: file.name,
              size: file.size,
              content: base64Content,
              mimeType,
            });
          }
        } catch {
          notificationDialog.notify({
            title: "File Upload Failed",
            description: `Failed to process ${file.name}`,
            type: "error",
          });
        }
      }

      if (newAttachments.length > 0) {
        onAddAttachments(newAttachments);
      }

      e.target.value = "";
    },
    [selectedModel, notificationDialog, onAddAttachments]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        accept="image/*,.pdf,.txt,.md,.js,.py,.html,.css,.json,.xml,.yaml,.sql"
        className="hidden"
        multiple
        type="file"
        onChange={handleFileInputChange}
      />
      <Button
        aria-label="Upload files"
        className={cn(
          "h-9 w-9 rounded-full p-0 shrink-0",
          "transition-all duration-200",
          "border border-input bg-background text-muted-foreground",
          "hover:bg-accent hover:text-accent-foreground hover:border-accent",
          "hover:scale-105 active:scale-95",
          "shadow-sm hover:shadow-md",
          disabled && "cursor-not-allowed opacity-50 hover:scale-100"
        )}
        disabled={disabled || isSubmitting}
        size="icon"
        type="button"
        variant="ghost"
        onClick={handleClick}
      >
        <PaperclipIcon className="h-4 w-4" />
      </Button>
    </>
  );
}
