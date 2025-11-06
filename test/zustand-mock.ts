/**
 * Zustand test mock - automatically resets all stores after each test
 * Based on https://zustand.docs.pmnd.rs/guides/testing#vitest
 */

import { resolveSync } from "bun";
import type { StateCreator } from "zustand";

// Import actual zustand
const moduleDir =
  typeof (import.meta as any).dir === "string"
    ? (import.meta as any).dir
    : new URL(".", import.meta.url).pathname;
const resolvedZustandPath = resolveSync("zustand", moduleDir);
const actualZustand = await import(`${resolvedZustandPath}?actual`);
const { create: actualCreate, createStore: actualCreateStore } = actualZustand;

// Track all stores created during tests so we can reset them
const storeResetFns = new Set<() => void>();

// Mock create function that tracks stores for reset
const createUncurried = <T>(stateCreator: StateCreator<T>) => {
  const store = actualCreate(stateCreator);
  
  // To properly reset, call the state creator again to get fresh initial state
  // Important for singleton stores that persist across tests
  const resetFn = () => {
    const freshState = stateCreator(store.setState, store.getState, store);
    store.setState(freshState, true);
  };
  
  storeResetFns.add(resetFn);
  return store;
};

// Mock create function with curried overloads
const create = (<T>(stateCreator: StateCreator<T>) => {
  return typeof stateCreator === "function"
    ? createUncurried(stateCreator)
    : createUncurried;
}) as typeof actualCreate;

// Mock createStore function
const createStore = (<T>(stateCreator: StateCreator<T>) => {
  const store = actualCreateStore(stateCreator);
  
  const resetFn = () => {
    const freshState = stateCreator(store.setState, store.getState, store);
    store.setState(freshState, true);
  };
  
  storeResetFns.add(resetFn);
  return store;
}) as typeof actualCreateStore;

export const resetReactStores = () => {
  for (const resetFn of storeResetFns) {
    resetFn();
  }
};

// Export mocked zustand with reset capability
export { create, createStore };
export default create;

// Re-export everything else from actual zustand
export * from "zustand";
