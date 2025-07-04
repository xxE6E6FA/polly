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
import type * as ai_anthropic_native from "../ai/anthropic_native.js";
import type * as ai_citations from "../ai/citations.js";
import type * as ai_config from "../ai/config.js";
import type * as ai_encryption from "../ai/encryption.js";
import type * as ai_error_handlers from "../ai/error_handlers.js";
import type * as ai_errors from "../ai/errors.js";
import type * as ai_exa from "../ai/exa.js";
import type * as ai_messages from "../ai/messages.js";
import type * as ai_openrouter_capabilities from "../ai/openrouter_capabilities.js";
import type * as ai_providers from "../ai/providers.js";
import type * as ai_reasoning_detection from "../ai/reasoning_detection.js";
import type * as ai_resource_manager from "../ai/resource_manager.js";
import type * as ai_search_detection from "../ai/search_detection.js";
import type * as ai_stream_interruptor from "../ai/stream_interruptor.js";
import type * as ai_streaming from "../ai/streaming.js";
import type * as ai_utils from "../ai/utils.js";
import type * as ai from "../ai.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as backgroundJobs from "../backgroundJobs.js";
import type * as cleanup from "../cleanup.js";
import type * as constants from "../constants.js";
import type * as conversationStarters from "../conversationStarters.js";
import type * as conversationSummary from "../conversationSummary.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as examples_backgroundExportUsage from "../examples/backgroundExportUsage.js";
import type * as fileStorage from "../fileStorage.js";
import type * as http from "../http.js";
import type * as importOptimized from "../importOptimized.js";
import type * as internal_ from "../internal.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cache_utils from "../lib/cache_utils.js";
import type * as lib_conversation_utils from "../lib/conversation_utils.js";
import type * as lib_model_capabilities_config from "../lib/model_capabilities_config.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_provider_reasoning_config from "../lib/provider_reasoning_config.js";
import type * as lib_schemas from "../lib/schemas.js";
import type * as lib_shared_anthropic_stream from "../lib/shared/anthropic_stream.js";
import type * as lib_shared_citations from "../lib/shared/citations.js";
import type * as lib_shared_reasoning_config from "../lib/shared/reasoning_config.js";
import type * as lib_shared_stream_utils from "../lib/shared/stream_utils.js";
import type * as messages from "../messages.js";
import type * as models from "../models.js";
import type * as personas from "../personas.js";
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
  "ai/anthropic_native": typeof ai_anthropic_native;
  "ai/citations": typeof ai_citations;
  "ai/config": typeof ai_config;
  "ai/encryption": typeof ai_encryption;
  "ai/error_handlers": typeof ai_error_handlers;
  "ai/errors": typeof ai_errors;
  "ai/exa": typeof ai_exa;
  "ai/messages": typeof ai_messages;
  "ai/openrouter_capabilities": typeof ai_openrouter_capabilities;
  "ai/providers": typeof ai_providers;
  "ai/reasoning_detection": typeof ai_reasoning_detection;
  "ai/resource_manager": typeof ai_resource_manager;
  "ai/search_detection": typeof ai_search_detection;
  "ai/stream_interruptor": typeof ai_stream_interruptor;
  "ai/streaming": typeof ai_streaming;
  "ai/utils": typeof ai_utils;
  ai: typeof ai;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  backgroundJobs: typeof backgroundJobs;
  cleanup: typeof cleanup;
  constants: typeof constants;
  conversationStarters: typeof conversationStarters;
  conversationSummary: typeof conversationSummary;
  conversations: typeof conversations;
  crons: typeof crons;
  "examples/backgroundExportUsage": typeof examples_backgroundExportUsage;
  fileStorage: typeof fileStorage;
  http: typeof http;
  importOptimized: typeof importOptimized;
  internal: typeof internal_;
  "lib/auth": typeof lib_auth;
  "lib/cache_utils": typeof lib_cache_utils;
  "lib/conversation_utils": typeof lib_conversation_utils;
  "lib/model_capabilities_config": typeof lib_model_capabilities_config;
  "lib/pagination": typeof lib_pagination;
  "lib/provider_reasoning_config": typeof lib_provider_reasoning_config;
  "lib/schemas": typeof lib_schemas;
  "lib/shared/anthropic_stream": typeof lib_shared_anthropic_stream;
  "lib/shared/citations": typeof lib_shared_citations;
  "lib/shared/reasoning_config": typeof lib_shared_reasoning_config;
  "lib/shared/stream_utils": typeof lib_shared_stream_utils;
  messages: typeof messages;
  models: typeof models;
  personas: typeof personas;
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
