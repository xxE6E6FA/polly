// Shared model capability configuration
// This file is used by both convex/models.ts and src/lib/model-capabilities.ts
// To ensure consistent capability detection across backend and frontend

export type PatternConfig = {
  includes?: readonly string[];
  startsWith?: readonly string[];
  excludes?: readonly string[];
  forceValue?: boolean;
  contextThreshold?: number;
};

export type ProviderPatterns = {
  google?: PatternConfig;
  openrouter?: PatternConfig;
  openai?: PatternConfig;
  anthropic?: PatternConfig;
};

export const CAPABILITY_PATTERNS = {
  supportsImages: {
    google: {
      includes: ["vision", "pro", "gemini-1.5", "gemini-2."],
      excludes: [],
    },
    openrouter: {
      includes: [
        "vision",
        "gpt-4",
        "claude-3",
        "claude-3-5",
        "gemini",
        "qwen-vl",
      ],
      excludes: [],
    },
    openai: {
      includes: ["vision"],
      startsWith: ["gpt-4"],
      // Exclude older GPT-4 models that don't support vision
      excludes: ["turbo-instruct", "32k", "0314", "0613"],
    },
    anthropic: {
      forceValue: true,
      excludes: [],
    },
  },
  supportsReasoning: {
    google: {
      includes: ["gemini-2.5"],
      excludes: [],
    },
    openrouter: {
      includes: [
        "o1-",
        "o3-",
        "deepseek-r1",
        "deepseek/deepseek-r1",
        "claude-opus-4",
        "claude-sonnet-4",
        "claude-3-7-sonnet",
        "gemini-2.5",
        "reasoning",
        "thinking",
      ],
      excludes: [],
    },
    openai: {
      startsWith: ["o1-", "o3-", "o4-"],
      excludes: [],
    },
    anthropic: {
      // Some Anthropic models support reasoning
      includes: ["claude-opus-4", "claude-sonnet-4", "claude-3-7-sonnet"],
      excludes: [],
    },
  },
  supportsTools: {
    google: {
      includes: ["gemini-1.5", "gemini-2.", "pro"],
      excludes: [],
    },
    openrouter: {
      // Most models support tools
      forceValue: true,
      excludes: ["o1-"],
    },
    openai: {
      startsWith: ["gpt-"],
      excludes: ["o1-", "turbo-instruct", "gpt-3.5-turbo-16k-0613"],
    },
    anthropic: {
      forceValue: true,
      excludes: [],
    },
  },
  supportsFiles: {
    google: {
      // Models with large context windows or modern series
      includes: ["gemini-1.5", "gemini-2.", "pro"],
      contextThreshold: 32000,
    },
    openrouter: {
      // Most OpenRouter models support files
      forceValue: true,
      contextThreshold: 32000,
    },
    openai: {
      // Models with image support typically support files
      includes: ["vision", "gpt-4", "gpt-3.5-turbo-1106", "gpt-3.5-turbo-0125"],
      startsWith: ["gpt-4"],
      excludes: [],
    },
    anthropic: {
      forceValue: true,
      excludes: [],
    },
  },
  supportsPdf: {
    google: {
      // Google models with large context windows support PDFs
      includes: ["gemini-2.5", "gemini-1.5", "pro"],
      contextThreshold: 100000,
    },
    openrouter: {
      // Most OpenRouter models support PDFs
      forceValue: true,
      // Specific models we know support PDFs well
      includes: ["gpt-4o", "claude-3", "gemini"],
    },
    openai: {
      // GPT-4o models support PDFs
      includes: ["gpt-4o"],
      excludes: [],
    },
    anthropic: {
      forceValue: true,
      excludes: [],
    },
  },
  isFast: {
    google: {
      includes: ["flash"],
      excludes: [],
    },
    openrouter: {
      includes: ["mini", "flash", "haiku"],
      excludes: [],
      // Also consider small context models as fast
      contextThreshold: 50000,
    },
    openai: {
      includes: ["mini", "turbo"],
      excludes: [],
    },
    anthropic: {
      includes: ["haiku"],
      excludes: [],
    },
  },
  isCoding: {
    google: {
      includes: ["pro", "gemini-1.5", "gemini-2."],
      excludes: [],
    },
    openrouter: {
      includes: ["code", "deepseek", "claude"],
      excludes: [],
    },
    openai: {
      includes: ["code"],
      startsWith: ["gpt-4"],
      excludes: [],
    },
    anthropic: {
      // All Claude models are good for coding
      forceValue: true,
    },
  },
  isLatest: {
    google: {
      includes: ["gemini-2.", "2024", "2025"],
      excludes: [],
    },
    openrouter: {
      includes: ["2.5", "4o", "2024", "2025"],
      excludes: [],
    },
    openai: {
      includes: ["4o", "2024", "2025"],
      excludes: [],
    },
    anthropic: {
      includes: ["claude-3.5", "2024", "2025"],
      excludes: [],
    },
  },
} as const;

// Standard image types supported by vision models
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

// Standard text file types
export const SUPPORTED_TEXT_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "text/typescript",
  "application/json",
  "application/xml",
  "text/xml",
  "application/yaml",
  "text/x-python",
  "text/x-java",
  "text/x-c",
  "text/x-cpp",
  "text/x-csharp",
  "text/x-go",
  "text/x-rust",
  "text/x-php",
  "text/x-ruby",
  "text/x-swift",
  "text/x-kotlin",
  "text/x-scala",
  "text/x-shell",
  "text/x-sql",
  "text/x-dockerfile",
  "text/x-makefile",
  "text/x-properties",
  "text/x-log",
] as const;

// Helper function to check model patterns

export function checkModelPatterns(
  modelId: string,
  patterns: PatternConfig,
  contextLength?: number
): boolean {
  // Check force value first
  if (patterns.forceValue !== undefined) {
    // Still check excludes even with forceValue
    if (patterns.excludes?.some(pattern => modelId.includes(pattern))) {
      return false;
    }
    return patterns.forceValue;
  }

  // Check excludes
  if (patterns.excludes?.some(pattern => modelId.includes(pattern))) {
    return false;
  }

  // Check context threshold (for models like fast/file support)
  if (
    patterns.contextThreshold &&
    contextLength &&
    contextLength >= patterns.contextThreshold
  ) {
    return true;
  }

  // Check includes
  if (patterns.includes?.some(pattern => modelId.includes(pattern))) {
    return true;
  }

  // Check startsWith
  if (patterns.startsWith?.some(pattern => modelId.startsWith(pattern))) {
    return true;
  }

  return false;
}

// Type-safe capability checker

export function getCapabilityFromPatterns<
  T extends keyof typeof CAPABILITY_PATTERNS,
>(
  capability: T,
  provider: string,
  modelId: string,
  contextLength?: number
): boolean {
  const capabilityPatterns = CAPABILITY_PATTERNS[capability];
  const patterns =
    capabilityPatterns[provider as keyof typeof capabilityPatterns];

  if (!patterns) {
    return false;
  }

  return checkModelPatterns(modelId, patterns, contextLength);
}
