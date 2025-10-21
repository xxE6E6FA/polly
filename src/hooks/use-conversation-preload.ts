import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { preloadChatConversation } from "@/routes";
import type { ConversationId } from "@/types";

// Global cache for preloaded conversation data
const preloadedDataCache = new Map<
  ConversationId,
  {
    conversationAccessInfo: unknown;
    messages: unknown;
    lastUsedModel: unknown;
    streamingStatus: unknown;
    timestamp: number;
    isActive: boolean; // Track if conversation is currently active
  }
>();

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Hook for preloading conversation data on hover to improve navigation performance
 */
export function useConversationPreload() {
  const convex = useConvex();

  // Cache to track what we've already preloaded to avoid redundant requests
  const preloadedConversations = useMemo(() => new Set<ConversationId>(), []);

  // Debounce timer to avoid excessive preloading on rapid hover movements
  const preloadTimer = useRef<NodeJS.Timeout | null>(null);

  const preloadConversation = useCallback(
    (conversationId: ConversationId) => {
      // Don't preload if we've already done so recently
      if (preloadedConversations.has(conversationId)) {
        return;
      }

      // Don't preload if conversation is currently active - this prevents race conditions
      const existingCache = preloadedDataCache.get(conversationId);
      if (existingCache?.isActive) {
        return;
      }

      // Clear any existing timer
      if (preloadTimer.current) {
        clearTimeout(preloadTimer.current);
      }

      // Debounce the preloading to avoid excessive requests
      preloadTimer.current = setTimeout(async () => {
        // Double-check that conversation is still not active before proceeding
        const currentCache = preloadedDataCache.get(conversationId);
        if (currentCache?.isActive) {
          return;
        }

        // Mark as preloaded to avoid duplicate requests
        preloadedConversations.add(conversationId);

        // Preload the conversation page component code
        preloadChatConversation(conversationId);

        try {
          // Preload and cache all conversation data
          const [
            conversationAccessInfo,
            messages,
            lastUsedModel,
            streamingStatus,
          ] = await Promise.all([
            convex.query(api.conversations.getWithAccessInfo, {
              id: conversationId as Id<"conversations">,
            }),
            convex.query(api.messages.list, {
              conversationId,
            }),
            convex.query(api.messages.getLastUsedModel, {
              conversationId: conversationId as Id<"conversations">,
            }),
            convex.query(api.conversations.isStreaming, {
              conversationId: conversationId as Id<"conversations">,
            }),
          ]);

          // Double-check again before storing (conversation might have become active)
          const finalCache = preloadedDataCache.get(conversationId);
          if (!finalCache?.isActive) {
            // Store in local cache (not active since this is preloading)
            preloadedDataCache.set(conversationId, {
              conversationAccessInfo,
              messages,
              lastUsedModel,
              streamingStatus,
              timestamp: Date.now(),
              isActive: false,
            });
          }
        } catch (error) {
          console.warn("Failed to preload conversation data:", error);
        }
      }, 150); // 150ms debounce delay
    },
    [convex, preloadedConversations]
  );

  const clearPreloadCache = useCallback(() => {
    preloadedConversations.clear();
    preloadedDataCache.clear();
  }, [preloadedConversations]);

  const markConversationActive = useCallback(
    (conversationId: ConversationId) => {
      const cached = preloadedDataCache.get(conversationId);
      if (cached) {
        // Mark as active and update timestamp
        preloadedDataCache.set(conversationId, {
          ...cached,
          isActive: true,
          timestamp: Date.now(),
        });
      }
      // Also remove from preloaded conversations to allow fresh fetches
      preloadedConversations.delete(conversationId);
    },
    [preloadedConversations]
  );

  const clearConversationCache = useCallback(
    (conversationId: ConversationId) => {
      preloadedDataCache.delete(conversationId);
      preloadedConversations.delete(conversationId);
    },
    [preloadedConversations]
  );

  const getCachedData = useCallback((conversationId: ConversationId) => {
    const cached = preloadedDataCache.get(conversationId);
    if (!cached) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      preloadedDataCache.delete(conversationId);
      return null;
    }

    return cached;
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (preloadTimer.current) {
        clearTimeout(preloadTimer.current);
      }
    };
  }, []);

  return {
    preloadConversation,
    clearPreloadCache,
    getCachedData,
    markConversationActive,
    clearConversationCache,
  };
}
