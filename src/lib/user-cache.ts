import type { Doc } from "@convex/_generated/dataModel";
import type { User } from "../types";
import {
  createLocalStorageCache,
  createMultiKeyCache,
} from "./localStorage-utils";

const CACHE_VERSION = 1;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

type CachedUserData = {
  user: User | null;
  messageCount?: number;
  monthlyUsage?: {
    monthlyMessagesSent: number;
    monthlyLimit: number;
    remainingMessages: number;
    resetDate: number | null | undefined;
    needsReset: boolean;
  };
  hasUserApiKeys?: boolean;
  hasUserModels?: boolean;
};

type UserModelsByProvider = {
  id: string;
  name: string;
  models: Doc<"userModels">[];
}[];

type CachedUserModelsData = {
  userModelsByProvider: UserModelsByProvider;
  hasUserModels: boolean;
};

// Create cache instances
const userCache = createLocalStorageCache<CachedUserData>({
  key: "polly_user_cache",
  version: CACHE_VERSION,
  expiryMs: CACHE_EXPIRY,
});

const selectedModelCache = createLocalStorageCache<Doc<"userModels"> | null>({
  key: "polly_selected_model_cache",
  version: CACHE_VERSION,
  expiryMs: CACHE_EXPIRY,
});

const userModelsCache = createLocalStorageCache<CachedUserModelsData>({
  key: "polly_user_models_cache",
  version: CACHE_VERSION,
  expiryMs: CACHE_EXPIRY,
});

const multiCache = createMultiKeyCache([
  "polly_user_cache",
  "polly_selected_model_cache",
  "polly_user_models_cache",
]);

export function getCachedUser(): CachedUserData["user"] | null {
  const data = userCache.get();
  return data?.user || null;
}

export function getCachedUserData():
  | (Omit<CachedUserData, "user"> & { user: User | null })
  | null {
  return userCache.get();
}

export function setCachedUser(
  user: User | null,
  messageCount?: number,
  monthlyUsage?: CachedUserData["monthlyUsage"],
  hasUserApiKeys?: boolean
) {
  const cacheData: CachedUserData = {
    user,
    messageCount,
    monthlyUsage,
    hasUserApiKeys,
  };
  userCache.set(cacheData);
}

export function getCachedSelectedModel(): Doc<"userModels"> | null {
  return selectedModelCache.get();
}

export function setCachedSelectedModel(model: Doc<"userModels"> | null) {
  selectedModelCache.set(model);
}

export function getCachedUserModels(): {
  userModelsByProvider: UserModelsByProvider;
  hasUserModels: boolean;
} | null {
  return userModelsCache.get();
}

export function setCachedUserModels(
  userModelsByProvider: UserModelsByProvider,
  hasUserModels: boolean
) {
  const cacheData: CachedUserModelsData = {
    userModelsByProvider,
    hasUserModels,
  };
  userModelsCache.set(cacheData);
}

export function clearUserModelsCache() {
  userModelsCache.clear();
}

export function clearUserCache() {
  multiCache.clearAll();
}
