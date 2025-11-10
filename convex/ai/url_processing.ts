import { type Infer, v } from "convex/values";
import Exa from "exa-js";
import type { WebSource } from "../types";

// URL detection patterns - comprehensive coverage
const URL_PATTERNS = {
  // Standard URLs with protocol
  fullUrl: /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi,
  // URLs without protocol (common in chat)
  bareUrl: /(?<!\w)(?:www\.|https?:\/\/)?[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+(?:\/[^\s]*)?/gi,
  // Markdown links (existing)
  markdownLink: /\[([^\]]+)\]\(([^)]+)\)/g,
};

export const urlProcessingArgs = v.object({
  urls: v.array(v.string()),
  includeText: v.optional(v.boolean()),
  includeHighlights: v.optional(v.boolean()),
  includeSummary: v.optional(v.boolean()),
  maxCharacters: v.optional(v.number()),
});

export type UrlProcessingArgs = Infer<typeof urlProcessingArgs>;

export interface UrlContent {
  url: string;
  title: string;
  content: string;
  summary: string;
  highlights: string[];
  chunks: string[];
  publishedDate?: string;
  author?: string;
  image?: string;
  favicon?: string;
}

export interface UrlProcessingResult {
  contents: UrlContent[];
  sources: WebSource[];
  context: string;
  failedUrls: string[];
}

/**
 * Extract URLs from message content using multiple patterns
 */
export function extractUrlsFromMessage(content: string): string[] {
  const urls = new Set<string>();
  
  // Extract from all patterns
  Object.values(URL_PATTERNS).forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(url => {
        const normalized = normalizeUrl(url);
        if (normalized) urls.add(normalized);
      });
    }
  });
  
  return Array.from(urls);
}

/**
 * Normalize URL by adding protocol if missing and basic validation
 */
function normalizeUrl(url: string): string | null {
  // Handle markdown links - extract the URL part
  const markdownMatch = url.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (markdownMatch) {
    const linkTarget = markdownMatch[2];
    if (!linkTarget) {
      return null;
    }
    url = linkTarget;
  }
  
  // Add protocol if missing
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  
  // Basic validation
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Fetch content for a list of URLs using Exa's available methods
 */
export async function fetchUrlContents(
  apiKey: string,
  args: UrlProcessingArgs
): Promise<UrlProcessingResult> {
  
  try {
    const exa = new Exa(apiKey);
    const contents: UrlContent[] = [];
    const sources: WebSource[] = [];
    const failedUrls: string[] = [];
    
    // Process each URL individually using available Exa methods
    for (const url of args.urls) {
      try {
        // Try to get content using findSimilarAndContents first (works for existing URLs)
        const similarResults = await exa.findSimilarAndContents(url, {
          numResults: 1, // We only want the original URL content
          text: args.includeText !== false ? true : undefined,
        });
        
        // Check if we got the original URL in results
        const originalUrlResult = similarResults.results.find(result => 
          result.url === url || result.url.replace(/^https?:\/\//, '') === url.replace(/^https?:\/\//, '')
        );
        
        if (originalUrlResult) {
          // Type assertion to match existing pattern
          const result = originalUrlResult as {
            url: string;
            title?: string | null;
            text?: string;
            highlights?: string[];
            publishedDate?: string;
            author?: string;
            image?: string;
            favicon?: string;
          };
          
          const urlContent: UrlContent = {
            url: result.url || url,
            title: result.title || 'Web Page',
            content: result.text || '',
            summary: (result.text || '').substring(0, 500),
            highlights: result.highlights || [],
            chunks: chunkContent(result.text || '', 1500),
            publishedDate: result.publishedDate,
            author: result.author,
            image: result.image,
            favicon: result.favicon,
          };
          
          contents.push(urlContent);
          
          // Create source for reference (but not formal citations)
          sources.push({
            url: urlContent.url,
            title: urlContent.title,
            snippet: urlContent.summary,
          });
          
        } else {
          // Fallback: try to search for the URL content
          const searchOptions: Record<string, unknown> = {
            numResults: 1,
            mode: "fast",
            text: args.includeText !== false ? {
              maxCharacters: args.maxCharacters || 8000,
              includeHtmlTags: false,
            } : undefined,
            highlights: args.includeHighlights !== false ? {
              numSentences: 5,
              highlightsPerUrl: 3,
            } : undefined,
          };
          
          const searchResults = await exa.searchAndContents(url, searchOptions);
          
          if (searchResults.results.length > 0) {
            // Type assertion to match existing pattern
            const result = searchResults.results[0] as {
              url: string;
              title?: string | null;
              text?: string;
              highlights?: string[];
              publishedDate?: string;
              author?: string;
              image?: string;
              favicon?: string;
            };
            
            if (result.text) {
              const urlContent: UrlContent = {
                url: result.url || url,
                title: result.title || 'Web Page',
                content: result.text || '',
                summary: (result.text || '').substring(0, 500),
                highlights: result.highlights || [],
                chunks: chunkContent(result.text || '', 1500),
                publishedDate: result.publishedDate,
                author: result.author,
                image: result.image,
                favicon: result.favicon,
              };
              
              contents.push(urlContent);
              
              // Create source for reference (but not formal citations)
              sources.push({
                url: urlContent.url,
                title: urlContent.title,
                snippet: urlContent.summary,
              });
            }
            
          } else {
            failedUrls.push(url);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing URL ${url}:`, error);
        failedUrls.push(url);
      }
    }
    
    
    return {
      contents,
      sources,
      context: '', // No formal context - content will be referenced naturally
      failedUrls,
    };
    
  } catch (error) {
    console.error("❌ Failed to fetch URL contents:", error);
    throw new Error(
      `Failed to fetch URL contents: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Chunk content for token management
 */
function chunkContent(text: string, maxTokens: number): string[] {
  // Simple chunking - you could use a more sophisticated tokenizer
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxTokens) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence + '. ';
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Determine if URLs should be processed based on message content
 */
export function shouldProcessUrls(message: string): boolean {
  // Don't process if it's clearly a search query
  const searchIndicators = [
    /search for/i,
    /find information about/i,
    /what is/i,
    /how to/i,
    /tell me about/i,
    /look up/i,
    /find/i,
  ];
  
  const hasSearchIntent = searchIndicators.some(pattern => pattern.test(message));
  
  // Only process if URLs are present and it's not clearly a search query
  const hasUrls = URL_PATTERNS.fullUrl.test(message) || 
                  URL_PATTERNS.bareUrl.test(message);
  
  return hasUrls && !hasSearchIntent;
}

/**
 * Process URLs in a message and return enhanced content
 */
export async function processUrlsInMessage(
  apiKey: string,
  messageContent: string
): Promise<UrlProcessingResult | null> {
  // Check if we should process URLs
  if (!shouldProcessUrls(messageContent)) {
    return null;
  }
  
  // Extract URLs
  const urls = extractUrlsFromMessage(messageContent);
  if (urls.length === 0) {
    return null;
  }
  
  
  // Fetch content for URLs
  return await fetchUrlContents(apiKey, {
    urls,
    includeText: true,
    includeHighlights: true,
    includeSummary: true,
    maxCharacters: 8000,
  });
}
