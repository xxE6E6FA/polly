/**
 * Zustand vanilla test mock - automatically resets all vanilla stores after each test.
 * Based on https://zustand.docs.pmnd.rs/guides/testing#vitest adapted for Bun
 */

import { resolveSync } from "bun";
import type { StateCreator } from "zustand/vanilla";

// Track all stores AND their state creators for reset
const storeResetFns = new Set<() => void>();

// Resolve the actual zustand/vanilla module path
const moduleDir =
  typeof (import.meta as any).dir === "string"
    ? (import.meta as any).dir
    : new URL(".", import.meta.url).pathname;

const resolvedPath = resolveSync("zustand/vanilla", moduleDir);
const actualZustand = await import(resolvedPath);
const actualCreateStore = actualZustand.createStore;

// Mock createStore - handles both curried and direct calls
const createUncurried = <T>(stateCreator: StateCreator<T>) => {
  const store = actualCreateStore(stateCreator);
  
  // To properly reset, we need to call the state creator again to get fresh initial state
  // This is important for singleton stores that persist across tests
  const resetFn = () => {
    const freshState = stateCreator(store.setState, store.getState, store);
    store.setState(freshState, true);
  };
  
  storeResetFns.add(resetFn);
  return store;
};

// createStore can be called with or without arguments (curried pattern)
export const createStore = (<T>(stateCreator?: StateCreator<T>) => {
  if (typeof stateCreator === "function") {
    return createUncurried(stateCreator);
  }
  return createUncurried;
}) as typeof actualCreateStore;

export const resetVanillaStores = () => {
  for (const resetFn of storeResetFns) {
    resetFn();
  }
};

// Export both named and default
export default { createStore };

// Re-export everything else from actual zustand/vanilla
export * from "zustand/vanilla";
