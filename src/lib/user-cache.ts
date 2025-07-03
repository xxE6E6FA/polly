import { type Doc } from "../../convex/_generated/dataModel";
import { type User } from "../types";

const USER_CACHE_KEY = "polly_user_cache";
const SELECTED_MODEL_CACHE_KEY = "polly_selected_model_cache";
const USER_MODELS_CACHE_KEY = "polly_user_models_cache";
const CACHE_VERSION = 1;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

type CachedUserData = {
  version: number;
  timestamp: number;
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

type CachedModelData = {
  version: number;
  timestamp: number;
  model: Doc<"userModels"> | null;
};

type UserModelsByProvider = {
  id: string;
  name: string;
  models: Doc<"userModels">[];
}[];

type CachedUserModelsData = {
  version: number;
  timestamp: number;
  userModelsByProvider: UserModelsByProvider;
  hasUserModels: boolean;
};

export function getCachedUser(): CachedUserData["user"] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: CachedUserData = JSON.parse(cached);

    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - data.timestamp > CACHE_EXPIRY;
    if (isExpired) {
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }

    return data.user;
  } catch (error) {
    console.error("Error reading user cache:", error);
    localStorage.removeItem(USER_CACHE_KEY);
    return null;
  }
}

export function getCachedUserData(): Omit<
  CachedUserData,
  "version" | "timestamp"
> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: CachedUserData = JSON.parse(cached);

    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - data.timestamp > CACHE_EXPIRY;
    if (isExpired) {
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }

    return {
      user: data.user,
      messageCount: data.messageCount,
      monthlyUsage: data.monthlyUsage,
      hasUserApiKeys: data.hasUserApiKeys,
      hasUserModels: data.hasUserModels,
    };
  } catch (error) {
    console.error("Error reading user cache:", error);
    localStorage.removeItem(USER_CACHE_KEY);
    return null;
  }
}

export function setCachedUser(
  user: User | null,
  messageCount?: number,
  monthlyUsage?: CachedUserData["monthlyUsage"],
  hasUserApiKeys?: boolean
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cacheData: CachedUserData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      user,
      messageCount,
      monthlyUsage,
      hasUserApiKeys,
    };

    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error setting user cache:", error);
  }
}

export function getCachedSelectedModel(): Doc<"userModels"> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = localStorage.getItem(SELECTED_MODEL_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: CachedModelData = JSON.parse(cached);

    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(SELECTED_MODEL_CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - data.timestamp > CACHE_EXPIRY;
    if (isExpired) {
      localStorage.removeItem(SELECTED_MODEL_CACHE_KEY);
      return null;
    }

    return data.model;
  } catch (error) {
    console.error("Error reading selected model cache:", error);
    localStorage.removeItem(SELECTED_MODEL_CACHE_KEY);
    return null;
  }
}

export function setCachedSelectedModel(model: Doc<"userModels"> | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cacheData: CachedModelData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      model,
    };

    localStorage.setItem(SELECTED_MODEL_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error setting selected model cache:", error);
  }
}

export function getCachedUserModels(): {
  userModelsByProvider: UserModelsByProvider;
  hasUserModels: boolean;
} | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = localStorage.getItem(USER_MODELS_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: CachedUserModelsData = JSON.parse(cached);

    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(USER_MODELS_CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - data.timestamp > CACHE_EXPIRY;
    if (isExpired) {
      localStorage.removeItem(USER_MODELS_CACHE_KEY);
      return null;
    }

    return {
      userModelsByProvider: data.userModelsByProvider,
      hasUserModels: data.hasUserModels,
    };
  } catch (error) {
    console.error("Error reading user models cache:", error);
    localStorage.removeItem(USER_MODELS_CACHE_KEY);
    return null;
  }
}

export function setCachedUserModels(
  userModelsByProvider: UserModelsByProvider,
  hasUserModels: boolean
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cacheData: CachedUserModelsData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      userModelsByProvider,
      hasUserModels,
    };

    localStorage.setItem(USER_MODELS_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error setting user models cache:", error);
  }
}

export function clearUserModelsCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(USER_MODELS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing user models cache:", error);
  }
}

export function clearUserCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(SELECTED_MODEL_CACHE_KEY);
    localStorage.removeItem(USER_MODELS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing user cache:", error);
  }
}
