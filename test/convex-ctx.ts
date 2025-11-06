import { mock } from "bun:test";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";

/**
 * Minimal Convex context stub for testing backend functions.
 * Provides just the methods needed for most tests with sensible defaults.
 *
 * Usage:
 *   const ctx = makeConvexCtx({ db: { get: mock(() => Promise.resolve(user)) } });
 *   await myMutation(ctx, args);
 */

type MockFn = ReturnType<typeof mock>;

type MockDbReader = {
  get: MockFn;
  query: MockFn;
};

type MockDbWriter = MockDbReader & {
  insert: MockFn;
  patch: MockFn;
  replace: MockFn;
  delete: MockFn;
};

type MockAuth = {
  getUserIdentity: MockFn;
};

type MockStorage = {
  generateUploadUrl: MockFn;
  getUrl: MockFn;
  getMetadata: MockFn;
  get: MockFn;
  delete: MockFn;
};

export type MockConvexContext = {
  db: MockDbWriter;
  auth: MockAuth;
  storage: MockStorage;
  scheduler: {
    runAfter: MockFn;
    runAt: MockFn;
  };
  runQuery?: MockFn;
  runMutation?: MockFn;
  runAction?: MockFn;
};

type ConvexCtxOverrides = {
  db?: Partial<MockDbWriter>;
  auth?: Partial<MockAuth>;
  storage?: Partial<MockStorage>;
  scheduler?: {
    runAfter?: MockFn;
    runAt?: MockFn;
  };
  runQuery?: MockFn;
  runMutation?: MockFn;
  runAction?: MockFn;
};

/**
 * Create a mock query chain that mimics Convex query builder.
 * Provides minimal implementation for common query patterns.
 */
function createQueryChain() {
  const chain = {
    withIndex: mock(() => chain),
    filter: mock(() => chain),
    order: mock(() => chain),
    paginate: mock(() => Promise.resolve({ page: [], isDone: true, continueCursor: "" })),
    first: mock(() => Promise.resolve(null)),
    unique: mock(() => Promise.resolve(null)),
    collect: mock(() => Promise.resolve([])),
    take: mock(() => Promise.resolve([])),
  };

  return chain;
}

/**
 * Create a minimal Convex context for testing.
 * All database and auth operations are mocked by default.
 *
 * @param overrides - Override default mock implementations
 * @returns Mock Convex context
 */
export function makeConvexCtx(overrides: ConvexCtxOverrides = {}): MockConvexContext {
  const queryChain = createQueryChain();

  const ctx: MockConvexContext = {
    db: {
      get: mock(() => Promise.resolve(null)),
      query: mock(() => queryChain),
      insert: mock(() => Promise.resolve("mock-id" as any)),
      patch: mock(() => Promise.resolve(undefined)),
      replace: mock(() => Promise.resolve(undefined)),
      delete: mock(() => Promise.resolve(undefined)),
      ...overrides.db,
    },
    auth: {
      getUserIdentity: mock(() => Promise.resolve({
        subject: "test-user-id",
        name: "Test User",
        email: "test@example.com",
      })),
      ...overrides.auth,
    },
    storage: {
      generateUploadUrl: mock(() => Promise.resolve("mock-upload-url")),
      getUrl: mock(() => Promise.resolve("mock-file-url")),
      getMetadata: mock(() => Promise.resolve({
        storageId: "mock-storage-id",
        sha256: "mock-sha256",
        size: 1024,
        contentType: "application/octet-stream",
      })),
      get: mock(() => Promise.resolve(new Blob(["mock-content"], { type: "application/octet-stream" }))),
      delete: mock(() => Promise.resolve(undefined)),
      ...overrides.storage,
    },
    scheduler: {
      runAfter: mock(() => Promise.resolve(undefined)),
      runAt: mock(() => Promise.resolve(undefined)),
      ...overrides.scheduler,
    },
    runQuery: overrides.runQuery || mock(() => Promise.resolve(null)),
    runMutation: overrides.runMutation || mock(() => Promise.resolve(null)),
    runAction: overrides.runAction || mock(() => Promise.resolve(null)),
  };

  return ctx;
}

/**
 * Create a mock authenticated user identity.
 * Useful for auth.getUserIdentity() mocks.
 */
export function mockUserIdentity(overrides: Partial<{ subject: string; name: string; email: string }> = {}) {
  return {
    subject: "test-user-id",
    name: "Test User",
    email: "test@example.com",
    ...overrides,
  };
}

/**
 * Create a mock unauthenticated context (getUserIdentity returns null).
 */
export function makeUnauthenticatedCtx(overrides: ConvexCtxOverrides = {}): MockConvexContext {
  return makeConvexCtx({
    ...overrides,
    auth: {
      getUserIdentity: mock(() => Promise.resolve(null)),
      ...overrides.auth,
    },
  });
}
