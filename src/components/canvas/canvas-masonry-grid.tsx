import { api } from "@convex/_generated/api";
import {
  DownloadSimpleIcon,
  TrashSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useBreakpointColumns } from "@/hooks/use-breakpoint-columns";
import { downloadFromUrl, generateImageFilename } from "@/lib/export";
import { useToast } from "@/providers/toast-context";
import type { CanvasFilterMode } from "@/stores/canvas-store";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasImage } from "@/types";
import { CanvasGridCard } from "./canvas-grid-card";
import { CanvasImageViewer } from "./canvas-image-viewer";

type CanvasMasonryGridProps = {
  filterMode: CanvasFilterMode;
};

export function CanvasMasonryGrid({ filterMode }: CanvasMasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useBreakpointColumns(containerRef);
  const managedToast = useToast();

  // Image viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const deleteGeneration = useMutation(api.generations.deleteGeneration);
  const selectedImageIds = useCanvasStore(s => s.selectedImageIds);
  const clearImageSelection = useCanvasStore(s => s.clearImageSelection);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "single"; image: CanvasImage } | { type: "batch" } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Canvas generations
  const canvasData = useQuery(
    api.generations.listGenerations,
    filterMode !== "conversations" ? {} : "skip"
  );

  // Conversation images
  const conversationImages = useQuery(
    api.fileStorage.listGeneratedImages,
    filterMode !== "canvas" &&
      filterMode !== "upscaled" &&
      filterMode !== "edits"
      ? {}
      : "skip"
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
            quality: gen.params?.quality,
            generationId: gen._id,
            batchId: gen.batchId,
            parentGenerationId: gen.parentGenerationId,
            rootGenerationId: gen.rootGenerationId,
            editCount: gen.editCount,
            referenceImageUrls: gen.referenceImageUrls,
            upscales: gen.upscales.map(u => ({
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
          upscales: [],
        });
      }
    }
  }

  // Filter upscaled-only when requested
  if (filterMode === "upscaled") {
    const upscaled = allImages.filter(img =>
      img.upscales.some(u => u.status === "succeeded" && u.imageUrl)
    );
    allImages.length = 0;
    allImages.push(...upscaled);
  }

  // Filter edits-only: only child edits, not originals
  if (filterMode === "edits") {
    const editTreeImages = allImages.filter(img => img.parentGenerationId);
    allImages.length = 0;
    allImages.push(...editTreeImages);
  }

  // Sort by createdAt desc
  allImages.sort((a, b) => b.createdAt - a.createdAt);

  // Build edit children map: rootGenerationId → sorted child edits
  const editChildrenMap = new Map<string, CanvasImage[]>();
  if (filterMode !== "edits") {
    for (const img of allImages) {
      if (img.parentGenerationId && img.status === "succeeded") {
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
    // Sort each group by createdAt ascending (oldest first)
    for (const children of editChildrenMap.values()) {
      children.sort((a, b) => a.createdAt - b.createdAt);
    }
  }

  // Always hide child edits from display (they appear in the filmstrip)
  const displayImages =
    filterMode === "edits"
      ? allImages
      : allImages.filter(img => !img.parentGenerationId);

  // Build viewer list: display images + all edit children (for filmstrip clicks)
  const succeededImages: CanvasImage[] = [];
  for (const img of displayImages) {
    if (img.status === "succeeded" && img.imageUrl) {
      succeededImages.push(img);
      // Insert edit children right after their parent so viewer navigation is logical
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

  const handleRequestDelete = useCallback((image: CanvasImage) => {
    setDeleteTarget({ type: "single", image });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      if (deleteTarget?.type === "single") {
        const { image } = deleteTarget;
        if (image.source === "canvas" && image.generationId) {
          await deleteGeneration({ id: image.generationId });
          managedToast.success("Image deleted");
        }
      } else if (deleteTarget?.type === "batch") {
        // Collect unique generationIds from selected images
        const seen = new Set<string>();
        const toDelete: CanvasImage[] = [];
        for (const img of allImages) {
          if (
            selectedImageIds.has(img.id) &&
            img.source === "canvas" &&
            img.generationId &&
            !seen.has(img.generationId)
          ) {
            seen.add(img.generationId);
            toDelete.push(img);
          }
        }
        await Promise.all(
          toDelete.map(img => {
            // generationId is guaranteed non-null by the filter above
            const genId = img.generationId;
            if (!genId) {
              return Promise.resolve();
            }
            return deleteGeneration({ id: genId });
          })
        );
        managedToast.success(
          `${toDelete.length} image${toDelete.length === 1 ? "" : "s"} deleted`
        );
        clearImageSelection();
      }
    } catch {
      managedToast.error("Failed to delete");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [
    deleteTarget,
    deleteGeneration,
    managedToast,
    selectedImageIds,
    clearImageSelection,
  ]);

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

  const handleBatchDelete = useCallback(() => {
    setDeleteTarget({ type: "batch" });
  }, []);

  // Count how many selected images are deletable (canvas-sourced)
  const selectedCount = selectedImageIds.size;
  const selectedDeletableCount = allImages.filter(
    img =>
      selectedImageIds.has(img.id) &&
      img.source === "canvas" &&
      img.generationId
  ).length;

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

  const deleteMessage =
    deleteTarget?.type === "single"
      ? "This will permanently delete this image and cannot be undone."
      : `This will permanently delete ${selectedDeletableCount} image${selectedDeletableCount === 1 ? "" : "s"} and cannot be undone.`;

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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "batch"
                ? `Delete ${selectedDeletableCount} image${selectedDeletableCount === 1 ? "" : "s"}?`
                : "Delete image?"}
            </AlertDialogTitle>
            <AlertDialogDescription>{deleteMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
