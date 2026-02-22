import type { Doc } from "@convex/_generated/dataModel";
import { CACHE_KEYS, LOCAL_STORAGE_VERSION } from "@/lib/local-storage";

export type ConversationsCacheStore = Record<string, Doc<"conversations">[]>;

const KEY_PREFIX = "polly:";
const STORAGE_KEY = `${KEY_PREFIX}${CACHE_KEYS?.conversations ?? "conversations"}/v${
  typeof LOCAL_STORAGE_VERSION === "number" ? LOCAL_STORAGE_VERSION : 1
}`;

function readStore(): ConversationsCacheStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {} as ConversationsCacheStore;
    }
    const parsed = JSON.parse(raw) as { version?: number; data?: unknown };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (typeof parsed.version === "number" &&
        typeof LOCAL_STORAGE_VERSION === "number" &&
        parsed.version < LOCAL_STORAGE_VERSION)
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return {} as ConversationsCacheStore;
    }
    const data = parsed.data as ConversationsCacheStore | undefined;
    if (!data || Array.isArray(data)) {
      // Legacy format or unexpected shape – drop value
      localStorage.removeItem(STORAGE_KEY);
      return {} as ConversationsCacheStore;
    }
    return data;
  } catch {
    return {} as ConversationsCacheStore;
  }
}

function writeStore(store: ConversationsCacheStore): void {
  try {
    const payload = {
      version:
        typeof LOCAL_STORAGE_VERSION === "number" ? LOCAL_STORAGE_VERSION : 1,
      data: store,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

function cacheKey(userId: string, profileId?: string): string {
  return profileId ? `${userId}:${profileId}` : userId;
}

export function getCachedConversations(
  userId: string | undefined,
  profileId?: string
): Doc<"conversations">[] {
  if (!userId) {
    return [];
  }
  const store = readStore();
  return store[cacheKey(userId, profileId)] ?? [];
}

export function setCachedConversations(
  userId: string,
  conversations: Doc<"conversations">[],
  profileId?: string
): void {
  const store = readStore();
  const key = cacheKey(userId, profileId);
  const next: ConversationsCacheStore = { ...store, [key]: conversations };
  writeStore(next);
}

export function clearCachedConversations(
  userId: string | undefined,
  profileId?: string
): void {
  if (!userId) {
    return;
  }
  const key = cacheKey(userId, profileId);
  const store = readStore();
  if (!(key in store)) {
    return;
  }
  const { [key]: _removed, ...rest } = store;
  if (Object.keys(rest).length === 0) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    return;
  }
  writeStore(rest as ConversationsCacheStore);
}
