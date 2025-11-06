import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import React from "react";
import { renderWithProviders } from "../../test/test-utils";
import { useUI } from "./ui-provider";

function UIProbe() {
  const { isSidebarVisible, toggleSidebar } = useUI();
  return (
    <div>
      <span data-testid="sidebar-state">{String(isSidebarVisible)}</span>
      <button onClick={toggleSidebar}>toggle</button>
    </div>
  );
}

describe("UIProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("toggles sidebar visibility", async () => {
    await renderWithProviders(<UIProbe />);
    const state = () => screen.getByTestId("sidebar-state").textContent;
    expect(state()).toBe("false");
    fireEvent.click(screen.getByText("toggle"));
    expect(state()).toBe("true");
  });
});
