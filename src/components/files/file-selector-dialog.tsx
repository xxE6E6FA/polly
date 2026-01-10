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
import { Virtuoso, VirtuosoGrid } from "react-virtuoso";
import { ListEmptyState } from "@/components/data-list";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

type FileType = "all" | "image" | "pdf" | "text";

const FILES_PER_PAGE = 50;

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
            <div className="flex items-start gap-2">
              {getFileAttachmentIcon(file.attachment, "sm")}
              <span
                className="text-sm font-semibold text-foreground line-clamp-2 break-all"
                title={file.attachment.name}
              >
                {file.attachment.name}
              </span>
            </div>
            <div
              className="text-xs text-muted-foreground truncate mt-auto"
              title={file.conversationName}
            >
              {file.conversationName}
            </div>
          </div>
        )}

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

        {!isImage && selected && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shadow-md">
              <CheckIcon className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        )}

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

// Skeleton components for loading states
const FileCardSkeleton = memo(() => (
  <div className="rounded-lg border-2 border-border bg-muted/20 aspect-square">
    <Skeleton className="h-full w-full rounded-lg" />
  </div>
));
FileCardSkeleton.displayName = "FileCardSkeleton";

const FileListItemSkeleton = memo(() => (
  <div className="flex items-center gap-3 w-full p-3 border-b border-border">
    <Skeleton className="h-12 w-12 shrink-0 rounded" />
    <div className="flex-1 min-w-0 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
    <Skeleton className="h-6 w-6 shrink-0 rounded" />
  </div>
));
FileListItemSkeleton.displayName = "FileListItemSkeleton";

// Wrapper components to avoid array index key warnings
const GridSkeletons = memo(({ count }: { count: number }) => (
  <>
    <FileCardSkeleton />
    {count > 1 && <FileCardSkeleton />}
    {count > 2 && <FileCardSkeleton />}
    {count > 3 && <FileCardSkeleton />}
    {count > 4 && <FileCardSkeleton />}
    {count > 5 && <FileCardSkeleton />}
  </>
));
GridSkeletons.displayName = "GridSkeletons";

const GridSkeletonsDouble = memo(({ count }: { count: number }) => (
  <>
    <GridSkeletons count={count} />
    <GridSkeletons count={count} />
  </>
));
GridSkeletonsDouble.displayName = "GridSkeletonsDouble";

const ListSkeletons = memo(() => (
  <>
    <FileListItemSkeleton />
    <FileListItemSkeleton />
    <FileListItemSkeleton />
    <FileListItemSkeleton />
  </>
));
ListSkeletons.displayName = "ListSkeletons";

const ListSkeletonsDouble = memo(() => (
  <>
    <ListSkeletons />
    <ListSkeletons />
  </>
));
ListSkeletonsDouble.displayName = "ListSkeletonsDouble";

// VirtuosoGrid Item component
const GridItemContainer = memo(
  ({
    children,
    ...props
  }: React.ComponentProps<"div"> & { "data-index"?: number }) => (
    <div {...props}>{children}</div>
  )
);
GridItemContainer.displayName = "GridItemContainer";

// Context type for virtuoso components
interface VirtuosoContext {
  isLoadingMore: boolean;
  columnsPerRow: number;
}

// Grid footer for loading state - uses context from Virtuoso
const GridFooter = memo(({ context }: { context?: VirtuosoContext }) =>
  context?.isLoadingMore ? (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${context.columnsPerRow}, minmax(0, 1fr))`,
        gap: "16px",
        marginTop: "16px",
      }}
    >
      <GridSkeletons count={context.columnsPerRow} />
    </div>
  ) : null
);
GridFooter.displayName = "GridFooter";

// Grid list container - uses context from Virtuoso
const GridList = memo(
  ({
    style,
    children,
    context,
    ...props
  }: React.ComponentProps<"div"> & {
    style?: React.CSSProperties;
    context?: VirtuosoContext;
  }) => (
    <div
      {...props}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${context?.columnsPerRow ?? 4}, minmax(0, 1fr))`,
        gap: "16px",
        ...style,
      }}
    >
      {children}
    </div>
  )
);
GridList.displayName = "GridList";

// List footer for loading state - uses context from Virtuoso
const VirtuosoListFooter = memo(({ context }: { context?: VirtuosoContext }) =>
  context?.isLoadingMore ? <ListSkeletons /> : null
);
VirtuosoListFooter.displayName = "VirtuosoListFooter";

