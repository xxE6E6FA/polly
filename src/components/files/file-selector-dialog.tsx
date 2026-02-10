import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  FileCodeIcon,
  FilePdfIcon,
  FileTextIcon,
  FilmStripIcon,
  FolderIcon,
  ImageIcon,
  MagicWandIcon,
  PlayIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { ListEmptyState } from "@/components/data-list";
import { SelectionCheckbox } from "@/components/data-list/selection-checkbox";
import { ImageThumbnail } from "@/components/files/file-display";
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
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { TextFilePreview } from "@/components/ui/text-file-preview";
import { useDebounce } from "@/hooks";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn, formatDate, formatFileSize } from "@/lib/utils";
import type { Attachment } from "@/types";

type FileType = "all" | "image" | "pdf" | "text" | "audio" | "video";

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
  { value: "all", label: "All", icon: FolderIcon },
  { value: "image", label: "Images", icon: ImageIcon },
  { value: "pdf", label: "PDFs", icon: FilePdfIcon },
  { value: "text", label: "Text & Code", icon: FileTextIcon },
  { value: "audio", label: "Audio", icon: SpeakerHighIcon },
  { value: "video", label: "Video", icon: FilmStripIcon },
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
  const sizeClass = size === "sm" ? "size-5" : "size-10";

  if (attachment.type === "pdf") {
    return <FilePdfIcon className={cn(sizeClass, "text-red-500")} />;
  }

  if (attachment.type === "audio") {
    return <SpeakerHighIcon className={cn(sizeClass, "text-orange-500")} />;
  }

  if (attachment.type === "video") {
    return <FilmStripIcon className={cn(sizeClass, "text-purple-500")} />;
  }

  if (attachment.type === "text") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    const isTextFile =
      extension &&
      (TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);

    if (isTextFile) {
      return <FileTextIcon className={cn(sizeClass, "text-blue-500")} />;
    }
    return <FileCodeIcon className={cn(sizeClass, "text-success")} />;
  }

  return <FileTextIcon className={cn(sizeClass, "text-muted-foreground")} />;
}

// --- FileListRow ---

interface FileListRowProps {
  file: UserFile;
  selected: boolean;
  previewing: boolean;
  onToggle: (file: UserFile) => void;
  onPreview?: (file: UserFile) => void;
}

