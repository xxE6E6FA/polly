import { FILE_LIMITS } from "@shared/file-constants";
import { isFileTypeSupported as defaultIsFileTypeSupported } from "@shared/model-capabilities-config";
import {
  convertImageToWebP as defaultConvertImageToWebP,
  readFileAsBase64 as defaultReadFileAsBase64,
  readFileAsText as defaultReadFileAsText,
} from "@/lib/file-utils";
import type { Attachment } from "@/types";

export type Notifier = (args: {
  title: string;
  description?: string;
  type?: "error" | "success" | "info";
}) => void;

type FileSupport = {
  supported: boolean;
  category: "image" | "pdf" | "text" | "unsupported";
};

export type ProcessFilesDeps = {
  readFileAsText?: (file: File) => Promise<string>;
  readFileAsBase64?: (file: File) => Promise<string>;
  convertImageToWebP?: (
    file: File
  ) => Promise<{ base64: string; mimeType: string }>;
  isFileTypeSupported?: (
    fileType: string,
    model: { provider: string; modelId: string },
    fileName?: string
  ) => FileSupport;
};

export async function processFilesForAttachments(
  files: FileList,
  selectedModel: unknown,
  notify?: Notifier,
  deps: ProcessFilesDeps = {}
): Promise<Attachment[]> {
  const readFileAsText = deps.readFileAsText ?? defaultReadFileAsText;
  const readFileAsBase64 = deps.readFileAsBase64 ?? defaultReadFileAsBase64;
  const convertImageToWebP =
    deps.convertImageToWebP ?? defaultConvertImageToWebP;
  const isFileTypeSupported =
    deps.isFileTypeSupported ?? defaultIsFileTypeSupported;
  const newAttachments: Attachment[] = [];

  const validModel =
    selectedModel &&
    typeof selectedModel === "object" &&
    "provider" in selectedModel &&
    "modelId" in selectedModel
      ? (selectedModel as {
          provider: string;
          modelId: string;
          supportsImages?: boolean;
        })
      : null;

  for (const file of Array.from(files)) {
    const maxSize =
      file.type === "application/pdf"
        ? FILE_LIMITS.PDF_MAX_SIZE_BYTES
        : FILE_LIMITS.MAX_SIZE_BYTES;

    if (file.size > maxSize) {
      notify?.({
        title: "File Too Large",
        description: `File ${file.name} exceeds the ${Math.round(maxSize / (1024 * 1024))}MB limit.`,
        type: "error",
      });
      continue;
    }

    if (!validModel) {
      notify?.({
        title: "No Model Selected",
        description: "Please select a model to upload files.",
        type: "error",
      });
      continue;
    }

    const fileSupport = isFileTypeSupported(file.type, validModel, file.name);
    if (!fileSupport.supported) {
      notify?.({
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
          // Check if this is a HEIC file - conversion is required
          const isHeic =
            file.name.toLowerCase().endsWith(".heic") ||
            file.name.toLowerCase().endsWith(".heif") ||
            file.type === "image/heic" ||
            file.type === "image/heif";

          try {
            const converted = await convertImageToWebP(file);
            base64Content = converted.base64;
            mimeType = converted.mimeType;
          } catch (_error) {
            // HEIC files require conversion - can't fall back to original
            if (isHeic) {
              notify?.({
                title: "HEIC Conversion Failed",
                description: `Could not convert ${file.name}. Please try converting it to JPEG or PNG first.`,
                type: "error",
              });
              continue;
            }
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
      notify?.({
        title: "File Upload Failed",
        description: `Failed to process ${file.name}`,
        type: "error",
      });
    }
  }

  return newAttachments;
}
