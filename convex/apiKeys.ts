import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import {
  getClientEncryptedApiKeyHandler,
  getDecryptedApiKeyHandler,
  getEncryptedApiKeyDataHandler,
  getUserApiKeysHandler,
  hasAnyApiKeyHandler,
  removeApiKeyHandler,
  storeApiKeyHandler,
  storeClientEncryptedApiKeyHandler,
  validateApiKeyHandler,
} from "./lib/api_keys/handlers";

const providerSchema = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("google"),
  v.literal("groq"),
  v.literal("openrouter"),
  v.literal("moonshot"),
  v.literal("replicate"),
  v.literal("elevenlabs")
);

// Store API key with server-side encryption (for server operations)
export const storeApiKey = mutation({
  args: {
    provider: providerSchema,
    rawKey: v.string(),
  },
  handler: storeApiKeyHandler,
});

// Store client-encrypted API key (end-to-end encryption like Whisper app)
export const storeClientEncryptedApiKey = mutation({
  args: {
    provider: providerSchema,
    encryptedKey: v.string(),
    partialKey: v.string(),
  },
  handler: storeClientEncryptedApiKeyHandler,
});

export const getUserApiKeys = query({
  args: {},
  handler: getUserApiKeysHandler,
});

export const removeApiKey = mutation({
  args: {
    provider: providerSchema,
  },
  handler: removeApiKeyHandler,
});

export const validateApiKey = mutation({
  args: {
    provider: providerSchema,
  },
  handler: validateApiKeyHandler,
});

export const hasAnyApiKey = query({
  args: {},
  handler: hasAnyApiKeyHandler,
});

// Server-side function to get decrypted API key for server operations
export const getDecryptedApiKey = action({
  args: {
    provider: providerSchema,
    modelId: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: getDecryptedApiKeyHandler,
});

export const getClientEncryptedApiKey = query({
  args: {
    provider: providerSchema,
  },
  handler: getClientEncryptedApiKeyHandler,
});

// Internal query to get server-encrypted data (for server-side decryption only)
export const getEncryptedApiKeyData = internalQuery({
  args: {
    userId: v.id("users"),
    provider: providerSchema,
  },
  handler: getEncryptedApiKeyDataHandler,
});
