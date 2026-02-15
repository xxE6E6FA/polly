/**
 * Unified Message Converter
 *
 * Single source of truth for converting stored messages/attachments to AI SDK format.
 * Handles all legacy formats for backward compatibility.
 *
 * Entry points:
 * - convertAttachmentToAISDK() - Single attachment conversion
 * - convertStoredMessageToAISDK() - Full message with attachments
 * - convertStoredMessagesToAISDK() - Batch conversion
 */

// Core types and functions
export {
  convertAttachmentToAISDK,
  convertLegacyPartToAISDK,
  convertStoredMessageToAISDK,
  convertStoredMessagesToAISDK,
  fetchStorageWithRetry,
  resetRetryConfig,
  setRetryConfig,
  type AISDKPart,
  type ConversionOptions,
  type LegacyMessagePart,
  type StoredAttachment,
} from "./core";
