import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  FileCodeIcon,
  FilePdfIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  MagicWandIcon,
  XIcon,
} from "@phosphor-icons/react";
import { usePaginatedQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { ListEmptyState, ListLoadingState } from "@/components/data-list";
import { ImageThumbnail } from "@/components/file-display";
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
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
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
  { value: "text", label: "Text Files", icon: FileTextIcon },
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

function getFileAttachmentIcon(attachment: Attachment) {
  if (attachment.type === "pdf") {
    return <FilePdfIcon className="h-12 w-12 text-red-500" />;
  }

  if (attachment.type === "text") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    const isTextFile =
      extension &&
      (TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);

    if (isTextFile) {
      return <FileTextIcon className="h-12 w-12 text-blue-500" />;
    }
    return <FileCodeIcon className="h-12 w-12 text-green-500" />;
  }

  return <FileTextIcon className="h-12 w-12 text-muted-foreground" />;
}

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
  const [includeGenerated, setIncludeGenerated] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Debounce search query to avoid excessive queries (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Query user files with server-side filtering, search, and pagination
  const {
    results: filesData,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.fileStorage.getUserFiles,
    {
      fileType: fileType === "all" ? undefined : fileType,
      includeGenerated,
      searchQuery: debouncedSearchQuery || undefined,
    },
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

  const handleSelectAll = useCallback(() => {
    if (selectedFiles.size === validFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(validFiles.map(getFileKey)));
    }
  }, [selectedFiles.size, validFiles, getFileKey]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Reset state when closing
        setSelectedFiles(new Set());
        setSearchQuery("");
        setFileType("all");
        setIncludeGenerated(true);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Files from Library</DialogTitle>
          <DialogDescription>
            Choose files from your uploaded files and generated images
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={fileType}
              onValueChange={(value: FileType) => setFileType(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
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

            {fileType === "image" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeGenerated}
                  onChange={e => setIncludeGenerated(e.target.checked)}
                  className="rounded"
                />
                Include generated images
              </label>
            )}
          </div>

          <SearchInput
            placeholder="Search files..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="w-full sm:w-60"
          />
        </div>

        {/* Selection count and actions */}
        {validFiles.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-8"
              >
                {selectedFiles.size === validFiles.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
              {selectedFiles.size > 0 && (
                <span className="text-muted-foreground">
                  {selectedFiles.size} selected
                </span>
              )}
            </div>
          </div>
        )}

        {/* File Grid */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading && <ListLoadingState count={6} height="h-32" />}

          {!isLoading && validFiles.length === 0 && (
            <ListEmptyState
              icon={<FolderIcon className="h-12 w-12" />}
              title="No files found"
              description={
                searchQuery
                  ? "Try adjusting your search or filter settings"
                  : "Upload files in your conversations to see them here"
              }
            />
          )}

          {!isLoading && validFiles.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-4">
              {validFiles.map(file => {
                const selected = isSelected(file);
                return (
                  <button
                    key={getFileKey(file)}
                    className={cn(
                      "relative group rounded-lg border-2 transition-all overflow-hidden bg-muted/20 text-left w-full aspect-square",
                      file.attachment.type === "image"
                        ? "flex items-center justify-center"
                        : "p-3 flex flex-col",
                      selected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:border-primary/50 hover:shadow-sm"
                    )}
                    onClick={() => toggleSelection(file)}
                  >
                    {file.attachment.type === "image" ? (
                      <ImageThumbnail
                        attachment={file.attachment}
                        className="h-full w-full object-cover pointer-events-none"
                      />
                    ) : (
                      <div className="flex flex-col h-full pointer-events-none">
                        <div className="flex items-center justify-center flex-1">
                          {getFileAttachmentIcon(file.attachment)}
                        </div>
                        <div className="stack-xs text-center">
                          <div
                            className="text-sm font-medium text-foreground truncate"
                            title={file.attachment.name}
                          >
                            {file.attachment.name}
                          </div>
                          <div
                            className="text-xs text-muted-foreground truncate"
                            title={file.conversationName}
                          >
                            {file.conversationName}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Selection indicator */}
                    {selected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <svg
                            className="h-5 w-5 text-primary-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                    {/* Generated badge */}
                    {(file.attachment.generatedImage?.isGenerated ?? false) && (
                      <Badge className="absolute top-2 right-2 bg-purple-500/90 text-white text-xs px-1 py-0">
                        <MagicWandIcon className="h-3 w-3" />
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Load More Button */}
          {status === "CanLoadMore" && (
            <div className="flex justify-center py-4">
              <Button
                onClick={() => loadMore(FILES_PER_PAGE)}
                variant="outline"
                size="sm"
              >
                Load More
              </Button>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedFiles.size === 0}>
            Add {selectedFiles.size > 0 ? `(${selectedFiles.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
