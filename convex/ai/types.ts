import { type Id } from "../_generated/dataModel";

// Message types

export type StreamMessage = {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<{
        type: "text" | "image_url" | "file";
        text?: string;
        image_url?: { url: string };
        file?: { filename: string; file_data: string };
        attachment?: {
          storageId: Id<"_storage">;
          type: string;
          name: string;
        };
      }>;
};

export type MessagePart = {
  type: "text" | "image_url" | "file";
  text?: string;
  image_url?: { url: string };
  file?: { filename: string; file_data: string };
  attachment?: {
    storageId: Id<"_storage">;
    type: string;
    name: string;
  };
};

// Citation types

export type Citation = {
  type: "url_citation";
  url: string;
  title: string;
  cited_text?: string;
  snippet?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  publishedDate?: string;
  author?: string;
};

export type WebSource = {
  url: string;
  title?: string;
  snippet?: string;
  description?: string;
};

export type OpenRouterCitation = {
  url: string;
  title?: string;
  text?: string;
  snippet?: string;
};

export type OpenRouterAnnotation = {
  type: string;
  url_citation?: {
    url: string;
    title?: string;
    content?: string;
  };
};

export type GoogleGroundingChunk = {
  content: string;
  web?: {
    uri: string;
    title?: string;
  };
};

// Provider types

export type ProviderType = "openai" | "anthropic" | "google" | "openrouter";

export type ProviderMetadata = {
  openrouter?: {
    citations?: OpenRouterCitation[];
    annotations?: OpenRouterAnnotation[];
  };
  google?: {
    groundingChunks?: GoogleGroundingChunk[];
  };
};

// Storage types

export type StorageData = {
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  base64: string;
  mimeType: string;
};

// Stream types

export type StreamPart = {
  type: "text-delta" | "reasoning" | string;
  textDelta?: string;
};

export type FinishData = {
  text: string;
  finishReason: string | null | undefined;
  reasoning: string | null | undefined;
  providerMetadata: ProviderMetadata | undefined;
};
