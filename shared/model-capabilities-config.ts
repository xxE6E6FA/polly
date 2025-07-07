// Shared model capability configuration
// This file is used by both convex backend and src frontend
// To ensure consistent capability detection across the entire application

// ============================================================================
// SIMPLE FILE TYPE DETECTION
// ============================================================================

export function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/");
}

export function isTextType(fileType: string): boolean {
  // Handle empty or unknown types - assume text for safety
  if (!fileType || fileType === "application/octet-stream") {
    return true;
  }

  // Common text MIME types (what file.type actually contains)
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



// ============================================================================
// REASONING CONFIGURATION
// ============================================================================

// Models that always have reasoning enabled and cannot disable it
export const MANDATORY_REASONING_PATTERNS = [
  "o1-",
  "o3-",
  "o4-",
  "deepseek-r1",
  "gemini-2.5-pro",
] as const;

// OpenRouter models that support optional reasoning (reasoning can be disabled)
// This uses fuzzy matching patterns - a model matches if it contains any of these patterns
export const OPENROUTER_OPTIONAL_REASONING_PATTERNS = [
  "gemini-2.5-flash",
  "claude-3.7",
  // Examples (uncomment when verified):
  // "2.5-flash",        // Matches all Gemini 2.5 Flash variants
  // "claude-3.5",       // Matches all Claude 3.5 variants (sonnet, haiku, etc.)
  // "llama-3.1",        // Matches all Llama 3.1 variants
  // "qwen2.5",          // Matches all Qwen 2.5 variants
] as const;

export function hasMandatoryReasoning(
  provider: string,
  modelId: string
): boolean {
  const modelIdLower = modelId.toLowerCase();

  // Check explicit patterns first
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

// ============================================================================
// SIMPLIFIED CAPABILITY CHECKER
// ============================================================================

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

  // No fallback - if backend doesn't provide it, return false
  return false;
}

// ============================================================================
// FILE TYPE SUPPORT
// ============================================================================

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
