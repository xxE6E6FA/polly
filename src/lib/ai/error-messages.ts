/**
 * Common error messages used across the application
 * Centralized to ensure consistency and easy updates
 */

export const ERROR_MESSAGES = {
  // User limits
  MESSAGE_LIMIT_REACHED:
    "Message limit reached. Please sign in to continue chatting.",
  MESSAGE_LIMIT_REACHED_AUTH:
    "Monthly limit reached. Add API keys to use BYOK models...",

  // Model selection
  NO_MODEL_SELECTED:
    "No model selected. Please select a model in the model picker to send messages.",
  NO_MODEL_FOR_REGENERATE:
    "No model selected. Please select a model in the model picker to regenerate messages.",
  NO_MODEL_FOR_EDIT:
    "No model selected. Please select a model in the model picker to edit messages.",
  NO_MODEL_FOR_RETRY:
    "No model selected. Please select a model in the model picker to retry messages.",

  // API keys
  NO_API_KEYS: "No API keys configured. Please add your API keys in settings.",
  NO_API_KEY_FOR_PROVIDER: (provider: string) =>
    `No valid API key found for ${provider}`,
  API_KEY_FETCH_FAILED: (provider: string) =>
    `No API key found for ${provider}. Please add an API key in Settings.`,

  // Messages
  NO_MESSAGES_TO_SAVE: "No messages to save",
  NO_MESSAGES_DESCRIPTION: "Start a private conversation first",
  NO_USER_MESSAGE: "No user message found",
  NO_USER_MESSAGE_REGENERATE: "No user message found to regenerate from",

  // Conversation
  NO_CONVERSATION: "No conversation found",
  CONVERSATION_CREATE_FAILED: "Failed to create conversation",
  CONVERSATION_CREATE_NEW_FAILED: "Failed to create new conversation",

  // Authentication
  NOT_AUTHENTICATED: "User not authenticated",

  // Save/Export
  SAVE_SUCCESS: "Private chat saved",
  SAVE_SUCCESS_DESCRIPTION: "All messages have been saved to your chat history",
  SAVE_FAILED: "Failed to save private chat",
  EXPORT_SUCCESS: "Export successful",
  EXPORT_FAILED: "Export failed",

  // Private mode
  PRIVATE_MODE_ENABLED: "Private mode enabled",
  PRIVATE_MODE_ENABLED_DESCRIPTION:
    "Messages will not be saved to the database",
  PRIVATE_MODE_DISABLED: "Private mode disabled",
  PRIVATE_MODE_DISABLED_DESCRIPTION: "Previous private messages will be lost",

  // Generic
  SEND_FAILED: "Failed to send message",
  REGENERATE_FAILED: "Failed to regenerate message",
  EDIT_FAILED: "Failed to edit message",
  RETRY_FAILED: "Failed to retry message",
  STOP_FAILED: "Failed to stop generation",
  OPERATION_FAILED: "Operation failed",
} as const;
