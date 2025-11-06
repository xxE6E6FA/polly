import { afterEach, describe, expect, test } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { TestProviders } from "../../test/TestProviders";
import { PrivateModeProvider, usePrivateMode } from "./private-mode-context";

function PrivateModeProbe() {
  const { isPrivateMode, togglePrivateMode, setPrivateMode } = usePrivateMode();
  return (
    <div data-testid="private-mode-probe">
      <span data-testid="private-state">{String(isPrivateMode)}</span>
      <button data-testid="toggle-btn" onClick={togglePrivateMode}>
        toggle
      </button>
      <button data-testid="force-btn" onClick={() => setPrivateMode(true)}>
        force
      </button>
    </div>
  );
}

describe.serial("PrivateModeProvider", () => {
  afterEach(() => {
    cleanup();
  });

  test("exposes toggle and setter", async () => {
    // Ensure clean DOM before test
    cleanup();

    const { container } = render(
      <TestProviders>
        <PrivateModeProbe />
      </TestProviders>
    );

    // Use within(container) to scope queries to this specific render
    const probe = within(container).getByTestId("private-mode-probe");
    const state = () => within(probe).getByTestId("private-state").textContent;

    expect(state()).toBe("false");

    fireEvent.click(within(probe).getByTestId("toggle-btn"));
    await waitFor(() => {
      expect(state()).toBe("true");
    });

    fireEvent.click(within(probe).getByTestId("force-btn"));
    await waitFor(() => {
      expect(state()).toBe("true");
    });
  });
});
