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

export const MANDATORY_REASONING_PATTERNS = [
  "o1-",
  "o3-",
  "o4-",
  "deepseek-r1",
  "gemini-2.5-pro",
] as const;

export const OPENROUTER_OPTIONAL_REASONING_PATTERNS = [
  "gemini-2.5-flash",
  "claude-3.7",
  // Anthropic reasoning models (optional)
  "claude-3.5",
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-3-7-sonnet",
  // Examples (uncomment when verified):
  // "2.5-flash",        // Matches all Gemini 2.5 Flash variants
  // "llama-3.1",        // Matches all Llama 3.1 variants
  // "qwen2.5",          // Matches all Qwen 2.5 variants
] as const;

export function hasMandatoryReasoning(
  provider: string,
  modelId: string
): boolean {
  const modelIdLower = modelId.toLowerCase();

  const hasPattern = MANDATORY_REASONING_PATTERNS.some((pattern) =>
    modelIdLower.includes(pattern.toLowerCase())
  );

  if (hasPattern) {
    return true;
  }

  // For OpenRouter models with reasoning capability:
  // Check if it's in the optional list (if so, reasoning is optional)
  // All other OpenRouter reasoning models default to mandatory for safety
  if (provider === "openrouter") {
    const isKnownOptional = OPENROUTER_OPTIONAL_REASONING_PATTERNS.some(
      (pattern) => modelId.includes(pattern)
    );
    // If it's not in the optional list, assume mandatory for safety
    // This only applies to models that we know support reasoning
    return !isKnownOptional;
  }

  return false;
}

/**
 * Check if a model supports reasoning (either mandatory or optional)
 */
export function supportsReasoning(
  modelId: string
): boolean {
  const modelIdLower = modelId.toLowerCase();

  // Check mandatory reasoning patterns first
  const hasMandatoryPattern = MANDATORY_REASONING_PATTERNS.some((pattern) =>
    modelIdLower.includes(pattern.toLowerCase())
  );

  if (hasMandatoryPattern) {
    return true;
  }

  // Check optional reasoning patterns
  const hasOptionalPattern = OPENROUTER_OPTIONAL_REASONING_PATTERNS.some((pattern) =>
    modelIdLower.includes(pattern.toLowerCase())
  );

  if (hasOptionalPattern) {
    return true;
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

  // Check PDF support - use backend data only
  if (fileType === "application/pdf") {
    // For PDF support, check if the model supports files
    const hasPdfCapability = model?.supportsFiles ?? false;
    if (hasPdfCapability) {
      return { supported: true, category: "pdf" };
    }
  }

  // Check text file support
  if (isTextType(fileType)) {
    return { supported: true, category: "text" };
  }

  return { supported: false, category: "unsupported" };
}
