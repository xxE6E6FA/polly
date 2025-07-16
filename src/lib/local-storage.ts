const KEY_PREFIX = "polly:";

function buildKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

export function get<T>(key: string, fallback: T): T {
  const namespaced = buildKey(key);
  try {
    const raw = localStorage.getItem(namespaced);
    if (raw == null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function set<T>(key: string, value: T): void {
  const namespaced = buildKey(key);
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(namespaced, serialized);
    notify(namespaced);
  } catch {
    // Ignore storage errors
  }
}

export function del(key: string): void {
  const namespaced = buildKey(key);
  try {
    localStorage.removeItem(namespaced);
    notify(namespaced);
  } catch {
    // Ignore storage errors
  }
}

type Callback = () => void;
const listeners = new Map<string, Set<Callback>>();

function notify(namespacedKey: string) {
  const set = listeners.get(namespacedKey);
  if (!set) {
    return;
  }
  for (const cb of set) {
    cb();
  }
}

export function subscribe(key: string, cb: Callback): () => void {
  const namespaced = buildKey(key);
  let set = listeners.get(namespaced);
  if (!set) {
    set = new Set();
    listeners.set(namespaced, set);
  }
  set.add(cb);

  window.addEventListener("storage", storageHandler);

  return () => {
    set?.delete(cb);
    if (set && set.size === 0) {
      listeners.delete(namespaced);
    }
    if (listeners.size === 0) {
      window.removeEventListener("storage", storageHandler);
    }
  };
}

function storageHandler(e: StorageEvent) {
  if (e.key == null) {
    return;
  }
  notify(e.key);
}
