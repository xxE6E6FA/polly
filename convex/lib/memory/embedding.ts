import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { CONFIG } from "../../ai/config";

/**
 * Generate a 1536-dimensional embedding using OpenAI text-embedding-3-small.
 * Used for semantic memory search via Convex vector indexes.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env[CONFIG.PROVIDER_ENV_KEYS.openai];
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY required for memory embeddings");
  }

  const openai = createOpenAI({ apiKey });
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}
