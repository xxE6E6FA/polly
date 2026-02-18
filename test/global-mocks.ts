/**
 * Global test mocks - preloaded before all test files
 * 
 * These mocks are global and stable across the entire test suite.
 * Instead of having each test file call mock.module() for the same modules,
 * we set up ONE mock here and make it configurable per-test via registries.
 * 
 * This prevents cross-file mock conflicts and flakiness from test execution order.
 */

import { mock, afterEach } from "bun:test";

// ============================================================================
// Convex Mock Registry
// ============================================================================

type ConvexMockRegistry = {
  useQuery?: (query: any, args?: any) => any;
  useMutation?: (mutation: any) => any;
  useAction?: (action: any) => any;
  usePaginatedQuery?: (query: any, args?: any) => any;
};

// Registry that tests can configure - reset after each test
const convexMockRegistry: ConvexMockRegistry = {};

// Import the actual Convex module to fall back to for unmocked exports
const actualConvexReact = await import("convex/react");

// Set up the global mock with a proxy that checks the registry
mock.module("convex/react", () => ({
  __esModule: true,
  ...actualConvexReact,
  useQuery: (query: any, args?: any) => {
    if (convexMockRegistry.useQuery) {
      return convexMockRegistry.useQuery(query, args);
    }
    return undefined;
  },
  useMutation: (mutation: any) => {
    if (convexMockRegistry.useMutation) {
      return convexMockRegistry.useMutation(mutation);
    }
    return async () => {};
  },
  useAction: (action: any) => {
    if (convexMockRegistry.useAction) {
      return convexMockRegistry.useAction(action);
    }
    return async () => {};
  },
  usePaginatedQuery: (query: any, args?: any) => {
    if (convexMockRegistry.usePaginatedQuery) {
      return convexMockRegistry.usePaginatedQuery(query, args);
    }
    return { results: [], status: "LoadingFirstPage", loadMore: () => {} };
  },
}));

/**
 * Configure the Convex mock for your tests
 * Call this in your test file (module scope or beforeEach)
 */
export function setConvexMock(config: ConvexMockRegistry) {
  Object.assign(convexMockRegistry, config);
}

/**
 * Clear specific Convex mock handlers (useful in beforeEach)
 */
export function clearConvexMock() {
  convexMockRegistry.useQuery = undefined;
  convexMockRegistry.useMutation = undefined;
  convexMockRegistry.useAction = undefined;
  convexMockRegistry.usePaginatedQuery = undefined;
}

// ============================================================================
// User Data Context Mock Registry
// ============================================================================

type UserDataMockRegistry = {
  user?: any;
  canSendMessage?: boolean;
  hasMessageLimit?: boolean;
  hasUnlimitedCalls?: boolean;
  [key: string]: any;
};

const userDataMockRegistry: UserDataMockRegistry = {
  user: { _id: "test-user" },
  canSendMessage: true,
  hasMessageLimit: false,
  hasUnlimitedCalls: true,
};

const actualUserDataContext = await import("@/providers/user-data-context");

mock.module("@/providers/user-data-context", () => ({
  ...actualUserDataContext,
  useUserDataContext: () => ({ ...userDataMockRegistry }),
}));

/**
 * Configure the user data context mock for your tests
 */
export function setUserDataMock(data: Partial<UserDataMockRegistry>) {
  Object.assign(userDataMockRegistry, data);
}

/**
 * Reset user data mock to defaults
 */
export function resetUserDataMock() {
  userDataMockRegistry.user = { _id: "test-user" };
  userDataMockRegistry.canSendMessage = true;
  userDataMockRegistry.hasMessageLimit = false;
  userDataMockRegistry.hasUnlimitedCalls = true;
}

// ============================================================================
// Global Cleanup
// ============================================================================

// Clear registries after each test to prevent pollution
afterEach(() => {
  clearConvexMock();
  resetUserDataMock();
});
