/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_chat_helpers from "../ai/chat_helpers.js";
import type * as ai_chat_stream from "../ai/chat_stream.js";
import type * as ai_config from "../ai/config.js";
import type * as ai_elevenlabs from "../ai/elevenlabs.js";
import type * as ai_elevenlabs_stream from "../ai/elevenlabs_stream.js";
import type * as ai_elevenlabs_utils from "../ai/elevenlabs_utils.js";
import type * as ai_encryption from "../ai/encryption.js";
import type * as ai_error_handlers from "../ai/error_handlers.js";
import type * as ai_exa from "../ai/exa.js";
import type * as ai_message_converter from "../ai/message_converter.js";
import type * as ai_message_converter_core from "../ai/message_converter/core.js";
import type * as ai_message_converter_image from "../ai/message_converter/image.js";
import type * as ai_message_converter_index from "../ai/message_converter/index.js";
import type * as ai_message_converter_pdf from "../ai/message_converter/pdf.js";
import type * as ai_message_converter_text from "../ai/message_converter/text.js";
import type * as ai_messages from "../ai/messages.js";
import type * as ai_pdf from "../ai/pdf.js";
import type * as ai_pdf_cache from "../ai/pdf_cache.js";
import type * as ai_pdf_status from "../ai/pdf_status.js";
import type * as ai_replicate from "../ai/replicate.js";
import type * as ai_replicate_generate from "../ai/replicate/generate.js";
import type * as ai_replicate_polling from "../ai/replicate/polling.js";
import type * as ai_replicate_webhook from "../ai/replicate/webhook.js";
import type * as ai_replicate_helpers from "../ai/replicate_helpers.js";
import type * as ai_search_detection from "../ai/search_detection.js";
import type * as ai_server_citations from "../ai/server_citations.js";
import type * as ai_server_streaming from "../ai/server_streaming.js";
import type * as ai_server_utils from "../ai/server_utils.js";
import type * as ai_streaming_buffer from "../ai/streaming/buffer.js";
import type * as ai_streaming_state from "../ai/streaming/state.js";
import type * as ai_streaming_core from "../ai/streaming_core.js";
import type * as ai_text_generation from "../ai/text_generation.js";
import type * as ai_tools_conversation_search from "../ai/tools/conversation_search.js";
import type * as ai_tools_image_generation from "../ai/tools/image_generation.js";
import type * as ai_tools_index from "../ai/tools/index.js";
import type * as ai_tools_web_search from "../ai/tools/web_search.js";
import type * as ai_url_processing from "../ai/url_processing.js";
import type * as apiKeys from "../apiKeys.js";
import type * as backgroundJobs from "../backgroundJobs.js";
import type * as branches from "../branches.js";
import type * as capabilities from "../capabilities.js";
import type * as chat from "../chat.js";
import type * as cleanup from "../cleanup.js";
import type * as clerk from "../clerk.js";
import type * as constants from "../constants.js";
import type * as conversationExport from "../conversationExport.js";
import type * as conversationImport from "../conversationImport.js";
import type * as conversationStarters from "../conversationStarters.js";
import type * as conversationSummary from "../conversationSummary.js";
import type * as conversation_search from "../conversation_search.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as fileStorage from "../fileStorage.js";
import type * as http from "../http.js";
import type * as imageModels from "../imageModels.js";
import type * as internal_ from "../internal.js";
import type * as lib_anonymous_auth from "../lib/anonymous_auth.js";
import type * as lib_api_keys_handlers from "../lib/api_keys/handlers.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_background_jobs_helpers from "../lib/background_jobs/helpers.js";
import type * as lib_background_jobs_mutation_handlers from "../lib/background_jobs/mutation_handlers.js";
import type * as lib_background_jobs_query_handlers from "../lib/background_jobs/query_handlers.js";
import type * as lib_branch_mutation_handlers from "../lib/branch/mutation_handlers.js";
import type * as lib_branch_query_handlers from "../lib/branch/query_handlers.js";
import type * as lib_capability_resolver from "../lib/capability_resolver.js";
import type * as lib_clerk_webhook from "../lib/clerk_webhook.js";
import type * as lib_conversation_action_handlers from "../lib/conversation/action_handlers.js";
import type * as lib_conversation_assistant_retry from "../lib/conversation/assistant_retry.js";
import type * as lib_conversation_background_operations from "../lib/conversation/background_operations.js";
import type * as lib_conversation_branching_handlers from "../lib/conversation/branching_handlers.js";
import type * as lib_conversation_context_building from "../lib/conversation/context_building.js";
import type * as lib_conversation_create_branching_handler from "../lib/conversation/create_branching_handler.js";
import type * as lib_conversation_create_handlers from "../lib/conversation/create_handlers.js";
import type * as lib_conversation_create_message_handler from "../lib/conversation/create_message_handler.js";
import type * as lib_conversation_edit_resend_handler from "../lib/conversation/edit_resend_handler.js";
import type * as lib_conversation_helpers from "../lib/conversation/helpers.js";
import type * as lib_conversation_internal_handlers from "../lib/conversation/internal_handlers.js";
import type * as lib_conversation_message_handling from "../lib/conversation/message_handling.js";
import type * as lib_conversation_modify_handlers from "../lib/conversation/modify_handlers.js";
import type * as lib_conversation_mutation_handlers from "../lib/conversation/mutation_handlers.js";
import type * as lib_conversation_query_handlers from "../lib/conversation/query_handlers.js";
import type * as lib_conversation_retry_handlers from "../lib/conversation/retry_handlers.js";
import type * as lib_conversation_save_private_handler from "../lib/conversation/save_private_handler.js";
import type * as lib_conversation_send_handlers from "../lib/conversation/send_handlers.js";
import type * as lib_conversation_start_conversation_handler from "../lib/conversation/start_conversation_handler.js";
import type * as lib_conversation_streaming from "../lib/conversation/streaming.js";
import type * as lib_conversation_types from "../lib/conversation/types.js";
import type * as lib_conversation_user_retry from "../lib/conversation/user_retry.js";
import type * as lib_conversation_export_handlers from "../lib/conversation_export/handlers.js";
import type * as lib_conversation_export_helpers from "../lib/conversation_export/helpers.js";
import type * as lib_conversation_utils from "../lib/conversation_utils.js";
import type * as lib_cors from "../lib/cors.js";
import type * as lib_file_storage_attachment_queries from "../lib/file_storage/attachment_queries.js";
import type * as lib_file_storage_file_queries from "../lib/file_storage/file_queries.js";
import type * as lib_file_storage_helpers from "../lib/file_storage/helpers.js";
import type * as lib_file_storage_mutation_handlers from "../lib/file_storage/mutation_handlers.js";
import type * as lib_file_storage_user_file_queries from "../lib/file_storage/user_file_queries.js";
import type * as lib_image_models_handlers from "../lib/image_models/handlers.js";
import type * as lib_image_models_model_management_actions from "../lib/image_models/model_management_actions.js";
import type * as lib_image_models_replicate_actions from "../lib/image_models/replicate_actions.js";
import type * as lib_image_models_replicate_utils from "../lib/image_models/replicate_utils.js";
import type * as lib_image_models_schema_analysis from "../lib/image_models/schema_analysis.js";
import type * as lib_image_models_types from "../lib/image_models/types.js";
import type * as lib_memory_embedding from "../lib/memory/embedding.js";
import type * as lib_memory_extraction from "../lib/memory/extraction.js";
import type * as lib_message_action_handlers from "../lib/message/action_handlers.js";
import type * as lib_message_attachment_handlers from "../lib/message/attachment_handlers.js";
import type * as lib_message_branch_delete_handlers from "../lib/message/branch_delete_handlers.js";
import type * as lib_message_create_update_handlers from "../lib/message/create_update_handlers.js";
import type * as lib_message_helpers from "../lib/message/helpers.js";
import type * as lib_message_internal_handlers from "../lib/message/internal_handlers.js";
import type * as lib_message_mutation_handlers from "../lib/message/mutation_handlers.js";
import type * as lib_message_query_handlers from "../lib/message/query_handlers.js";
import type * as lib_message_query_internal_handlers from "../lib/message/query_internal_handlers.js";
import type * as lib_message_reasoning_tool_handlers from "../lib/message/reasoning_tool_handlers.js";
import type * as lib_message_status_handlers from "../lib/message/status_handlers.js";
import type * as lib_message_streaming_handlers from "../lib/message/streaming_handlers.js";
import type * as lib_model_fetchers from "../lib/model_fetchers.js";
import type * as lib_model_resolution from "../lib/model_resolution.js";
import type * as lib_models_dev_mapping from "../lib/models_dev_mapping.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_persona_helpers from "../lib/persona/helpers.js";
import type * as lib_persona_mutation_handlers from "../lib/persona/mutation_handlers.js";
import type * as lib_persona_query_handlers from "../lib/persona/query_handlers.js";
import type * as lib_process_attachments from "../lib/process_attachments.js";
import type * as lib_scheduler from "../lib/scheduler.js";
import type * as lib_schemas from "../lib/schemas.js";
import type * as lib_shared_citations from "../lib/shared/citations.js";
import type * as lib_shared_stream_utils from "../lib/shared/stream_utils.js";
import type * as lib_shared_utils from "../lib/shared_utils.js";
import type * as lib_streaming_utils from "../lib/streaming_utils.js";
import type * as lib_user_mutation_handlers from "../lib/user/mutation_handlers.js";
import type * as lib_user_query_handlers from "../lib/user/query_handlers.js";
import type * as lib_user_models_mutation_handlers from "../lib/user_models/mutation_handlers.js";
import type * as lib_user_models_query_handlers from "../lib/user_models/query_handlers.js";
import type * as memory from "../memory.js";
import type * as memory_actions from "../memory_actions.js";
import type * as messages from "../messages.js";
import type * as migrations_addUserIdToMessages from "../migrations/addUserIdToMessages.js";
import type * as migrations_populateUserFiles from "../migrations/populateUserFiles.js";
import type * as migrations_seedBuiltInModels from "../migrations/seedBuiltInModels.js";
import type * as migrations_updateStoppedMessages from "../migrations/updateStoppedMessages.js";
import type * as migrations_updateUserFilesMetadata from "../migrations/updateUserFilesMetadata.js";
import type * as models_dev_sync from "../models_dev_sync.js";
import type * as personas from "../personas.js";
import type * as profiles from "../profiles.js";
import type * as sharedConversations from "../sharedConversations.js";
import type * as streaming_actions from "../streaming_actions.js";
import type * as titleGeneration from "../titleGeneration.js";
import type * as types from "../types.js";
import type * as userModels from "../userModels.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/chat_helpers": typeof ai_chat_helpers;
  "ai/chat_stream": typeof ai_chat_stream;
  "ai/config": typeof ai_config;
  "ai/elevenlabs": typeof ai_elevenlabs;
  "ai/elevenlabs_stream": typeof ai_elevenlabs_stream;
  "ai/elevenlabs_utils": typeof ai_elevenlabs_utils;
  "ai/encryption": typeof ai_encryption;
  "ai/error_handlers": typeof ai_error_handlers;
  "ai/exa": typeof ai_exa;
  "ai/message_converter": typeof ai_message_converter;
  "ai/message_converter/core": typeof ai_message_converter_core;
  "ai/message_converter/image": typeof ai_message_converter_image;
  "ai/message_converter/index": typeof ai_message_converter_index;
  "ai/message_converter/pdf": typeof ai_message_converter_pdf;
  "ai/message_converter/text": typeof ai_message_converter_text;
  "ai/messages": typeof ai_messages;
  "ai/pdf": typeof ai_pdf;
  "ai/pdf_cache": typeof ai_pdf_cache;
  "ai/pdf_status": typeof ai_pdf_status;
  "ai/replicate": typeof ai_replicate;
  "ai/replicate/generate": typeof ai_replicate_generate;
  "ai/replicate/polling": typeof ai_replicate_polling;
  "ai/replicate/webhook": typeof ai_replicate_webhook;
  "ai/replicate_helpers": typeof ai_replicate_helpers;
  "ai/search_detection": typeof ai_search_detection;
  "ai/server_citations": typeof ai_server_citations;
  "ai/server_streaming": typeof ai_server_streaming;
  "ai/server_utils": typeof ai_server_utils;
  "ai/streaming/buffer": typeof ai_streaming_buffer;
  "ai/streaming/state": typeof ai_streaming_state;
  "ai/streaming_core": typeof ai_streaming_core;
  "ai/text_generation": typeof ai_text_generation;
  "ai/tools/conversation_search": typeof ai_tools_conversation_search;
  "ai/tools/image_generation": typeof ai_tools_image_generation;
  "ai/tools/index": typeof ai_tools_index;
  "ai/tools/web_search": typeof ai_tools_web_search;
  "ai/url_processing": typeof ai_url_processing;
  apiKeys: typeof apiKeys;
  backgroundJobs: typeof backgroundJobs;
  branches: typeof branches;
  capabilities: typeof capabilities;
  chat: typeof chat;
  cleanup: typeof cleanup;
  clerk: typeof clerk;
  constants: typeof constants;
  conversationExport: typeof conversationExport;
  conversationImport: typeof conversationImport;
  conversationStarters: typeof conversationStarters;
  conversationSummary: typeof conversationSummary;
  conversation_search: typeof conversation_search;
  conversations: typeof conversations;
  crons: typeof crons;
  fileStorage: typeof fileStorage;
  http: typeof http;
  imageModels: typeof imageModels;
  internal: typeof internal_;
  "lib/anonymous_auth": typeof lib_anonymous_auth;
  "lib/api_keys/handlers": typeof lib_api_keys_handlers;
  "lib/auth": typeof lib_auth;
  "lib/background_jobs/helpers": typeof lib_background_jobs_helpers;
  "lib/background_jobs/mutation_handlers": typeof lib_background_jobs_mutation_handlers;
  "lib/background_jobs/query_handlers": typeof lib_background_jobs_query_handlers;
  "lib/branch/mutation_handlers": typeof lib_branch_mutation_handlers;
  "lib/branch/query_handlers": typeof lib_branch_query_handlers;
  "lib/capability_resolver": typeof lib_capability_resolver;
  "lib/clerk_webhook": typeof lib_clerk_webhook;
  "lib/conversation/action_handlers": typeof lib_conversation_action_handlers;
  "lib/conversation/assistant_retry": typeof lib_conversation_assistant_retry;
  "lib/conversation/background_operations": typeof lib_conversation_background_operations;
  "lib/conversation/branching_handlers": typeof lib_conversation_branching_handlers;
  "lib/conversation/context_building": typeof lib_conversation_context_building;
  "lib/conversation/create_branching_handler": typeof lib_conversation_create_branching_handler;
  "lib/conversation/create_handlers": typeof lib_conversation_create_handlers;
  "lib/conversation/create_message_handler": typeof lib_conversation_create_message_handler;
  "lib/conversation/edit_resend_handler": typeof lib_conversation_edit_resend_handler;
  "lib/conversation/helpers": typeof lib_conversation_helpers;
  "lib/conversation/internal_handlers": typeof lib_conversation_internal_handlers;
  "lib/conversation/message_handling": typeof lib_conversation_message_handling;
  "lib/conversation/modify_handlers": typeof lib_conversation_modify_handlers;
  "lib/conversation/mutation_handlers": typeof lib_conversation_mutation_handlers;
  "lib/conversation/query_handlers": typeof lib_conversation_query_handlers;
  "lib/conversation/retry_handlers": typeof lib_conversation_retry_handlers;
  "lib/conversation/save_private_handler": typeof lib_conversation_save_private_handler;
  "lib/conversation/send_handlers": typeof lib_conversation_send_handlers;
  "lib/conversation/start_conversation_handler": typeof lib_conversation_start_conversation_handler;
  "lib/conversation/streaming": typeof lib_conversation_streaming;
  "lib/conversation/types": typeof lib_conversation_types;
  "lib/conversation/user_retry": typeof lib_conversation_user_retry;
  "lib/conversation_export/handlers": typeof lib_conversation_export_handlers;
  "lib/conversation_export/helpers": typeof lib_conversation_export_helpers;
  "lib/conversation_utils": typeof lib_conversation_utils;
  "lib/cors": typeof lib_cors;
  "lib/file_storage/attachment_queries": typeof lib_file_storage_attachment_queries;
  "lib/file_storage/file_queries": typeof lib_file_storage_file_queries;
  "lib/file_storage/helpers": typeof lib_file_storage_helpers;
  "lib/file_storage/mutation_handlers": typeof lib_file_storage_mutation_handlers;
  "lib/file_storage/user_file_queries": typeof lib_file_storage_user_file_queries;
  "lib/image_models/handlers": typeof lib_image_models_handlers;
  "lib/image_models/model_management_actions": typeof lib_image_models_model_management_actions;
  "lib/image_models/replicate_actions": typeof lib_image_models_replicate_actions;
  "lib/image_models/replicate_utils": typeof lib_image_models_replicate_utils;
  "lib/image_models/schema_analysis": typeof lib_image_models_schema_analysis;
  "lib/image_models/types": typeof lib_image_models_types;
  "lib/memory/embedding": typeof lib_memory_embedding;
  "lib/memory/extraction": typeof lib_memory_extraction;
  "lib/message/action_handlers": typeof lib_message_action_handlers;
  "lib/message/attachment_handlers": typeof lib_message_attachment_handlers;
  "lib/message/branch_delete_handlers": typeof lib_message_branch_delete_handlers;
  "lib/message/create_update_handlers": typeof lib_message_create_update_handlers;
  "lib/message/helpers": typeof lib_message_helpers;
  "lib/message/internal_handlers": typeof lib_message_internal_handlers;
  "lib/message/mutation_handlers": typeof lib_message_mutation_handlers;
  "lib/message/query_handlers": typeof lib_message_query_handlers;
  "lib/message/query_internal_handlers": typeof lib_message_query_internal_handlers;
  "lib/message/reasoning_tool_handlers": typeof lib_message_reasoning_tool_handlers;
  "lib/message/status_handlers": typeof lib_message_status_handlers;
  "lib/message/streaming_handlers": typeof lib_message_streaming_handlers;
  "lib/model_fetchers": typeof lib_model_fetchers;
  "lib/model_resolution": typeof lib_model_resolution;
  "lib/models_dev_mapping": typeof lib_models_dev_mapping;
  "lib/pagination": typeof lib_pagination;
  "lib/persona/helpers": typeof lib_persona_helpers;
  "lib/persona/mutation_handlers": typeof lib_persona_mutation_handlers;
  "lib/persona/query_handlers": typeof lib_persona_query_handlers;
  "lib/process_attachments": typeof lib_process_attachments;
  "lib/scheduler": typeof lib_scheduler;
  "lib/schemas": typeof lib_schemas;
  "lib/shared/citations": typeof lib_shared_citations;
  "lib/shared/stream_utils": typeof lib_shared_stream_utils;
  "lib/shared_utils": typeof lib_shared_utils;
  "lib/streaming_utils": typeof lib_streaming_utils;
  "lib/user/mutation_handlers": typeof lib_user_mutation_handlers;
  "lib/user/query_handlers": typeof lib_user_query_handlers;
  "lib/user_models/mutation_handlers": typeof lib_user_models_mutation_handlers;
  "lib/user_models/query_handlers": typeof lib_user_models_query_handlers;
  memory: typeof memory;
  memory_actions: typeof memory_actions;
  messages: typeof messages;
  "migrations/addUserIdToMessages": typeof migrations_addUserIdToMessages;
  "migrations/populateUserFiles": typeof migrations_populateUserFiles;
  "migrations/seedBuiltInModels": typeof migrations_seedBuiltInModels;
  "migrations/updateStoppedMessages": typeof migrations_updateStoppedMessages;
  "migrations/updateUserFilesMetadata": typeof migrations_updateUserFilesMetadata;
  models_dev_sync: typeof models_dev_sync;
  personas: typeof personas;
  profiles: typeof profiles;
  sharedConversations: typeof sharedConversations;
  streaming_actions: typeof streaming_actions;
  titleGeneration: typeof titleGeneration;
  types: typeof types;
  userModels: typeof userModels;
  userSettings: typeof userSettings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
