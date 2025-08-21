import type { Doc } from "@convex/_generated/dataModel";
import { FILE_LIMITS } from "@shared/file-constants";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
import { useCallback, useState } from "react";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import {
  convertImageToWebP,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { isUserModel } from "@/lib/type-guards";
import type { Attachment } from "@/types";

interface UseChatInputFileHandlingProps {
  selectedModel: Doc<"userModels"> | null;
  isPrivateMode: boolean;
  onAddAttachments: (attachments: Attachment[]) => void;
}

export function useChatInputFileHandling({
  selectedModel,
  isPrivateMode,
  onAddAttachments,
}: UseChatInputFileHandlingProps) {
  const { uploadFile } = useConvexFileUpload();
  const notificationDialog = useNotificationDialog();
  const [isUploading, setIsUploading] = useState(false);

  const uploadAttachmentsToConvex = useCallback(
    async (attachmentsToUpload: Attachment[]): Promise<Attachment[]> => {
      if (isPrivateMode) {
        return attachmentsToUpload.map(attachment => {
          if (attachment.content && attachment.mimeType && !attachment.url) {
            return {
              ...attachment,
              url: `data:${attachment.mimeType};base64,${attachment.content}`,
              contentType: attachment.mimeType,
            };
          }
          return attachment;
        });
      }

      const uploadedAttachments: Attachment[] = [];

      for (const attachment of attachmentsToUpload) {
        if (attachment.type === "text" || attachment.storageId) {
          uploadedAttachments.push(attachment);
        } else if (attachment.content && attachment.mimeType) {
          try {
            const byteCharacters = atob(attachment.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const file = new File([byteArray], attachment.name, {
              type: attachment.mimeType,
            });

            const uploadResult = await uploadFile(file);

            if (attachment.type === "pdf" && attachment.extractedText) {
              uploadResult.extractedText = attachment.extractedText;
            }

            uploadedAttachments.push(uploadResult);
          } catch (error) {
            console.error("Failed to upload attachment:", error);
            if (attachment.size > 1024 * 1024) {
              throw new Error(
                `Failed to upload large file "${attachment.name}". File uploads to storage are required for files over 1MB.`
              );
            }
            uploadedAttachments.push(attachment);
          }
        } else {
          uploadedAttachments.push(attachment);
        }
      }

      return uploadedAttachments;
    },
    [isPrivateMode, uploadFile]
  );

  const processFiles = useCallback(
    async (files: FileList) => {
      const newAttachments: Attachment[] = [];

      // Check if model is properly selected and typed
      const validModel =
        isUserModel(selectedModel) &&
        selectedModel.provider &&
        selectedModel.modelId
          ? selectedModel
          : null;

      for (const file of Array.from(files)) {
        // Check file size with different limits for PDFs
        const maxSize =
          file.type === "application/pdf"
            ? FILE_LIMITS.PDF_MAX_SIZE_BYTES
            : FILE_LIMITS.MAX_SIZE_BYTES;

        if (file.size > maxSize) {
          notificationDialog.notify({
            title: "File Too Large",
            description: `File ${file.name} exceeds the ${Math.round(
              maxSize / (1024 * 1024)
            )}MB limit.`,
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
            });
          } else if (fileSupport.category === "pdf") {
            // Always upload PDFs as PDF attachments
            // Text extraction will happen on submit if needed
            const base64Content = await readFileAsBase64(file);
            newAttachments.push({
              type: "pdf",
              url: "",
              name: file.name,
              size: file.size,
              content: base64Content,
              mimeType: file.type,
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
    },
    [selectedModel, notificationDialog, onAddAttachments]
  );

  const removeAttachment = useCallback(
    (
      index: number,
      currentAttachments: Attachment[],
      setAttachments: (attachments: Attachment[]) => void
    ) => {
      setAttachments(currentAttachments.filter((_, i) => i !== index));
    },
    []
  );

  return {
    isUploading,
    setIsUploading,
    uploadAttachmentsToConvex,
    processFiles,
    removeAttachment,
  };
}
