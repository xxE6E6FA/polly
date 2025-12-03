import type { ActionCtx } from "../../_generated/server";
import type { ApiMessageDoc, ProcessedChunk } from "./types";
import { api } from "../../_generated/api";
import {
	generateTextWithProvider,
	isTextGenerationAvailable,
} from "../../ai/text_generation";

// Hierarchical summarization configuration
export const CONTEXT_CONFIG = {
  CHUNK_SIZE: 15, // Messages per chunk
  SUMMARY_THRESHOLD: 20, // When to start summarizing
  // When working with context windows, start summarizing once the
  // conversation exceeds this many tokens even if the active model
  // supports a larger window. This protects multi‑model conversations
  // from ballooning. Tokens are estimated heuristically.
  MIN_TOKEN_THRESHOLD: 100_000, // 100k tokens safety cap
  MAX_SUMMARY_LENGTH: 400, // Max characters per summary (increased for richer summaries)
  MAX_SUMMARY_CHUNKS: 5, // Max summaries before creating meta-summary
  MIN_CHUNK_SIZE: 10, // Minimum chunk size
  MAX_CHUNK_SIZE: 25, // Maximum chunk size
  // LLM summarization settings
  MAX_API_TOKENS: 1000, // Maximum tokens for API calls
  TEMPERATURE: 0.2, // Temperature for consistent summaries
  TOP_P: 0.9, // Top-p for focused generation
  TOP_K: 40, // Top-k for quality variety
  // Fallback settings
  FALLBACK_SUMMARY_LENGTH: 300, // Length for fallback summaries
  TRUNCATE_BUFFER: 20, // Buffer space for truncation
} as const;

// Dynamic chunk size calculation based on model context window
function calculateOptimalChunkSize(modelContextWindow?: number): number {
  if (!modelContextWindow) {
    return CONTEXT_CONFIG.CHUNK_SIZE;
  }

  // Adjust chunk size based on context window
  // Larger context windows can handle bigger chunks
  if (modelContextWindow >= 200000) { // Claude 3.5/3.7, GPT-4o
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 25);
  } else if (modelContextWindow >= 128000) { // GPT-4 Turbo
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 22);
  } else if (modelContextWindow >= 32000) { // GPT-4, Gemini 2.5
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 18);
  } else if (modelContextWindow >= 16000) { // GPT-3.5 Turbo
    return Math.min(CONTEXT_CONFIG.MAX_CHUNK_SIZE, 15);
  } else {
    return Math.max(CONTEXT_CONFIG.MIN_CHUNK_SIZE, 12);
  }
}

async function processChunksWithStoredSummaries(
  ctx: ActionCtx,
  conversationId: string,
  allMessages: ApiMessageDoc[]
): Promise<ProcessedChunk[]> {
  // Query for existing summaries for this conversation
  const existingSummaries = await ctx.runQuery(
    api.conversationSummary.getConversationSummaries,
    {
      conversationId: conversationId as any,
    }
  );


  // Create a map of chunk indices to their summaries
  const summaryMap = new Map<number, string>();
  for (const summary of existingSummaries) {
    summaryMap.set(summary.chunkIndex, summary.summary);
  }

  const optimalChunkSize = calculateOptimalChunkSize();
  const chunks: ProcessedChunk[] = [];

  // Process all messages in chunks
  for (let i = 0; i < allMessages.length; i += optimalChunkSize) {
    const chunk = allMessages.slice(i, Math.min(i + optimalChunkSize, allMessages.length));
    const chunkIndex = Math.floor(i / optimalChunkSize);
    
    // Check if we have a stored summary for this chunk
    const storedSummary = summaryMap.get(chunkIndex);
    
    if (storedSummary) {
      // Use the stored summary instead of raw messages
      chunks.push({
        summary: storedSummary,
        chunkIndex,
        originalMessageCount: chunk.length,
      });
    } else {
      // No stored summary - use raw messages (will be summarized later if needed)
      chunks.push({
        messages: chunk,
        chunkIndex,
        originalMessageCount: chunk.length,
      });
    }
  }

  return chunks;
}

