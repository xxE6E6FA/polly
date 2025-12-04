import { type Infer, v } from "convex/values";
import Exa from "exa-js";
import type { WebSource } from "../types";

/**
 * SSRF Protection: Blocked domains and IP ranges
 * Prevents Server-Side Request Forgery attacks by blocking internal/private addresses
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal", // GCP metadata
  "169.254.169.254", // AWS/GCP/Azure metadata endpoint
  "metadata.google",
  "kubernetes.default.svc",
]);

/**
 * Check if an IP address is in a private/internal range
 * RFC 1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * Plus link-local, loopback, and other reserved ranges
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // Remove brackets from IPv6
  const cleanHost = hostname.replace(/^\[|\]$/g, "");

  // Check IPv4 patterns
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      return false;
    }

    // Loopback: 127.0.0.0/8
    if (a === 127) return true;

    // Private: 10.0.0.0/8
    if (a === 10) return true;

    // Private: 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // Private: 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // Link-local: 169.254.0.0/16
    if (a === 169 && b === 254) return true;

    // Broadcast: 255.255.255.255
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;

    // Zero address
    if (a === 0 && b === 0 && c === 0 && d === 0) return true;
  }

  // Check for IPv6 private/reserved patterns
  const ipv6Lower = cleanHost.toLowerCase();
  if (
    ipv6Lower.startsWith("fe80:") || // Link-local
    ipv6Lower.startsWith("fc") || // Unique local (fc00::/7)
    ipv6Lower.startsWith("fd") || // Unique local (fc00::/7)
    ipv6Lower === "::1" || // Loopback
    ipv6Lower === "::" // Unspecified
  ) {
    return true;
  }

  return false;
}

/**
 * Check if a URL is safe to fetch (not pointing to internal/private resources)
 * @returns true if URL is safe, false if blocked
 */
function isUrlSafeToFetch(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Check against blocked hostnames
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      console.warn(`[SSRF Protection] Blocked hostname: ${hostname}`);
      return false;
    }

    // Check for private/reserved IP addresses
    if (isPrivateOrReservedIP(hostname)) {
      console.warn(`[SSRF Protection] Blocked private/reserved IP: ${hostname}`);
      return false;
    }

    // Block URLs with credentials (potential abuse vector)
    if (url.username || url.password) {
      console.warn(`[SSRF Protection] Blocked URL with credentials`);
      return false;
    }

    // Block non-HTTP(S) protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      console.warn(`[SSRF Protection] Blocked non-HTTP protocol: ${url.protocol}`);
      return false;
    }

    // Block common internal/infrastructure domains
    const blockedPatterns = [
      /\.internal$/i,
      /\.local$/i,
      /\.localhost$/i,
      /\.localdomain$/i,
      /^consul\./i,
      /^vault\./i,
      /^etcd\./i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        console.warn(`[SSRF Protection] Blocked internal domain pattern: ${hostname}`);
        return false;
      }
    }

    return true;
  } catch {
    // If URL parsing fails, it's not safe
    return false;
  }
}

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
 * Filters out unsafe URLs (internal/private addresses) for SSRF protection
 */
export function extractUrlsFromMessage(content: string): string[] {
  const urls = new Set<string>();

  // Extract from all patterns
  Object.values(URL_PATTERNS).forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(url => {
        const normalized = normalizeUrl(url);
        // Only add URLs that pass SSRF safety check
        if (normalized && isUrlSafeToFetch(normalized)) {
          urls.add(normalized);
        }
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
      // Defense-in-depth: Double-check URL safety before fetching
      if (!isUrlSafeToFetch(url)) {
        console.warn(`[SSRF Protection] Skipping unsafe URL in fetchUrlContents: ${url}`);
        failedUrls.push(url);
        continue;
      }

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
