import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuotePreview } from "./quote-preview";

describe("QuotePreview", () => {
  const mockOnClear = mock(() => {
    // No-op mock for testing
  });

  test("renders quoted text without '>' markers", () => {
    render(<QuotePreview quote="> Hello world" onClear={mockOnClear} />);
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  test("strips multiple '>' markers from multiline quote", () => {
    const quote = "> Line one\n> Line two\n> Line three";
    render(<QuotePreview quote={quote} onClear={mockOnClear} />);
    const text = screen.getByText(/Line one/);
    expect(text.textContent).toBe("Line one\nLine two\nLine three");
  });

  test("preserves markdown formatting within quote", () => {
    const quote = "> This is **bold** text";
    render(<QuotePreview quote={quote} onClear={mockOnClear} />);
    expect(screen.getByText(/This is \*\*bold\*\* text/)).toBeTruthy();
  });

  test("renders icon and clear button", () => {
    render(<QuotePreview quote="> Test" onClear={mockOnClear} />);
    const clearButton = screen.getByRole("button", {
      name: "Remove quoted text",
    });
    expect(clearButton).toBeTruthy();
  });

  test("calls onClear when clear button is clicked", () => {
    render(<QuotePreview quote="> Test" onClear={mockOnClear} />);
    const clearButton = screen.getByRole("button", {
      name: "Remove quoted text",
    });
    fireEvent.click(clearButton);
    expect(mockOnClear).toHaveBeenCalledTimes(1);
  });

  test("applies custom className", () => {
    const { container } = render(
      <QuotePreview
        quote="> Test"
        onClear={mockOnClear}
        className="custom-class"
      />
    );
    const element = container.querySelector(".custom-class");
    expect(element).toBeTruthy();
  });

  test("has proper accessibility attributes", () => {
    render(<QuotePreview quote="> Test" onClear={mockOnClear} />);
    const note = screen.getByRole("note");
    expect(note.getAttribute("aria-label")).toBe("Quoted text");
  });

  test("handles empty quote gracefully", () => {
    render(<QuotePreview quote="" onClear={mockOnClear} />);
    const note = screen.getByRole("note");
    expect(note).toBeTruthy();
  });

  test("trims whitespace from quote", () => {
    render(<QuotePreview quote=">   Extra spaces   " onClear={mockOnClear} />);
    expect(screen.getByText("Extra spaces")).toBeTruthy();
  });
});
