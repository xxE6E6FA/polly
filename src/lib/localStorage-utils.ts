export interface CacheConfig<T> {
  key: string;
  version: number;
  expiryMs: number;
  transform?: {
    serialize?: (data: T) => unknown;
    deserialize?: (data: unknown) => T;
  };
}

interface CachedData<T> {
  version: number;
  timestamp: number;
  data: T;
}

export function createLocalStorageCache<T>(config: CacheConfig<T>) {
  const { key, version, expiryMs, transform } = config;

  const get = (): T | null => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const cached = localStorage.getItem(key);
      if (!cached) {
        return null;
      }

      const parsed: CachedData<unknown> = JSON.parse(cached);

      if (parsed.version !== version) {
        localStorage.removeItem(key);
        return null;
      }

      const isExpired = Date.now() - parsed.timestamp > expiryMs;
      if (isExpired) {
        localStorage.removeItem(key);
        return null;
      }

      const data = transform?.deserialize
        ? transform.deserialize(parsed.data)
        : (parsed.data as T);

      return data;
    } catch (error) {
      console.error(`Error reading ${key} cache:`, error);
      localStorage.removeItem(key);
      return null;
    }
  };

  const set = (data: T): void => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const serializedData = transform?.serialize
        ? transform.serialize(data)
        : data;

      const cacheData: CachedData<unknown> = {
        version,
        timestamp: Date.now(),
        data: serializedData,
      };

      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error(`Error setting ${key} cache:`, error);
    }
  };

  const clear = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error clearing ${key} cache:`, error);
    }
  };

  const isExpired = (): boolean => {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      const cached = localStorage.getItem(key);
      if (!cached) {
        return true;
      }

      const parsed: CachedData<unknown> = JSON.parse(cached);
      return Date.now() - parsed.timestamp > expiryMs;
    } catch {
      return true;
    }
  };

  return {
    get,
    set,
    clear,
    isExpired,
  };
}

export function createMultiKeyCache(keys: string[]) {
  const clearAll = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      keys.forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error("Error clearing multi-key cache:", error);
    }
  };

  return {
    clearAll,
  };
}
