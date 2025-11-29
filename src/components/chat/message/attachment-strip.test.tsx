import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { Attachment } from "@/types";
import { AttachmentStrip } from "./attachment-strip";

type FileDisplayProps = {
  attachment: Attachment;
  className?: string;
  onClick?: () => void;
};

type ImageThumbnailProps = {
  attachment: Attachment;
  className?: string;
};

// Mock the child components
mock.module("@/components/files/file-display", () => ({
  FileDisplay: ({ attachment, onClick }: FileDisplayProps) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Test mock component
    <div
      data-testid="file-display"
      data-attachment-name={attachment.name}
      onClick={onClick}
    >
      File: {attachment.name}
    </div>
  ),
  ImageThumbnail: ({ attachment, className }: ImageThumbnailProps) => (
    <div
      data-testid="image-thumbnail"
      data-attachment-name={attachment.name}
      className={className}
    >
      Thumbnail: {attachment.name}
    </div>
  ),
}));

const createMockAttachment = (
  overrides: Partial<Attachment> = {}
): Attachment => ({
  type: "pdf" as const,
  name: "document.pdf",
  url: "https://example.com/document.pdf",
  size: 1024,
  ...overrides,
});

describe("AttachmentStrip", () => {
  const mockOnPreviewFile = mock(() => {
    /* empty */
  });

  beforeEach(() => {
    mockOnPreviewFile.mockClear();
  });

  test("renders nothing when no attachments provided", () => {
    const { container } = render(<AttachmentStrip />);
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when empty attachments array provided", () => {
    const { container } = render(<AttachmentStrip attachments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders user variant with FileDisplay components", () => {
    const attachments = [
      createMockAttachment({ name: "file1.pdf", type: "pdf" }),
      createMockAttachment({ name: "file2.docx", type: "text" }),
    ];

    render(
      <AttachmentStrip
        attachments={attachments}
        variant="user"
        onPreviewFile={mockOnPreviewFile}
      />
    );

    const fileDisplays = screen.getAllByTestId("file-display");
    expect(fileDisplays).toHaveLength(2);
    const firstDisplay = fileDisplays[0];
    const secondDisplay = fileDisplays[1];
    expect(firstDisplay?.getAttribute("data-attachment-name")).toBe(
      "file1.pdf"
    );
    expect(secondDisplay?.getAttribute("data-attachment-name")).toBe(
      "file2.docx"
    );
  });

  test("renders assistant variant with custom buttons and thumbnails", () => {
    const attachments = [
      createMockAttachment({ name: "image.jpg", type: "image" }),
      createMockAttachment({ name: "document.pdf", type: "pdf" }),
    ];

    render(
      <AttachmentStrip
        attachments={attachments}
        variant="assistant"
        onPreviewFile={mockOnPreviewFile}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);

    // Check for image thumbnails
    const thumbnails = screen.getAllByTestId("image-thumbnail");
    expect(thumbnails).toHaveLength(2);
  });

  test("defaults to user variant", () => {
    const attachments = [createMockAttachment()];

    render(<AttachmentStrip attachments={attachments} />);

    expect(screen.getByTestId("file-display")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("calls onPreviewFile when file display is clicked in user variant", () => {
    const attachment = createMockAttachment({ name: "test.pdf" });
    const attachments = [attachment];

    render(
      <AttachmentStrip
        attachments={attachments}
        variant="user"
        onPreviewFile={mockOnPreviewFile}
      />
    );

    const fileDisplay = screen.getByTestId("file-display");
    fireEvent.click(fileDisplay);

    expect(mockOnPreviewFile).toHaveBeenCalledWith(attachment);
    expect(mockOnPreviewFile).toHaveBeenCalledTimes(1);
  });

  test("calls onPreviewFile when button is clicked in assistant variant", () => {
    const attachment = createMockAttachment({ name: "test.pdf", type: "text" });
    const attachments = [attachment];

    render(
      <AttachmentStrip
        attachments={attachments}
        variant="assistant"
        onPreviewFile={mockOnPreviewFile}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnPreviewFile).toHaveBeenCalledWith(attachment);
    expect(mockOnPreviewFile).toHaveBeenCalledTimes(1);
  });

  test("does not render filename for image attachments in assistant variant", () => {
    const attachment = createMockAttachment({
      name: "photo.jpg",
      type: "image",
    });
    const attachments = [attachment];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    // Should not contain the filename text in the rendered output
    expect(screen.queryByText("photo.jpg")).toBeNull();
  });

  test("renders truncated filename for non-image attachments in assistant variant", () => {
    const attachment = createMockAttachment({
      name: "very-long-filename-that-should-be-truncated.pdf",
      type: "text",
    });
    const attachments = [attachment];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    // Should show truncated version
    expect(screen.getByText("very-long....pdf")).toBeTruthy();
  });

  test("applies different CSS classes for image vs file attachments in assistant variant", () => {
    const imageAttachment = createMockAttachment({
      name: "photo.jpg",
      type: "image",
    });
    const fileAttachment = createMockAttachment({
      name: "doc.pdf",
      type: "text",
    });
    const attachments = [imageAttachment, fileAttachment];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    const buttons = screen.getAllByRole("button");
    const firstButton = buttons[0];
    const secondButton = buttons[1];
    // Image attachments have no padding
    expect(firstButton?.className).toContain("p-0");
    // File attachments have muted background and padding
    expect(secondButton?.className).toContain("bg-muted/50");
    expect(secondButton?.className).toContain("pl-2");
  });

  test("applies custom className", () => {
    const attachments = [createMockAttachment()];

    render(
      <AttachmentStrip
        attachments={attachments}
        variant="user"
        className="custom-class"
      />
    );

    const container = screen.getByTestId("file-display").parentElement;
    expect(container?.className).toContain("custom-class");
  });

  test("applies focus styles for accessibility", () => {
    const attachments = [createMockAttachment({ type: "text" })];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    const button = screen.getByRole("button");
    expect(button.className).toContain("focus-visible:outline-none");
    expect(button.className).toContain("focus-visible:ring-2");
    expect(button.className).toContain("focus-visible:ring-ring");
    expect(button.className).toContain("focus-visible:ring-offset-2");
  });

  test("filename truncation preserves file extension", () => {
    const attachment = createMockAttachment({
      name: "very-long-filename-with-multiple-extensions.tar.gz",
      type: "text",
    });
    const attachments = [attachment];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    // Should preserve the last extension part
    expect(screen.getByText("very-long-....gz")).toBeTruthy();
  });

  test("filename truncation works for files without extensions", () => {
    const attachment = createMockAttachment({
      name: "very-long-filename-without-extension",
      type: "text",
    });
    const attachments = [attachment];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    // Should still truncate but without extension
    expect(screen.getByText("very-long-fil...")).toBeTruthy();
  });

  test("handles attachments with missing names gracefully", () => {
    const attachment = createMockAttachment({ name: "" });
    const attachments = [attachment];

    render(<AttachmentStrip attachments={attachments} variant="assistant" />);

    // Should still render without crashing
    expect(screen.getByRole("button")).toBeTruthy();
  });

  test("memoization works correctly", () => {
    const attachments1 = [createMockAttachment({ name: "file1.pdf" })];
    const attachments2 = [createMockAttachment({ name: "file1.pdf" })]; // Same content
    const attachments3 = [createMockAttachment({ name: "file2.pdf" })]; // Different content

    const { rerender } = render(
      <AttachmentStrip attachments={attachments1} variant="user" />
    );

    // Should not re-render with identical props
    rerender(<AttachmentStrip attachments={attachments2} variant="user" />);

    // Should re-render with different attachments
    rerender(<AttachmentStrip attachments={attachments3} variant="user" />);

    expect(screen.getByText("File: file2.pdf")).toBeTruthy();
  });

  test("memoization detects variant changes", () => {
    const attachments = [createMockAttachment()];

    const { rerender } = render(
      <AttachmentStrip attachments={attachments} variant="user" />
    );

    // Should re-render when variant changes
    rerender(<AttachmentStrip attachments={attachments} variant="assistant" />);

    expect(screen.getByRole("button")).toBeTruthy();
    expect(screen.queryByTestId("file-display")).toBeNull();
  });
});
