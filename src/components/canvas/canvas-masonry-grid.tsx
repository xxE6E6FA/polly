import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  DownloadSimpleIcon,
  TrashSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type RefObject, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useArchiveGeneration } from "@/hooks/use-archive-generation";
import { useBreakpointColumns } from "@/hooks/use-breakpoint-columns";
import { useVirtualizedPaginatedQuery } from "@/hooks/use-virtualized-paginated-query";
import { downloadFromUrl, generateImageFilename } from "@/lib/export";
import { useToast } from "@/providers/toast-context";
import type { CanvasFilterMode } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasImage, GenerationStatus, UpscaleEntry } from "@/types";
import { CanvasGridCard } from "./canvas-grid-card";
import { CanvasImageViewer } from "./canvas-image-viewer";

/** Shape of an enriched generation from the paginated query */
type PaginatedGeneration = {
  _id: Id<"generations">;
  prompt: string;
  model: string;
  status: GenerationStatus;
  createdAt: number;
  duration?: number;
  error?: string;
  batchId?: string;
  parentGenerationId?: Id<"generations">;
  rootGenerationId?: Id<"generations">;
  isArchived?: boolean;
  params?: {
    aspectRatio?: string;
    seed?: number;
    quality?: number;
    referenceImageIds?: Id<"_storage">[];
  };
  imageUrls: string[];
  upscales: (UpscaleEntry & { isArchived?: boolean })[];
  editCount: number;
  referenceImageUrls: string[];
};

type CanvasMasonryGridProps = {
  filterMode: CanvasFilterMode;
  scrollContainerRef?: RefObject<HTMLElement | null>;
};

