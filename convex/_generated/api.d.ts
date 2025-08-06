/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as ai_config from "../ai/config.js";
import type * as ai_encryption from "../ai/encryption.js";
import type * as ai_error_handlers from "../ai/error_handlers.js";
import type * as ai_exa from "../ai/exa.js";
import type * as ai_messages from "../ai/messages.js";
import type * as ai_openrouter_capabilities from "../ai/openrouter_capabilities.js";
import type * as ai_pdf from "../ai/pdf.js";
import type * as ai_pdf_cache from "../ai/pdf_cache.js";
import type * as ai_pdf_status from "../ai/pdf_status.js";
import type * as ai_reasoning_detection from "../ai/reasoning_detection.js";
import type * as ai_replicate from "../ai/replicate.js";
import type * as ai_search_detection from "../ai/search_detection.js";
import type * as ai_server_citations from "../ai/server_citations.js";
import type * as ai_server_streaming from "../ai/server_streaming.js";
import type * as ai_server_utils from "../ai/server_utils.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as backgroundJobs from "../backgroundJobs.js";
import type * as chat from "../chat.js";
import type * as cleanup from "../cleanup.js";
import type * as constants from "../constants.js";
import type * as conversationExport from "../conversationExport.js";
import type * as conversationImport from "../conversationImport.js";
import type * as conversationStarters from "../conversationStarters.js";
import type * as conversationSummary from "../conversationSummary.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as fileStorage from "../fileStorage.js";
import type * as http from "../http.js";
import type * as imageModels from "../imageModels.js";
import type * as internal_ from "../internal.js";
import type * as lib_cache_utils from "../lib/cache_utils.js";
import type * as lib_conversation_utils from "../lib/conversation_utils.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_model_resolution from "../lib/model_resolution.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_process_attachments from "../lib/process_attachments.js";
import type * as lib_schemas from "../lib/schemas.js";
import type * as lib_shared_anthropic_stream from "../lib/shared/anthropic_stream.js";
import type * as lib_shared_citations from "../lib/shared/citations.js";
import type * as lib_shared_stream_utils from "../lib/shared/stream_utils.js";
import type * as lib_streaming_utils from "../lib/streaming_utils.js";
import type * as messages from "../messages.js";
import type * as migrations_seedBuiltInModels from "../migrations/seedBuiltInModels.js";
import type * as models from "../models.js";
import type * as personas from "../personas.js";
import type * as runMigration from "../runMigration.js";
import type * as sessions from "../sessions.js";
import type * as sharedConversations from "../sharedConversations.js";
import type * as titleGeneration from "../titleGeneration.js";
import type * as types from "../types.js";
import type * as userModels from "../userModels.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "ai/config": typeof ai_config;
  "ai/encryption": typeof ai_encryption;
  "ai/error_handlers": typeof ai_error_handlers;
  "ai/exa": typeof ai_exa;
  "ai/messages": typeof ai_messages;
  "ai/openrouter_capabilities": typeof ai_openrouter_capabilities;
  "ai/pdf": typeof ai_pdf;
  "ai/pdf_cache": typeof ai_pdf_cache;
  "ai/pdf_status": typeof ai_pdf_status;
  "ai/reasoning_detection": typeof ai_reasoning_detection;
  "ai/replicate": typeof ai_replicate;
  "ai/search_detection": typeof ai_search_detection;
  "ai/server_citations": typeof ai_server_citations;
  "ai/server_streaming": typeof ai_server_streaming;
  "ai/server_utils": typeof ai_server_utils;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  backgroundJobs: typeof backgroundJobs;
  chat: typeof chat;
  cleanup: typeof cleanup;
  constants: typeof constants;
  conversationExport: typeof conversationExport;
  conversationImport: typeof conversationImport;
  conversationStarters: typeof conversationStarters;
  conversationSummary: typeof conversationSummary;
  conversations: typeof conversations;
  crons: typeof crons;
  fileStorage: typeof fileStorage;
  http: typeof http;
  imageModels: typeof imageModels;
  internal: typeof internal_;
  "lib/cache_utils": typeof lib_cache_utils;
  "lib/conversation_utils": typeof lib_conversation_utils;
  "lib/logger": typeof lib_logger;
  "lib/model_resolution": typeof lib_model_resolution;
  "lib/pagination": typeof lib_pagination;
  "lib/process_attachments": typeof lib_process_attachments;
  "lib/schemas": typeof lib_schemas;
  "lib/shared/anthropic_stream": typeof lib_shared_anthropic_stream;
  "lib/shared/citations": typeof lib_shared_citations;
  "lib/shared/stream_utils": typeof lib_shared_stream_utils;
  "lib/streaming_utils": typeof lib_streaming_utils;
  messages: typeof messages;
  "migrations/seedBuiltInModels": typeof migrations_seedBuiltInModels;
  models: typeof models;
  personas: typeof personas;
  runMigration: typeof runMigration;
  sessions: typeof sessions;
  sharedConversations: typeof sharedConversations;
  titleGeneration: typeof titleGeneration;
  types: typeof types;
  userModels: typeof userModels;
  userSettings: typeof userSettings;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