interface FileSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFiles: (attachments: Attachment[]) => void;
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

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Calculate columns based on screen size
  useEffect(() => {
    if (!open) {
      return;
    }

    const updateLayout = () => {
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

  // Query user files with pagination
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

    if (!supportsImages) {
      return filtered.filter(file => file.attachment.type !== "image");
    }

    return filtered;
  }, [filesData, supportsImages]);

  // File key generation
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
        setSelectedFiles(new Set());
        setFileType("all");
      }
      onOpenChange(open);
    },
    [onOpenChange]
  );

  const handleConfirm = useCallback(() => {
    const attachments = validFiles
      .filter(file => selectedFiles.has(getFileKey(file)))
      .map(file => file.attachment);

    onSelectFiles(attachments);
    handleOpenChange(false);
  }, [validFiles, selectedFiles, getFileKey, onSelectFiles, handleOpenChange]);

  // Load more callback for react-virtuoso
  const handleEndReached = useCallback(() => {
    if (status === "CanLoadMore") {
      loadMore(FILES_PER_PAGE);
    }
  }, [status, loadMore]);

  // Mobile list item renderer for Virtuoso
  const renderMobileListItem = useCallback(
    (index: number, file: UserFile) => {
      const isImage = file.attachment.type === "image";
      return (
        <div
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
              {(file.attachment.generatedImage?.isGenerated ?? false) && (
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
              isSelected(file) ? "bg-primary border-primary" : "border-border"
            )}
          >
            {isSelected(file) && (
              <CheckIcon className="h-4 w-4 text-primary-foreground" />
            )}
          </button>
        </div>
      );
    },
    [isSelected, toggleSelection, handlePreview]
  );

  // Empty state component
  const emptyState = (
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
  );

  // Controls component
  const controlsContent = (
    <div className="flex items-center justify-between">
      <Select
        value={fileType}
        onValueChange={(value: FileType | null) => {
          if (value) {
            setFileType(value);
          }
        }}
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

  // Footer buttons
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

  // Loading states
  const isLoadingMore = status === "LoadingMore";
  const isLoadingFirstPage = status === "LoadingFirstPage";

  // Context for virtuoso components
  const virtuosoContext = useMemo<VirtuosoContext>(
    () => ({ isLoadingMore, columnsPerRow }),
    [isLoadingMore, columnsPerRow]
  );

  // Static component references for react-virtuoso
  const gridComponents = useMemo(
    () => ({
      List: GridList,
      Item: GridItemContainer,
      Footer: GridFooter,
    }),
    []
  );

  const listComponents = useMemo(
    () => ({
      Footer: VirtuosoListFooter,
    }),
    []
  );

  // Helper to render grid content based on state
  const renderGridContent = () => {
    if (isLoadingFirstPage) {
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
            gap: "16px",
          }}
        >
          <GridSkeletonsDouble count={columnsPerRow} />
        </div>
      );
    }

    if (validFiles.length === 0) {
      return emptyState;
    }

    return (
      <VirtuosoGrid
        data={validFiles}
        endReached={handleEndReached}
        overscan={200}
        context={virtuosoContext}
        components={gridComponents}
        itemContent={(index, file) => (
          <FileCard
            file={file}
            selected={isSelected(file)}
            onToggle={toggleSelection}
            onPreview={handlePreview}
          />
        )}
        customScrollParent={scrollContainerRef.current ?? undefined}
      />
    );
  };

  // Helper to render list content based on state
  const renderListContent = () => {
    if (isLoadingFirstPage) {
      return <ListSkeletonsDouble />;
    }

    if (validFiles.length === 0) {
      return emptyState;
    }

    return (
      <Virtuoso
        data={validFiles}
        endReached={handleEndReached}
        overscan={200}
        context={virtuosoContext}
        components={listComponents}
        itemContent={renderMobileListItem}
        customScrollParent={scrollContainerRef.current ?? undefined}
      />
    );
  };

  // Desktop grid content using VirtuosoGrid
  const desktopGridContent = (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto -mx-6 px-6">
      {renderGridContent()}
    </div>
  );

  // Mobile list content using Virtuoso
  const mobileListContent = (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
      {renderListContent()}
    </div>
  );

  // Image preview dialog
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
