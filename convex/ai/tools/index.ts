/**
 * AI Tools Module
 *
 * This module exports tools that can be used with AI SDK's streamText function.
 * Tools allow models with tool calling support to access external capabilities.
 */

export {
  createWebSearchTool,
  webSearchToolSchema,
  WEB_SEARCH_TOOL_NAME,
  type WebSearchToolParams,
  type WebSearchToolResult,
} from "./web_search";

export {
  createConversationSearchTool,
  conversationSearchToolSchema,
  CONVERSATION_SEARCH_TOOL_NAME,
  type ConversationSearchToolParams,
  type ConversationSearchToolResult,
} from "./conversation_search";

export {
  createImageGenerationTool,
  imageGenerationToolSchema,
  IMAGE_GENERATION_TOOL_NAME,
  type ImageModelInfo,
  type ImageGenerationToolParams,
  type ImageGenerationToolResult,
} from "./image_generation";
