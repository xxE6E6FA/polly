import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  ChatCircleIcon,
  DownloadIcon,
  PushPinIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ListEmptyState,
  ListLoadingState,
  type MobileDrawerConfig,
  VirtualizedDataList,
  type VirtualizedDataListColumn,
} from "@/components/data-list";
import { ActivitySection } from "@/components/settings/chat-history-tab/ActivitySection";
import { ImportExportActions } from "@/components/settings/chat-history-tab/ImportExportActions";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import type { SortDirection } from "@/hooks/use-list-sort";
import {
  type ConversationSummary,
  usePaginatedConversations,
} from "@/hooks/use-paginated-conversations";
import { generateBackgroundExportFilename } from "@/lib/export";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type SortField = "updated";

export default function ChatHistoryPage() {
  const navigate = useNavigate();
  const {
    listSelection,
    selectedConversations,
    selectedCount,
    someSelected,
    includeAttachments,
    setIncludeAttachments,
    clearSelection,
  } = usePaginatedConversations({ includeArchived: true });
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    "selected" | Id<"conversations"> | null
  >(null);

  // Sort state for server-side sorting
  const [sortField] = useState<SortField>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      }
    },
    [sortField]
  );

  const bulkRemove = useMutation(api.conversations.bulkRemove);

  const downloadData = useQuery(
    api.backgroundJobs.getExportDownloadUrl,
    downloadingJobId ? { jobId: downloadingJobId } : "skip"
  );

  // Recently imported IDs
  const jobs = backgroundJobs.activeJobs;
  const recentlyImportedIds = useMemo(() => {
    const ids = jobs
      .filter(
        job =>
          job.type === "import" &&
          job.status === "completed" &&
          job.result?.conversationIds
      )
      .flatMap(job => job.result?.conversationIds || []);
    return new Set(ids as Id<"conversations">[]);
  }, [jobs]);

  // Check if export is currently running
  const isExporting = backgroundJobs
    .getActiveJobs()
    .some(job => job.type === "export");

  const handleDownload = useCallback((jobId: string, filename?: string) => {
    setPendingFilename(filename ?? null);
    setDownloadingJobId(jobId);
  }, []);

  useEffect(() => {
    if (!(downloadData && downloadingJobId)) {
      return;
    }

    const downloadFile = async () => {
      let loadingToastId: string | number | undefined;

      try {
        if (downloadData.downloadUrl) {
          loadingToastId = managedToast.loading("Preparing download...");

          const response = await fetch(downloadData.downloadUrl);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const blob = await response.blob();

          let filename = pendingFilename ?? "export.json";
          if (filename === "export.json") {
            filename = generateBackgroundExportFilename(downloadData.manifest);
          }

          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          window.URL.revokeObjectURL(blobUrl);

          if (loadingToastId) {
            managedToast.dismiss(loadingToastId);
          }
          managedToast.success("Download started", {
            description: `Export file downloaded as ${filename}`,
          });
        } else {
          if (loadingToastId) {
            managedToast.dismiss(loadingToastId);
          }
          managedToast.error("Download failed", {
            description: "Export file is not available for download",
          });
        }
      } catch (_error) {
        if (loadingToastId) {
          managedToast.dismiss(loadingToastId);
        }
        managedToast.error("Download failed", {
          description: "An error occurred while downloading the file",
        });
      }
    };

    downloadFile();
    setDownloadingJobId(null);
    setPendingFilename(null);
  }, [
    downloadData,
    downloadingJobId,
    managedToast.success,
    managedToast.error,
    managedToast.loading,
    managedToast.dismiss,
    pendingFilename,
  ]);

  // Listen for download events from toast actions
  useEffect(() => {
    const handleDownloadExport = (event: CustomEvent) => {
      const { jobId, filename } = event.detail as {
        jobId: string;
        filename?: string;
      };
      handleDownload(jobId, filename);
    };

    window.addEventListener(
      "downloadExport",
      handleDownloadExport as EventListener
    );

    return () => {
      window.removeEventListener(
        "downloadExport",
        handleDownloadExport as EventListener
      );
    };
  }, [handleDownload]);

  const handleRemove = (jobId: string) => {
    backgroundJobs.removeJob(jobId);
  };

  // Export handlers
  const handleExportSelected = useCallback(async () => {
    if (selectedConversations.size === 0) {
      managedToast.error("Please select conversations to export");
      return;
    }

    try {
      const conversationIds = Array.from(
        selectedConversations
      ) as Id<"conversations">[];
      await backgroundJobs.startExport(conversationIds, {
        includeAttachmentContent: includeAttachments,
      });
      managedToast.success(
        `Started exporting ${conversationIds.length} conversation${conversationIds.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      managedToast.error("Failed to start export", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }, [selectedConversations, includeAttachments, backgroundJobs, managedToast]);

  const handleExportSingle = useCallback(
    async (conversationId: Id<"conversations">) => {
      try {
        await backgroundJobs.startExport([conversationId], {
          includeAttachmentContent: includeAttachments,
        });
        managedToast.success("Started exporting conversation");
      } catch (error) {
        managedToast.error("Failed to start export", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    },
    [backgroundJobs, includeAttachments, managedToast]
  );

  // Delete handlers
  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true);
    try {
      const BackgroundThreshold = 10;

      if (deleteTarget === "selected") {
        const ids = Array.from(selectedConversations);

        if (ids.length > BackgroundThreshold) {
          await backgroundJobs.startBulkDelete(ids);
          managedToast.success(
            `Started deleting ${ids.length} conversations in background. You'll be notified when complete.`
          );
        } else {
          await bulkRemove({ ids });
          managedToast.success("Conversations Deleted", {
            description: `${ids.length} conversation${ids.length === 1 ? "" : "s"} deleted successfully.`,
          });
          del(CACHE_KEYS.conversations);
        }
        clearSelection();
      } else if (deleteTarget) {
        await bulkRemove({ ids: [deleteTarget] });
        managedToast.success("Conversation Deleted");
        del(CACHE_KEYS.conversations);
      }
    } catch (_error) {
      managedToast.error("Delete Failed", {
        description: "Failed to delete conversations. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  }, [
    deleteTarget,
    selectedConversations,
    clearSelection,
    bulkRemove,
    backgroundJobs,
    managedToast,
  ]);

  // Create selection adapter for VirtualizedDataList
  const selectionAdapter = useMemo(
    () => ({
      selectedKeys: selectedConversations as Set<string>,
      isSelected: (conv: ConversationSummary) => listSelection.isSelected(conv),
      isAllSelected: (items: ConversationSummary[]) =>
        listSelection.isAllSelected(items),
      toggleItem: (conv: ConversationSummary) => {
        listSelection.toggleItem(conv);
      },
      toggleAll: (items: ConversationSummary[]) => {
        listSelection.toggleAll(items);
      },
    }),
    [selectedConversations, listSelection]
  );

  // Column definitions
  const columns: VirtualizedDataListColumn<ConversationSummary, SortField>[] =
    useMemo(
      () => [
        {
          key: "conversation",
          label: "Conversation",
          render: conv => {
            const isRecentlyImported = recentlyImportedIds.has(conv._id);
            return (
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {conv.isPinned && (
                      <PushPinIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                    <span className="font-medium truncate">{conv.title}</span>
                    {isRecentlyImported && (
                      <Badge
                        variant="success"
                        className="text-xs flex-shrink-0"
                      >
                        New
                      </Badge>
                    )}
                    {conv.isArchived && (
                      <ArchiveIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(conv.updatedAt)}
                  </div>
                </div>
              </div>
            );
          },
          hideOnMobile: true,
        },
        {
          key: "updated",
          label: "Last Updated",
          sortable: true,
          sortField: "updated" as SortField,
          width: "w-32",
          className: "text-sm text-muted-foreground",
          hideOnMobile: true,
          render: conv => formatDate(conv.updatedAt),
        },
        {
          key: "actions",
          label: "",
          width: "w-24",
          className: "text-right",
          hideOnMobile: true,
          render: conv => (
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  navigate(`/chat/${conv._id}`);
                }}
                title="Open conversation"
              >
                <ChatCircleIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  handleExportSingle(conv._id);
                }}
                disabled={isExporting}
                title="Export conversation"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={e => {
                  e.stopPropagation();
                  setDeleteTarget(conv._id);
                  setShowDeleteDialog(true);
                }}
                title="Delete conversation"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          ),
        },
      ],
      [recentlyImportedIds, navigate, handleExportSingle, isExporting]
    );

  // Mobile drawer config
  const mobileDrawerConfig: MobileDrawerConfig<ConversationSummary> = useMemo(
    () => ({
      title: conv => conv.title,
      subtitle: conv => {
        const parts = [formatDate(conv.updatedAt)];
        if (conv.isArchived) {
          parts.push("Archived");
        }
        return parts.join(" • ");
      },
      actions: [
        {
          key: "open",
          icon: ChatCircleIcon,
          label: "Open conversation",
          onClick: conv => navigate(`/chat/${conv._id}`),
        },
        {
          key: "export",
          icon: DownloadIcon,
          label: "Export conversation",
          onClick: conv => handleExportSingle(conv._id),
          disabled: isExporting,
        },
        {
          key: "delete",
          icon: TrashIcon,
          label: "Delete conversation",
          onClick: conv => {
            setDeleteTarget(conv._id);
            setShowDeleteDialog(true);
          },
          className:
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
        },
      ],
    }),
    [navigate, handleExportSingle, isExporting]
  );

  // Mobile renderers
  const mobileTitleRender = useCallback(
    (conv: ConversationSummary) => {
      const isRecentlyImported = recentlyImportedIds.has(conv._id);
      return (
        <div className="flex items-center gap-2 min-w-0">
          {conv.isPinned && (
            <PushPinIcon className="h-4 w-4 text-primary flex-shrink-0" />
          )}
          <span className="font-medium truncate flex-1">{conv.title}</span>
          {isRecentlyImported && (
            <Badge variant="success" className="text-xs flex-shrink-0">
              New
            </Badge>
          )}
        </div>
      );
    },
    [recentlyImportedIds]
  );

  const mobileMetadataRender = useCallback(
    (conv: ConversationSummary) => (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{formatDate(conv.updatedAt)}</span>
        {conv.isArchived && (
          <>
            <span>•</span>
            <span className="flex items-center gap-1">
              <ArchiveIcon className="h-3 w-3" />
              Archived
            </span>
          </>
        )}
      </div>
    ),
    []
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Chat History"
        description="Manage your conversation history - import, export, and organize your chats"
      />

      <ActivitySection
        jobs={jobs}
        onDownload={handleDownload}
        onRemove={handleRemove}
        isDownloading={downloadingJobId !== null}
        downloadingJobId={downloadingJobId}
        showDetailed={true}
        title="Import & Export Activity"
        description="Track your recent imports and exports. Files are automatically deleted after 30 days."
      />

      <ImportExportActions />

      {/* Conversations Section */}
      <div className="stack-lg">
        <div className="flex-col gap-4 sm:flex-row sm:items-center sm:justify-between hidden sm:flex">
          <div className="flex flex-wrap items-center gap-2">
            {someSelected ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeAttachments}
                    onChange={e => setIncludeAttachments(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-muted-foreground">
                    Include attachment content in export
                  </span>
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportSelected}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    "Exporting..."
                  ) : (
                    <>
                      <DownloadIcon className="mr-1.5 h-4 w-4" />
                      Export ({selectedCount})
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setDeleteTarget("selected");
                    setShowDeleteDialog(true);
                  }}
                >
                  <TrashIcon className="mr-1.5 h-4 w-4" />
                  Delete ({selectedCount})
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
              </>
            ) : undefined}
          </div>
        </div>

        {/* VirtualizedDataList */}
        <VirtualizedDataList<ConversationSummary, SortField>
          query={api.conversations.list}
          queryArgs={{ includeArchived: true, sortDirection }}
          columns={columns}
          getItemKey={conv => conv._id}
          selection={selectionAdapter}
          sort={{
            field: sortField,
            direction: sortDirection,
            onSort: handleSort,
          }}
          onRowClick={conv => selectionAdapter.toggleItem(conv)}
          mobileTitleRender={mobileTitleRender}
          mobileMetadataRender={mobileMetadataRender}
          mobileDrawerConfig={mobileDrawerConfig}
          emptyState={
            <ListEmptyState
              icon={<ChatCircleIcon className="h-12 w-12" />}
              title="No Conversations"
              description="Start a new conversation to see it here"
            />
          }
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={open => {
          setShowDeleteDialog(open);
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Conversations"
        description={
          deleteTarget === "selected"
            ? `Are you sure you want to delete ${selectedCount} conversation${selectedCount === 1 ? "" : "s"}? This action cannot be undone.`
            : "Are you sure you want to delete this conversation? This action cannot be undone."
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        onConfirm={handleDeleteConfirm}
        variant="destructive"
      />
    </SettingsPageLayout>
  );
}
