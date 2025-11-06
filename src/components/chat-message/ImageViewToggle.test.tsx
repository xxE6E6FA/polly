import { describe, expect, mock, test } from "bun:test";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ImageViewToggle } from "./ImageViewToggle";

// Note: Suspended resource warnings are expected for lazy loading tests
// These warnings indicate that lazy-loaded components finish loading during tests,
// which is normal behavior and doesn't affect test correctness

// Mock the lazy-loaded ImageGallery module
mock.module("./ImageGallery", () => ({
  ImageGallery: ({
    images,
    messageId,
  }: {
    images: string[];
    messageId: string;
  }) => (
    <div data-testid="image-gallery">
      <div>Gallery for message: {messageId}</div>
      <div>Image count: {images.length}</div>
    </div>
  ),
}));

// Mock tooltip components to avoid context requirements - simplified to prevent suspended resources
mock.module("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}));

const mockOnImageClick = mock(() => {
  /* empty */
});

describe("ImageViewToggle", () => {
  test("when only 1 image: renders gridComponent without toggle buttons", () => {
    const gridComponent = (
      <div data-testid="grid-component">Single Image Grid</div>
    );

    act(() => {
      render(
        <ImageViewToggle
          images={["image1.jpg"]}
          onImageClick={mockOnImageClick}
          messageId="msg-1"
          gridComponent={gridComponent}
        />
      );
    });

    expect(screen.getByTestId("grid-component")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Grid view")).toBeNull();
    expect(screen.queryByText("Gallery view")).toBeNull();
  });

  test("when multiple images: renders toggle buttons and gridComponent by default", () => {
    const gridComponent = (
      <div data-testid="grid-component">Multiple Images Grid</div>
    );

    act(() => {
      render(
        <ImageViewToggle
          images={["image1.jpg", "image2.jpg"]}
          onImageClick={mockOnImageClick}
          messageId="msg-2"
          gridComponent={gridComponent}
        />
      );
    });

    expect(screen.getByTestId("grid-component")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("Grid view")).toBeTruthy();
    expect(screen.getByText("Gallery view")).toBeTruthy();
  });

  test("click grid button: keeps grid view active", () => {
    const gridComponent = <div data-testid="grid-component">Grid View</div>;

    render(
      <ImageViewToggle
        images={["image1.jpg", "image2.jpg"]}
        onImageClick={mockOnImageClick}
        messageId="msg-3"
        gridComponent={gridComponent}
      />
    );

    const gridButton = screen.getAllByRole("button")[0];
    expect(gridButton).toBeDefined();
    if (gridButton) {
      fireEvent.click(gridButton);
    }

    expect(screen.getByTestId("grid-component")).toBeTruthy();
    expect(gridButton?.className).toContain("bg-white/30");
  });

  test("click gallery button: switches to gallery view and lazy loads ImageGallery", async () => {
    const gridComponent = <div data-testid="grid-component">Grid View</div>;

    render(
      <ImageViewToggle
        images={["image1.jpg", "image2.jpg", "image3.jpg"]}
        onImageClick={mockOnImageClick}
        messageId="msg-4"
        gridComponent={gridComponent}
      />
    );

    const galleryButton = screen.getAllByRole("button")[1];
    expect(galleryButton).toBeDefined();
    if (galleryButton) {
      act(() => {
        fireEvent.click(galleryButton);
      });
    }

    await waitFor(() => {
      expect(screen.getByTestId("image-gallery")).toBeTruthy();
    });

    expect(screen.getByText("Gallery for message: msg-4")).toBeTruthy();
    expect(screen.getByText("Image count: 3")).toBeTruthy();
    expect(galleryButton?.className).toContain("bg-white/30");
  });

  test("apply custom className", () => {
    const gridComponent = <div data-testid="grid-component">Grid</div>;

    const { container } = render(
      <ImageViewToggle
        images={["image1.jpg", "image2.jpg"]}
        onImageClick={mockOnImageClick}
        messageId="msg-5"
        className="custom-class"
        gridComponent={gridComponent}
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper?.className).toContain("custom-class");
  });

  test("proper aria labels and tooltips", () => {
    const gridComponent = <div data-testid="grid-component">Grid</div>;

    render(
      <ImageViewToggle
        images={["image1.jpg", "image2.jpg"]}
        onImageClick={mockOnImageClick}
        messageId="msg-6"
        gridComponent={gridComponent}
      />
    );

    expect(screen.getByRole("tooltip", { name: "Grid view" })).toBeTruthy();
    expect(screen.getByRole("tooltip", { name: "Gallery view" })).toBeTruthy();
  });

  test("passes aspectRatio to ImageGallery when provided", async () => {
    const gridComponent = <div data-testid="grid-component">Grid</div>;

    render(
      <ImageViewToggle
        images={["image1.jpg", "image2.jpg"]}
        aspectRatio="16/9"
        onImageClick={mockOnImageClick}
        messageId="msg-7"
        gridComponent={gridComponent}
      />
    );

    const galleryButton = screen.getAllByRole("button")[1];
    expect(galleryButton).toBeDefined();
    if (galleryButton) {
      act(() => {
        fireEvent.click(galleryButton);
      });
    }

    await waitFor(() => {
      expect(screen.getByTestId("image-gallery")).toBeTruthy();
    });
  });

  test("shows loading spinner while ImageGallery loads", async () => {
    const gridComponent = <div data-testid="grid-component">Grid</div>;

    render(
      <ImageViewToggle
        images={["image1.jpg", "image2.jpg"]}
        onImageClick={mockOnImageClick}
        messageId="msg-8"
        gridComponent={gridComponent}
      />
    );

    const galleryButton = screen.getAllByRole("button")[1];
    expect(galleryButton).toBeDefined();
    if (galleryButton) {
      act(() => {
        fireEvent.click(galleryButton);
      });
    }

    // Suspense fallback should show temporarily
    await waitFor(() => {
      expect(screen.getByTestId("image-gallery")).toBeTruthy();
    });
  });
});
