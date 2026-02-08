import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  FilePdfIcon,
  FileTextIcon,
  FilmStripIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  MagicWandIcon,
  SpeakerHighIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ListEmptyState,
  ListLoadingState,
  type MobileDrawerConfig,
  VirtualizedDataList,
  type VirtualizedDataListColumn,
} from "@/components/data-list";
import { ImageThumbnail } from "@/components/files/file-display";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { AttachmentGalleryDialog } from "@/components/ui/attachment-gallery-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDebounce } from "@/hooks/use-debounce";
import { useListSelection } from "@/hooks/use-list-selection";
import type { SortDirection } from "@/hooks/use-list-sort";
import { useToast } from "@/providers/toast-context";
import type { Attachment } from "@/types";

type SortField = "name" | "created";

type FileType = "all" | "image" | "pdf" | "text" | "audio" | "video";

interface UserFile {
  storageId: Id<"_storage"> | null; // null for content-based text attachments
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getFileAttachmentIcon(attachment: Attachment) {
  if (attachment.type === "pdf") {
    return <FilePdfIcon className="h-4 w-4 text-red-500" />;
  }

  if (attachment.type === "audio") {
    return <SpeakerHighIcon className="size-4 text-orange-500" />;
  }

  if (attachment.type === "video") {
    return <FilmStripIcon className="size-4 text-purple-500" />;
  }

  if (attachment.type === "text") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    const isTextFile =
      extension &&
      (TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);

    if (isTextFile) {
      return <FileTextIcon className="size-4 text-blue-500" />;
    }
    return <FileCodeIcon className="size-4 text-success" />;
  }

  return <FileTextIcon className="size-4 text-gray-500" />;
}

