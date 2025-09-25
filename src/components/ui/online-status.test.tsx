import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getOnlineSnapshot, OnlineStatus } from "./online-status";
import { TooltipProvider } from "./tooltip";

describe("getOnlineSnapshot", () => {
  it("falls back to online when window is unavailable", () => {
    const snapshot = getOnlineSnapshot({ hasWindowOverride: false });
    expect(snapshot.online).toBe(true);
    expect(snapshot.canListen).toBe(false);
  });

  it("reflects the provided navigator status", () => {
    const snapshot = getOnlineSnapshot({
      hasWindowOverride: true,
      navigatorOverride: { onLine: false } as Navigator,
    });
    expect(snapshot.online).toBe(false);
    expect(snapshot.canListen).toBe(true);
  });
});

describe("OnlineStatus", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without crashing when navigator reports offline", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "onLine"
    );

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });

    try {
      const { getByText } = render(
        <TooltipProvider>
          <OnlineStatus variant="inline" />
        </TooltipProvider>
      );
      expect(getByText("Disconnected")).toBeInTheDocument();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window.navigator, "onLine", originalDescriptor);
      }
    }
  });
});