export function CanvasMasonryGrid({
  filterMode,
  scrollContainerRef,
}: CanvasMasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useBreakpointColumns(containerRef);
  const managedToast = useToast();
  const { isAuthenticated } = useConvexAuth();

  // Image viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const deleteGeneration = useMutation(api.generations.deleteGeneration);
  const { archiveGeneration, unarchiveGeneration } = useArchiveGeneration();
  const selectedImageIds = useCanvasStore(s => s.selectedImageIds);
  const clearImageSelection = useCanvasStore(s => s.clearImageSelection);

  // Canvas and conversation images are kept completely separate to avoid
  // column redistribution when paginated canvas results grow.
  const isConversationView = filterMode === "conversations";

  // Skip queries until Convex auth resolves — otherwise the server returns
  // { page: [], isDone: true } (no userId), which the client interprets as
  // "no data" and briefly flashes the empty state before real results arrive.
  const skipCanvas = isConversationView || !isAuthenticated;
  const skipConversation = !(isConversationView && isAuthenticated);

  // Canvas generations (paginated)
  const {
    results: canvasGenerations,
    isLoading: isLoadingCanvas,
    status: paginationStatus,
  } = useVirtualizedPaginatedQuery<PaginatedGeneration>({
    query: api.generations.listGenerationsPaginated,
    queryArgs: skipCanvas ? "skip" : {},
    initialNumItems: 50,
    loadMoreCount: 30,
    scrollContainerRef,
  });

  // Conversation images (non-paginated, capped at 100)
  const conversationImages = useQuery(
    api.fileStorage.listGeneratedImages,
    skipConversation ? "skip" : {}
  );

  // Build the image list from a single source based on filterMode
  const allImages: CanvasImage[] = [];

  if (isConversationView) {
    // Conversation-only view
    if (conversationImages) {
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
            upscales: [],
          });
        }
      }
    }
  } else if (canvasGenerations) {
    // Canvas-only views: all, canvas, upscaled, edits
    // Client-side filtering hides archived items (server-side would break pagination cursor stability)
    for (const gen of canvasGenerations) {
      if (gen.isArchived) {
        continue;
      }
      if (gen.status === "succeeded" && gen.imageUrls.length > 0) {
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
            quality: gen.params?.quality,
            generationId: gen._id,
            batchId: gen.batchId,
            parentGenerationId: gen.parentGenerationId,
            rootGenerationId: gen.rootGenerationId,
            editCount: gen.editCount,
            referenceImageUrls: gen.referenceImageUrls,
            upscales: gen.upscales
              .filter(u => !u.isArchived)
              .map(u => ({
                id: u.id,
                type: u.type,
                status: u.status,
                error: u.error,
                imageUrl: u.imageUrl,
                duration: u.duration,
                startedAt: u.startedAt,
                completedAt: u.completedAt,
              })),
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
          quality: gen.params?.quality,
          generationId: gen._id,
          batchId: gen.batchId,
          parentGenerationId: gen.parentGenerationId,
          rootGenerationId: gen.rootGenerationId,
          error: gen.error,
          upscales: [],
        });
      }
    }
  }

  // Client-side filtering for canvas sub-views
  if (filterMode === "upscaled") {
    const upscaled = allImages.filter(img =>
      img.upscales.some(u => u.status === "succeeded" && u.imageUrl)
    );
    allImages.length = 0;
    allImages.push(...upscaled);
  }

  if (filterMode === "edits") {
    const editTreeImages = allImages.filter(img => img.parentGenerationId);
    allImages.length = 0;
    allImages.push(...editTreeImages);
  }

  if (filterMode === "canvas") {
    const canvasOnly = allImages.filter(img => !img.parentGenerationId);
    allImages.length = 0;
    allImages.push(...canvasOnly);
  }

  // Build edit children map: rootGenerationId → sorted child edits
  const editChildrenMap = new Map<string, CanvasImage[]>();
  if (filterMode !== "edits" && filterMode !== "conversations") {
    for (const img of allImages) {
      if (
        img.parentGenerationId &&
        img.status !== "failed" &&
        img.status !== "canceled"
      ) {
        const rootId = img.rootGenerationId ?? img.parentGenerationId;
        if (rootId) {
          let children = editChildrenMap.get(rootId);
          if (!children) {
            children = [];
            editChildrenMap.set(rootId, children);
          }
          children.push(img);
        }
      }
    }
    for (const children of editChildrenMap.values()) {
      children.sort((a, b) => a.createdAt - b.createdAt);
    }
  }

  // Hide child edits from display (they appear in the filmstrip)
  const displayImages =
    filterMode === "edits" || filterMode === "conversations"
      ? allImages
      : allImages.filter(img => !img.parentGenerationId);

  // Build viewer list: display images + all edit children (for filmstrip clicks)
  const succeededImages: CanvasImage[] = [];
  for (const img of displayImages) {
    if (img.status === "succeeded" && img.imageUrl) {
      succeededImages.push(img);
      const children = img.generationId
        ? editChildrenMap.get(img.generationId)
        : undefined;
      if (children) {
        for (const child of children) {
          succeededImages.push(child);
        }
      }
    }
  }

  const handleImageClick = (image: CanvasImage, target?: CanvasImage) => {
    const toOpen = target ?? image;
    const idx = succeededImages.findIndex(img => img.id === toOpen.id);
    if (idx >= 0) {
      setViewerIndex(idx);
      setViewerOpen(true);
    }
  };

  const handleRequestDelete = useCallback(
    async (image: CanvasImage) => {
      if (!(image.source === "canvas" && image.generationId)) {
        return;
      }
      const genId = image.generationId;
      try {
        await archiveGeneration(genId);
        let undone = false;
        managedToast.success("Image deleted", {
          id: `delete-gen-${genId}`,
          duration: 5000,
          isUndo: true,
          action: {
            label: "Undo",
            onClick: () => {
              undone = true;
              unarchiveGeneration(genId);
            },
          },
          onAutoClose: async () => {
            if (!undone) {
              try {
                await deleteGeneration({ id: genId });
              } catch {
                // Already archived, permanent delete failed — acceptable
              }
            }
          },
        });
      } catch {
        managedToast.error("Failed to delete");
      }
    },
    [archiveGeneration, unarchiveGeneration, deleteGeneration, managedToast]
  );

  const handleBatchDownload = useCallback(async () => {
    const selected = allImages.filter(
      img =>
        selectedImageIds.has(img.id) &&
        img.status === "succeeded" &&
        img.imageUrl
    );
    if (selected.length === 0) {
      return;
    }

    let downloaded = 0;
    for (const img of selected) {
      try {
        const filename = generateImageFilename(
          img.imageUrl,
          img.prompt,
          String(downloaded + 1)
        );
        await downloadFromUrl(img.imageUrl, filename);
        downloaded++;
      } catch {
        // continue with remaining downloads
      }
    }
    managedToast.success(
      `${downloaded} image${downloaded === 1 ? "" : "s"} downloaded`
    );
  }, [selectedImageIds, managedToast]);

  const handleBatchDelete = useCallback(async () => {
    // Collect unique generationIds from selected images
    const seen = new Set<string>();
    const toArchive: Id<"generations">[] = [];
    for (const img of allImages) {
      if (
        selectedImageIds.has(img.id) &&
        img.source === "canvas" &&
        img.generationId &&
        !seen.has(img.generationId)
      ) {
        seen.add(img.generationId);
        toArchive.push(img.generationId);
      }
    }
    if (toArchive.length === 0) {
      return;
    }

    try {
      await Promise.all(toArchive.map(id => archiveGeneration(id)));
      clearImageSelection();

      let undone = false;
      const count = toArchive.length;
      managedToast.success(`${count} image${count === 1 ? "" : "s"} deleted`, {
        id: `delete-gen-batch-${Date.now()}`,
        duration: 5000,
        isUndo: true,
        action: {
          label: "Undo",
          onClick: () => {
            undone = true;
            for (const id of toArchive) {
              unarchiveGeneration(id);
            }
          },
        },
        onAutoClose: async () => {
          if (!undone) {
            try {
              await Promise.all(toArchive.map(id => deleteGeneration({ id })));
            } catch {
              // Acceptable — already archived
            }
          }
        },
      });
    } catch {
      managedToast.error("Failed to delete");
    }
  }, [
    selectedImageIds,
    archiveGeneration,
    unarchiveGeneration,
    deleteGeneration,
    clearImageSelection,
    managedToast,
  ]);

  // Count how many selected images are deletable (canvas-sourced)
  const selectedCount = selectedImageIds.size;
  const selectedDeletableCount = allImages.filter(
    img =>
      selectedImageIds.has(img.id) &&
      img.source === "canvas" &&
      img.generationId
  ).length;

  // Show skeleton while auth is pending or the first page is loading.
  // Since queries are skipped until auth resolves, isLoadingCanvas stays
  // true (LoadingFirstPage) until real data arrives — no false "Exhausted".
  const isLoading =
    !isAuthenticated ||
    (isConversationView ? conversationImages === undefined : isLoadingCanvas);

  if (isLoading) {
    const skeletonCount = columnCount * 4;
    const skeletonHeights = [180, 240, 200, 260, 220, 190, 250, 210];
    return (
      <div ref={containerRef} className="flex items-start gap-3">
        {Array.from({ length: columnCount }, (_, colIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
          <div key={colIdx} className="flex flex-1 flex-col gap-3">
            {Array.from(
              { length: Math.ceil(skeletonCount / columnCount) },
              (_, i) => (
                <Skeleton
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
                  key={i}
                  className="w-full rounded-xl"
                  style={{
                    height:
                      skeletonHeights[
                        (colIdx * 3 + i) % skeletonHeights.length
                      ],
                  }}
                />
              )
            )}
          </div>
        ))}
      </div>
    );
  }

  if (displayImages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex h-full items-center justify-center text-muted-foreground"
      >
        <p className="text-sm">
          {(() => {
            if (filterMode === "conversations") {
              return "No conversation images yet.";
            }
            if (filterMode === "edits") {
              return "No edited images yet.";
            }
            return "No images yet. Generate your first image!";
          })()}
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
  for (let i = 0; i < displayImages.length; i++) {
    const image = displayImages[i];
    if (image) {
      columns[i % columnCount]?.push(image);
    }
  }

  return (
    <>
      <div ref={containerRef} className="flex items-start gap-3">
        {columns.map((col, colIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable column layout, index is the only meaningful key
          <div key={colIdx} className="flex flex-1 flex-col gap-3">
            {col.map(image => (
              <CanvasGridCard
                key={image.id}
                image={image}
                editChildren={
                  image.generationId
                    ? editChildrenMap.get(image.generationId)
                    : undefined
                }
                onClick={
                  image.status === "succeeded" && image.imageUrl
                    ? (target?: CanvasImage) => handleImageClick(image, target)
                    : undefined
                }
                onRequestDelete={handleRequestDelete}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Invisible scroll sentinel — triggers loadMore when scrolled into view.
          Zero height so it never causes layout shift or visible spinners. */}
      {paginationStatus === "CanLoadMore" && (
        <div aria-hidden className="h-0 w-full" />
      )}

      {/* Batch action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-modal -translate-x-1/2 flex items-center gap-3 rounded-xl bg-card px-4 py-2.5 shadow-xl ring-1 ring-border/50 backdrop-blur-md dark:ring-white/[0.08]">
          <span className="text-sm font-medium tabular-nums">
            {selectedCount} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={handleBatchDownload}
          >
            <DownloadSimpleIcon className="size-4" />
            Download
          </Button>
          {selectedDeletableCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={handleBatchDelete}
            >
              <TrashSimpleIcon className="size-4" />
              Delete
            </Button>
          )}
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearImageSelection}
            aria-label="Clear selection"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      )}

      {/* Image viewer modal */}
      <CanvasImageViewer
        images={succeededImages}
        currentIndex={viewerIndex}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onIndexChange={setViewerIndex}
        onRequestDelete={handleRequestDelete}
      />
    </>
  );
}
