import { DEFAULT_STREAM_CONFIG } from "../lib/shared/stream_utils";

export const CONFIG = {
  STREAM: {
    ...DEFAULT_STREAM_CONFIG,
    CHECK_STOP_EVERY_N_CHUNKS: 10, // Override specific values for this use case
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
    replicate: "REPLICATE_API_TOKEN",
  },
} as const;
