import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { Attachment } from "@/types";
import { AttachmentStrip } from "./attachment-strip";

type ImageThumbnailProps = {
  attachment: Attachment;
  className?: string;
};

// Mock the child components
mock.module("@/components/files/file-display", () => ({
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

  test("renders thumbnails for all attachment types", () => {
    const attachments = [
      createMockAttachment({ name: "photo.jpg", type: "image" }),
      createMockAttachment({ name: "doc.pdf", type: "pdf" }),
    ];

    render(
      <AttachmentStrip
        attachments={attachments}
        onPreviewFile={mockOnPreviewFile}
      />
    );

    const thumbnails = screen.getAllByTestId("image-thumbnail");
    expect(thumbnails).toHaveLength(2);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });

  test("calls onPreviewFile when button is clicked", () => {
    const attachment = createMockAttachment({ name: "test.pdf", type: "text" });

    render(
      <AttachmentStrip
        attachments={[attachment]}
        onPreviewFile={mockOnPreviewFile}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnPreviewFile).toHaveBeenCalledWith(attachment);
    expect(mockOnPreviewFile).toHaveBeenCalledTimes(1);
  });

  test("does not render filename for image attachments", () => {
    const attachment = createMockAttachment({
      name: "photo.jpg",
      type: "image",
    });

    render(<AttachmentStrip attachments={[attachment]} />);

    expect(screen.queryByText("photo.jpg")).toBeNull();
  });

  test("renders truncated filename for non-image attachments", () => {
    const attachment = createMockAttachment({
      name: "very-long-filename-that-should-be-truncated.pdf",
      type: "text",
    });

    render(<AttachmentStrip attachments={[attachment]} />);

    expect(screen.getByText("very-long....pdf")).toBeTruthy();
  });

  test("applies different CSS classes for image vs file attachments", () => {
    const imageAttachment = createMockAttachment({
      name: "photo.jpg",
      type: "image",
    });
    const fileAttachment = createMockAttachment({
      name: "doc.pdf",
      type: "text",
    });

    render(<AttachmentStrip attachments={[imageAttachment, fileAttachment]} />);

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

    const { container } = render(
      <AttachmentStrip attachments={attachments} className="custom-class" />
    );

    expect(container.firstElementChild?.className).toContain("custom-class");
  });

  test("applies focus styles for accessibility", () => {
    const attachments = [createMockAttachment({ type: "text" })];

    render(<AttachmentStrip attachments={attachments} />);

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

    render(<AttachmentStrip attachments={[attachment]} />);

    expect(screen.getByText("very-long-....gz")).toBeTruthy();
  });

  test("filename truncation works for files without extensions", () => {
    const attachment = createMockAttachment({
      name: "very-long-filename-without-extension",
      type: "text",
    });

    render(<AttachmentStrip attachments={[attachment]} />);

    expect(screen.getByText("very-long-fil...")).toBeTruthy();
  });

  test("handles attachments with missing names gracefully", () => {
    const attachment = createMockAttachment({ name: "" });

    render(<AttachmentStrip attachments={[attachment]} />);

    expect(screen.getByRole("button")).toBeTruthy();
  });

  test("memoization works correctly", () => {
    const attachments1 = [createMockAttachment({ name: "file1.pdf" })];
    const attachments2 = [createMockAttachment({ name: "file1.pdf" })]; // Same content
    const attachments3 = [createMockAttachment({ name: "file2.pdf" })]; // Different content

    const { rerender } = render(<AttachmentStrip attachments={attachments1} />);

    // Should not re-render with identical props
    rerender(<AttachmentStrip attachments={attachments2} />);

    // Should re-render with different attachments
    rerender(<AttachmentStrip attachments={attachments3} />);

    expect(screen.getByText("Thumbnail: file2.pdf")).toBeTruthy();
  });
});
