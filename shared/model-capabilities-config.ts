export function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/");
}

export function isTextType(fileType: string): boolean {
  if (!fileType || fileType === "application/octet-stream") {
    return true;
  }

  return (
    fileType.startsWith("text/") ||
    fileType === "application/json" ||
    fileType === "application/xml" ||
    fileType === "application/javascript" ||
    fileType === "application/typescript" ||
    fileType === "application/yaml" ||
    fileType === "application/x-yaml"
  );
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

export function isFileTypeSupported(
  fileType: string,
  model?: ModelForCapabilityCheck
): { supported: boolean; category: "image" | "pdf" | "text" | "unsupported" } {
  // Check image support
  if (isImageType(fileType)) {
    const hasImageCapability = model?.supportsImages ?? false;
    if (hasImageCapability) {
      return { supported: true, category: "image" };
    }
  }

  // Check PDF support - universally supported via multiple strategies
  if (fileType === "application/pdf") {
    // PDFs are supported for all models via two strategies:
    // 1. Native PDF support: Anthropic/Google models with supportsFiles capability
    // 2. Text extraction: All other models use Gemini 2.5 Flash Lite for text extraction
    return { supported: true, category: "pdf" };
  }

  // Check text file support
  if (isTextType(fileType)) {
    return { supported: true, category: "text" };
  }

  return { supported: false, category: "unsupported" };
}
