// Re-export everything from the new modular structure
export * from "./conversation/types";
export * from "./conversation/message_handling";
export { buildHierarchicalContextMessages, buildContextMessages } from "./conversation/context_building";
export * from "./conversation/streaming";
export * from "./conversation/summarization";

// Legacy compatibility - if any existing code still imports directly from conversation_utils
// These imports can be removed once all references are updated to use the new modules directly