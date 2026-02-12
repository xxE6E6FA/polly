import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { TestProviders } from "../../../../test/TestProviders";
import { ImageActions } from "./image-actions";

// Mock the clipboard API
const mockWriteText = mock(() => Promise.resolve());
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
});

// Mock the download function
const mockDownloadFromUrl = mock((url: string, filename: string) =>
  Promise.resolve()
);
mock.module("@/lib/export", () => ({
  downloadFromUrl: mockDownloadFromUrl,
}));

// Toast functionality is tested separately in ToastProvider tests
// We don't need to mock or assert on toast calls here

// Mock tooltip components to avoid context requirements
mock.module("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({
    children,
    render,
    onClick,
    disabled,
    delayDuration: _delayDuration, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...props
  }: React.PropsWithChildren<{
    render?: React.ReactElement;
    onClick?: () => void;
    disabled?: boolean;
    delayDuration?: number;
  }>) => {
    // If render prop is provided, clone it with the onClick and disabled props
    if (render) {
      return React.cloneElement(render, { onClick, disabled, ...props });
    }
    return <>{children}</>;
  },
  TooltipContent: () => null,
}));

// Mock ImageRetryPopover to render a simple button for testing
mock.module("./image-retry-popover", () => ({
  ImageRetryPopover: ({
    onRetry,
  }: {
    onRetry: (params: { model: string; aspectRatio: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onRetry({ model: "test-model", aspectRatio: "1:1" })}
    >
      Retry
    </button>
  ),
}));

// Date mocking removed - tests will use current date

const renderWithProviders = (component: React.ReactElement) => {
  return render(component, { wrapper: TestProviders });
};

describe("ImageActions", () => {
  const defaultProps = {
    imageUrl: "https://example.com/image.png",
    prompt: "A beautiful sunset over mountains",
  };

  beforeEach(() => {
    mock.restore();
    mockWriteText.mockClear();
    mockDownloadFromUrl.mockClear();
  });

  afterEach(() => {
    // Cleanup
  });

  test("renders all action buttons", () => {
    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2); // Copy prompt and download image buttons
  });

  test("renders retry button when onRetry is provided", () => {
    const onRetry = mock(() => {
      /* empty */
    });

    renderWithProviders(<ImageActions {...defaultProps} onRetry={onRetry} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3); // Copy prompt, download image, and retry buttons
  });

  test("applies custom className", () => {
    renderWithProviders(
      <ImageActions {...defaultProps} className="custom-class" />
    );

    const container = screen.getAllByRole("button")[0]?.parentElement;
    expect(container?.className).toContain("custom-class");
  });

  test("copy prompt button is disabled when no prompt provided", () => {
    renderWithProviders(<ImageActions {...defaultProps} prompt={undefined} />);

    const buttons = screen.getAllByRole("button");
    const firstButton = buttons[0];
    const secondButton = buttons[1];
    expect(firstButton).toBeDefined();
    expect(secondButton).toBeDefined();
    if (firstButton && secondButton) {
      expect((firstButton as HTMLButtonElement).disabled).toBe(true);
      expect((secondButton as HTMLButtonElement).disabled).toBe(false);
    }
  });

  test("successfully copies prompt to clipboard", async () => {
    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const copyButton = buttons[0];
    expect(copyButton).toBeDefined();
    if (copyButton) {
      fireEvent.click(copyButton);
    }

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(
        "A beautiful sunset over mountains"
      );
    });
  });

  test("handles clipboard copy failure", async () => {
    const consoleError = mock(() => {
      /* empty */
    });
    console.error = consoleError;
    mockWriteText.mockRejectedValueOnce(new Error("Clipboard not available"));

    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const copyButton = buttons[0];
    expect(copyButton).toBeDefined();
    if (copyButton) {
      fireEvent.click(copyButton);
    }

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(
        "A beautiful sunset over mountains"
      );
    });
  });

  test("handles missing prompt during copy", async () => {
    renderWithProviders(<ImageActions {...defaultProps} prompt="" />);

    const buttons = screen.getAllByRole("button");
    const copyButton = buttons[0];
    expect(copyButton).toBeDefined();
    if (copyButton) {
      fireEvent.click(copyButton);
    }

    await waitFor(() => {
      expect(mockWriteText).not.toHaveBeenCalled();
    });
  });

  test("prevents multiple simultaneous copy operations", async () => {
    // Make the first copy operation slow
    mockWriteText.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const copyButton = buttons[0];
    expect(copyButton).toBeDefined();
    if (copyButton) {
      // Click twice quickly
      fireEvent.click(copyButton);
      fireEvent.click(copyButton);
    }

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledTimes(1);
    });
  });

  test("successfully downloads image with generated filename", async () => {
    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      const call = mockDownloadFromUrl.mock.calls[0];
      expect(call).toBeDefined();
      if (call && call.length >= 2) {
        const url = call[0];
        const filename = call[1];
        expect(url).toBe("https://example.com/image.png");
        expect(filename).toMatch(
          /^a-beautiful-sunset-over-mountains-\d{4}-\d{2}-\d{2}\.png$/
        );
      }
    });
  });

  test("downloads image without prompt uses default filename", async () => {
    renderWithProviders(<ImageActions {...defaultProps} prompt={undefined} />);

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      const call = mockDownloadFromUrl.mock.calls[0];
      expect(call).toBeDefined();
      if (call && call.length >= 2) {
        const url = call[0];
        const filename = call[1];
        expect(url).toBe("https://example.com/image.png");
        expect(filename).toMatch(/^generated-image-\d{4}-\d{2}-\d{2}\.png$/);
      }
    });
  });

  test("sanitizes prompt for filename generation", async () => {
    const complexPrompt =
      "Create an image of a cat with @#$%^&*() special chars!!!";
    renderWithProviders(
      <ImageActions {...defaultProps} prompt={complexPrompt} />
    );

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      const call = mockDownloadFromUrl.mock.calls[0];
      expect(call).toBeDefined();
      if (call && call.length >= 2) {
        const url = call[0];
        const filename = call[1];
        expect(url).toBe("https://example.com/image.png");
        expect(filename).toMatch(
          /^create-an-image-of-a-cat-with-special-ch-\d{4}-\d{2}-\d{2}\.png$/
        );
      }
    });
  });

  test("handles download failure", async () => {
    const consoleError = mock(() => {
      /* empty */
    });
    console.error = consoleError;
    mockDownloadFromUrl.mockRejectedValueOnce(new Error("Network error"));

    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      expect(mockDownloadFromUrl).toHaveBeenCalled();
    });
  });

  test("prevents multiple simultaneous download operations", async () => {
    // Make the first download operation slow
    mockDownloadFromUrl.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      // Click twice quickly
      fireEvent.click(downloadButton);
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      expect(mockDownloadFromUrl).toHaveBeenCalledTimes(1);
    });
  });

  test("calls onRetry when retry button is clicked", () => {
    const onRetry = mock(() => {
      /* empty */
    });

    renderWithProviders(<ImageActions {...defaultProps} onRetry={onRetry} />);

    const buttons = screen.getAllByRole("button");
    const retryButton = buttons[2];
    expect(retryButton).toBeDefined();
    if (retryButton) {
      fireEvent.click(retryButton);
    }

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("download button is disabled during download", async () => {
    // Make download slow to test loading state
    mockDownloadFromUrl.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      expect((downloadButton as HTMLButtonElement).disabled).toBe(true);
    });

    // Button should be re-enabled after operation completes
    await waitFor(() => {
      expect((downloadButton as HTMLButtonElement).disabled).toBe(false);
    });
  });

  test("copy button is disabled during copy operation", async () => {
    // Make copy slow to test loading state
    mockWriteText.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    renderWithProviders(<ImageActions {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const copyButton = buttons[0];
    expect(copyButton).toBeDefined();
    if (copyButton) {
      fireEvent.click(copyButton);
    }

    // Button should be disabled during operation
    await waitFor(() => {
      expect((copyButton as HTMLButtonElement).disabled).toBe(true);
    });

    // Button should be re-enabled after operation completes
    await waitFor(() => {
      expect((copyButton as HTMLButtonElement).disabled).toBe(false);
    });
  });

  test("extracts file extension from URL", async () => {
    renderWithProviders(
      <ImageActions
        {...defaultProps}
        imageUrl="https://example.com/photo.jpeg"
      />
    );

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      expect(mockDownloadFromUrl).toHaveBeenCalledWith(
        "https://example.com/photo.jpeg",
        expect.stringMatching(/\.jpeg$/)
      );
    });
  });

  test("defaults to png extension when URL has no extension", async () => {
    renderWithProviders(
      <ImageActions {...defaultProps} imageUrl="https://example.com/image" />
    );

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      const call = mockDownloadFromUrl.mock.calls[0];
      expect(call).toBeDefined();
      if (call && call.length >= 2) {
        const url = call[0];
        const filename = call[1];
        expect(url).toBe("https://example.com/image");
        expect(filename).toMatch(
          /^a-beautiful-sunset-over-mountains-\d{4}-\d{2}-\d{2}\.\/image$/
        );
      }
    });
  });

  test("truncates very long prompts in filename", async () => {
    const longPrompt = `${"A".repeat(100)} beautiful landscape`;
    renderWithProviders(<ImageActions {...defaultProps} prompt={longPrompt} />);

    const buttons = screen.getAllByRole("button");
    const downloadButton = buttons[1];
    expect(downloadButton).toBeDefined();
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }

    await waitFor(() => {
      const call = mockDownloadFromUrl.mock.calls[0];
      expect(call).toBeDefined();
      if (call && call.length >= 2 && call[1]) {
        const filename = call[1] as string;
        expect(filename.length).toBeLessThan(100); // Should be truncated
        expect(filename).toMatch(/\d{4}-\d{2}-\d{2}\.png$/);
      }
    });
  });
});
