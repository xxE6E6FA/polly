import { api } from "@convex/_generated/api";
import { PaperclipIcon } from "@phosphor-icons/react";
import { FILE_LIMITS } from "@shared/file-constants";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
import { useQuery } from "convex/react";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useNotificationDialog } from "@/hooks/use-dialog-management";

import {
  convertImageToWebP,
  getFileLanguage,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { isUserModel } from "@/lib/type-guards";
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
  const selectedModelRaw = useQuery(api.userModels.getUserSelectedModel, {});
  const selectedModel = isUserModel(selectedModelRaw) ? selectedModelRaw : null;
  const notificationDialog = useNotificationDialog();

  const handleFileSelect = useCallback(async () => {
    const input = fileInputRef.current;
    if (!input?.files || input.files.length === 0) {
      return;
    }

    const files = Array.from(input.files);
    const newAttachments: Attachment[] = [];

    // Check if model is properly selected and typed
    const validModel =
      isUserModel(selectedModel) &&
      selectedModel.provider &&
      selectedModel.modelId
        ? selectedModel
        : null;

    for (const file of files) {
      // Check file size
      if (file.size > FILE_LIMITS.MAX_SIZE_BYTES) {
        notificationDialog.notify({
          title: "File Too Large",
          description: `File ${file.name} exceeds the ${Math.round(FILE_LIMITS.MAX_SIZE_BYTES / (1024 * 1024))}MB limit.`,
          type: "error",
        });
        continue;
      }

      // Check if we have a valid model for file type checking
      if (!validModel) {
        notificationDialog.notify({
          title: "No Model Selected",
          description: "Please select a model to upload files.",
          type: "error",
        });
        continue;
      }

      const fileSupport = isFileTypeSupported(file.type, validModel);
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

    input.value = "";
  }, [selectedModel, notificationDialog, onAddAttachments]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <>
      <input
        ref={fileInputRef}
        accept="image/*,.pdf,.txt,.md,.js,.py,.html,.css,.json,.xml,.yaml,.sql"
        className="hidden"
        multiple
        type="file"
        onChange={handleFileSelect}
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
