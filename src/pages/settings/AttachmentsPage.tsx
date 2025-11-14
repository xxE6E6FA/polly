import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  CaretUpIcon,
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  FilePdfIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  MagicWandIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DataList,
  type DataListColumn,
  ListEmptyState,
  ListLoadingState,
} from "@/components/data-list";
import { ImageThumbnail } from "@/components/file-display";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FilePreviewDialog } from "@/components/ui/file-preview-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useListSelection } from "@/hooks/use-list-selection";
import { useListSort } from "@/hooks/use-list-sort";
import { useToast } from "@/providers/toast-context";
import type { Attachment } from "@/types";

type FileType = "all" | "image" | "pdf" | "text";
type SortField = "name" | "created";

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

  if (attachment.type === "text") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    const isTextFile =
      extension &&
      (TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);

    if (isTextFile) {
      return <FileTextIcon className="h-4 w-4 text-blue-500" />;
    }
    return <FileCodeIcon className="h-4 w-4 text-green-500" />;
  }

  return <FileTextIcon className="h-4 w-4 text-gray-500" />;
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
    { initialNumItems: 50 }
  );

  // Mutations
  const deleteFile = useMutation(api.fileStorage.deleteFile);
  const deleteMultipleFiles = useMutation(api.fileStorage.deleteMultipleFiles);
  const removeAttachment = useMutation(api.messages.removeAttachment);

  // Filter out null entries
  const validFiles = useMemo(() => {
    if (!filesData) {
      return [];
    }
    return filesData.filter(
      (file: UserFile | null) => file !== null
    ) as UserFile[];
  }, [filesData]);

  // File key generation for selection
  const getFileKey = useCallback((file: UserFile) => {
    return file.storageId || `${file.messageId}-${file.attachment.name}`;
  }, []);

  // Sorting hook
  const { sortField, sortDirection, toggleSort, sortItems } = useListSort<
    SortField,
    UserFile
  >("created", "desc", (file, field) => {
    if (field === "name") {
      return file.attachment.name.toLowerCase();
    }
    return file.createdAt;
  });

  // Selection hook
  const selection = useListSelection<UserFile>(getFileKey);

  // Apply sorting
  const sortedFiles = useMemo(
    () => sortItems(validFiles),
    [sortItems, validFiles]
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

    // Get selected files and separate by type
    const storageIds: Id<"_storage">[] = [];
    const textAttachments: Array<{
      messageId: Id<"messages">;
      attachmentName: string;
    }> = [];

    for (const key of selection.selectedKeys) {
      const file = sortedFiles.find(f => {
        const fileKey = getFileKey(f);
        return fileKey === key;
      });

      if (file) {
        if (file.storageId) {
          storageIds.push(file.storageId);
        } else {
          textAttachments.push({
            messageId: file.messageId,
            attachmentName: file.attachment.name,
          });
        }
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
  }, [
    selection,
    sortedFiles,
    deleteMultipleFiles,
    removeAttachment,
    managedToast,
    getFileKey,
  ]);

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
      // Find the file object by key
      const file = sortedFiles.find(f => {
        const fileKey = getFileKey(f);
        return fileKey === deleteTarget;
      });
      if (file) {
        handleDeleteFile(file);
      }
    }
    setShowDeleteDialog(false);
    setDeleteTarget(null);
  }, [
    deleteTarget,
    sortedFiles,
    handleDeleteSelected,
    handleDeleteFile,
    getFileKey,
  ]);

  const isLoading = status === "LoadingFirstPage";

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

        <div className="flex gap-2">
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
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
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete ({selection.selectedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Files Table */}
      {isLoading && <ListLoadingState count={6} height="h-16" />}

      {!isLoading && sortedFiles.length === 0 && (
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

      {!isLoading && sortedFiles.length > 0 && (
        <DataList
          items={sortedFiles}
          getItemKey={getFileKey}
          selection={selection}
          sort={{
            field: sortField,
            direction: sortDirection,
            onSort: toggleSort,
          }}
          sortIcons={{ asc: CaretUpIcon, desc: CaretDownIcon }}
          onRowClick={file => selection.toggleItem(file)}
          mobileTitleRender={file => (
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setPreviewFile(file);
                  }}
                  className="h-10 w-10 rounded border bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors overflow-hidden"
                  type="button"
                >
                  {file.attachment.type === "image" ? (
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
                <div className="flex items-center gap-2">
                  <div
                    className="truncate font-medium"
                    title={file.attachment.name}
                  >
                    {file.attachment.name}
                  </div>
                  {(file.attachment.generatedImage?.isGenerated ?? false) && (
                    <Badge className="bg-purple-500/90 text-white text-xs flex-shrink-0">
                      <MagicWandIcon className="h-3 w-3 mr-1" />
                      Generated
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          mobileActionsRender={file => (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  setPreviewFile(file);
                }}
                className="h-9 w-9 p-0"
                title="Preview file"
              >
                <EyeIcon className="h-5 w-5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  navigate(`/chat/${file.conversationId}`);
                }}
                className="h-9 w-9 p-0"
                title="Go to conversation"
              >
                <LinkIcon className="h-5 w-5" />
              </Button>
              {file.url && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={e => {
                    e.stopPropagation();
                    handleDownloadFile(file);
                  }}
                  className="h-9 w-9 p-0"
                  title="Download file"
                >
                  <DownloadIcon className="h-5 w-5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  setDeleteTarget(getFileKey(file));
                  setShowDeleteDialog(true);
                }}
                className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                title={
                  file.storageId
                    ? "Delete file"
                    : "Remove text attachment from message"
                }
              >
                <TrashIcon className="h-5 w-5" />
              </Button>
            </>
          )}
          mobileMetadataRender={file => (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate" title={file.conversationName}>
                {file.conversationName}
              </span>
              <span>•</span>
              <span className="flex-shrink-0">
                {formatDate(file.createdAt)}
              </span>
            </div>
          )}
          columns={
            [
              {
                key: "name",
                label: "Name",
                sortable: true,
                sortField: "name",
                className: "flex-1 min-w-0",
                hideOnMobile: true, // Title is rendered via mobileTitleRender
                render: file => (
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded border bg-muted/20 flex items-center justify-center">
                        {file.attachment.type === "image" ? (
                          <ImageThumbnail
                            attachment={file.attachment}
                            className="h-full w-full rounded object-cover"
                            onClick={() => setPreviewFile(file)}
                          />
                        ) : (
                          <button
                            onClick={() => setPreviewFile(file)}
                            className="flex h-full w-full items-center justify-center hover:bg-muted/30 transition-colors rounded"
                            type="button"
                          >
                            {getFileAttachmentIcon(file.attachment)}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="truncate font-medium"
                          title={file.attachment.name}
                        >
                          {file.attachment.name}
                        </div>
                        {(file.attachment.generatedImage?.isGenerated ??
                          false) && (
                          <Badge className="bg-purple-500/90 text-white text-xs flex-shrink-0">
                            <MagicWandIcon className="h-3 w-3 mr-1" />
                            Generated
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span
                          className="truncate"
                          title={file.conversationName}
                        >
                          {file.conversationName}
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: "created",
                label: "Created",
                sortable: true,
                sortField: "created",
                width: "w-32 flex-shrink-0 ml-4",
                className: "text-sm text-muted-foreground",
                hideOnMobile: true, // Date is rendered via mobileMetadataRender
                render: file => formatDate(file.createdAt),
              },
              {
                key: "actions",
                label: "Actions",
                width: "w-32 flex-shrink-0",
                className: "flex items-center justify-end gap-1",
                hideOnMobile: true, // Actions are rendered via mobileActionsRender
                render: file => (
                  <div className="flex items-center gap-1">
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
                      <EyeIcon className="h-4 w-4" />
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
                      <LinkIcon className="h-4 w-4" />
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
                        <DownloadIcon className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={e => {
                        e.stopPropagation();
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
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ] as DataListColumn<UserFile, SortField>[]
          }
        />
      )}

      {/* Load More Button */}
      {status === "CanLoadMore" && (
        <div className="flex justify-center py-4">
          <Button onClick={() => loadMore(50)} variant="outline">
            Load More
          </Button>
        </div>
      )}

      {status === "LoadingMore" && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Loading more files...</span>
          </div>
        </div>
      )}

      {/* File Preview Dialog */}
      {previewFile && (
        <FilePreviewDialog
          attachment={previewFile.attachment}
          open={!!previewFile}
          onOpenChange={open => !open && setPreviewFile(null)}
          imageUrl={previewFile.url || undefined}
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
