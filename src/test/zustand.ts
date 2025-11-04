import { afterEach, beforeEach } from "bun:test";
import type { StoreApi } from "zustand";

type ReleaseLock = () => void;

type AsyncLock = {
  acquire: () => Promise<ReleaseLock>;
};

const STORE_LOCK_SYMBOL = Symbol.for("polly.test.zustandStoreLock");

type GlobalWithLock = typeof globalThis & {
  [STORE_LOCK_SYMBOL]?: AsyncLock;
};

const globalWithLock = globalThis as GlobalWithLock;

function createAsyncLock(): AsyncLock {
  let locked = false;
  const queue: Array<() => void> = [];

  return {
    async acquire() {
      if (locked) {
        await new Promise<void>(resolve => {
          queue.push(resolve);
        });
      }

      locked = true;
      let released = false;

      return () => {
        if (released) {
          return;
        }

        released = true;

        if (queue.length > 0) {
          const next = queue.shift();
          locked = false;
          next?.();
        } else {
          locked = false;
        }
      };
    },
  };
}

function getAsyncLock(): AsyncLock {
  const existingLock = globalWithLock[STORE_LOCK_SYMBOL];
  if (existingLock) {
    return existingLock;
  }
  const createdLock = createAsyncLock();
  globalWithLock[STORE_LOCK_SYMBOL] = createdLock;
  return createdLock;
}

type SetupOptions<S> = {
  /** Factory that returns a fresh store instance */
  createStore: () => StoreApi<S>;
  /** Callback used to swap the store used by the application/test runtime */
  setStore: (store: StoreApi<S>) => void;
};

/**
 * Registers a Bun test harness that swaps in a fresh Zustand store before and
 * after each test case. Returns a getter so individual tests can access the
 * current store instance when they need direct state assertions.
 */
export function setupZustandTestStore<S>({
  createStore,
  setStore,
}: SetupOptions<S>) {
  let current: StoreApi<S> | undefined;
  const lock = getAsyncLock();
  let releaseLock: ReleaseLock | undefined;

  const replaceStore = (next: StoreApi<S>) => {
    const prev = current;
    current = next;
    setStore(next);
    if (prev && prev !== next) {
      // Note: Zustand stores don't have a destroy method
      // The store will be garbage collected when no longer referenced
    }
  };

  beforeEach(async () => {
    releaseLock = await lock.acquire();

    try {
      replaceStore(createStore());
    } catch (error) {
      releaseLock?.();
      releaseLock = undefined;
      throw error;
    }
  });

  afterEach(() => {
    try {
      replaceStore(createStore());
    } finally {
      releaseLock?.();
      releaseLock = undefined;
    }
  });

  return () => {
    if (!current) {
      throw new Error("Zustand store has not been initialised yet");
    }
    return current;
  };
}
