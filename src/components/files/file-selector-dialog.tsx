import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CheckIcon,
  FileCodeIcon,
  FilePdfIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  MagicWandIcon,
} from "@phosphor-icons/react";
import { usePaginatedQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtualizer, type VirtualizerHandle } from "virtua";
import { ListEmptyState, ListLoadingState } from "@/components/data-list";
import { ImageThumbnail } from "@/components/files/file-display";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

type FileType = "all" | "image" | "pdf" | "text";

const FILES_PER_PAGE = 50;
const LOAD_MORE_THRESHOLD = 400;

interface UserFile {
  storageId: Id<"_storage"> | null;
  attachment: Attachment;
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  conversationName: string;
  createdAt: number;
  url: string | null;
  metadata: Record<string, unknown> | null;
}

const FILE_TYPE_OPTIONS = [
  { value: "all", label: "All Files", icon: FolderIcon },
  { value: "image", label: "Images", icon: ImageIcon },
  { value: "pdf", label: "PDFs", icon: FilePdfIcon },
  { value: "text", label: "Text & Code", icon: FileTextIcon },
] as const;

// Row height for virtualization (card height + gap)
const ESTIMATED_ROW_HEIGHT = 180;
// Minimum items before enabling virtualization
const VIRTUALIZATION_THRESHOLD = 24;

const TEXT_FILE_EXTENSIONS = [
  "txt",
  "text",
  "md",
  "markdown",
  "mdx",
  "rtf",
  "log",
  "csv",
  "tsv",
] as const;

function getFileAttachmentIcon(
  attachment: Attachment,
  size: "sm" | "lg" = "lg"
) {
  const sizeClass = size === "sm" ? "h-5 w-5" : "h-10 w-10";

  if (attachment.type === "pdf") {
    return <FilePdfIcon className={cn(sizeClass, "text-red-500")} />;
  }

  if (attachment.type === "text") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    const isTextFile =
      extension &&
      (TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);

    if (isTextFile) {
      return <FileTextIcon className={cn(sizeClass, "text-blue-500")} />;
    }
    return <FileCodeIcon className={cn(sizeClass, "text-green-500")} />;
  }

  return <FileTextIcon className={cn(sizeClass, "text-muted-foreground")} />;
}

interface FileCardProps {
  file: UserFile;
  selected: boolean;
  onToggle: (file: UserFile) => void;
  onPreview?: (file: UserFile) => void;
}

const FileCard = memo(
  ({ file, selected, onToggle, onPreview }: FileCardProps) => {
    const isImage = file.attachment.type === "image";

    const handleClick = useCallback(() => {
      if (isImage && onPreview) {
        onPreview(file);
      } else {
        onToggle(file);
      }
    }, [file, isImage, onToggle, onPreview]);

    const handleSelectionClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(file);
      },
      [file, onToggle]
    );

    return (
      <button
        type="button"
        className={cn(
          "relative group rounded-lg border-2 transition-all overflow-hidden bg-muted/20 text-left w-full aspect-square",
          isImage ? "flex items-center justify-center" : "flex flex-col",
          selected
            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
            : "border-border hover:border-primary/50 hover:shadow-sm"
        )}
        onClick={handleClick}
      >
        {isImage ? (
          <ImageThumbnail
            attachment={file.attachment}
            className="h-full w-full object-cover pointer-events-none"
          />
        ) : (
          <div className="flex flex-col h-full p-3 pointer-events-none">
            {/* Title row - prominent at top */}
            <div className="flex items-start gap-2">
              {getFileAttachmentIcon(file.attachment, "sm")}
              <span
                className="text-sm font-semibold text-foreground line-clamp-2 break-all"
                title={file.attachment.name}
              >
                {file.attachment.name}
              </span>
            </div>
            {/* Conversation name - secondary at bottom */}
            <div
              className="text-xs text-muted-foreground truncate mt-auto"
              title={file.conversationName}
            >
              {file.conversationName}
            </div>
          </div>
        )}

        {/* Selection checkbox for images */}
        {isImage && (
          <button
            type="button"
            className={cn(
              "absolute top-2 left-2 h-6 w-6 rounded border-2 flex items-center justify-center transition-all",
              selected
                ? "bg-primary border-primary"
                : "bg-background/80 border-border hover:border-primary/50"
            )}
            onClick={handleSelectionClick}
            aria-label={selected ? "Deselect image" : "Select image"}
          >
            {selected && (
              <CheckIcon className="h-4 w-4 text-primary-foreground" />
            )}
          </button>
        )}

        {/* Selection overlay for non-images */}
        {!isImage && selected && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shadow-md">
              <CheckIcon className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        )}

        {/* Generated badge */}
        {(file.attachment.generatedImage?.isGenerated ?? false) && (
          <Badge
            className={cn(
              "absolute bg-purple-500/90 text-white text-[10px] px-1 py-0 h-5",
              isImage ? "top-2 right-2" : "top-1.5 right-1.5"
            )}
          >
            <MagicWandIcon className="h-3 w-3" />
          </Badge>
        )}
      </button>
    );
  }
);

