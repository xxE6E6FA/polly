/**
 * @module lib
 * @description Utility functions and helpers organized by domain
 *
 * ## Domains
 *
 * ### General Utils
 * - cn (classnames), formatDate
 *
 * ### File Utils
 * - Image conversion, thumbnails, file reading
 *
 * ### AI Utils
 * - Chat handlers, citations, error messages
 *
 * ### Model Utils
 * - Capabilities, Replicate schema parsing
 *
 * ### Storage
 * - Local storage helpers, caching
 *
 * @example
 * import { cn, formatDate, ROUTES } from "@/lib";
 */

// =============================================================================
// General Utils
// =============================================================================

export { ROUTES } from "./routes";
export {
  cn,
  formatDate,
  formatFileSize,
  resizeGoogleImageUrl,
  stripCitations,
} from "./utils";
export { validateApiKey } from "./validation";

// =============================================================================
// File Utils
// =============================================================================

export {
  base64ToUint8Array,
  convertImageToWebP,
  FILE_EXTENSION_TO_LANGUAGE,
  generateThumbnail,
  generateVideoThumbnail,
  getCanvas2DContext,
  getFileLanguage,
  isHeicFile,
  readFileAsBase64,
  readFileAsText,
  truncateMiddle,
} from "./file-utils";

// =============================================================================
// Markdown Utils
// =============================================================================

export {
  applyHardLineBreaks,
  applyHardLineBreaksToString,
  bufferIncompleteEntities,
  convertCitationsToMarkdownLinks,
  decodeMinimalEntities,
  normalizeEscapedMarkdown,
  normalizeLatexDelimiters,
  removeParenthesesAroundItalics,
  renderTextWithMathAndCitations,
} from "./markdown-utils";

// =============================================================================
// Export/Import Utils
// =============================================================================

export {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateBackgroundExportFilename,
  generateFilename,
} from "./export";
export type { ImportResult, ParsedConversation } from "./import-parsers";
export { detectAndParseImportData } from "./import-parsers";

// =============================================================================
// Storage Utils
// =============================================================================

export type { ConversationsCacheStore } from "./conversations-cache";
export {
  clearCachedConversations,
  getCachedConversations,
  setCachedConversations,
} from "./conversations-cache";
export type { CacheKey } from "./local-storage";
export {
  buildKey,
  CACHE_KEYS,
  clearAllPollyKeys,
  clearUserData,
  del,
  get,
  LOCAL_STORAGE_VERSION,
  set,
} from "./local-storage";

// =============================================================================
// Model Utils
// =============================================================================

export type { CapabilityDefinition, CapabilityKey } from "./model-capabilities";
export {
  CAPABILITY_REGISTRY,
  generateCapabilityCounts,
  getAllCapabilities,
  getModelCapabilities,
  matchesCapabilityFilters,
} from "./model-capabilities";
export type {
  ModelInputSchema,
  ReplicateModelSchema,
  SchemaProperty,
  SchemaPropertyType,
} from "./replicate-schema";
export {
  detectAspectRatioSupport,
  detectImageInput,
  getGuidanceParameter,
  getMaxOutputs,
  getSeedParameter,
  getStepsParameter,
  getSupportedAspectRatios,
  sortPropertiesByOrder,
  supportsImageInput,
  supportsMultipleOutputs,
  supportsNegativePrompt,
} from "./replicate-schema";

// =============================================================================
// Message & Reasoning Utils
// =============================================================================

export { formatContextLength } from "./format-context";

// =============================================================================
// Type Guards
// =============================================================================

export {
  hasPageArray,
  isApiKeysArray,
  isMonthlyUsage,
  isPersona,
  isPersonaArray,
  isUser,
  isUserApiKey,
  isUserModel,
  isUserModelsArray,
  isUserSettings,
} from "./type-guards";

// =============================================================================
// Syntax Themes
// =============================================================================

export { darkSyntaxTheme, lightSyntaxTheme } from "./syntax-themes";

// =============================================================================
// AI Utils (from lib/ai/)
// =============================================================================

export type {
  ChatHandlers,
  ChatMode,
  ConvexActions,
  ModelOptions,
  PrivateChatConfig,
  SendMessageParams,
} from "./ai/chat-handlers";
export {
  createChatHandlers,
  createPrivateChatHandlers,
  createServerChatHandlers,
} from "./ai/chat-handlers";
export { usePrivateApiKeys } from "./ai/private-api-keys";
export { convertChatMessagesToCoreMessages } from "./ai/private-message-utils";
export { usePrivatePersona } from "./ai/private-personas";

// =============================================================================
// Chat Utils (from lib/chat/)
// =============================================================================

export {
  convertServerMessage,
  convertServerMessages,
  extractMessagesArray,
  findStreamingMessage,
  isMessageMetadata,
  isMessageStreaming,
} from "./chat/message-utils";

// =============================================================================
// Search Utils
// =============================================================================

export { highlightMatches } from "./search-highlight";
