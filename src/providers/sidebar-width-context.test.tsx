import { beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import React from "react";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { renderWithProviders } from "../../test/test-utils";
import { SidebarWidthProvider, useSidebarWidth } from "./sidebar-width-context";

function SidebarProbe() {
  const { sidebarWidth, setSidebarWidth, setIsResizing, isResizing } =
    useSidebarWidth();
  return (
    <div>
      <span data-testid="sidebar-width">{String(sidebarWidth)}</span>
      <span data-testid="sidebar-resizing">{String(isResizing)}</span>
      <button onClick={() => setSidebarWidth(100)}>set-small</button>
      <button onClick={() => setSidebarWidth(800)}>set-large</button>
      <button onClick={() => setIsResizing(true)}>resize-on</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("SidebarWidthProvider", () => {
  test("hydrates from storage and clamps width", async () => {
    set(CACHE_KEYS.sidebarWidth, 900);

    await renderWithProviders(
      <SidebarWidthProvider>
        <SidebarProbe />
      </SidebarWidthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidebar-width").textContent).toBe("600");
    });
  });

  test("setSidebarWidth clamps and persists", async () => {
    await renderWithProviders(
      <SidebarWidthProvider>
        <SidebarProbe />
      </SidebarWidthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidebar-width").textContent).toBe("320");
    });

    // biome-ignore lint/suspicious/useAwait: act() requires async callback for proper React testing
    await act(async () => {
      fireEvent.click(screen.getByText("set-small"));
    });
    expect(screen.getByTestId("sidebar-width").textContent).toBe("320");
    expect(get(CACHE_KEYS.sidebarWidth, 0)).toBe(320);

    // biome-ignore lint/suspicious/useAwait: act() requires async callback for proper React testing
    await act(async () => {
      fireEvent.click(screen.getByText("set-large"));
    });
    expect(screen.getByTestId("sidebar-width").textContent).toBe("600");
    expect(get(CACHE_KEYS.sidebarWidth, 0)).toBe(600);

    fireEvent.click(screen.getByText("resize-on"));
    expect(screen.getByTestId("sidebar-resizing").textContent).toBe("true");
  });
});
