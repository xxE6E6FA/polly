import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { BrainIcon, ToggleLeftIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/components/chat/memory-indicator";
import type { MobileDrawerConfig } from "@/components/data-list/data-list-mobile-drawer";
import type { VirtualizedDataListColumn } from "@/components/data-list/virtualized-data-list";
import { VirtualizedDataList } from "@/components/data-list/virtualized-data-list";
import { SettingsHeader } from "@/components/settings/settings-header";
import { ActivitySection } from "@/components/settings/ui/activity-section";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { SettingsZeroState } from "@/components/settings/ui/settings-zero-state";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useDebounce } from "@/hooks/use-debounce";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import type { SortDirection } from "@/hooks/use-list-sort";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

type MemoryItem = Doc<"userMemories">;

type SortField = "createdAt";

export function MemoryContent() {
  const userSettings = useUserSettings();
  const updateSettings = useMutation(api.userSettings.updateUserSettings);
  const memoryCountResult = useQuery(api.memory.getMemoryCount);
  const memoryCount = memoryCountResult?.count;
  const memoryCountLabel = memoryCountResult?.isApproximate
    ? "99+"
    : String(memoryCount ?? 0);
  const toggleActive = useMutation(api.memory.toggleActive);
  const removeMemory = useMutation(api.memory.remove);
  const clearAllMutation = useMutation(api.memory.clearAll);
  const confirmationDialog = useConfirmationDialog();
  const managedToast = useToast();
  const backgroundJobs = useBackgroundJobs();

  const memoryScanJobs = useMemo(
    () => backgroundJobs.activeJobs.filter(j => j.type === "memory_scan"),
    [backgroundJobs.activeJobs]
  );
  const hasActiveScan = memoryScanJobs.some(
    j => j.status === "scheduled" || j.status === "processing"
  );

  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const memoryEnabled = userSettings?.memoryEnabled ?? false;

  const handleToggleMemory = () => {
    startTransition(async () => {
      await updateSettings({ memoryEnabled: !memoryEnabled });
    });
  };

  const handleSort = useCallback(() => {
    setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const handleToggleActive = useCallback(
    (memory: MemoryItem) => {
      startTransition(async () => {
        await toggleActive({ id: memory._id });
      });
    },
    [toggleActive]
  );

  const handleDelete = useCallback(
    (memory: MemoryItem) => {
      setDeletingId(memory._id);
      startTransition(async () => {
        try {
          await removeMemory({ id: memory._id });
          managedToast.success("Memory deleted");
        } finally {
          setDeletingId(null);
        }
      });
    },
    [removeMemory, managedToast.success]
  );

  const handleClearAll = useCallback(() => {
    confirmationDialog.confirm(
      {
        title: "Clear all memories?",
        description: `This will permanently delete all ${memoryCountLabel} saved memories. This action cannot be undone.`,
        confirmText: "Clear all memories",
        cancelText: "Cancel",
        variant: "destructive",
      },
      async () => {
        let hasMore = true;
        try {
          while (hasMore) {
            const result = await clearAllMutation();
            hasMore = result?.hasMore ?? false;
          }
          managedToast.success("All memories cleared");
        } catch {
          managedToast.error("Failed to clear all memories. Some may remain.");
        }
      }
    );
  }, [
    confirmationDialog,
    clearAllMutation,
    managedToast.success,
    managedToast.error,
    memoryCountLabel,
  ]);

  const columns: VirtualizedDataListColumn<MemoryItem, SortField>[] = useMemo(
    () => [
      {
        key: "category",
        label: "Category",
        width: "w-24",
        hideOnMobile: true,
        render: memory => (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
              CATEGORY_COLORS[memory.category] ??
                "bg-muted text-muted-foreground"
            )}
          >
            {CATEGORY_LABELS[memory.category] ?? memory.category}
          </span>
        ),
      },
      {
        key: "content",
        label: "Memory",
        render: memory => (
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm truncate",
                !memory.isActive && "text-muted-foreground"
              )}
              title={memory.content}
            >
              {memory.content}
            </p>
            {memory.sourceConversationTitle && (
              <span className="text-xs text-muted-foreground truncate block">
                from &ldquo;{memory.sourceConversationTitle}&rdquo;
              </span>
            )}
          </div>
        ),
      },
      {
        key: "createdAt",
        label: "Added",
        width: "w-28",
        hideOnMobile: true,
        sortable: true,
        sortField: "createdAt" as SortField,
        render: memory => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {new Date(memory.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        key: "status",
        label: "",
        width: "w-24",
        className: "text-center",
        hideOnMobile: true,
        render: memory => (
          <div className="flex justify-center">
            <Switch
              checked={memory.isActive}
              onCheckedChange={() => handleToggleActive(memory)}
              disabled={isPending}
            />
          </div>
        ),
      },
      {
        key: "actions",
        label: "",
        width: "w-12",
        className: "text-right",
        render: memory => {
          const isMemoryDeleting = deletingId === memory._id;
          return (
            <div
              className="flex items-center justify-end"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
            >
              <Tooltip>
                <TooltipTrigger delayDuration={200}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(memory)}
                    disabled={isMemoryDeleting}
                  >
                    {isMemoryDeleting ? (
                      <Spinner size="sm" className="size-4" />
                    ) : (
                      <TrashIcon className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isMemoryDeleting ? "Deleting..." : "Delete memory"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [deletingId, handleToggleActive, handleDelete, isPending]
  );

  const mobileDrawerConfig: MobileDrawerConfig<MemoryItem> = useMemo(
    () => ({
      title: memory => memory.content,
      subtitle: memory =>
        `${CATEGORY_LABELS[memory.category] ?? memory.category} · Added ${new Date(memory.createdAt).toLocaleDateString()}`,
      actions: [
        {
          key: "toggle",
          label: memory =>
            memory.isActive ? "Disable memory" : "Enable memory",
          icon: ToggleLeftIcon,
          onClick: () => {
            // Toggle actions use the toggle config below, onClick is required by type
          },
          toggle: {
            checked: memory => memory.isActive,
            onCheckedChange: memory => handleToggleActive(memory),
          },
        },
        {
          key: "delete",
          label: memory =>
            deletingId === memory._id ? "Deleting..." : "Delete memory",
          icon: TrashIcon,
          onClick: memory => handleDelete(memory),
          className:
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
          disabled: memory => deletingId === memory._id,
        },
      ],
    }),
    [handleToggleActive, handleDelete, deletingId]
  );

  const getEmptyDescription = () => {
    if (searchQuery) {
      return "Try adjusting your search terms.";
    }
    if (memoryEnabled) {
      return "Start chatting and Polly will remember important details about you.";
    }
    return "Enable memory above to start saving facts across conversations.";
  };

  const emptyState = (
    <SettingsZeroState
      icon={<BrainIcon className="size-12" weight="duotone" />}
      title={searchQuery ? "No memories found" : "No memories yet"}
      description={getEmptyDescription()}
    />
  );

  if (!userSettings) {
    return (
      <SettingsPageLayout>
        <SettingsHeader
          title="Memory"
          description="Polly can remember things about you across conversations to provide more personalized responses."
        />
        <div className="stack-sm">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Memory"
        description="Polly can remember things about you across conversations to provide more personalized responses."
      />

      {/* Global Memory Toggle */}
      <div className="rounded-lg bg-muted/20 p-4 shadow-sm ring-1 ring-border/30">
        <div className="flex items-start justify-between gap-4">
          <div className="stack-sm flex-1">
            <h3 className="text-base font-semibold">Enable Memory</h3>
            <p className="text-sm text-muted-foreground">
              Automatically extract and remember relevant facts about you from
              conversations.
            </p>
          </div>
          <Switch
            checked={memoryEnabled}
            onCheckedChange={handleToggleMemory}
            disabled={isPending}
            className="flex-shrink-0"
          />
        </div>
      </div>

      {/* Scan Existing Conversations */}
      {memoryEnabled && (
        <div className="rounded-lg bg-muted/20 p-4 shadow-sm ring-1 ring-border/30">
          <div className="flex items-start justify-between gap-4">
            <div className="stack-sm flex-1">
              <h3 className="text-base font-semibold">
                Scan Existing Conversations
              </h3>
              <p className="text-sm text-muted-foreground">
                Extract memories from your recent conversations. Only processes
                conversations with enough messages.
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger delayDuration={200}>
                <Button
                  onClick={async () => {
                    await backgroundJobs.startMemoryScan();
                  }}
                  disabled={hasActiveScan}
                >
                  {hasActiveScan ? (
                    <>
                      <Spinner size="sm" className="mr-1.5" /> Scanning...
                    </>
                  ) : (
                    "Start Scan"
                  )}
                </Button>
              </TooltipTrigger>
              {hasActiveScan && (
                <TooltipContent>
                  <p>A scan is already in progress</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      )}

      {/* Scan Activity */}
      {memoryScanJobs.length > 0 && (
        <div>
          <ActivitySection
            jobs={memoryScanJobs}
            onDownload={() => {
              // Memory scan jobs don't have downloadable files
            }}
            onRemove={backgroundJobs.removeJob}
            isDownloading={false}
            downloadingJobId={null}
            showDetailed={true}
            title="Scan Activity"
          />
        </div>
      )}

      {/* Saved Memories */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Saved Memories
            {memoryCount !== undefined && memoryCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({memoryCountLabel})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <SearchInput
              placeholder="Search memories..."
              value={searchQuery}
              onChange={setSearchQuery}
              className="w-48"
            />
            {memoryCount !== undefined && memoryCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-destructive hover:text-destructive"
              >
                <TrashIcon className="mr-1.5 size-4" />
                Clear all
              </Button>
            )}
          </div>
        </div>

        <VirtualizedDataList<MemoryItem, SortField>
          query={api.memory.listPaginated}
          queryArgs={{
            sortDirection,
            searchQuery: debouncedSearchQuery || undefined,
          }}
          getItemKey={memory => memory._id}
          columns={columns}
          sort={{
            field: "createdAt",
            direction: sortDirection,
            onSort: handleSort,
          }}
          mobileTitleRender={memory => (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  CATEGORY_COLORS[memory.category] ??
                    "bg-muted text-muted-foreground"
                )}
              >
                {CATEGORY_LABELS[memory.category] ?? memory.category}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  !memory.isActive && "text-muted-foreground"
                )}
              >
                {memory.content}
              </span>
            </div>
          )}
          mobileMetadataRender={memory => (
            <span className="text-xs text-muted-foreground">
              {memory.sourceConversationTitle
                ? `from "${memory.sourceConversationTitle}" · `
                : ""}
              Added {new Date(memory.createdAt).toLocaleDateString()}
            </span>
          )}
          mobileDrawerConfig={mobileDrawerConfig}
          emptyState={emptyState}
          initialNumItems={20}
          loadMoreCount={20}
        />
      </section>

      <ConfirmationDialog
        open={confirmationDialog.state.isOpen}
        onOpenChange={confirmationDialog.handleOpenChange}
        title={confirmationDialog.state.title}
        description={confirmationDialog.state.description}
        confirmText={confirmationDialog.state.confirmText}
        cancelText={confirmationDialog.state.cancelText}
        variant={confirmationDialog.state.variant}
        onConfirm={confirmationDialog.handleConfirm}
        onCancel={confirmationDialog.handleCancel}
      />
    </SettingsPageLayout>
  );
}

export default MemoryContent;
