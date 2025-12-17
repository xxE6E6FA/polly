/**
 * PDF Text Extraction Cache System
 * Implements intelligent caching for PDF text extraction to improve performance
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";

// Cache key generation based on file content hash
export function generatePdfCacheKey(fileContent: string): string {
  // Simple hash of the first 1KB + file size for quick cache lookup
  const prefix = fileContent.substring(0, 1024);
  const hash = Array.from(prefix)
    .reduce((hash, char) => {
      const charCode = char.charCodeAt(0);
      return ((hash << 5) - hash) + charCode;
    }, 0)
    .toString(36);
  
  return `pdf_${hash}_${fileContent.length}`;
}

// Cache entry type
export type PdfCacheEntry = {
  cacheKey: string;
  textFileId: Id<"_storage">;
  extractedAt: number;
  contentLength: number;
  wordCount: number;
  expiresAt: number; // Cache expiration timestamp
};

// Cache duration (7 days)
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Check if a PDF text extraction is cached
 */
export const checkPdfCache = internalQuery({
  args: {
    cacheKey: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      textFileId: v.id("_storage"),
      extractedAt: v.number(),
      contentLength: v.number(),
      wordCount: v.number(),
    })
  ),
  handler: async (ctx, { cacheKey }) => {
    const now = Date.now();
    
    // Query for cache entry
    const cacheEntry = await ctx.db
      .query("pdfTextCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", cacheKey))
      .first();

    if (!cacheEntry) {
      return null;
    }

    // Check if cache entry has expired
    if (cacheEntry.expiresAt < now) {
      // Mark as expired but don't clean up synchronously in query
      // Cleanup will happen via the daily cron job
      return null;
    }

    // Return valid cache entry
    return {
      textFileId: cacheEntry.textFileId,
      extractedAt: cacheEntry.extractedAt,
      contentLength: cacheEntry.contentLength,
      wordCount: cacheEntry.wordCount,
    };
  },
});

/**
 * Store a PDF text extraction in cache
 */
export const storePdfCache = internalMutation({
  args: {
    cacheKey: v.string(),
    textFileId: v.id("_storage"),
    contentLength: v.number(),
    wordCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { cacheKey, textFileId, contentLength, wordCount }) => {
    const now = Date.now();
    const expiresAt = now + CACHE_DURATION_MS;

    // Check if entry already exists
    const existing = await ctx.db
      .query("pdfTextCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", cacheKey))
      .first();

    if (existing) {
      // Update existing entry
      await ctx.db.patch("pdfTextCache", existing._id, {
        textFileId,
        extractedAt: now,
        contentLength,
        wordCount,
        expiresAt,
      });
    } else {
      // Create new entry
      await ctx.db.insert("pdfTextCache", {
        cacheKey,
        textFileId,
        extractedAt: now,
        contentLength,
        wordCount,
        expiresAt,
      });
    }
  },
});

/**
 * Cleanup expired cache entry
 */
export const cleanupExpiredEntry = internalMutation({
  args: {
    id: v.id("pdfTextCache"),
  },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    try {
      const entry = await ctx.db.get("pdfTextCache", id);
      if (entry) {
        // Try to delete the stored text file
        try {
          await ctx.storage.delete(entry.textFileId);
        } catch (storageError) {
          // Storage deletion failed, but continue with cache cleanup
          console.warn("Failed to delete cached PDF text file:", storageError);
        }
        
        // Delete the cache entry
        await ctx.db.delete("pdfTextCache", id);
      }
    } catch (error) {
      console.error("Failed to cleanup expired PDF cache entry:", error);
    }
  },
});

/**
 * Try to retrieve cached PDF text
 */
export async function getCachedPdfText(
  ctx: ActionCtx,
  fileContent: string
): Promise<{ textFileId: Id<"_storage">; text: string } | null> {
  const cacheKey = generatePdfCacheKey(fileContent);
  
  try {
    const cached = await ctx.runQuery(internal.ai.pdf_cache.checkPdfCache, {
      cacheKey,
    });

    if (!cached) {
      return null;
    }

    // Retrieve the actual text content
    const textBlob = await ctx.storage.get(cached.textFileId);
    if (!textBlob) {
      return null;
    }

    const text = await textBlob.text();
    return {
      textFileId: cached.textFileId,
      text,
    };
  } catch (error) {
    console.warn("Failed to retrieve cached PDF text:", error);
    return null;
  }
}

/**
 * Store extracted PDF text in cache
 */
export async function cachePdfText(
  ctx: ActionCtx,
  fileContent: string,
  extractedText: string
): Promise<Id<"_storage"> | null> {
  const cacheKey = generatePdfCacheKey(fileContent);
  
  try {
    // Store the text content
    const textBlob = new Blob([extractedText], { type: "text/plain" });
    const textFileId = await ctx.storage.store(textBlob);

    // Store cache entry
    await ctx.runMutation(internal.ai.pdf_cache.storePdfCache, {
      cacheKey,
      textFileId,
      contentLength: extractedText.length,
      wordCount: extractedText.split(/\s+/).length,
    });

    return textFileId;
  } catch (error) {
    console.error("Failed to cache PDF text:", error);
    return null;
  }
}

/**
 * Batch cleanup of expired cache entries
 */
export const batchCleanupExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Find expired entries in batches
    const expiredEntries = await ctx.db
      .query("pdfTextCache")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(50); // Process in batches of 50

    for (const entry of expiredEntries) {
      try {
        // Try to delete the stored text file
        try {
          await ctx.storage.delete(entry.textFileId);
        } catch (storageError) {
          // Continue even if storage deletion fails
        }
        
        // Delete the cache entry
        await ctx.db.delete("pdfTextCache", entry._id);
        cleanedCount++;
      } catch (error) {
        console.error("Failed to cleanup expired cache entry:", error);
      }
    }

    return cleanedCount;
  },
});
