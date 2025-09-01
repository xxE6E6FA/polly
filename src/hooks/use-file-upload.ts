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
import { useToast } from "@/providers/toast-context";
import type { AIModel, Attachment, FileUploadProgress } from "@/types";

interface UseFileUploadProps {
  currentModel?: AIModel;
  privateMode?: boolean;
  conversationId?: string | null;
}

export function useFileUpload({
  currentModel,
  privateMode,
  conversationId,
}: UseFileUploadProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    Map<string, FileUploadProgress>
  >(new Map());

  const { uploadFile } = useConvexFileUpload();
  const notificationDialog = useNotificationDialog();
  const managedToast = useToast();

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files) {
        return;
      }

      const newAttachments: Attachment[] = [];

      for (const file of [...files]) {
        // Validate file size with different limits for PDFs
        const maxSize =
          file.type === "application/pdf"
            ? FILE_LIMITS.PDF_MAX_SIZE_BYTES
            : FILE_LIMITS.MAX_SIZE_BYTES;

        if (file.size > maxSize) {
          notificationDialog.notify({
            title: "File Too Large",
            description: `File ${file.name} is too large. Maximum size is ${
              maxSize / (1024 * 1024)
            }MB.`,
            type: "error",
          });
          continue;
        }

        // Check file type support
        const fileSupport = isFileTypeSupported(file.type, currentModel);
        if (!fileSupport.supported) {
          notificationDialog.notify({
            title: "Unsupported File Type",
            description: `File ${
              file.name
            } is not supported by the current model. ${
              currentModel
                ? "Try selecting a different model that supports this file type."
                : "Please select a model first."
            }`,
            type: "error",
          });
          continue;
        }

        try {
          const fileKey = file.name + file.size;

          setUploadProgress(
            prev =>
              new Map(
                prev.set(fileKey, {
                  file,
                  progress: 0,
                  status: "pending",
                })
              )
          );

          if (fileSupport.category === "text") {
            const textContent = await readFileAsText(file);
            const attachment: Attachment = {
              type: "text",
              url: "",
              name: file.name,
              size: file.size,
              content: textContent,
            };
            newAttachments.push(attachment);
          } else {
            // Handle binary files (images, PDFs)
            let base64Content: string;
            let mimeType = file.type;

            if (fileSupport.category === "image") {
              try {
                const converted = await convertImageToWebP(file);
                base64Content = converted.base64;
                mimeType = converted.mimeType;
              } catch (error) {
                console.warn(
                  "Failed to convert image to WebP, using original:",
                  error
                );
                base64Content = await readFileAsBase64(file);
              }
            } else {
              base64Content = await readFileAsBase64(file);
            }

            const attachment: Attachment = {
              type: fileSupport.category as "image" | "pdf" | "text",
              url: "",
              name: file.name,
              size: file.size,
              content: base64Content,
              mimeType,
              storageId: undefined,
            };
            newAttachments.push(attachment);
          }

          setUploadProgress(prev => {
            const newMap = new Map(prev);
            newMap.delete(fileKey);
            return newMap;
          });
        } catch (error) {
          notificationDialog.notify({
            title: "File Upload Failed",
            description: `Failed to upload file ${file.name}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            type: "error",
          });

          const fileKey = file.name + file.size;
          setUploadProgress(prev => {
            const newMap = new Map(prev);
            newMap.delete(fileKey);
            return newMap;
          });
        }
      }

      if (conversationId !== undefined) {
        const { appendAttachments } = await import(
          "@/stores/actions/chat-input-actions"
        );
        appendAttachments(conversationId ?? undefined, newAttachments);
      } else {
        setAttachments(prev => [...prev, ...newAttachments]);
      }

      // Show success toast for added files
      if (newAttachments.length > 0) {
        const imageAttachments = newAttachments.filter(
          att => att.type === "image"
        );

        managedToast.success(
          `File${newAttachments.length > 1 ? "s" : ""} added successfully`,
          {
            description:
              imageAttachments.length > 0
                ? `${newAttachments.length} file${
                    newAttachments.length > 1 ? "s" : ""
                  } ready to use. ${imageAttachments.length} image${
                    imageAttachments.length > 1 ? "s" : ""
                  } optimized to WebP format.`
                : privateMode
                  ? `${newAttachments.length} file${
                      newAttachments.length > 1 ? "s" : ""
                    } ready to use in your private conversation.`
                  : `${newAttachments.length} file${
                      newAttachments.length > 1 ? "s" : ""
                    } ready to use. Will be uploaded when message is sent.`,
          }
        );
      }
    },
    [
      notificationDialog,
      currentModel,
      privateMode,
      managedToast,
      conversationId,
    ]
  );

  const removeAttachment = useCallback(
    async (index: number) => {
      if (conversationId !== undefined) {
        const { removeAttachmentAt } = await import(
          "@/stores/actions/chat-input-actions"
        );
        removeAttachmentAt(conversationId ?? undefined, index);
      } else {
        setAttachments(prev => prev.filter((_, i) => i !== index));
      }
    },
    [conversationId]
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const buildMessageContent = useCallback((input: string) => {
    return input.trim();
  }, []);

  const getBinaryAttachments = useCallback(() => {
    return attachments;
  }, [attachments]);

  const uploadAttachmentsToConvex = useCallback(
    async (attachmentsToUpload: Attachment[]): Promise<Attachment[]> => {
      if (privateMode) {
        // In private mode, convert base64 content to data URLs for local use
        return attachmentsToUpload.map(attachment => {
          if (attachment.content && attachment.mimeType && !attachment.url) {
            return {
              ...attachment,
              url: `data:${attachment.mimeType};base64,${attachment.content}`,
              contentType: attachment.mimeType, // AI SDK expects contentType field
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
            // Convert Base64 back to File object for upload
            const byteCharacters = atob(attachment.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const file = new File([byteArray], attachment.name, {
              type: attachment.mimeType,
            });

            const uploadedAttachment = await uploadFile(file);
            uploadedAttachments.push(uploadedAttachment);
          } catch (error) {
            console.error("Failed to upload attachment:", error);
            // For large files, don't fall back to base64 content as it exceeds Convex limits
            if (attachment.size > 1024 * 1024) {
              // 1MB limit
              throw new Error(
                `Failed to upload large file "${attachment.name}". File uploads to storage are required for files over 1MB.`
              );
            }
            // For smaller files, keep the original attachment as fallback
            uploadedAttachments.push(attachment);
          }
        } else {
          uploadedAttachments.push(attachment);
        }
      }

      return uploadedAttachments;
    },
    [privateMode, uploadFile]
  );

  return {
    attachments,
    uploadProgress,
    handleFileUpload,
    removeAttachment,
    clearAttachments,
    buildMessageContent,
    getBinaryAttachments,
    uploadAttachmentsToConvex,
    notificationDialog,
  };
}