FileCard.displayName = "FileCard";

interface FileSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFiles: (attachments: Attachment[]) => void;
  /**
   * Filter files based on model capabilities
   * If provided, will only show files that the model supports
   */
  supportsImages?: boolean;
}

export function FileSelectorDialog({
  open,
  onOpenChange,
  onSelectFiles,
  supportsImages = true,
}: FileSelectorDialogProps) {
  const [fileType, setFileType] = useState<FileType>("all");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [columnsPerRow, setColumnsPerRow] = useState(4);
  const [previewFile, setPreviewFile] = useState<UserFile | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const loadMoreThrottleRef = useRef<NodeJS.Timeout | null>(null);

  // Use Dialog on desktop (lg+), Drawer on mobile
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Calculate columns based on screen size (desktop only)
  useEffect(() => {
    if (!open) {
      return;
    }

    const updateLayout = () => {
      // Match breakpoints: 2xl:6, lg:4, md:3, sm:2
      if (window.innerWidth >= 1536) {
        setColumnsPerRow(6);
      } else if (window.innerWidth >= 1024) {
        setColumnsPerRow(4);
      } else if (window.innerWidth >= 768) {
        setColumnsPerRow(3);
      } else {
        setColumnsPerRow(2);
      }
    };

    updateLayout();

    let timeoutId: NodeJS.Timeout;
    const debouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateLayout, 150);
    };

    window.addEventListener("resize", debouncedUpdate);
    return () => {
      window.removeEventListener("resize", debouncedUpdate);
      clearTimeout(timeoutId);
    };
  }, [open]);

  // Query user files with server-side filtering and pagination
  // Skip query when dialog is closed to avoid unnecessary data loading
  const {
    results: filesData,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.fileStorage.getUserFiles,
    open
      ? {
          fileType: fileType === "all" ? undefined : fileType,
          includeGenerated: true,
        }
      : "skip",
    { initialNumItems: FILES_PER_PAGE }
  );

  // Filter out null entries and apply model capability filtering
  const validFiles = useMemo(() => {
    if (!filesData) {
      return [];
    }
    const filtered = filesData.filter(
      (file: UserFile | null) => file !== null
    ) as UserFile[];

    // Filter based on model capabilities
    if (!supportsImages) {
      return filtered.filter(file => file.attachment.type !== "image");
    }

    return filtered;
  }, [filesData, supportsImages]);

  // Group files into rows for virtualization
  const rows = useMemo(() => {
    const result: UserFile[][] = [];
    for (let i = 0; i < validFiles.length; i += columnsPerRow) {
      result.push(validFiles.slice(i, i + columnsPerRow));
    }
    return result;
  }, [validFiles, columnsPerRow]);

  // Scroll-to-load-more: auto-fetch when near bottom
  const canLoadMore = status === "CanLoadMore";
  const canLoadMoreRef = useRef(canLoadMore);
  const loadMoreRef = useRef(loadMore);
  canLoadMoreRef.current = canLoadMore;
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!(scrollContainer && open)) {
      return;
    }

    const handleScroll = () => {
      if (!canLoadMoreRef.current || loadMoreThrottleRef.current) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom < LOAD_MORE_THRESHOLD) {
        loadMoreRef.current(FILES_PER_PAGE);
        loadMoreThrottleRef.current = setTimeout(() => {
          loadMoreThrottleRef.current = null;
        }, 300);
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    // Check immediately in case content doesn't fill the viewport
    handleScroll();

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (loadMoreThrottleRef.current) {
        clearTimeout(loadMoreThrottleRef.current);
        loadMoreThrottleRef.current = null;
      }
    };
  }, [open]);

  // File key generation for selection
  const getFileKey = useCallback((file: UserFile) => {
    return file.storageId || `${file.messageId}-${file.attachment.name}`;
  }, []);

  // Selection handlers
  const toggleSelection = useCallback(
    (file: UserFile) => {
      const key = getFileKey(file);
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [getFileKey]
  );

  const isSelected = useCallback(
    (file: UserFile) => {
      return selectedFiles.has(getFileKey(file));
    },
    [selectedFiles, getFileKey]
  );

  const handlePreview = useCallback((file: UserFile) => {
    setPreviewFile(file);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFileType("all");
  }, []);

  const hasActiveFilters = fileType !== "all";

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Reset state when closing
        setSelectedFiles(new Set());
        setFileType("all");
      }
      onOpenChange(open);
    },
    [onOpenChange]
  );

  const handleConfirm = useCallback(() => {
    // Get selected file attachments
    const attachments = validFiles
      .filter(file => selectedFiles.has(getFileKey(file)))
      .map(file => file.attachment);

    onSelectFiles(attachments);
    handleOpenChange(false);
  }, [validFiles, selectedFiles, getFileKey, onSelectFiles, handleOpenChange]);

  const isLoading = status === "LoadingFirstPage";
  const shouldVirtualize =
    rows.length > VIRTUALIZATION_THRESHOLD / columnsPerRow;

  // Shared controls component
  const controlsContent = (
    <div className="flex items-center justify-between">
      <Select
        value={fileType}
        onValueChange={(value: FileType) => setFileType(value)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue>
            {() => {
              const selected = FILE_TYPE_OPTIONS.find(
                opt => opt.value === fileType
              );
              if (!selected) {
                return null;
              }
              const Icon = selected.icon;
              return (
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {selected.label}
                </span>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {FILE_TYPE_OPTIONS.map(option => {
            const Icon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {option.label}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="text-sm text-muted-foreground">
        {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : "\u00A0"}
      </div>
    </div>
  );

  // Shared footer buttons
  const footerButtons = (
    <>
      <Button variant="outline" onClick={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={handleConfirm} disabled={selectedFiles.size === 0}>
        Add {selectedFiles.size > 0 ? `(${selectedFiles.size})` : ""}
      </Button>
    </>
  );

  // Desktop grid content
  const desktopGridContent = (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto -mx-6 px-6">
      {isLoading && <ListLoadingState count={6} height="h-32" />}

      {!isLoading && validFiles.length === 0 && (
        <ListEmptyState
          icon={<FolderIcon className="h-12 w-12" />}
          title="No files found"
          description={
            hasActiveFilters
              ? "Try adjusting your search or filter settings"
              : "Upload files in your conversations to see them here"
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && validFiles.length > 0 && (
        <>
          {shouldVirtualize ? (
            <Virtualizer
              ref={virtualizerRef}
              scrollRef={scrollContainerRef}
              overscan={4}
              itemSize={ESTIMATED_ROW_HEIGHT}
            >
              {rows.map((rowFiles, rowIndex) => (
                <div
                  key={`row-${rowIndex}-${rowFiles[0] ? getFileKey(rowFiles[0]) : "empty"}`}
                  className="pb-4"
                >
                  <div
                    className="grid gap-4"
                    style={{
                      gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
                    }}
                  >
                    {rowFiles.map(file => (
                      <FileCard
                        key={getFileKey(file)}
                        file={file}
                        selected={isSelected(file)}
                        onToggle={toggleSelection}
                        onPreview={handlePreview}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </Virtualizer>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
              }}
            >
              {validFiles.map(file => (
                <FileCard
                  key={getFileKey(file)}
                  file={file}
                  selected={isSelected(file)}
                  onToggle={toggleSelection}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>Loading more files...</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Mobile list content
  const mobileListContent = (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
      {isLoading && <ListLoadingState count={6} height="h-16" />}

      {!isLoading && validFiles.length === 0 && (
        <ListEmptyState
          icon={<FolderIcon className="h-12 w-12" />}
          title="No files found"
          description={
            hasActiveFilters
              ? "Try adjusting your filters"
              : "Upload files to see them here"
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && validFiles.length > 0 && (
        <>
          <Virtualizer scrollRef={scrollContainerRef} overscan={4}>
            {validFiles.map(file => {
              const isImage = file.attachment.type === "image";
              return (
                <div
                  key={getFileKey(file)}
                  className={cn(
                    "flex items-center gap-3 w-full p-3 border-b border-border transition-colors",
                    isSelected(file) && "bg-primary/10"
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      isImage ? handlePreview(file) : toggleSelection(file)
                    }
                    className="h-12 w-12 shrink-0 rounded overflow-hidden bg-muted/20"
                  >
                    {isImage ? (
                      <ImageThumbnail
                        attachment={file.attachment}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        {getFileAttachmentIcon(file.attachment, "sm")}
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSelection(file)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {file.attachment.name}
                      </span>
                      {(file.attachment.generatedImage?.isGenerated ??
                        false) && (
                        <Badge className="bg-purple-500/90 text-white text-[10px] px-1 py-0 h-5 shrink-0">
                          <MagicWandIcon className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground truncate block">
                      {file.conversationName}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSelection(file)}
                    className={cn(
                      "h-6 w-6 shrink-0 rounded border-2 flex items-center justify-center transition-all",
                      isSelected(file)
                        ? "bg-primary border-primary"
                        : "border-border"
                    )}
                  >
                    {isSelected(file) && (
                      <CheckIcon className="h-4 w-4 text-primary-foreground" />
                    )}
                  </button>
                </div>
              );
            })}
          </Virtualizer>

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>Loading more...</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Image preview dialog (shared)
  const imagePreviewDialog = previewFile && (
    <AttachmentGalleryDialog
      attachments={[previewFile.attachment]}
      currentAttachment={previewFile.attachment}
      open={!!previewFile}
      onOpenChange={o => !o && setPreviewFile(null)}
    />
  );

  // Desktop: Dialog
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-7xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Files from Library</DialogTitle>
            <DialogDescription>
              Choose files from your uploaded files and generated images
            </DialogDescription>
          </DialogHeader>

          {controlsContent}
          {desktopGridContent}

          <DialogFooter>{footerButtons}</DialogFooter>
        </DialogContent>

        {imagePreviewDialog}
      </Dialog>
    );
  }

  // Mobile: Drawer
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader>
          <DrawerTitle>Select Files</DrawerTitle>
        </DrawerHeader>

        <DrawerBody className="flex flex-col stack-sm px-4">
          {controlsContent}
          {mobileListContent}
        </DrawerBody>

        <DrawerFooter className="flex-row gap-2">{footerButtons}</DrawerFooter>
      </DrawerContent>

      {imagePreviewDialog}
    </Drawer>
  );
}
