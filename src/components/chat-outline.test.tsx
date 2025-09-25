import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/types";

import { ChatOutline } from "./chat-outline";

vi.mock("@/providers/ui-provider", () => ({
  useUI: () => ({ isSidebarVisible: false, isMobile: false }),
}));

vi.mock("@/providers/sidebar-width-context", () => ({
  useSidebarWidth: () => ({ sidebarWidth: 0 }),
}));

describe("ChatOutline", () => {
  const messages: ChatMessage[] = [
    {
      id: "user-1",
      role: "user",
      content: "Explain Flux models",
      isMainBranch: true,
      createdAt: Date.now(),
    },
    {
      id: "assistant-1",
      role: "assistant",
      content: "# Introduction\nFlux models are fast.",
      isMainBranch: true,
      createdAt: Date.now(),
    },
    {
      id: "user-2",
      role: "user",
      content: "List key benefits",
      isMainBranch: true,
      createdAt: Date.now(),
    },
    {
      id: "assistant-2",
      role: "assistant",
      content: "# Benefits\n- Speed\n- Quality",
      isMainBranch: true,
      createdAt: Date.now(),
    },
  ];

  it("expands on focus and collapses after focus leaves the outline", () => {
    render(
      <>
        <ChatOutline messages={messages} />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </>
    );

    const container = screen.getByTestId("chat-outline-container");
    expect(container).toHaveAttribute("aria-expanded", "false");

    const firstItem = screen.getByRole("button", {
      name: /Explain Flux models/i,
    });

    act(() => {
      firstItem.focus();
      firstItem.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(container).toHaveAttribute("aria-expanded", "true");

    act(() => {
      container.dispatchEvent(
        new FocusEvent("focusout", { relatedTarget: firstItem, bubbles: true })
      );
    });
    expect(container).toHaveAttribute("aria-expanded", "true");

    const outside = screen.getByTestId("outside");
    act(() => {
      container.dispatchEvent(
        new FocusEvent("focusout", { relatedTarget: outside, bubbles: true })
      );
      outside.focus();
    });
    expect(container).toHaveAttribute("aria-expanded", "false");
  });
});
