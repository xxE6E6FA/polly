import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { ChatMessage } from "@/types";
import { MessageError } from "./MessageError";

const createMockMessage = (
  overrides: Partial<ChatMessage> = {}
): ChatMessage => ({
  id: "msg-1",
  role: "assistant" as const,
  content: "Hello world",
  status: "done" as const,
  createdAt: Date.now(),
  isMainBranch: true,
  attachments: [],
  ...overrides,
});

describe("MessageError", () => {
  const mockOnRetry = mock(() => {
    /* empty */
  });

  beforeEach(() => {
    mockOnRetry.mockClear();
  });

  test("renders nothing when message has no errors", () => {
    const message = createMockMessage();

    const { container } = render(
      <MessageError message={message} messageId="msg-1" />
    );

    expect(container.firstChild).toBeNull();
  });

  test("renders text message error", () => {
    const message = createMockMessage({
      status: "error",
      error: "Failed to generate response",
    });

    render(<MessageError message={message} messageId="msg-1" />);

    expect(screen.getByText("Message failed")).toBeTruthy();
    expect(screen.getByText("Failed to generate response")).toBeTruthy();

    // Check for error icon (SVG)
    const errorIcon = document.querySelector("svg");
    expect(errorIcon).toBeTruthy();
  });

  test("renders image generation failed error", () => {
    const message = createMockMessage({
      imageGeneration: {
        status: "failed",
        error: "Model unavailable",
      },
    });

    render(<MessageError message={message} messageId="msg-1" />);

    expect(screen.getByText("Image generation failed")).toBeTruthy();
    expect(screen.getByText("Model unavailable")).toBeTruthy();
  });

  test("renders image generation canceled error", () => {
    const message = createMockMessage({
      imageGeneration: {
        status: "canceled",
        error: "Generation was canceled by user",
      },
    });

    render(<MessageError message={message} messageId="msg-1" />);

    expect(screen.getByText("Image generation canceled")).toBeTruthy();
    expect(screen.getByText("Generation was canceled by user")).toBeTruthy();
  });

  test("renders retry button for text errors when onRetry provided", () => {
    const message = createMockMessage({
      status: "error",
      error: "Network error",
    });

    render(
      <MessageError message={message} messageId="msg-1" onRetry={mockOnRetry} />
    );

    const retryButton = screen.getByRole("button", { name: /retry message/i });
    expect(retryButton).toBeTruthy();
    expect(retryButton.textContent).toBe("Retry message");
  });

  test("renders retry button for image errors when onRetry provided", () => {
    const message = createMockMessage({
      imageGeneration: {
        status: "failed",
        error: "Model unavailable",
      },
    });

    render(
      <MessageError message={message} messageId="msg-1" onRetry={mockOnRetry} />
    );

    const retryButton = screen.getByRole("button", {
      name: /retry generation/i,
    });
    expect(retryButton).toBeTruthy();
    expect(retryButton.textContent).toBe("Retry generation");
  });

  test("calls onRetry with messageId when retry button clicked", () => {
    const message = createMockMessage({
      status: "error",
      error: "API error",
    });

    render(
      <MessageError
        message={message}
        messageId="custom-msg-123"
        onRetry={mockOnRetry}
      />
    );

    const retryButton = screen.getByRole("button", { name: /retry message/i });
    fireEvent.click(retryButton);

    expect(mockOnRetry).toHaveBeenCalledWith("custom-msg-123");
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  test("does not render retry button when onRetry not provided", () => {
    const message = createMockMessage({
      status: "error",
      error: "Connection failed",
    });

    render(<MessageError message={message} messageId="msg-1" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  test("renders nothing when image error exists but no error message", () => {
    const message = createMockMessage({
      imageGeneration: {
        status: "failed",
        // No error message
      },
    });

    const { container } = render(
      <MessageError message={message} messageId="msg-1" />
    );

    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when text error exists but no error message", () => {
    const message = createMockMessage({
      status: "error",
      // No error message
    });

    const { container } = render(
      <MessageError message={message} messageId="msg-1" />
    );

    expect(container.firstChild).toBeNull();
  });

  test("prioritizes image error over text error when both exist", () => {
    const message = createMockMessage({
      status: "error",
      error: "Text error",
      imageGeneration: {
        status: "failed",
        error: "Image error",
      },
    });

    render(<MessageError message={message} messageId="msg-1" />);

    expect(screen.getByText("Image generation failed")).toBeTruthy();
    expect(screen.getByText("Image error")).toBeTruthy();
    expect(screen.queryByText("Text error")).toBeNull();
  });
});
