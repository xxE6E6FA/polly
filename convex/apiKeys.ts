import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

// Provider type definition
type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "replicate"
  | "elevenlabs";

// Shared handler for user authentication
async function handleGetAuthenticatedUser(
  ctx: MutationCtx | QueryCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }
  return userId;
}

// Shared handler for getting user API key record
async function handleGetUserApiKey(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  provider: ProviderType
): Promise<Doc<"userApiKeys"> | null> {
  return await ctx.db
    .query("userApiKeys")
    .withIndex("by_user_provider", q =>
      q.eq("userId", userId).eq("provider", provider)
    )
    .unique();
}

// Shared handler for upserting API key data
async function handleUpsertApiKey(
  ctx: MutationCtx,
  userId: Id<"users">,
  provider: ProviderType,
  updates: Partial<Doc<"userApiKeys">> & { partialKey?: string }
): Promise<void> {
  const existing = await handleGetUserApiKey(ctx, userId, provider);

  if (existing) {
    await ctx.db.patch(existing._id, updates);
  } else {
    await ctx.db.insert("userApiKeys", {
      userId,
      provider,
      isValid: false,
      createdAt: Date.now(),
      partialKey: updates.partialKey || "",
      ...updates,
    });
  }
}

// Server-side encryption for operations that need server access
const ALGORITHM = { name: "AES-GCM", length: 256 };

async function getServerEncryptionKey(): Promise<CryptoKey> {
  const encryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!encryptionSecret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET environment variable is required"
    );
  }

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(encryptionSecret);
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial);

  return await crypto.subtle.importKey("raw", hash, ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function serverEncryptApiKey(rawKey: string): Promise<{
  encryptedKey: number[];
  initializationVector: number[];
}> {
  const key = await getServerEncryptionKey();
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    key,
    new TextEncoder().encode(rawKey)
  );

  return {
    encryptedKey: [...new Uint8Array(encrypted)],
    initializationVector: [...initializationVector],
  };
}

async function serverDecryptApiKey(
  encryptedKey: number[],
  initializationVector: number[]
): Promise<string> {
  const key = await getServerEncryptionKey();

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(initializationVector) },
    key,
    new Uint8Array(encryptedKey)
  );

  return new TextDecoder().decode(decrypted);
}

function createPartialKey(key: string): string {
  if (!key) {
    return "";
  }
  if (key.length <= 8) {
    return "•".repeat(key.length);
  }
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

function validateApiKeyFormat(provider: string, key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  switch (provider) {
    case "openai":
      return key.startsWith("sk-") && key.length > 20;
    case "anthropic":
      return key.startsWith("sk-ant-") && key.length > 20;
    case "google":
      return key.length > 20;
    case "groq":
      return key.length > 20; // Groq keys vary; AI SDK uses Authorization: Bearer
    case "openrouter":
      return key.startsWith("sk-or-") && key.length > 20;
    case "replicate":
      return key.startsWith("r8_") && key.length > 20;
    case "elevenlabs":
      return key.length > 20;
    default:
      return false;
  }
}

// Store API key with server-side encryption (for server operations)
export const storeApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
    rawKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await handleGetAuthenticatedUser(ctx);

    if (!validateApiKeyFormat(args.provider, args.rawKey)) {
      throw new Error(`Invalid API key format for ${args.provider}`);
    }

    const { encryptedKey, initializationVector } = await serverEncryptApiKey(
      args.rawKey
    );
    const partialKey = createPartialKey(args.rawKey);

    await handleUpsertApiKey(ctx, userId, args.provider, {
      encryptedKey,
      initializationVector,
      partialKey,
      isValid: false,
      lastValidated: undefined,
    });
  },
});

// Store client-encrypted API key (end-to-end encryption like Whisper app)
export const storeClientEncryptedApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
    encryptedKey: v.string(), // Client-encrypted using CryptoJS or Web Crypto API
    partialKey: v.string(), // For display purposes
  },
  handler: async (ctx, args) => {
    const userId = await handleGetAuthenticatedUser(ctx);

    await handleUpsertApiKey(ctx, userId, args.provider, {
      clientEncryptedKey: args.encryptedKey,
      partialKey: args.partialKey,
      isValid: false,
      lastValidated: undefined,
    });
  },
});

