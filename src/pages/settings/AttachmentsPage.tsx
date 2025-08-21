import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
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
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/providers/toast-context";
import type { Attachment } from "@/types";

type FileType = "all" | "image" | "pdf" | "text";
type SortField = "name" | "created";
type SortDirection = "asc" | "desc";

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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AttachmentsPage() {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [fileType, setFileType] = useState<FileType>("all");
  const [includeGenerated, setIncludeGenerated] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState<UserFile | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"selected" | string | null>(
    null
  );
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const managedToast = useToast();

  // Query all user files (no filtering on server)
  const filesData = useQuery(api.fileStorage.getUserFiles, {
    fileType: "all",
    includeGenerated: true,
    limit: 1000, // Fetch more files since we're filtering client-side
  });

  // Mutations
  const deleteFile = useMutation(api.fileStorage.deleteFile);
  const deleteMultipleFiles = useMutation(api.fileStorage.deleteMultipleFiles);
  const removeAttachment = useMutation(api.messages.removeAttachment);

  // Filter and sort files
  const filteredAndSortedFiles = useMemo(() => {
    if (!filesData?.files) {
      return [];
    }

    const filtered = filesData.files.filter((file: UserFile | null) => {
      if (!file) {
        return false;
      }

      // Apply file type filter
      if (fileType !== "all") {
        if (fileType === "image" && file.attachment.type !== "image") {
          return false;
        }
        if (fileType === "pdf" && file.attachment.type !== "pdf") {
          return false;
        }
        if (fileType === "text" && file.attachment.type !== "text") {
          return false;
        }
      }

      // Apply generated images filter
      if (fileType === "image" && !includeGenerated) {
        if (file.attachment.generatedImage?.isGenerated) {
          return false;
        }
      }

      // Apply search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          file.attachment.name.toLowerCase().includes(query) ||
          file.conversationName.toLowerCase().includes(query)
        );
      }

      return true;
    });

    // Sort files - create a new array to avoid mutating the original
    const sorted = [...filtered].sort((a, b) => {
      if (!(a && b)) {
        return 0;
      }

      let aValue: string | number;
      let bValue: string | number;

      if (sortField === "name") {
        aValue = a.attachment.name.toLowerCase();
        bValue = b.attachment.name.toLowerCase();
      } else {
        aValue = a.createdAt;
        bValue = b.createdAt;
      }

      if (aValue < bValue) {
        return sortDirection === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [
    filesData?.files,
    fileType,
    includeGenerated,
    searchQuery,
    sortField,
    sortDirection,
  ]);

  // Memoized file key generation to ensure consistency
  const getFileKey = useCallback((file: UserFile) => {
    return file.storageId || `${file.messageId}-${file.attachment.name}`;
  }, []);

  // Selection handlers
  const handleSelectFile = useCallback(
    (file: UserFile) => {
      const fileKey = getFileKey(file);
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(fileKey)) {
          newSet.delete(fileKey);
        } else {
          newSet.add(fileKey);
        }
        return newSet;
      });
    },
    [getFileKey]
  );

  const handleSelectAll = useCallback(() => {
    const validFiles = filteredAndSortedFiles.filter(f => f !== null);
    const allFileKeys = new Set(validFiles.map(getFileKey));

    if (selectedFiles.size === allFileKeys.size) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(allFileKeys);
    }
  }, [selectedFiles.size, filteredAndSortedFiles, getFileKey]);

  // Sort handlers
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
    if (selectedFiles.size === 0) {
      return;
    }

    // Get selected files and separate by type
    const storageIds: Id<"_storage">[] = [];
    const textAttachments: Array<{
      messageId: Id<"messages">;
      attachmentName: string;
    }> = [];

    for (const key of selectedFiles) {
      const file = filteredAndSortedFiles.find(f => {
        if (!f) {
          return false;
        }
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

      setSelectedFiles(new Set());

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
    selectedFiles,
    filteredAndSortedFiles,
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
      const file = filteredAndSortedFiles.find(f => {
        const fileKey = f?.storageId || `${f?.messageId}-${f?.attachment.name}`;
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
    filteredAndSortedFiles,
    handleDeleteSelected,
    handleDeleteFile,
  ]);

  if (!filesData) {
    return (
      <SettingsPageLayout>
        <SettingsHeader
          title="Attachments"
          description="Manage your uploaded files and image generations"
        />
        <div className="space-y-6">
          {/* Loading skeleton */}
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton
                key={`skeleton-${Date.now()}-${i}`}
                className="h-16 w-full"
              />
            ))}
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

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

          {selectedFiles.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteTarget("selected");
                setShowDeleteDialog(true);
              }}
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete ({selectedFiles.size})
            </Button>
          )}
        </div>
      </div>

      {/* Selection Controls */}
      {filteredAndSortedFiles.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {selectedFiles.size} of {filteredAndSortedFiles.length} selected
          </span>
        </div>
      )}

      {/* Files Table */}
      {filteredAndSortedFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            No files found
          </h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? "Try adjusting your search or filter settings"
              : "Upload files in your conversations to see them here"}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="bg-muted/50 border-b">
            <div className="flex items-center p-4">
              <div className="w-8 flex-shrink-0">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleSelectAll();
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded border"
                >
                  {selectedFiles.size === filteredAndSortedFiles.length && (
                    <CheckIcon className="h-3 w-3" />
                  )}
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
                >
                  Name
                  {sortField === "name" &&
                    (sortDirection === "asc" ? (
                      <CaretUpIcon className="h-3 w-3" />
                    ) : (
                      <CaretDownIcon className="h-3 w-3" />
                    ))}
                </button>
              </div>
              <div className="w-32 flex-shrink-0 ml-4">
                <button
                  onClick={() => handleSort("created")}
                  className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
                >
                  Created
                  {sortField === "created" &&
                    (sortDirection === "asc" ? (
                      <CaretUpIcon className="h-3 w-3" />
                    ) : (
                      <CaretDownIcon className="h-3 w-3" />
                    ))}
                </button>
              </div>
              <div className="w-24 flex-shrink-0" />
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y">
            {filteredAndSortedFiles
              .filter(file => file !== null)
              .map(file => {
                if (!file) {
                  return null;
                }
                return (
                  <button
                    key={
                      file.storageId ||
                      `${file.messageId}-${file.attachment.name}`
                    }
                    className={`group transition-all hover:bg-muted/30 cursor-pointer w-full text-left ${
                      selectedFiles.has(
                        file.storageId ||
                          `${file.messageId}-${file.attachment.name}`
                      )
                        ? "bg-primary/5"
                        : ""
                    }`}
                    onClick={() => handleSelectFile(file)}
                    aria-label={`Select ${file.attachment.name}`}
                  >
                    <div className="flex items-center p-4">
                      {/* Selection checkbox */}
                      <div className="w-8 flex-shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleSelectFile(file);
                          }}
                          className="flex h-4 w-4 items-center justify-center rounded border"
                        >
                          {selectedFiles.has(
                            file.storageId ||
                              `${file.messageId}-${file.attachment.name}`
                          ) && <CheckIcon className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        {/* File thumbnail/icon */}
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
                              >
                                {file.attachment.type === "pdf" ? (
                                  <FilePdfIcon className="h-4 w-4 text-red-500" />
                                ) : file.attachment.type === "text" ? (
                                  (() => {
                                    const extension = file.attachment.name
                                      .split(".")
                                      .pop()
                                      ?.toLowerCase();
                                    const isTextFile =
                                      extension &&
                                      [
                                        "txt",
                                        "text",
                                        "md",
                                        "markdown",
                                        "mdx",
                                        "rtf",
                                        "log",
                                        "csv",
                                        "tsv",
                                      ].includes(extension);

                                    return isTextFile ? (
                                      <FileTextIcon className="h-4 w-4 text-blue-500" />
                                    ) : (
                                      <FileCodeIcon className="h-4 w-4 text-green-500" />
                                    );
                                  })()
                                ) : (
                                  <FileTextIcon className="h-4 w-4 text-gray-500" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* File details */}
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

                          {/* File type and conversation */}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="flex-shrink-0">
                              {file.attachment.type}
                            </span>
                            <span className="flex-shrink-0">•</span>
                            <div className="flex items-center gap-1 min-w-0">
                              <LinkIcon className="h-3 w-3 flex-shrink-0" />
                              <span
                                className="truncate"
                                title={file.conversationName}
                              >
                                {file.conversationName}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="w-32 flex-shrink-0 ml-4 text-sm text-muted-foreground">
                        {formatDate(file.createdAt)}
                      </div>

                      {/* Action buttons */}
                      <div className="w-24 flex-shrink-0 flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={e => {
                            e.stopPropagation();
                            setPreviewFile(file);
                          }}
                          className="h-8 px-2"
                        >
                          <EyeIcon className="h-4 w-4" />
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
                          >
                            <DownloadIcon className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteTarget(
                              file.storageId ||
                                `${file.messageId}-${file.attachment.name}`
                            );
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
                    </div>
                  </button>
                );
              })}
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
            ? `Are you sure you want to delete ${selectedFiles.size} selected files? This action cannot be undone and will remove them from your conversations.`
            : "Are you sure you want to delete this file? This action cannot be undone and will remove it from your conversations."
        }
        confirmText="Delete"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </SettingsPageLayout>
  );
}
