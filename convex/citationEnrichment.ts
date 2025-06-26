import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";

// Type for enriched citation data

type EnrichedCitationData = {
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  publishedDate?: string;
  author?: string;
};

// Extract metadata from HTML

function extractMetadata(html: string, url: string): EnrichedCitationData {
  const metadata: EnrichedCitationData = {};

  // Helper to extract meta tag content
  const getMetaContent = (property: string): string | undefined => {
    // Try property attribute
    const propertyMatch = html.match(
      new RegExp(
        `<meta\\s+(?:[^>]*\\s+)?property=["']${property}["'][^>]*content=["']([^"']+)["']`,
        "i"
      )
    );
    if (propertyMatch) {
      return propertyMatch[1];
    }

    // Try name attribute
    const nameMatch = html.match(
      new RegExp(
        `<meta\\s+(?:[^>]*\\s+)?name=["']${property}["'][^>]*content=["']([^"']+)["']`,
        "i"
      )
    );
    if (nameMatch) {
      return nameMatch[1];
    }

    // Try content first (for cases where content comes before property/name)
    const contentFirstMatch = html.match(
      new RegExp(
        `<meta\\s+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
        "i"
      )
    );
    if (contentFirstMatch) {
      return contentFirstMatch[1];
    }

    return undefined;
  };

  // Extract OpenGraph data
  metadata.description =
    getMetaContent("og:description") ||
    getMetaContent("description") ||
    getMetaContent("twitter:description");

  metadata.image =
    getMetaContent("og:image") ||
    getMetaContent("twitter:image") ||
    getMetaContent("twitter:image:src");

  metadata.siteName =
    getMetaContent("og:site_name") || getMetaContent("application-name");

  metadata.author =
    getMetaContent("author") ||
    getMetaContent("article:author") ||
    getMetaContent("twitter:creator");

  metadata.publishedDate =
    getMetaContent("article:published_time") ||
    getMetaContent("publishedDate") ||
    getMetaContent("datePublished");

  // Extract favicon
  const faviconMatch = html.match(
    /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i
  );
  if (faviconMatch) {
    const faviconUrl = faviconMatch[1];
    // Make favicon URL absolute
    if (faviconUrl.startsWith("http")) {
      metadata.favicon = faviconUrl;
    } else if (faviconUrl.startsWith("//")) {
      metadata.favicon = `https:${faviconUrl}`;
    } else {
      const urlObj = new URL(url);
      metadata.favicon =
        urlObj.origin + (faviconUrl.startsWith("/") ? "" : "/") + faviconUrl;
    }
  } else {
    // Default favicon path
    const urlObj = new URL(url);
    metadata.favicon = `${urlObj.origin}/favicon.ico`;
  }

  // Clean up image URL if relative
  if (metadata.image && !metadata.image.startsWith("http")) {
    const urlObj = new URL(url);
    metadata.image = metadata.image.startsWith("//")
      ? `https:${metadata.image}`
      : urlObj.origin +
        (metadata.image.startsWith("/") ? "" : "/") +
        metadata.image;
  }

  return metadata;
}

// Fetch metadata from a URL

async function fetchUrlMetadata(url: string): Promise<EnrichedCitationData> {
  try {
    // Add a timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Polly/1.0; +https://polly.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return {};
    }

    // Only process HTML responses
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html")) {
      return {};
    }

    // Read only the first 50KB to avoid processing huge pages
    const reader = response.body?.getReader();
    if (!reader) {
      return {};
    }

    let html = "";
    let totalBytes = 0;
    const maxBytes = 50 * 1024; // 50KB

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = new TextDecoder().decode(value);
      html += chunk;
      totalBytes += value.byteLength;

      // Check if we have enough data (found </head>)
      if (html.includes("</head>")) {
        reader.cancel();
        break;
      }
    }

    reader.cancel();
    return extractMetadata(html, url);
  } catch (error) {
    console.error(`Error fetching metadata for ${url}:`, error);
    return {};
  }
}

// Internal action to enrich citations for a message
export const enrichMessageCitations = internalAction({
  args: {
    messageId: v.id("messages"),
    citations: v.array(
      v.object({
        type: v.literal("url_citation"),
        url: v.string(),
        title: v.string(),
        cited_text: v.optional(v.string()),
        snippet: v.optional(v.string()),
        description: v.optional(v.string()),
        image: v.optional(v.string()),
        favicon: v.optional(v.string()),
        siteName: v.optional(v.string()),
        publishedDate: v.optional(v.string()),
        author: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Process citations in parallel but limit concurrency
    const BATCH_SIZE = 5;
    const enrichedCitations = [...args.citations];

    for (let i = 0; i < enrichedCitations.length; i += BATCH_SIZE) {
      const batch = enrichedCitations.slice(i, i + BATCH_SIZE);
      const enrichmentPromises = batch.map(async (citation, index) => {
        // Skip if already has enriched data
        if (citation.image || citation.description || citation.favicon) {
          return;
        }

        try {
          const metadata = await fetchUrlMetadata(citation.url);
          const citationIndex = i + index;

          // Merge metadata with existing citation
          enrichedCitations[citationIndex] = {
            ...citation,
            ...metadata,
            // Don't override existing data
            description: citation.description || metadata.description,
            image: citation.image || metadata.image,
            favicon: citation.favicon || metadata.favicon,
            siteName: citation.siteName || metadata.siteName,
            publishedDate: citation.publishedDate || metadata.publishedDate,
            author: citation.author || metadata.author,
          };
        } catch (error) {
          console.error(`Failed to enrich citation ${citation.url}:`, error);
        }
      });

      await Promise.all(enrichmentPromises);
    }

    // Update the message with enriched citations
    await ctx.runMutation(internal.messages.internalUpdate, {
      id: args.messageId,
      citations: enrichedCitations,
    });
  },
});

// Public action to manually enrich citations (for testing or manual trigger)
export const enrichCitations = action({
  args: {
    urls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.urls.map(async url => {
        const metadata = await fetchUrlMetadata(url);
        return {
          url,
          ...metadata,
        };
      })
    );
    return results;
  },
});
