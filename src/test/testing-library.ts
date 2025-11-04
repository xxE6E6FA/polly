import { afterEach, beforeEach, expect, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { getQueriesForElement, queries } from "@testing-library/dom";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, screen } from "@testing-library/react";

/**
 * Aligns React Testing Library with Bun's recommended setup.
 * See https://bun.com/docs/guides/test/testing-library
 */
function rebindScreenToDocument() {
  if (typeof document === "undefined" || !document.body) {
    return;
  }
  const bound = getQueriesForElement(document.body, queries);
  Object.assign(screen, bound);
}

rebindScreenToDocument();

expect.extend(matchers);

beforeEach(async () => {
  if (!("document" in globalThis && globalThis.document?.body)) {
    await GlobalRegistrator.unregister().catch(() => {
      // Ignore errors during unregister
    });
    GlobalRegistrator.register();
  }
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  }
  globalThis.localStorage?.clear?.();
  globalThis.sessionStorage?.clear?.();
  rebindScreenToDocument();
});

afterEach(() => {
  cleanup();
  mock.restore();
});