export default function AttachmentsPage() {
  const navigate = useNavigate();
  const [fileType, setFileType] = useState<FileType>("all");
  const [includeGenerated, setIncludeGenerated] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState<UserFile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"selected" | string | null>(
    null
  );

  const managedToast = useToast();

  // Debounce search query to avoid excessive queries (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Sort state for server-side sorting
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField]
  );

  // Query args for VirtualizedDataList
  const queryArgs = useMemo(
    () => ({
      fileType: fileType === "all" ? undefined : fileType,
      includeGenerated,
      searchQuery: debouncedSearchQuery || undefined,
      sortField,
      sortDirection,
    }),
    [fileType, includeGenerated, debouncedSearchQuery, sortField, sortDirection]
  );

  // Mutations
  const deleteFile = useMutation(api.fileStorage.deleteFile);
  const deleteMultipleFiles = useMutation(api.fileStorage.deleteMultipleFiles);
  const removeAttachment = useMutation(api.messages.removeAttachment);

  // File key generation for selection
  const getFileKey = useCallback((file: UserFile) => {
    return file.storageId || `${file.messageId}-${file.attachment.name}`;
  }, []);

  // Selection hook
  const selection = useListSelection<UserFile>(getFileKey);

  // Track selected file objects for bulk operations
  const selectedFilesRef = useRef<Map<string, UserFile>>(new Map());

  // Selection adapter that tracks full file objects
  const selectionAdapter = useMemo(
    () => ({
      selectedKeys: selection.selectedKeys,
      isSelected: (file: UserFile) => selection.isSelected(file),
      isAllSelected: (items: UserFile[]) => selection.isAllSelected(items),
      toggleItem: (file: UserFile) => {
        const key = getFileKey(file);
        if (selection.isSelected(file)) {
          selectedFilesRef.current.delete(key);
        } else {
          selectedFilesRef.current.set(key, file);
        }
        selection.toggleItem(file);
      },
      toggleAll: (items: UserFile[]) => {
        const allSelected = selection.isAllSelected(items);
        if (allSelected) {
          selectedFilesRef.current.clear();
        } else {
          for (const file of items) {
            selectedFilesRef.current.set(getFileKey(file), file);
          }
        }
        selection.toggleAll(items);
      },
    }),
    [selection, getFileKey]
  );

  // File operations
  const handleDeleteFile = useCallback(
    async (file: UserFile) => {
      if (!file.storageId) {
        // Handle text attachments that are stored directly in messages
        try {
          await removeAttachment({
            messageId: file.messageId,
            attachmentName: file.attachment.name,
          });
          managedToast.success("Attachment removed", {
            description:
              "The text attachment has been removed from the message.",
          });
        } catch (error) {
          managedToast.error("Delete failed", {
            description:
              error instanceof Error
                ? error.message
                : "Failed to remove attachment.",
          });
        }
        return;
      }

      try {
        // Try to delete the storage file (may not exist if already deleted)
        try {
          await deleteFile({ storageId: file.storageId });
        } catch (storageError) {
          // If storage file doesn't exist, that's okay - just log it
          console.warn(
            `Storage file ${file.storageId} not found, may have been already deleted:`,
            storageError
          );
        }

        // Always remove the attachment reference from the message
        await removeAttachment({
          messageId: file.messageId,
          attachmentName: file.attachment.name,
        });

        managedToast.success("File deleted", {
          description: "The file has been removed from the message.",
        });
      } catch (error) {
        managedToast.error("Delete failed", {
          description:
            error instanceof Error
              ? error.message
              : "Failed to remove attachment from message.",
        });
      }
    },
    [deleteFile, removeAttachment, managedToast]
  );

  const handleDeleteSelected = useCallback(async () => {
    if (selection.selectedCount === 0) {
      return;
    }

    // Get selected files from ref and separate by type
    const storageIds: Id<"_storage">[] = [];
    const textAttachments: Array<{
      messageId: Id<"messages">;
      attachmentName: string;
    }> = [];

    for (const file of selectedFilesRef.current.values()) {
      if (file.storageId) {
        storageIds.push(file.storageId);
      } else {
        textAttachments.push({
          messageId: file.messageId,
          attachmentName: file.attachment.name,
        });
      }
    }

    try {
      // Delete storage-based files (this will also update message attachments)
      if (storageIds.length > 0) {
        try {
          await deleteMultipleFiles({
            storageIds,
            updateMessages: true,
          });
        } catch (storageError) {
          // If some storage files don't exist, that's okay - just log it
          console.warn(
            "Some storage files may not exist during bulk delete:",
            storageError
          );
        }
      }

      // Remove text attachments from messages
      if (textAttachments.length > 0) {
        await Promise.all(
          textAttachments.map(({ messageId, attachmentName }) =>
            removeAttachment({
              messageId,
              attachmentName,
            })
          )
        );
      }

      selection.clearSelection();
      selectedFilesRef.current.clear();

      const storageMessage =
        storageIds.length > 0
          ? `${storageIds.length} file${storageIds.length > 1 ? "s" : ""} removed.`
          : "";
      const textMessage =
        textAttachments.length > 0
          ? `${textAttachments.length} text attachment${textAttachments.length > 1 ? "s" : ""} removed.`
          : "";

      const message = [storageMessage, textMessage].filter(Boolean).join(" ");

      managedToast.success("Files removed", {
        description: message,
      });
    } catch (error) {
      managedToast.error("Remove failed", {
        description:
          error instanceof Error ? error.message : "Failed to remove files.",
      });
    }
  }, [selection, deleteMultipleFiles, removeAttachment, managedToast]);

  const handleDownloadFile = useCallback((file: UserFile) => {
    if (!file.url) {
      return;
    }

    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteTarget === "selected") {
      handleDeleteSelected();
    } else if (deleteTarget) {
      // Find the file object by key from the selection ref
      const file = selectedFilesRef.current.get(deleteTarget);
      if (file) {
        handleDeleteFile(file);
        selectedFilesRef.current.delete(deleteTarget);
      }
    }
    setShowDeleteDialog(false);
    setDeleteTarget(null);
  }, [deleteTarget, handleDeleteSelected, handleDeleteFile]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Attachments"
        description="Manage your uploaded files and image generations. Note that deleting files here will remove them from the relevant conversations, but not delete the conversations."
      />

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={fileType}
            onValueChange={(value: FileType | null) => {
              if (value) {
                setFileType(value);
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
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
                      <Icon className="size-4" />
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
                      <Icon className="size-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {fileType === "image" && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch
                checked={includeGenerated}
                onCheckedChange={setIncludeGenerated}
              />
              Include generated images
            </label>
          )}
        </div>

        <div className="flex gap-2">
          <SearchInput
            placeholder="Search files..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="w-60"
          />

          {selection.selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteTarget("selected");
                setShowDeleteDialog(true);
              }}
            >
              <TrashIcon className="size-4 mr-2" />
              Delete ({selection.selectedCount})
            </Button>
          )}
        </div>
      </div>

      {/* VirtualizedDataList */}
      <VirtualizedDataList<UserFile, SortField>
        query={api.fileStorage.getUserFiles}
        queryArgs={queryArgs}
        getItemKey={getFileKey}
        selection={selectionAdapter}
        sort={{
          field: sortField,
          direction: sortDirection,
          onSort: handleSort,
        }}
        onRowClick={file => selectionAdapter.toggleItem(file)}
        initialNumItems={50}
        loadingState={<ListLoadingState count={6} height="h-16" />}
        emptyState={
          <ListEmptyState
            icon={<FolderIcon className="size-12" />}
            title="No files found"
            description={
              searchQuery
                ? "Try adjusting your search or filter settings"
                : "Upload files in your conversations to see them here"
            }
          />
        }
        mobileTitleRender={file => {
          const hasVisualThumb =
            file.attachment.type === "image" ||
            (file.attachment.type === "video" && !!file.attachment.thumbnail);
          return (
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setPreviewFile(file);
                  }}
                  className="h-10 w-10 rounded border bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors"
                  type="button"
                >
                  {hasVisualThumb ? (
                    <ImageThumbnail
                      attachment={file.attachment}
                      className="h-full w-full rounded object-cover"
                    />
                  ) : (
                    getFileAttachmentIcon(file.attachment)
                  )}
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="truncate font-medium"
                    title={file.attachment.name}
                  >
                    {file.attachment.name}
                  </div>
                  {(file.attachment.generatedImage?.isGenerated ?? false) && (
                    <Badge
                      className="bg-purple-500/90 text-white text-xs flex-shrink-0 px-1"
                      title="Generated image"
                    >
                      <MagicWandIcon className="size-3" />
                      <span className="ml-1 hidden sm:inline">Generated</span>
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        }}
        mobileDrawerConfig={
          {
            title: file => file.attachment.name,
            subtitle: file =>
              `${file.conversationName} • ${formatDate(file.createdAt)}`,
            actions: [
              {
                key: "preview",
                icon: EyeIcon,
                label: "Preview file",
                onClick: file => setPreviewFile(file),
              },
              {
                key: "conversation",
                icon: LinkIcon,
                label: "Go to conversation",
                onClick: file => navigate(`/chat/${file.conversationId}`),
              },
              {
                key: "download",
                icon: DownloadIcon,
                label: "Download file",
                onClick: file => handleDownloadFile(file),
                hidden: file => !file.url,
              },
              {
                key: "delete",
                icon: TrashIcon,
                label: file =>
                  file.storageId ? "Delete file" : "Remove attachment",
                onClick: file => {
                  // Store in ref for confirmDelete to access
                  selectedFilesRef.current.set(getFileKey(file), file);
                  setDeleteTarget(getFileKey(file));
                  setShowDeleteDialog(true);
                },
                className:
                  "text-destructive hover:bg-destructive/10 hover:text-destructive",
              },
            ],
          } as MobileDrawerConfig<UserFile>
        }
        mobileMetadataRender={file => (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate" title={file.conversationName}>
              {file.conversationName}
            </span>
            <span>•</span>
            <span className="flex-shrink-0">{formatDate(file.createdAt)}</span>
          </div>
        )}
        columns={
          [
            {
              key: "name",
              label: "Name",
              sortable: true,
              sortField: "name" as SortField,
              hideOnMobile: true,
              render: file => {
                const hasVisualThumb =
                  file.attachment.type === "image" ||
                  (file.attachment.type === "video" &&
                    !!file.attachment.thumbnail);
                return (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded border bg-muted/20 flex items-center justify-center">
                        {hasVisualThumb ? (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewFile(file);
                            }}
                            className="flex h-full w-full items-center justify-center hover:bg-muted/30 transition-colors rounded"
                            type="button"
                          >
                            <ImageThumbnail
                              attachment={file.attachment}
                              className="h-full w-full rounded object-cover"
                            />
                          </button>
                        ) : (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setPreviewFile(file);
                            }}
                            className="flex h-full w-full items-center justify-center hover:bg-muted/30 transition-colors rounded"
                            type="button"
                          >
                            {getFileAttachmentIcon(file.attachment)}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="truncate font-medium"
                          title={file.attachment.name}
                        >
                          {file.attachment.name}
                        </div>
                        {(file.attachment.generatedImage?.isGenerated ??
                          false) && (
                          <Badge className="bg-purple-500/90 text-white text-xs flex-shrink-0">
                            <MagicWandIcon className="size-3 mr-1" />
                            Generated
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground min-w-0">
                        <span
                          className="truncate"
                          title={file.conversationName}
                        >
                          {file.conversationName}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              },
            },
            {
              key: "created",
              label: "Created",
              sortable: true,
              sortField: "created" as SortField,
              width: "w-32",
              className: "text-sm text-muted-foreground",
              hideOnMobile: true,
              render: file => formatDate(file.createdAt),
            },
            {
              key: "actions",
              label: "",
              width: "w-40",
              className: "text-right",
              hideOnMobile: true,
              render: file => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => {
                      e.stopPropagation();
                      setPreviewFile(file);
                    }}
                    className="h-8 px-2"
                    title="Preview file"
                  >
                    <EyeIcon className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/chat/${file.conversationId}`);
                    }}
                    className="h-8 px-2"
                    title="Go to conversation"
                  >
                    <LinkIcon className="size-4" />
                  </Button>
                  {file.url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={e => {
                        e.stopPropagation();
                        handleDownloadFile(file);
                      }}
                      className="h-8 px-2"
                      title="Download file"
                    >
                      <DownloadIcon className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => {
                      e.stopPropagation();
                      // Store in ref for confirmDelete to access
                      selectedFilesRef.current.set(getFileKey(file), file);
                      setDeleteTarget(getFileKey(file));
                      setShowDeleteDialog(true);
                    }}
                    className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title={
                      file.storageId
                        ? "Delete file"
                        : "Remove text attachment from message"
                    }
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              ),
            },
          ] as VirtualizedDataListColumn<UserFile, SortField>[]
        }
      />

      {/* File Preview Dialog */}
      {previewFile && (
        <AttachmentGalleryDialog
          attachments={[previewFile.attachment]}
          currentAttachment={previewFile.attachment}
          open={!!previewFile}
          onOpenChange={open => !open && setPreviewFile(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Files"
        description={
          deleteTarget === "selected"
            ? `Are you sure you want to delete ${selection.selectedCount} selected files? This action cannot be undone and will remove them from your conversations.`
            : "Are you sure you want to delete this file? This action cannot be undone and will remove it from your conversations."
        }
        confirmText="Delete"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </SettingsPageLayout>
  );
}