export const getUserApiKeys = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    const apiKeys = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", q => q.eq("userId", userId))
      .take(20); // Reasonable limit for user API keys

    // Return display info without exposing any encrypted data
    return apiKeys.map(key => ({
      provider: key.provider,
      isValid: key.isValid,
      hasKey: Boolean(key.encryptedKey || key.clientEncryptedKey),
      partialKey: key.partialKey,
      createdAt: key.createdAt,
      encryptionType: key.encryptedKey ? "server" : "client", // Indicate encryption type
    }));
  },
});

export const removeApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await handleGetAuthenticatedUser(ctx);
    const existing = await handleGetUserApiKey(ctx, userId, args.provider);

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const validateApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await handleGetAuthenticatedUser(ctx);
    const apiKeyRecord = await handleGetUserApiKey(ctx, userId, args.provider);

    if (!apiKeyRecord) {
      throw new Error(`No API key found for ${args.provider}`);
    }

    // For now, just mark as valid since we don't have a validation endpoint
    // In a real app, you'd call the provider's API to validate the key
    await ctx.db.patch(apiKeyRecord._id, {
      isValid: true,
      lastValidated: Date.now(),
    });

    return { success: true };
  },
});

export const hasAnyApiKey = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      // For anonymous users, check if any environment API keys are available
      return hasEnvironmentApiKeys();
    }

    const apiKeys = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", q => q.eq("userId", userId))
      .collect();

    // If user has stored API keys, return true
    if (apiKeys.length > 0) {
      return true;
    }

    // If no stored API keys, fall back to checking environment variables
    return hasEnvironmentApiKeys();
  },
});

// Helper function to check if any environment API keys are available
function hasEnvironmentApiKeys(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY
  );
}

// Server-side function to get decrypted API key for server operations
export const getDecryptedApiKey = action({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
    modelId: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")), // For getting user ID from conversation
  },
  handler: async (ctx, args): Promise<string | null> => {
    // Get user ID from conversation if available, otherwise use auth context
    let userId: Id<"users"> | null = null;

    userId = await getAuthUserId(ctx);

    // If no user from auth context, try to get from conversation (works for background jobs)
    if (!userId && args.conversationId) {
      try {
        const conversation = await ctx.runQuery(
          internal.conversations.internalGet,
          {
            id: args.conversationId,
          }
        );
        userId = conversation?.userId || null;
      } catch (error) {
        console.warn("Failed to get user from conversation", error);
      }
    }

    if (!userId) {
      // User ID not found - will fallback to environment variables
      return null;
    }

    const apiKeyRecord = await ctx.runQuery(
      internal.apiKeys.getEncryptedApiKeyData,
      {
        userId,
        provider: args.provider,
      }
    );

    if (!(apiKeyRecord?.encryptedKey && apiKeyRecord.initializationVector)) {
      // No valid encrypted key found - will fallback to environment variables
      return null;
    }

    try {
      const decryptedKey = await serverDecryptApiKey(
        apiKeyRecord.encryptedKey,
        apiKeyRecord.initializationVector
      );
      return decryptedKey;
    } catch (error) {
      console.warn("Failed to decrypt API key", error);
      return null;
    }
  },
});

export const getClientEncryptedApiKey = query({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return null;
    }

    const apiKey = await handleGetUserApiKey(ctx, userId, args.provider);

    if (!apiKey?.clientEncryptedKey) {
      return null;
    }

    return {
      encryptedKey: apiKey.clientEncryptedKey,
      initializationVector: apiKey.initializationVector ?? [],
    };
  },
});

// Internal query to get server-encrypted data (for server-side decryption only)
export const getEncryptedApiKeyData = internalQuery({
  args: {
    userId: v.id("users"),
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google"),
      v.literal("groq"),
      v.literal("openrouter"),
      v.literal("replicate"),
      v.literal("elevenlabs")
    ),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.db
      .query("userApiKeys")
      .withIndex("by_user_provider", q =>
        q
          .eq("userId", args.userId)
          .eq(
            "provider",
            args.provider as
              | "openai"
              | "anthropic"
              | "google"
              | "openrouter"
              | "replicate"
              | "elevenlabs"
          )
      )
      .unique();

    if (!apiKey) {
      return null;
    }

    const result = {
      encryptedKey: apiKey.encryptedKey,
      initializationVector: apiKey.initializationVector,
    };

    return result;
  },
});
