import React, { type ReactElement } from "react";
import { TestProviders } from "./TestProviders";

// Lazy import to avoid forcing @testing-library/* to be installed for pure unit tests.
export async function renderUi(ui: ReactElement) {
  const { render } = await import("@testing-library/react");
  return render(ui);
}

export async function renderWithRouter(ui: ReactElement, initialEntries: string[] = ["/"]) {
  const [{ MemoryRouter }] = await Promise.all([
    import("react-router-dom"),
  ]);
  const { render } = await import("@testing-library/react");
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

export async function renderWithProviders(ui: ReactElement, options?: { withTooltips?: boolean }) {
  const { render } = await import("@testing-library/react");
  return render(<TestProviders withTooltips={options?.withTooltips}>{ui}</TestProviders>);
}

export const renderApp = renderWithProviders;

export function silenceConsoleError(): () => void {
  const original = console.error;
  console.error = () => {};
  return () => {
    console.error = original;
  };
}

export function mockNavigatorOnline(value: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(navigator, "onLine", descriptor);
    }
  };
}

// NOTE: If a component requires AppProvider (and thus ConvexProvider),
// prefer mocking `src/providers/convex-provider` in that test file:
//
//   import { mock } from "bun:test";
//   mock.module("@/providers/convex-provider", () => ({
//     ConvexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
//     getConvexClient: () => ({})
//   }));
//
// Then wrap with your app provider and render.
