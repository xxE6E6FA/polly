import {
  AUDIO_EXTENSIONS,
  MIME_TYPES,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "./file-constants";

export function isImageType(fileType: string, fileName?: string): boolean {
  if (fileType.startsWith("image/")) {
    return true;
  }

  // Check by extension for HEIC/HEIF (browsers often report empty or octet-stream MIME)
  if (fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) {
      return true;
    }
  }

  return false;
}

export function isTextType(fileType: string, fileName?: string): boolean {
  if (MIME_TYPES.TEXT.has(fileType) || fileType.startsWith("text/")) {
    return true;
  }

  // Unknown MIME: check extension instead of blindly accepting
  if (!fileType || fileType === "application/octet-stream") {
    if (fileName) {
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      return TEXT_EXTENSIONS.has(ext);
    }
    return false;
  }

  return false;
}

export function isAudioType(fileType: string, fileName?: string): boolean {
  if (MIME_TYPES.AUDIO.has(fileType) || fileType.startsWith("audio/")) {
    return true;
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return AUDIO_EXTENSIONS.has(ext);
  }

  return false;
}

export function isVideoType(fileType: string, fileName?: string): boolean {
  if (MIME_TYPES.VIDEO.has(fileType) || fileType.startsWith("video/")) {
    return true;
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return VIDEO_EXTENSIONS.has(ext);
  }

  return false;
}

export interface ModelForCapabilityCheck {
  provider: string;
  modelId: string;
  contextLength?: number;
  contextWindow?: number;
  supportsReasoning?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsFiles?: boolean;
  inputModalities?: string[];
}

export function checkModelCapability(
  capability: string,
  model?: ModelForCapabilityCheck
): boolean {
  if (!model) {
    return false;
  }

  // Only use backend-provided capability data
  const backendValue = model[capability as keyof ModelForCapabilityCheck];

  if (backendValue !== undefined) {
    return backendValue as boolean;
  }

  return false;
}

export type FileCategory =
  | "image"
  | "pdf"
  | "text"
  | "audio"
  | "video"
  | "unsupported";

export function isFileTypeSupported(
  fileType: string,
  model?: ModelForCapabilityCheck,
  fileName?: string
): { supported: boolean; category: FileCategory } {
  // Check image support (including HEIC by extension)
  if (isImageType(fileType, fileName)) {
    const hasImageCapability = model?.supportsImages ?? false;
    if (hasImageCapability) {
      return { supported: true, category: "image" };
    }
    return { supported: false, category: "unsupported" };
  }

  // Check PDF support - universally supported via multiple strategies
  if (fileType === "application/pdf") {
    // PDFs are supported for all models via two strategies:
    // 1. Native PDF support: Anthropic/Google models with supportsFiles capability
    // 2. Text extraction: All other models use Gemini 2.5 Flash Lite for text extraction
    return { supported: true, category: "pdf" };
  }

  // Check audio support (gated on model capabilities)
  if (isAudioType(fileType, fileName)) {
    const hasAudioCapability =
      model?.inputModalities?.includes("audio") ?? false;
    if (hasAudioCapability) {
      return { supported: true, category: "audio" };
    }
    return { supported: false, category: "unsupported" };
  }

  // Check video support (gated on model capabilities)
  if (isVideoType(fileType, fileName)) {
    const hasVideoCapability =
      model?.inputModalities?.includes("video") ?? false;
    if (hasVideoCapability) {
      return { supported: true, category: "video" };
    }
    return { supported: false, category: "unsupported" };
  }

  // Check text file support (pass fileName for extension-based detection)
  if (isTextType(fileType, fileName)) {
    return { supported: true, category: "text" };
  }

  return { supported: false, category: "unsupported" };
}
