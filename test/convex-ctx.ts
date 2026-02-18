import { mock } from "bun:test";

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
function createQueryChain(overrides?: {
  uniqueResult?: unknown;
  firstResult?: unknown;
  collectResult?: unknown[];
}) {
  const chain = {
    withIndex: mock(() => chain),
    filter: mock(() => chain),
    order: mock(() => chain),
    paginate: mock(() => Promise.resolve({ page: [], isDone: true, continueCursor: "" })),
    first: mock(() => Promise.resolve(overrides?.firstResult ?? null)),
    unique: mock(() => Promise.resolve(overrides?.uniqueResult ?? null)),
    collect: mock(() => Promise.resolve(overrides?.collectResult ?? [])),
    take: mock(() => Promise.resolve([])),
  };

  return chain;
}

/**
 * Create a table-aware query mock that handles auth + custom domain queries.
 *
 * Use this when your test overrides `db.query` for a specific domain table
 * but still needs `getAuthUserId` to work (which queries "users").
 *
 * @param domainMock - Function handling non-"users" table queries
 * @param userId - The user `_id` to return from auth lookup (default: "test-user-id")
 */
export function createAuthAwareQueryMock(
  domainMock: (table: string) => unknown,
  userId = "test-user-id" as unknown,
) {
  const authChain = createQueryChain({ uniqueResult: { _id: userId } });
  return mock((table: string) => (table === "users" ? authChain : domainMock(table)));
}

/**
 * Create a minimal Convex context for testing.
 * All database and auth operations are mocked by default.
 *
 * The `db.query` mock is automatically table-aware:
 * - Queries on "users" return a mock user so `getAuthUserId` works.
 * - The returned `_id` matches the `subject` from the auth identity.
 * - If you override `db.query`, it's automatically wrapped to still handle
 *   the "users" table for auth. To opt out, also override `auth`.
 *
 * @param overrides - Override default mock implementations
 * @returns Mock Convex context
 */
export function makeConvexCtx(overrides: ConvexCtxOverrides = {}): MockConvexContext {
  // Build auth mock first so we can reference it in the query mock
  const authMock: MockAuth = {
    getUserIdentity: mock(() => Promise.resolve({
      subject: "test-user-id",
      name: "Test User",
      email: "test@example.com",
    })),
    ...overrides.auth,
  };

  // Auth chain for getAuthUserId — dynamically resolves the user `_id` from
  // whatever `subject` the auth identity returns, so tests that override
  // `auth.getUserIdentity` with a custom `subject` still work correctly.
  const authChain = createQueryChain();
  authChain.unique = mock(async () => {
    const identity = await authMock.getUserIdentity();
    if (!identity) {
      return null;
    }
    return { _id: identity.subject };
  });

  const defaultChain = createQueryChain();

  // If the caller provides a custom db.query, wrap it to also handle "users" for auth.
  // If they don't, use our default table-aware mock.
  let queryMock: MockFn;
  if (overrides.db?.query) {
    const originalQuery = overrides.db.query;
    queryMock = mock((table: string) => {
      if (table === "users") {
        return authChain;
      }
      return (originalQuery as (...args: unknown[]) => unknown)(table);
    });
  } else {
    queryMock = mock((table: string) => (table === "users" ? authChain : defaultChain));
  }

  const ctx: MockConvexContext = {
    db: {
      get: mock(() => Promise.resolve(null)),
      query: queryMock,
      insert: mock(() => Promise.resolve("mock-id" as any)),
      patch: mock(() => Promise.resolve(undefined)),
      replace: mock(() => Promise.resolve(undefined)),
      delete: mock(() => Promise.resolve(undefined)),
      ...overrides.db,
      // Re-apply queryMock after spread since overrides.db.query would overwrite it
      ...(overrides.db?.query ? { query: queryMock } : {}),
    },
    auth: authMock,
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
