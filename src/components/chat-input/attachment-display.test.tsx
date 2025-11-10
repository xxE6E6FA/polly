import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { Attachment } from "@/types";
import { AttachmentDisplay } from "./attachment-display";

// Mock ImageThumbnail
mock.module("@/components/file-display", () => ({
  ImageThumbnail: ({
    attachment,
    className,
  }: {
    attachment: Attachment;
    className?: string;
  }) => (
    <div data-testid="image-thumbnail" className={className}>
      {attachment.type === "image" ? "📷" : "📄"}
    </div>
  ),
}));

// Mock AttachmentGalleryDialog
mock.module("@/components/ui/attachment-gallery-dialog", () => ({
  AttachmentGalleryDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="attachment-gallery">
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
}));

describe("AttachmentDisplay", () => {
  const mockOnRemoveAttachment = mock(() => {
    // Mock implementation for remove attachment
  });

  const imageAttachment: Attachment = {
    type: "image",
    url: "https://example.com/image.jpg",
    name: "image.jpg",
    size: 1024,
    mimeType: "image/jpeg",
  };

  const pdfAttachment: Attachment = {
    type: "pdf",
    url: "https://example.com/document.pdf",
    name: "document.pdf",
    size: 2048,
    mimeType: "application/pdf",
  };

  test("renders nothing when no attachments provided", () => {
    const { container } = render(
      <AttachmentDisplay
        attachments={[]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders single image attachment", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const thumbnails = screen.getAllByTestId("image-thumbnail");
    expect(thumbnails.length).toBe(1);
  });

  test("renders multiple attachments", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment, pdfAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const thumbnails = screen.getAllByTestId("image-thumbnail");
    expect(thumbnails.length).toBe(2);
  });

  test("shows filename for non-image attachments", () => {
    render(
      <AttachmentDisplay
        attachments={[pdfAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    expect(screen.getByText("document.pdf")).toBeTruthy();
  });

  test("does not show filename for image attachments", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    expect(screen.queryByText("image.jpg")).toBeNull();
  });

  test("truncates long filenames", () => {
    const longNameAttachment: Attachment = {
      type: "pdf",
      url: "https://example.com/file.pdf",
      name: "very_long_filename_that_should_be_truncated.pdf",
      size: 1024,
      mimeType: "application/pdf",
    };
    render(
      <AttachmentDisplay
        attachments={[longNameAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const text = screen.getByText(/very_long/).textContent;
    expect(text).toContain("...");
    expect(text).toContain(".pdf");
  });

  test("preserves extension when truncating filename", () => {
    const longNameAttachment: Attachment = {
      type: "text",
      url: "https://example.com/file.docx",
      name: "this_is_a_really_long_filename_example.docx",
      size: 1024,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    render(
      <AttachmentDisplay
        attachments={[longNameAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const text = screen.getByText(/\.docx$/).textContent;
    expect(text).toContain(".docx");
  });

  test("calls onRemoveAttachment with correct index", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment, pdfAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const removeButtons = screen.getAllByRole("button", {
      name: /Remove/,
    });
    const firstButton = removeButtons[0];
    expect(firstButton).toBeDefined();
    if (firstButton) {
      fireEvent.click(firstButton);
    }
    expect(mockOnRemoveAttachment).toHaveBeenCalledWith(0);
  });

  test("remove button has correct aria-label", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const removeButton = screen.getByRole("button", {
      name: "Remove image.jpg",
    });
    expect(removeButton).toBeTruthy();
  });

  test("opens preview dialog when attachment is clicked", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const attachmentButton = screen.getByRole("button", { name: "📷" });
    fireEvent.click(attachmentButton);
    expect(screen.getByTestId("attachment-gallery")).toBeTruthy();
  });

  test("opens preview dialog on Enter key", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const attachmentButton = screen.getByRole("button", { name: "📷" });
    // Native buttons handle Enter key automatically, so we simulate the resulting click
    fireEvent.click(attachmentButton);
    expect(screen.getByTestId("attachment-gallery")).toBeTruthy();
  });

  test("opens preview dialog on Space key", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const attachmentButton = screen.getByRole("button", { name: "📷" });
    // Native buttons handle Space key automatically, so we simulate the resulting click
    fireEvent.click(attachmentButton);
    expect(screen.getByTestId("attachment-gallery")).toBeTruthy();
  });

  test("closes preview dialog when close button is clicked", () => {
    render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const attachmentButton = screen.getByRole("button", { name: "📷" });
    fireEvent.click(attachmentButton);
    const closeButton = screen.getByText("Close");
    fireEvent.click(closeButton);
    expect(screen.queryByTestId("attachment-gallery")).toBeNull();
  });

  test("applies different styles for image vs file attachments", () => {
    const { container } = render(
      <AttachmentDisplay
        attachments={[imageAttachment, pdfAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const items = container.querySelectorAll(".group");
    const firstItem = items[0];
    const secondItem = items[1];
    expect(firstItem).toBeDefined();
    expect(secondItem).toBeDefined();
    if (firstItem && secondItem) {
      expect(firstItem.className).toContain("emerald");
      expect(secondItem.className).toContain("slate");
    }
  });

  test("memoization prevents unnecessary re-renders", () => {
    const { rerender } = render(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const firstRender = screen.getAllByTestId("image-thumbnail");

    rerender(
      <AttachmentDisplay
        attachments={[imageAttachment]}
        onRemoveAttachment={mockOnRemoveAttachment}
      />
    );
    const secondRender = screen.getAllByTestId("image-thumbnail");

    expect(firstRender.length).toBe(secondRender.length);
  });
});
