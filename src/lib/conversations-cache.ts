import type { Doc } from "@convex/_generated/dataModel";
import { CACHE_KEYS, del, get, set } from "@/lib/local-storage";

export type ConversationsCacheStore = Record<string, Doc<"conversations">[]>;

function normalizeStore(value: unknown): ConversationsCacheStore {
  if (!value) {
    return {} as ConversationsCacheStore;
  }

  if (Array.isArray(value)) {
    // Legacy format – drop to avoid leaking across users
    return {} as ConversationsCacheStore;
  }

  return value as ConversationsCacheStore;
}

export function getCachedConversations(
  userId: string | undefined
): Doc<"conversations">[] {
  if (!userId) {
    return [];
  }

  const raw = get(CACHE_KEYS.conversations, {} as ConversationsCacheStore);
  const store = normalizeStore(raw);
  return store[userId] ?? [];
}

export function setCachedConversations(
  userId: string,
  conversations: Doc<"conversations">[]
): void {
  const raw = get(CACHE_KEYS.conversations, {} as ConversationsCacheStore);
  const store = normalizeStore(raw);
  const next: ConversationsCacheStore = { ...store, [userId]: conversations };
  set(CACHE_KEYS.conversations, next);
}

export function clearCachedConversations(userId: string | undefined): void {
  if (!userId) {
    return;
  }
  const raw = get(CACHE_KEYS.conversations, {} as ConversationsCacheStore);
  const store = normalizeStore(raw);
  if (!(userId in store)) {
    return;
  }
  const { [userId]: _removed, ...rest } = store;
  if (Object.keys(rest).length === 0) {
    del(CACHE_KEYS.conversations);
    return;
  }
  set(CACHE_KEYS.conversations, rest);
}
