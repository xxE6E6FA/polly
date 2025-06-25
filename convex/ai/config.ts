export const CONFIG = {
  STREAM: {
    BATCH_SIZE: 30,
    BATCH_TIMEOUT: 75,
    CHECK_STOP_EVERY_N_CHUNKS: 2,
  },
  AES: {
    name: "AES-GCM",
    length: 256,
  },
  MIME_TYPES: {
    pdf: "application/pdf",
    text: "text/plain",
    image: "image/jpeg",
    default: "application/octet-stream",
  },
  PROVIDER_ENV_KEYS: {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  },
  REASONING_PATTERNS: [
    /<thinking>([\s\S]*?)<\/thinking>/,
    /<reasoning>([\s\S]*?)<\/reasoning>/,
    /^Thinking:\s*([\s\S]*?)(?:\n\n|$)/,
    /\[Reasoning\]([\s\S]*?)\[\/Reasoning\]/i,
  ],
} as const;
