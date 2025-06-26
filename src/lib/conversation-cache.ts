import { type Doc } from "../../convex/_generated/dataModel";

const CACHE_KEY = "polly_conversations_cache";
const CACHE_VERSION = 1;
const MAX_CACHED_CONVERSATIONS = 50;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

type CachedData = {
  version: number;
  timestamp: number;
  conversations: Doc<"conversations">[];
};

export function getCachedConversations(): Doc<"conversations">[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: CachedData = JSON.parse(cached);

    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - data.timestamp > CACHE_EXPIRY;
    if (isExpired) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data.conversations;
  } catch (error) {
    console.error("Error reading conversation cache:", error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function setCachedConversations(conversations: Doc<"conversations">[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const sortedConversations = [...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CACHED_CONVERSATIONS);

    const cacheData: CachedData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      conversations: sortedConversations,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error setting conversation cache:", error);
  }
}

export function updateCachedConversation(
  updatedConversation: Doc<"conversations">
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cached = getCachedConversations();
    if (!cached) {
      return;
    }

    const updatedConversations = cached.map(conv =>
      conv._id === updatedConversation._id ? updatedConversation : conv
    );

    // If the conversation wasn't in the cache, add it
    if (
      !updatedConversations.find(conv => conv._id === updatedConversation._id)
    ) {
      updatedConversations.unshift(updatedConversation);
    }

    // Re-sort and trim
    const sortedConversations = updatedConversations
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CACHED_CONVERSATIONS);

    const cacheData: CachedData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      conversations: sortedConversations,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error updating conversation cache:", error);
  }
}

export function removeCachedConversation(conversationId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cached = getCachedConversations();
    if (!cached) {
      return;
    }

    // Filter out the deleted conversation
    const filteredConversations = cached.filter(
      conv => conv._id !== conversationId
    );

    // If nothing changed, return early
    if (filteredConversations.length === cached.length) {
      return;
    }

    const cacheData: CachedData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      conversations: filteredConversations,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error removing conversation from cache:", error);
  }
}

export function clearConversationCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error("Error clearing conversation cache:", error);
  }
}
