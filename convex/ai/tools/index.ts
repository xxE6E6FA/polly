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
} from "./web-search";
