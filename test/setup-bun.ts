// Global Bun test setup — runs before any test files.
// Keep dependencies optional so unit tests can run without DOM libs.

// 1) Opt-in DOM environment (happy-dom) when available
//    This lets React DOM tests run in Bun without Node/real browser.
import { afterEach, beforeEach, mock } from "bun:test";

// Mock zustand to auto-reset stores between tests
// This must happen BEFORE any modules import zustand
import zustandMock, { resetReactStores } from "./zustand-mock";
import zustandVanillaMock, { resetVanillaStores } from "./zustand-vanilla-mock";

mock.module("zustand", () => zustandMock);
mock.module("zustand/vanilla", () => zustandVanillaMock);

try {
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  GlobalRegistrator.register();
} catch {
  // Not installed yet — unit tests can still run.
}

// 2) Extend expect with jest-dom matchers when present
try {
  await import("@testing-library/jest-dom");
  // Auto-clean DOM between tests when RTL is available
  const { cleanup } = await import("@testing-library/react");
  // Clean up BEFORE each test (in case previous test didn't finish cleanup)
  // and AFTER each test (standard cleanup)
  beforeEach(() => cleanup());
  afterEach(() => cleanup());
} catch {
  // Optional dependency; DOM tests may add it later.
}

// 3) Global mock cleanup to prevent pollution between tests
// IMPORTANT: mock.restore() does NOT clear mock.module() mocks!
// mock.module() is global and persists across test files.
// Only use mock.module() for suite-wide stable mocks that don't vary per test.
// For per-test mocking, use spyOn() which IS cleared by mock.restore().
afterEach(() => {
  mock.restore(); // Restores spyOn/mock() function implementations
  mock.clearAllMocks(); // Clears call history on all mocks
  resetVanillaStores();
  resetReactStores();
  
  // Clear localStorage to prevent test pollution
  // All tests share the same global DOM/localStorage in Bun+happy-dom
  try {
    localStorage?.clear();
  } catch {
    // localStorage might not be available in all test environments
  }
});

// 4) Minimal global test helpers
declare global {
  // Allows tests to await microtasks (effect flush) in a consistent way
  // without pulling a full helper library.
  // eslint-disable-next-line no-var
  var flushMicrotasks: () => Promise<void>;
}

globalThis.flushMicrotasks = () => Promise.resolve();
