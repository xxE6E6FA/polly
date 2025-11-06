import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import React from "react";
import {
  mockNavigatorOnline,
  renderWithRouter,
  silenceConsoleError,
} from "../../../test/test-utils";
import { ErrorBoundary } from "./error-boundary";

function Okay() {
  return <div>ok</div>;
}

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  test("renders children when no error", async () => {
    await renderWithRouter(
      <ErrorBoundary>
        <Okay />
      </ErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeTruthy();
  });

  test("shows default error UI when a child throws", async () => {
    const restoreConsole = silenceConsoleError();
    try {
      await renderWithRouter(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    } finally {
      restoreConsole();
    }
    expect(screen.getByText(/Oops! Something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/Reload page/i)).toBeTruthy();
  });

  test("renders offline placeholder when navigator.onLine is false", async () => {
    const restoreConsole = silenceConsoleError();
    const resetNavigator = mockNavigatorOnline(false);
    try {
      await renderWithRouter(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    } finally {
      restoreConsole();
      resetNavigator();
    }
    expect(screen.getByText(/You're offline/i)).toBeTruthy();
  });
});
let restoreNavigator: (() => void) | undefined;

beforeEach(() => {
  if (restoreNavigator) {
    restoreNavigator();
  }
  restoreNavigator = mockNavigatorOnline(true);
});

afterAll(() => {
  if (restoreNavigator) {
    restoreNavigator();
    restoreNavigator = undefined;
  }
});