const FileListRow = memo(
  ({ file, selected, previewing, onToggle, onPreview }: FileListRowProps) => {
    const isVisual =
      file.attachment.type === "image" ||
      (file.attachment.type === "video" && !!file.attachment.thumbnail);

    const handleRowClick = useCallback(() => {
      if (onPreview) {
        onPreview(file);
      } else {
        onToggle(file);
      }
    }, [file, onToggle, onPreview]);

    return (
      <div
        onClick={handleRowClick}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
        role="option"
        tabIndex={0}
        className={cn(
          "flex items-center gap-3 w-full px-6 py-3 text-left transition-colors border-b border-border/40 cursor-pointer",
          previewing && "bg-muted/60",
          selected && !previewing && "bg-primary/5",
          !(previewing || selected) && "hover:bg-muted/50"
        )}
      >
        {/* Checkbox — click toggles selection */}
        <SelectionCheckbox
          checked={selected}
          onToggle={() => onToggle(file)}
          label={selected ? "Deselect file" : "Select file"}
        />

        {/* Thumbnail / Icon */}
        <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted/30 flex items-center justify-center">
          {isVisual ? (
            <div className="relative h-full w-full">
              <ImageThumbnail
                attachment={file.attachment}
                className="h-full w-full object-cover"
              />
              {file.attachment.type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
                    <PlayIcon className="size-2" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            getFileAttachmentIcon(file.attachment, "sm")
          )}
        </div>

        {/* Name + metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {file.attachment.name}
            </span>
            {(file.attachment.generatedImage?.isGenerated ?? false) && (
              <Badge className="bg-purple-500/90 text-white text-overline px-1 py-0 h-5 shrink-0">
                <MagicWandIcon className="size-3" />
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{file.conversationName}</span>
            <span className="shrink-0">&middot;</span>
            <span className="shrink-0">{formatDate(file.createdAt)}</span>
            {file.attachment.size > 0 && (
              <>
                <span className="shrink-0">&middot;</span>
                <span className="shrink-0">
                  {formatFileSize(file.attachment.size)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);

FileListRow.displayName = "FileListRow";

// --- PreviewPanel ---

interface PreviewPanelProps {
  file: UserFile | null;
}

const PreviewPanel = memo(({ file }: PreviewPanelProps) => {
  const storageId = file?.attachment?.storageId as Id<"_storage"> | undefined;
  const fileUrl = useQuery(
    api.fileStorage.getFileUrl,
    storageId ? { storageId } : "skip"
  );

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground p-6">
        <ImageIcon className="size-10 opacity-40" />
        <p className="text-sm">Click a file to preview</p>
      </div>
    );
  }

  const resolvedUrl = (() => {
    if (file.attachment.storageId) {
      return fileUrl ?? undefined;
    }
    if (file.attachment.url) {
      return file.attachment.url;
    }
    if (file.attachment.content && file.attachment.mimeType) {
      return `data:${file.attachment.mimeType};base64,${file.attachment.content}`;
    }
    return undefined;
  })();

  const renderContent = () => {
    switch (file.attachment.type) {
      case "image": {
        if (!resolvedUrl) {
          return (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-xs text-muted-foreground">
                Loading image...
              </div>
            </div>
          );
        }
        return (
          <div className="flex h-full w-full items-center justify-center p-4">
            <img
              src={resolvedUrl}
              alt={file.attachment.name}
              className="max-h-full max-w-full object-contain rounded-md"
              draggable={false}
            />
          </div>
        );
      }

      case "video": {
        if (!resolvedUrl) {
          return null;
        }
        return (
          <div className="flex h-full w-full items-center justify-center p-4">
            <video
              controls
              src={resolvedUrl}
              poster={file.attachment.thumbnail || undefined}
              className="max-h-full max-w-full rounded-md"
              preload="metadata"
            >
              <track kind="captions" />
            </video>
          </div>
        );
      }

      case "audio": {
        if (!resolvedUrl) {
          return null;
        }
        return (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
            <SpeakerHighIcon className="size-12 text-muted-foreground" />
            <audio
              controls
              src={resolvedUrl}
              className="w-full max-w-xs"
              preload="metadata"
            >
              <track kind="captions" />
            </audio>
          </div>
        );
      }

      case "pdf": {
        if (!resolvedUrl) {
          return null;
        }
        return (
          <iframe
            src={resolvedUrl}
            className="h-full w-full border-0"
            title={`PDF preview: ${file.attachment.name}`}
          />
        );
      }

      case "text": {
        if (!file.attachment.content) {
          return (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No preview available
            </div>
          );
        }
        return (
          <div className="flex h-full w-full items-start justify-center p-4 overflow-auto">
            <TextFilePreview
              content={file.attachment.content}
              filename={file.attachment.name}
              className="max-h-full w-full"
            />
          </div>
        );
      }

      default:
        return (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No preview available
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-sm font-medium truncate">{file.attachment.name}</p>
        <p className="text-xs text-muted-foreground">
          {file.attachment.size > 0 && formatFileSize(file.attachment.size)}
        </p>
      </div>
      <div className="flex-1 min-h-0">{renderContent()}</div>
    </div>
  );
});

PreviewPanel.displayName = "PreviewPanel";

// --- Skeletons ---

const FileListItemSkeleton = memo(() => (
  <div className="flex items-center gap-3 w-full px-6 py-3 border-b border-border/40">
    <Skeleton className="h-5 w-5 shrink-0 rounded" />
    <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
    <div className="flex-1 min-w-0 stack-xs">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
));
FileListItemSkeleton.displayName = "FileListItemSkeleton";

const ListSkeletons = memo(() => (
  <>
    <FileListItemSkeleton />
    <FileListItemSkeleton />
    <FileListItemSkeleton />
    <FileListItemSkeleton />
    <FileListItemSkeleton />
    <FileListItemSkeleton />
  </>
));
ListSkeletons.displayName = "ListSkeletons";

// Context type for virtuoso footer
interface VirtuosoContext {
  isLoadingMore: boolean;
}

const VirtuosoListFooter = memo(({ context }: { context?: VirtuosoContext }) =>
  context?.isLoadingMore ? <ListSkeletons /> : null
);
VirtuosoListFooter.displayName = "VirtuosoListFooter";

// --- Main Component ---

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
  const [previewFile, setPreviewFile] = useState<UserFile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

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
          searchQuery: debouncedSearchQuery || undefined,
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
    setSearchQuery("");
  }, []);

  const hasActiveFilters = fileType !== "all" || searchQuery.length > 0;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSelectedFiles(new Set());
        setFileType("all");
        setPreviewFile(null);
        setSearchQuery("");
      }
      onOpenChange(nextOpen);
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

  // Loading states
  const isLoadingMore = status === "LoadingMore";
  const isLoadingFirstPage = status === "LoadingFirstPage";

  const virtuosoContext = useMemo<VirtuosoContext>(
    () => ({ isLoadingMore }),
    [isLoadingMore]
  );

  const listComponents = useMemo(
    () => ({
      Footer: VirtuosoListFooter,
    }),
    []
  );

  // Empty state
  const emptyState = (
    <ListEmptyState
      icon={<FolderIcon className="size-12" />}
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

  // Search bar
  const searchBar = (
    <div className="rounded-lg bg-muted/50">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search files..."
        className="w-full"
      />
    </div>
  );

  // Chip filter bar
  const chipBar = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto hide-scrollbar">
        {FILE_TYPE_OPTIONS.map(option => {
          const Icon = option.icon;
          const isActive = fileType === option.value;
          return (
            <Button
              key={option.value}
              variant={isActive ? "default" : "secondary"}
              size="sm"
              className={cn(
                "shrink-0 rounded-full h-7 text-xs lg:px-3 px-2",
                !isActive && "bg-muted/50"
              )}
              onClick={() => setFileType(option.value as FileType)}
              title={option.label}
            >
              <Icon className="size-3.5 lg:mr-1" />
              <span className="hidden lg:inline">{option.label}</span>
            </Button>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground shrink-0 hidden lg:block">
        {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : "\u00A0"}
      </div>
    </div>
  );

  const isPreviewing = useCallback(
    (file: UserFile) => {
      if (!previewFile) {
        return false;
      }
      return getFileKey(file) === getFileKey(previewFile);
    },
    [previewFile, getFileKey]
  );

  // Render list item — desktop: click row = preview, mobile: click row = select
  const renderListItem = useCallback(
    (_index: number, file: UserFile) => (
      <FileListRow
        file={file}
        selected={isSelected(file)}
        previewing={isPreviewing(file)}
        onToggle={toggleSelection}
        onPreview={isDesktop ? handlePreview : undefined}
      />
    ),
    [isSelected, isPreviewing, toggleSelection, handlePreview, isDesktop]
  );

  // Render desktop list (uses customScrollParent)
  const renderDesktopList = () => {
    if (isLoadingFirstPage || !scrollContainer) {
      return <ListSkeletons />;
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
        itemContent={renderListItem}
        customScrollParent={scrollContainer}
      />
    );
  };

  // Mobile: plain list with IntersectionObserver for load-more
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMoreSentinelRef.current || status !== "CanLoadMore") {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          loadMore(FILES_PER_PAGE);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(loadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [status, loadMore]);

  const renderMobileList = () => {
    if (isLoadingFirstPage) {
      return <ListSkeletons />;
    }

    if (validFiles.length === 0) {
      return emptyState;
    }

    return (
      <>
        {validFiles.map(file => (
          <FileListRow
            key={getFileKey(file)}
            file={file}
            selected={isSelected(file)}
            previewing={false}
            onToggle={toggleSelection}
          />
        ))}
        {isLoadingMore && <ListSkeletons />}
        <div ref={loadMoreSentinelRef} className="h-1" />
      </>
    );
  };

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

  // Desktop: Dialog with split layout
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-5xl !grid-rows-[auto_1fr_auto] h-[85vh]">
          <DialogHeader>
            <DialogTitle>Select Files from Library</DialogTitle>
            <DialogDescription>
              Choose files from your uploaded files and generated images
            </DialogDescription>
          </DialogHeader>

          {/* Browser area — search, chips, and split list+preview */}
          <div className="flex flex-col min-h-0 -mx-6">
            {/* Toolbar: search + chips */}
            <div className="px-6 py-4 stack-sm bg-muted/30">
              {searchBar}
              {chipBar}
            </div>

            {/* Split content area */}
            <div className="flex flex-row flex-1 min-h-0">
              {/* File list panel */}
              <div
                ref={setScrollContainer}
                className="w-[60%] overflow-y-auto h-full"
              >
                {renderDesktopList()}
              </div>

              {/* Preview panel — always visible on desktop */}
              <div className="w-[40%] border-l border-border/40 h-full overflow-hidden">
                <PreviewPanel file={previewFile} />
              </div>
            </div>
          </div>

          <DialogFooter>{footerButtons}</DialogFooter>
        </DialogContent>
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

        <DrawerBody className="flex flex-col !p-0">
          {/* Toolbar: search + chips */}
          <div className="px-4 py-3 stack-sm bg-muted/30 shrink-0">
            {searchBar}
            {chipBar}
          </div>

          {/* File list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {renderMobileList()}
          </div>
        </DrawerBody>

        <DrawerFooter className="flex-row gap-2">{footerButtons}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
