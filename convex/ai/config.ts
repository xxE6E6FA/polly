export const CONFIG = {
  STREAM: {
    BATCH_SIZE: 30,
    BATCH_TIMEOUT: 75,
    CHECK_STOP_EVERY_N_CHUNKS: 10,
    ABORT_TIMEOUT_MS: 5000, // Max time to wait for abort to complete
    STOP_CHECK_INTERVAL_MS: 500, // Increased from 250ms to 500ms - check less frequently
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
    /<thinking>([\S\s]*?)<\/thinking>/,
    /<reasoning>([\S\s]*?)<\/reasoning>/,
    /^Thinking:\s*([\S\s]*?)(?:\n\n|$)/,
    /\[reasoning]([\S\s]*?)\[\/reasoning]/i,
  ],
} as const;
