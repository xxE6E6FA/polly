import { extractCitations as extractCitationsShared } from "../lib/shared/citations";
import {
  type Citation,
  type GoogleGroundingChunk,
  type OpenRouterAnnotation,
  type OpenRouterCitation,
  type ProviderMetadata,
  type WebSource,
} from "./types";

// Citation extractor factory for Convex-specific formats
const citationExtractors = {
  sources: (sources: WebSource[]): Citation[] => {
    return sources
      .filter(source => source.url)
      .map(source => ({
        type: "url_citation" as const,
        url: source.url,
        title: source.title || "Web Source",
        snippet: source.snippet || source.description || "",
      }));
  },

  openrouter: (citations: OpenRouterCitation[]): Citation[] => {
    return citations.map(c => ({
      type: "url_citation" as const,
      url: c.url,
      title: c.title || "Web Source",
      cited_text: c.text,
      snippet: c.snippet,
    }));
  },

  openrouterAnnotations: (annotations: OpenRouterAnnotation[]): Citation[] => {
    // Handle OpenRouter's web search annotations format
    return annotations
      .filter(
        annotation =>
          annotation.type === "url_citation" && annotation.url_citation
      )
      .map(annotation => {
        const citation = annotation.url_citation!;
        return {
          type: "url_citation" as const,
          url: citation.url,
          title: citation.title || "Web Source",
          snippet: citation.content || "",
          // The cited_text can be extracted from the message content using start/end indices
          cited_text: citation.content,
        };
      });
  },

  google: (chunks: GoogleGroundingChunk[]): Citation[] => {
    return chunks.map(chunk => ({
      type: "url_citation" as const,
      url: chunk.web?.uri || "",
      title: chunk.web?.title || "Web Source",
      snippet: chunk.content,
    }));
  },
};

// Enhanced extract citations that uses shared logic plus Convex-specific formats
export const extractCitations = (
  providerMetadata?: ProviderMetadata | Record<string, unknown>,
  sources?: WebSource[]
): Citation[] | undefined => {
  const citations: Citation[] = [];

  // First try the shared extraction (handles standard formats)
  const sharedCitations = extractCitationsShared(providerMetadata);
  if (sharedCitations) {
    citations.push(...sharedCitations);
  }

  // Then handle Convex-specific formats
  if (sources && Array.isArray(sources)) {
    citations.push(...citationExtractors.sources(sources));
  }

  // Type-safe check for Convex-specific metadata
  const convexMetadata = providerMetadata as ProviderMetadata | undefined;

  if (convexMetadata?.openrouter?.citations) {
    citations.push(
      ...citationExtractors.openrouter(convexMetadata.openrouter.citations)
    );
  }

  // Check for OpenRouter annotations in provider metadata
  if (convexMetadata?.openrouter?.annotations) {
    citations.push(
      ...citationExtractors.openrouterAnnotations(
        convexMetadata.openrouter.annotations
      )
    );
  }

  if (convexMetadata?.google?.groundingChunks) {
    citations.push(
      ...citationExtractors.google(convexMetadata.google.groundingChunks)
    );
  }

  // Deduplicate citations by URL
  const uniqueCitations = Array.from(
    new Map(citations.map(c => [c.url, c])).values()
  );

  return uniqueCitations.length > 0 ? uniqueCitations : undefined;
};
