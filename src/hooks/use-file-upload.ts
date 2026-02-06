import { describeSupportedTypes, FILE_LIMITS } from "@shared/file-constants";
import {
  type FileCategory,
  isFileTypeSupported,
  type ModelForCapabilityCheck,
} from "@shared/model-capabilities-config";
import { useCallback, useState } from "react";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import {
  convertImageToWebP,
  isHeicFile,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { getUploadProgressStore } from "@/stores/upload-progress-store";
import type { AIModel, Attachment, FileUploadProgress } from "@/types";

// ==================== Extracted helpers ====================

/**
 * Determine the max file size for a given MIME type.
 */
function getMaxFileSize(mimeType: string): number {
  if (mimeType === "application/pdf") {
    return FILE_LIMITS.PDF_MAX_SIZE_BYTES;
  }
  if (mimeType.startsWith("audio/")) {
    return FILE_LIMITS.AUDIO_MAX_SIZE_BYTES;
  }
  if (mimeType.startsWith("video/")) {
    return FILE_LIMITS.VIDEO_MAX_SIZE_BYTES;
  }
  return FILE_LIMITS.MAX_SIZE_BYTES;
}

/**
 * Validate a file against size limits and model support.
 * Returns the file category on success, or an error message on failure.
 */
function validateFile(
  file: File,
  model?: ModelForCapabilityCheck
): { valid: true; category: FileCategory } | { valid: false; error: string } {
  const maxSize = getMaxFileSize(file.type);

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File ${file.name} is too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
    };
  }

  const fileSupport = isFileTypeSupported(file.type, model, file.name);
  if (!fileSupport.supported) {
    const supportsImages = model?.supportsImages ?? false;
    const supportsAudio = model?.inputModalities?.includes("audio") ?? false;
    const supportsVideo = model?.inputModalities?.includes("video") ?? false;
    const supportedDesc = model
      ? describeSupportedTypes({
          image: supportsImages,
          pdf: true,
          text: true,
          audio: supportsAudio,
          video: supportsVideo,
        })
      : "Please select a model first";

    return {
      valid: false,
      error: `"${file.name}" is not supported. ${supportedDesc}.`,
    };
  }

  return { valid: true, category: fileSupport.category };
}

/**
 * Process an image file: HEIC conversion + WebP conversion.
 * Returns the processed file, mimeType, and optional thumbnail.
 */
async function processImageFile(file: File): Promise<
  | {
      processedFile: File;
      mimeType: string;
      thumbnail?: string;
    }
  | { error: string }
> {
  const isHeic = isHeicFile(file);

  try {
    const converted = await convertImageToWebP(file);
    const thumbnail = `data:${converted.mimeType};base64,${converted.base64}`;
    const byteCharacters = atob(converted.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const processedFile = new File([byteArray], file.name, {
      type: converted.mimeType,
    });

    return { processedFile, mimeType: converted.mimeType, thumbnail };
  } catch (error) {
    // HEIC files require conversion - can't fall back to original
    if (isHeic) {
      console.error("Failed to convert HEIC image:", error);
      return {
        error: `Could not convert ${file.name}. Please try converting it to JPEG or PNG first.`,
      };
    }
    console.warn("Failed to convert image to WebP, using original:", error);
    return { processedFile: file, mimeType: file.type };
  }
}

// ==================== Hook ====================

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
        const validation = validateFile(file, currentModel);
        if (!validation.valid) {
          const isSize = validation.error.includes("too large");
          notificationDialog.notify({
            title: isSize ? "File Too Large" : "Unsupported File Type",
            description: validation.error,
            type: "error",
          });
          continue;
        }

        const { category } = validation;

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

          if (category === "text") {
            const textContent = await readFileAsText(file);
            newAttachments.push({
              type: "text",
              url: "",
              name: file.name,
              size: file.size,
              content: textContent,
            });
          } else {
            // Handle binary files (images, PDFs, audio, video)
            let processedFile = file;
            let mimeType = file.type;
            let thumbnailBase64: string | undefined;
            const isImage = category === "image";

            // Convert images to WebP for optimization
            if (isImage) {
              const result = await processImageFile(file);
              if ("error" in result) {
                notificationDialog.notify({
                  title: "HEIC Conversion Failed",
                  description: result.error,
                  type: "error",
                });
                continue;
              }
              processedFile = result.processedFile;
              mimeType = result.mimeType;
              thumbnailBase64 = result.thumbnail;
            }

            // Generate thumbnail for videos
            if (category === "video") {
              try {
                const { generateVideoThumbnail } = await import(
                  "@/lib/file-utils"
                );
                thumbnailBase64 = await generateVideoThumbnail(file);
              } catch (error) {
                console.warn("Failed to generate video thumbnail:", error);
              }
            }

            const attachmentType = category as Attachment["type"];

            // In private mode, store as base64 without uploading to storage
            if (privateMode) {
              const base64Content = await readFileAsBase64(processedFile);
              newAttachments.push({
                type: attachmentType,
                url: "",
                name: file.name,
                size: processedFile.size,
                content: base64Content,
                mimeType,
                storageId: undefined,
              });
            } else {
              // Eager upload: Add attachment immediately, upload in background
              const progressStore = getUploadProgressStore().getState();

              // Create attachment with base64 content for immediate display
              const base64Content = await readFileAsBase64(processedFile);
              const pendingAttachment: Attachment = {
                type: attachmentType,
                url: "",
                name: file.name,
                size: processedFile.size,
                content: base64Content,
                mimeType,
                storageId: undefined,
                thumbnail: thumbnailBase64,
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
                .then(async uploadedAttachment => {
                  // Upload complete - update the attachment with storageId to prevent re-upload
                  if (uploadedAttachment.storageId) {
                    const { updateAttachmentStorageId } = await import(
                      "@/stores/actions/chat-input-actions"
                    );
                    updateAttachmentStorageId(
                      conversationId ?? undefined,
                      file.name,
                      processedFile.size,
                      uploadedAttachment.storageId
                    );
                  }
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
