import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useRef, useState } from "react";
import { useBreakpointColumns } from "@/hooks/use-breakpoint-columns";
import type { CanvasFilterMode } from "@/stores/canvas-store";
import type { CanvasImage } from "@/types";
import { CanvasGridCard } from "./canvas-grid-card";
import { CanvasImageViewer } from "./canvas-image-viewer";

type CanvasMasonryGridProps = {
  filterMode: CanvasFilterMode;
};

export function CanvasMasonryGrid({ filterMode }: CanvasMasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useBreakpointColumns(containerRef);

  // Canvas generations
  const canvasData = useQuery(
    api.generations.listGenerations,
    filterMode !== "conversations" ? {} : "skip"
  );

  // Conversation images
  const conversationImages = useQuery(
    api.fileStorage.listGeneratedImages,
    filterMode !== "canvas" ? {} : "skip"
  );

  // Merge and normalize both sources
  const allImages: CanvasImage[] = [];

  if (filterMode !== "conversations" && canvasData?.generations) {
    for (const gen of canvasData.generations) {
      if (gen.status === "succeeded" && gen.imageUrls.length > 0) {
        // Create one CanvasImage per output image
        for (const url of gen.imageUrls) {
          allImages.push({
            id: `canvas-${gen._id}-${url}`,
            source: "canvas",
            imageUrl: url,
            prompt: gen.prompt,
            model: gen.model,
            status: gen.status,
            seed: gen.params?.seed,
            duration: gen.duration,
            createdAt: gen.createdAt,
            aspectRatio: gen.params?.aspectRatio,
            generationId: gen._id,
            batchId: gen.batchId,
          });
        }
      } else {
        // Pending/failed — show as placeholder
        allImages.push({
          id: `canvas-${gen._id}`,
          source: "canvas",
          imageUrl: "",
          prompt: gen.prompt,
          model: gen.model,
          status: gen.status,
          seed: gen.params?.seed,
          duration: gen.duration,
          createdAt: gen.createdAt,
          aspectRatio: gen.params?.aspectRatio,
          generationId: gen._id,
          batchId: gen.batchId,
        });
      }
    }
  }

  if (filterMode !== "canvas" && conversationImages) {
    for (const file of conversationImages) {
      if (file.url) {
        allImages.push({
          id: `conv-${file._id}`,
          source: "conversation",
          imageUrl: file.url,
          prompt: file.generatedImagePrompt,
          model: file.generatedImageModel,
          status: "succeeded",
          createdAt: file.createdAt,
          messageId: file.messageId,
          conversationId: file.conversationId,
        });
      }
    }
  }

  // Sort by createdAt desc
  allImages.sort((a, b) => b.createdAt - a.createdAt);

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Only succeeded images with URLs are viewable
  const succeededImages = allImages.filter(
    img => img.status === "succeeded" && img.imageUrl
  );

  const handleImageClick = (image: CanvasImage) => {
    const idx = succeededImages.findIndex(img => img.id === image.id);
    if (idx >= 0) {
      setViewerIndex(idx);
      setViewerOpen(true);
    }
  };

  if (allImages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex h-full items-center justify-center text-muted-foreground"
      >
        <p className="text-sm">
          {filterMode === "conversations"
            ? "No conversation images yet."
            : "No images yet. Generate your first image!"}
        </p>
      </div>
    );
  }

  // Distribute items row-major across columns so newest items
  // land top-left and read left-to-right, row by row.
  const columns: CanvasImage[][] = Array.from(
    { length: columnCount },
    () => []
  );
  for (let i = 0; i < allImages.length; i++) {
    const image = allImages[i];
    if (image) {
      columns[i % columnCount]?.push(image);
    }
  }

  return (
    <div ref={containerRef} className="flex items-start gap-4">
      {columns.map((col, colIdx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable column layout, index is the only meaningful key
        <div key={colIdx} className="flex flex-1 flex-col gap-4">
          {col.map(image => (
            <CanvasGridCard
              key={image.id}
              image={image}
              onClick={
                image.status === "succeeded" && image.imageUrl
                  ? () => handleImageClick(image)
                  : undefined
              }
            />
          ))}
        </div>
      ))}

      <CanvasImageViewer
        images={succeededImages}
        currentIndex={viewerIndex}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onIndexChange={setViewerIndex}
      />
    </div>
  );
}