// Extract summary storage logic into separate function
async function storeChunkSummary(
  ctx: ActionCtx,
  conversationId: string,
  chunkIndex: number,
  summary: string,
  messageCount: number,
  chunk: ProcessedChunk
): Promise<void> {
  try {
    // Calculate the required message IDs from the chunk
    const firstMessageId = chunk.messages?.[0]?._id || "unknown" as any;
    const lastMessageId = chunk.messages?.[chunk.messages.length - 1]?._id || "unknown" as any;
    
    await ctx.runMutation(api.conversationSummary.storeChunkSummary, {
      conversationId: conversationId as any,
      chunkIndex,
      summary,
      messageCount,
      firstMessageId,
      lastMessageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to store chunk summary: ${message}`);
    // Don't throw - continue with the process even if storage fails
  }
}

// Extract recursive meta-summary creation into separate function
async function createRecursiveMetaSummary(
  ctx: ActionCtx,
  conversationId: string,
  summaries: string[],
  depth: number = 1
): Promise<ProcessedChunk[]> {
  if (summaries.length <= CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS) {
    return summaries.map(summary => ({ summary }));
  }

  
  const metaSummaryChunks: ProcessedChunk[] = [];
  
  for (let i = 0; i < summaries.length; i += CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS) {
    const summaryGroup = summaries.slice(i, Math.min(i + CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS, summaries.length));
    const combinedSummaries = summaryGroup.join("\n\n");
    
    const metaSummaryPrompt = buildMetaSummaryPrompt(combinedSummaries, CONTEXT_CONFIG.MAX_SUMMARY_LENGTH);
    const metaSummary = await generateLLMSummary(metaSummaryPrompt, CONTEXT_CONFIG.MAX_SUMMARY_LENGTH);
    
    metaSummaryChunks.push({
      summary: metaSummary,
      isMetaSummary: true,
      chunkIndex: Math.floor(i / CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS),
      originalMessageCount: summaryGroup.length,
    });
  }

  // Recursively create meta-summaries if we still have too many
  if (metaSummaryChunks.length > CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS) {
    const summariesForNextLevel = metaSummaryChunks.map(chunk => chunk.summary!);
    return createRecursiveMetaSummary(ctx, conversationId, summariesForNextLevel, depth + 1);
  }

  return metaSummaryChunks;
}

async function summarizeChunk(chunk: ApiMessageDoc[]): Promise<string> {
  try {
    const conversationText = buildConversationText(chunk);
    const maxLength = Math.max(
      CONTEXT_CONFIG.FALLBACK_SUMMARY_LENGTH,
      Math.floor(conversationText.length * 0.25)
    );
    
    const summaryPrompt = buildSummaryPrompt(conversationText, maxLength);
    const summary = await generateLLMSummary(summaryPrompt, maxLength);
    
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`LLM summarization failed: ${message}. Using fallback.`);
    const conversationText = buildConversationText(chunk);
    return createFallbackSummary(conversationText, CONTEXT_CONFIG.FALLBACK_SUMMARY_LENGTH);
  }
}

// Extract conversation text building into separate function
function buildConversationText(chunk: ApiMessageDoc[]): string {
  return chunk
    .map(msg => {
      const roleName = msg.role === "user" ? "User" : "Assistant";
      return `${roleName}: ${msg.content}`;
    })
    .join("\n\n");
}

// Extract summary prompt building into separate function
function buildSummaryPrompt(conversationText: string, maxLength: number): string {
  return `Please create a comprehensive, structured summary of this conversation segment. Preserve all key information, technical details, questions asked, solutions provided, and important context. Use clear formatting with sections or bullet points where appropriate.

Important guidelines:
- Maintain technical accuracy and preserve domain-specific terminology
- Capture the logical flow and progression of ideas
- Include both questions and answers/solutions
- Preserve specific examples, code snippets, or technical details
- Use structured formatting (sections, bullet points) for clarity
- Aim for ${maxLength} characters or less
- Focus on information that would be valuable for conversation continuity

Conversation to summarize:
${conversationText}

Structured Summary:`;
}

// Extract LLM summary generation into separate function
async function generateLLMSummary(prompt: string, maxLength: number): Promise<string> {
  if (!isTextGenerationAvailable()) {
    throw new Error("No API key available for text generation");
  }

  try {
    let summary = await generateTextWithProvider({
      prompt,
      maxTokens: Math.min(CONTEXT_CONFIG.MAX_API_TOKENS, maxLength * 2),
      temperature: CONTEXT_CONFIG.TEMPERATURE,
      topP: CONTEXT_CONFIG.TOP_P,
    });

    // Ensure summary doesn't exceed max length
    if (summary.length > maxLength) {
      summary = intelligentTruncateSummary(summary, maxLength);
    }

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`LLM summarization failed: ${message}`);
    throw error;
  }
}

// Build a prompt for summarizing previously generated chunk summaries into a single coherent summary
function buildMetaSummaryPrompt(summaries: string, maxLength: number): string {
  return `Please create a comprehensive meta-summary that consolidates the following conversation summaries into a single, coherent overview. Preserve the most important information, maintain logical flow, and ensure no critical context is lost.

Guidelines:
- Combine related topics and themes
- Maintain chronological flow where important
- Preserve technical details and specific examples
- Keep important questions and their solutions
- Use structured formatting for clarity
- Aim for ${maxLength} characters or less
- Focus on information most valuable for conversation continuity

Summaries to consolidate:
${summaries}

Consolidated Meta-Summary:`;
}

function createFallbackSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let summary = "";
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (summary.length + trimmedSentence.length + 2 > maxLength - CONTEXT_CONFIG.TRUNCATE_BUFFER) {
      break;
    }
    summary += (summary ? ". " : "") + trimmedSentence;
  }
  
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 3) + "...";
  }
  
  return summary || text.substring(0, maxLength - 3) + "...";
}

function intelligentTruncateSummary(summary: string, maxLength: number): string {
  if (summary.length <= maxLength) {
    return summary;
  }

  // Try to truncate at sentence boundaries
  const sentences = summary.split(/[.!?]+/);
  let truncated = "";
  
  for (let i = 0; i < sentences.length; i++) {
    const rawSentence = sentences[i];
    if (!rawSentence) {
      continue;
    }
    const sentence = rawSentence.trim();
    if (!sentence) {
      continue;
    }
    
    const nextLength = truncated.length + (truncated ? ". " : "").length + sentence.length;
    if (nextLength > maxLength - CONTEXT_CONFIG.TRUNCATE_BUFFER) {
      break;
    }
    
    truncated += (truncated ? ". " : "") + sentence;
  }
  
  // If we couldn't fit even one sentence, do a hard truncate
  if (!truncated) {
    truncated = summary.substring(0, maxLength - 3) + "...";
  } else if (truncated.length < summary.length) {
    truncated += "...";
  }
  
  return truncated;
}

export {
  calculateOptimalChunkSize,
  processChunksWithStoredSummaries,
  storeChunkSummary,
  createRecursiveMetaSummary,
  summarizeChunk,
  buildConversationText,
  buildSummaryPrompt,
  generateLLMSummary,
  buildMetaSummaryPrompt,
  createFallbackSummary,
  intelligentTruncateSummary,
};
