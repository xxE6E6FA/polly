const KEY_PREFIX = "polly:";

// Global version for localStorage schema changes
export const LOCAL_STORAGE_VERSION = 1;

// All cache keys used throughout the app
export const CACHE_KEYS = {
  apiKeys: "api-keys",
  userModels: "user-models",
  modelCatalog: "model-catalog",
  selectedModel: "selected-model",
  conversations: "conversations",
  sidebar: "sidebar",
  sidebarWidth: "sidebar-width",
  theme: "theme",
  userSettings: "user-settings",
  setupChecklistDismissed: "setup-checklist-dismissed",
  userData: "user-data",
  anonymousUserGraduation: "anonymous-user-graduation",
  recentModels: "recent-models",
  zenDisplayPreferences: "zen-display-preferences",
} as const;

export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

const PERSISTENT_KEYS = new Set<CacheKey>([
  CACHE_KEYS.sidebar,
  CACHE_KEYS.theme,
  CACHE_KEYS.zenDisplayPreferences,
]);

export function buildKey(key: CacheKey): string {
  return `${KEY_PREFIX}${key}/v${LOCAL_STORAGE_VERSION}`;
}

export function get<T>(key: CacheKey, fallback: T): T {
  const namespaced = buildKey(key);
  try {
    const raw = localStorage.getItem(namespaced);
    if (raw == null) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "version" in parsed) {
      const dataVersion = Number(parsed.version);
      if (
        !Number.isFinite(dataVersion) ||
        dataVersion < LOCAL_STORAGE_VERSION
      ) {
        localStorage.removeItem(namespaced);
        return fallback;
      }
      const data = (parsed as { data?: T }).data;
      if (data === undefined) {
        localStorage.removeItem(namespaced);
        return fallback;
      }
      return data;
    }
    localStorage.removeItem(namespaced);
    return fallback;
  } catch {
    return fallback;
  }
}

export function set<T>(key: CacheKey, value: T): void {
  const namespaced = buildKey(key);
  try {
    const versionedData = {
      version: LOCAL_STORAGE_VERSION,
      data: value,
    };
    const serialized = JSON.stringify(versionedData);
    localStorage.setItem(namespaced, serialized);
  } catch {
    // Ignore storage errors
  }
}

export function del(key: CacheKey): void {
  const namespaced = buildKey(key);
  try {
    localStorage.removeItem(namespaced);
  } catch {
    // Ignore storage errors
  }
}

export function clearAllPollyKeys() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      const unprefixedKey = key
        .slice(KEY_PREFIX.length)
        .split("/")[0] as CacheKey;
      if (!PERSISTENT_KEYS.has(unprefixedKey)) {
        keysToRemove.push(key);
      }
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export function clearUserData() {
  // Clear user-specific data but preserve persistent settings
  const userSpecificKeys: CacheKey[] = [
    CACHE_KEYS.apiKeys,
    CACHE_KEYS.userModels,
    CACHE_KEYS.selectedModel,
    CACHE_KEYS.conversations,
    CACHE_KEYS.userSettings,
    CACHE_KEYS.setupChecklistDismissed,
    CACHE_KEYS.userData,
    CACHE_KEYS.anonymousUserGraduation,
  ];

  userSpecificKeys.forEach(key => {
    del(key);
  });
}
