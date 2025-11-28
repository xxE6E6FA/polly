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
import { getUploadProgressStore } from "@/stores/upload-progress-store";
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
            let processedFile = file;
            let mimeType = file.type;
            let thumbnailBase64: string | undefined;
            const isImage = fileSupport.category === "image";

            // Convert images to WebP for optimization
            if (isImage) {
              try {
                const converted = await convertImageToWebP(file);
                // Store thumbnail for progress indicator
                thumbnailBase64 = `data:${converted.mimeType};base64,${converted.base64}`;
                // Create a new File from the converted data
                const byteCharacters = atob(converted.base64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                processedFile = new File([byteArray], file.name, {
                  type: converted.mimeType,
                });
                mimeType = converted.mimeType;
              } catch (error) {
                console.warn(
                  "Failed to convert image to WebP, using original:",
                  error
                );
              }
            }

            // In private mode, store as base64 without uploading to storage
            if (privateMode) {
              const base64Content = await readFileAsBase64(processedFile);
              const attachment: Attachment = {
                type: fileSupport.category as "image" | "pdf" | "text",
                url: "",
                name: file.name,
                size: processedFile.size,
                content: base64Content,
                mimeType,
                storageId: undefined,
              };
              newAttachments.push(attachment);
            } else {
              // Eager upload: Add attachment immediately, upload in background
              const progressStore = getUploadProgressStore().getState();

              // Create attachment with base64 content for immediate display
              const base64Content = await readFileAsBase64(processedFile);
              const pendingAttachment: Attachment = {
                type: isImage ? "image" : (fileSupport.category as "pdf"),
                url: "",
                name: file.name,
                size: processedFile.size,
                content: base64Content,
                mimeType,
                storageId: undefined,
              };

              // Add to store immediately so user sees the attachment
              const { appendAttachments } = await import(
                "@/stores/actions/chat-input-actions"
              );
              appendAttachments(conversationId ?? undefined, [
                pendingAttachment,
              ]);

              // Track upload progress
              progressStore.startUpload(fileKey, file.name, {
                isImage,
                thumbnail: thumbnailBase64,
              });

              setUploadProgress(
                prev =>
                  new Map(
                    prev.set(fileKey, {
                      file,
                      progress: 0,
                      status: "uploading",
                    })
                  )
              );

              // Upload in background and update attachment when done
              uploadFile(processedFile, progress => {
                progressStore.updateProgress(fileKey, progress.progress);
                setUploadProgress(
                  prev =>
                    new Map(
                      prev.set(fileKey, {
                        ...progress,
                        progress: progress.progress,
                      })
                    )
                );
              })
                .then(() => {
                  // Upload complete - attachment already has base64 content for display
                  // The storageId would be used for server-side processing
                  progressStore.completeUpload(fileKey);
                  setUploadProgress(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(fileKey);
                    return newMap;
                  });
                })
                .catch(error => {
                  console.error("Upload failed:", error);
                  progressStore.completeUpload(fileKey);
                  setUploadProgress(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(fileKey);
                    return newMap;
                  });
                  // Attachment stays with base64 content as fallback
                });
            }
          }

          setUploadProgress(prev => {
            const newMap = new Map(prev);
            newMap.delete(fileKey);
            return newMap;
          });
        } catch (error) {
          const fileKey = file.name + file.size;

          // Clear from global progress store on error
          const progressStore = getUploadProgressStore().getState();
          progressStore.completeUpload(fileKey);

          notificationDialog.notify({
            title: "File Upload Failed",
            description: `Failed to upload file ${file.name}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            type: "error",
          });

          setUploadProgress(prev => {
            const newMap = new Map(prev);
            newMap.delete(fileKey);
            return newMap;
          });
        }
      }

      // Always append to global store - AttachmentDisplay reads from useChatAttachments
      if (newAttachments.length > 0) {
        const { appendAttachments } = await import(
          "@/stores/actions/chat-input-actions"
        );
        appendAttachments(conversationId ?? undefined, newAttachments);
      }
    },
    [notificationDialog, currentModel, privateMode, conversationId, uploadFile]
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
