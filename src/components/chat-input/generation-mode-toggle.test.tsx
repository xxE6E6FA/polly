import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { type ReactNode, useLayoutEffect } from "react";
import {
  PrivateModeProvider,
  usePrivateMode,
} from "@/providers/private-mode-context";
import { GenerationModeToggle } from "./generation-mode-toggle";

// Mock ToggleGroup components
mock.module("@/components/ui/toggle-group", () => ({
  ToggleGroup: ({
    value,
    onValueChange,
    children,
    className,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      data-testid="toggle-group"
      data-value={value}
      className={className}
      onClick={e => {
        const target = e.target as HTMLElement;
        const item = target.closest("[data-toggle-value]");
        if (item) {
          const newValue = item.getAttribute("data-toggle-value");
          if (newValue) {
            onValueChange(newValue);
          }
        }
      }}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const target = e.target as HTMLElement;
          const item = target.closest("[data-toggle-value]");
          if (item) {
            const newValue = item.getAttribute("data-toggle-value");
            if (newValue) {
              onValueChange(newValue);
            }
          }
        }
      }}
    >
      {children}
    </div>
  ),
  ToggleGroupItem: ({
    value,
    disabled,
    children,
    title,
  }: {
    value: string;
    disabled?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button
      data-toggle-value={value}
      disabled={disabled}
      title={title}
      type="button"
    >
      {children}
    </button>
  ),
}));

type RenderOptions = {
  isPrivateMode?: boolean;
  withProvider?: boolean;
};

function PrivateModeInitializer({
  initial,
  children,
}: {
  initial: boolean;
  children: ReactNode;
}) {
  const { setPrivateMode } = usePrivateMode();

  useLayoutEffect(() => {
    setPrivateMode(initial);
  }, [initial, setPrivateMode]);

  return <>{children}</>;
}

function renderToggle(
  ui: React.ReactElement,
  { isPrivateMode = false }: RenderOptions = {}
) {
  return render(
    <PrivateModeProvider>
      <PrivateModeInitializer initial={isPrivateMode}>
        {ui}
      </PrivateModeInitializer>
    </PrivateModeProvider>
  );
}

describe("GenerationModeToggle", () => {
  const mockOnModeChange = mock(() => {
    // Mock implementation for mode change
  });

  beforeEach(() => {
    mockOnModeChange.mockClear();
  });

  test("renders text and image toggle buttons", () => {
    renderToggle(
      <GenerationModeToggle mode="text" onModeChange={mockOnModeChange} />
    );
    const buttons = screen.getAllByRole("button");
    const firstButton = buttons[0];
    const secondButton = buttons[1];
    expect(firstButton).toBeDefined();
    expect(secondButton).toBeDefined();
    if (firstButton && secondButton) {
      expect(firstButton.getAttribute("title")).toBe("Text Generation");
      expect(secondButton.getAttribute("title")).toBe("Image Generation");
    }
  });

  test("displays text mode as active", () => {
    renderToggle(
      <GenerationModeToggle mode="text" onModeChange={mockOnModeChange} />
    );
    const toggleGroup = screen.getByTestId("toggle-group");
    expect(toggleGroup.getAttribute("data-value")).toBe("text");
  });

  test("displays image mode as active", () => {
    renderToggle(
      <GenerationModeToggle mode="image" onModeChange={mockOnModeChange} />
    );
    const toggleGroup = screen.getByTestId("toggle-group");
    expect(toggleGroup.getAttribute("data-value")).toBe("image");
  });

  test("calls onModeChange when switching from text to image", () => {
    renderToggle(
      <GenerationModeToggle mode="text" onModeChange={mockOnModeChange} />
    );
    const buttons = screen.getAllByRole("button");
    const imageButton = buttons[1];
    expect(imageButton).toBeDefined();
    if (imageButton) {
      fireEvent.click(imageButton);
    }
    expect(mockOnModeChange).toHaveBeenCalledWith("image");
  });

  test("calls onModeChange when switching from image to text", () => {
    renderToggle(
      <GenerationModeToggle mode="image" onModeChange={mockOnModeChange} />
    );
    const buttons = screen.getAllByRole("button");
    const textButton = buttons[0];
    expect(textButton).toBeDefined();
    if (textButton) {
      fireEvent.click(textButton);
    }
    expect(mockOnModeChange).toHaveBeenCalledWith("text");
  });

  test("disables image mode in private mode", () => {
    renderToggle(
      <GenerationModeToggle mode="text" onModeChange={mockOnModeChange} />,
      { isPrivateMode: true }
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toBeDefined();
    const imageButton = buttons[1] as HTMLButtonElement;
    expect(imageButton.disabled).toBe(true);
    expect(imageButton.getAttribute("title")).toBe(
      "Image generation not available in private mode"
    );
  });

  test("disables image mode when no Replicate API key", () => {
    renderToggle(
      <GenerationModeToggle
        mode="text"
        onModeChange={mockOnModeChange}
        hasReplicateApiKey={false}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toBeDefined();
    const imageButton = buttons[1] as HTMLButtonElement;
    expect(imageButton.disabled).toBe(true);
    expect(imageButton.getAttribute("title")).toBe(
      "Image generation requires a Replicate API key"
    );
  });

  test("disables all controls when disabled prop is true", () => {
    renderToggle(
      <GenerationModeToggle
        mode="text"
        onModeChange={mockOnModeChange}
        disabled={true}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDefined();
    expect(buttons[1]).toBeDefined();
    const textButton = buttons[0] as HTMLButtonElement;
    const imageButton = buttons[1] as HTMLButtonElement;
    expect(textButton.disabled).toBe(true);
    expect(imageButton.disabled).toBe(true);
  });

  test("applies custom className", () => {
    renderToggle(
      <GenerationModeToggle
        mode="text"
        onModeChange={mockOnModeChange}
        className="custom-class"
      />
    );
    const toggleGroup = screen.getByTestId("toggle-group");
    expect(toggleGroup.className).toContain("custom-class");
  });

  test("does not call onModeChange when clicking the already active mode", () => {
    const mockHandler = mock(() => {
      // Mock handler for mode change
    });
    renderToggle(
      <GenerationModeToggle mode="text" onModeChange={mockHandler} />
    );
    const buttons = screen.getAllByRole("button");
    const textButton = buttons[0];
    expect(textButton).toBeDefined();
    if (textButton) {
      fireEvent.click(textButton);
    }
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test("does not switch to image mode when disabled", () => {
    const mockHandler = mock(() => {
      // Mock handler for disabled mode
    });
    renderToggle(
      <GenerationModeToggle mode="text" onModeChange={mockHandler} />,
      { isPrivateMode: true }
    );
    const buttons = screen.getAllByRole("button");
    const imageButton = buttons[1];
    expect(imageButton).toBeDefined();
    if (imageButton) {
      fireEvent.click(imageButton);
    }
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
