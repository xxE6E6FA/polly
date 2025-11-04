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

export function getCachedConversations(
  userId: string | undefined
): Doc<"conversations">[] {
  if (!userId) {
    return [];
  }
  const store = readStore();
  return store[userId] ?? [];
}

export function setCachedConversations(
  userId: string,
  conversations: Doc<"conversations">[]
): void {
  const store = readStore();
  const next: ConversationsCacheStore = { ...store, [userId]: conversations };
  writeStore(next);
}

export function clearCachedConversations(userId: string | undefined): void {
  if (!userId) {
    return;
  }
  const store = readStore();
  if (!(userId in store)) {
    return;
  }
  const { [userId]: _removed, ...rest } = store;
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
