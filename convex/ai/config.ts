import { DEFAULT_STREAM_CONFIG } from "../lib/shared/stream_utils";

export const CONFIG = {
  STREAM: {
    ...DEFAULT_STREAM_CONFIG,
    CHECK_STOP_EVERY_N_CHUNKS: 10, // Override specific values for this use case
    STOP_CHECK_INTERVAL_MS: 500, // Increased from 250ms to 500ms - check less frequently
  },
  PERF: {
    // When true, skip expensive pre-stream work (search/URL fetch) to emit first chunks faster
    FAST_FIRST_CHUNK: true,
    // Always perform web search and URL processing before LLM
    // Emit detailed timing logs for diagnosing pre-stream latency
    LOG_TIMINGS: false,
    // Smoothing delay for AI SDK smoothStream transform (ms)
    // 6–12ms recommended for smooth cadence without hurting TTFT
    SMOOTH_STREAM_DELAY_MS: 8,

    // Precheck + EXA concurrency tuning
    PRECHECK_BUDGET_MS: 350,
    EXA_SEED_TOPK: 3,
    EXA_FULL_TOPK: 6,
    EXA_SEED_TIMEOUT_MS: 600,
    EXA_FULL_TIMEOUT_MS: 2500,
    EXA_ABORT_ON_NO_SEARCH: true,
    SEARCH_CACHE_TTL_MS: 15 * 60 * 1000, // 15 minutes
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
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    replicate: "REPLICATE_API_TOKEN",
    elevenlabs: "ELEVENLABS_API_KEY",
  },
} as const;
