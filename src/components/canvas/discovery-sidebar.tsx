import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import {
  ArrowLeftIcon,
  BookmarkSimpleIcon,
  ImagesIcon,
  PauseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { PanelLeftIcon } from "@/components/animate-ui/icons/panel-left";
import { SquarePenIcon } from "@/components/animate-ui/icons/square-pen";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  SidebarShell,
  SidebarShellContent,
  SidebarShellHeader,
} from "@/components/ui/sidebar-shell";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useDiscoveryStore } from "@/stores/discovery-store";

interface DiscoverySidebarProps {
  onResumeSession: (sessionId: string) => void;
}

export function DiscoverySidebar({ onResumeSession }: DiscoverySidebarProps) {
  const sessions = useQuery(api.discoverySessions.list, { limit: 50 });
  const removeSession = useMutation(api.discoverySessions.remove);
  const completeSession = useMutation(api.discoverySessions.complete);
  const activeSessionId = useDiscoveryStore(s => s.sessionId);

  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<
    string | null
  >(null);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      setPendingDeleteSessionId(sessionId);
    },
    []
  );

  const handleConfirmDelete = useCallback(() => {
    if (pendingDeleteSessionId) {
      removeSession({ sessionId: pendingDeleteSessionId });
      setPendingDeleteSessionId(null);
    }
  }, [pendingDeleteSessionId, removeSession]);

  const handleComplete = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      completeSession({ sessionId });
    },
    [completeSession]
  );

  return (
    <div className="px-2 stack-xs">
      {sessions === undefined && (
        <div className="px-2 py-8 text-center text-xs text-muted-foreground/50">
          Loading...
        </div>
      )}
      {sessions?.length === 0 && (
        <div className="px-2 py-8 text-center text-xs text-muted-foreground/50">
          No sessions yet
        </div>
      )}
      {sessions?.map(session => (
        <SessionItem
          key={session._id}
          session={session}
          isActive={session.sessionId === activeSessionId}
          onResume={() => onResumeSession(session.sessionId)}
          onDelete={e => handleDeleteClick(e, session.sessionId)}
          onComplete={e => handleComplete(e, session.sessionId)}
        />
      ))}

      <ConfirmationDialog
        open={pendingDeleteSessionId !== null}
        onOpenChange={open => {
          if (!open) {
            setPendingDeleteSessionId(null);
          }
        }}
        title="Delete session"
        description="This will permanently delete this discovery session and all its history. This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiscoveryPanelSidebar — full sidebar shell, reused across entry form & session
// ---------------------------------------------------------------------------

interface DiscoveryPanelSidebarProps {
  onResumeSession: (sessionId: string) => void;
}

export function DiscoveryPanelSidebar({
  onResumeSession,
}: DiscoveryPanelSidebarProps) {
  const isPanelVisible = useDiscoveryStore(s => s.isPanelVisible);
  const panelWidth = useDiscoveryStore(s => s.panelWidth);
  const togglePanel = useDiscoveryStore(s => s.togglePanel);
  const setPanelWidth = useDiscoveryStore(s => s.setPanelWidth);
  const setIsResizing = useDiscoveryStore(s => s.setIsResizing);
  const resetPanelWidth = useDiscoveryStore(s => s.resetPanelWidth);

  return (
    <SidebarShell
      width={panelWidth}
      resizable
      onWidthChange={setPanelWidth}
      onResizeStart={() => setIsResizing(true)}
      onResizeEnd={() => setIsResizing(false)}
      onDoubleClickHandle={resetPanelWidth}
      collapsed={!isPanelVisible}
      onExpand={togglePanel}
      side="left"
    >
      <SidebarShellHeader>
        <Link to={ROUTES.CANVAS} viewTransition>
          <Button size="icon-sm" title="Back to canvas" variant="ghost">
            <ArrowLeftIcon className="size-4.5" />
          </Button>
        </Link>
        <Link to={ROUTES.DISCOVER}>
          <Button size="icon-sm" title="New session" variant="ghost">
            <SquarePenIcon animateOnHover className="size-4.5" />
          </Button>
        </Link>
        <Button
          size="icon-sm"
          title="Collapse panel"
          variant="ghost"
          onClick={togglePanel}
        >
          <PanelLeftIcon animateOnHover className="size-4.5" />
        </Button>
      </SidebarShellHeader>
      <SidebarShellContent>
        <DiscoverySidebar onResumeSession={onResumeSession} />
      </SidebarShellContent>
    </SidebarShell>
  );
}

function SessionItem({
  session,
  isActive,
  onResume,
  onDelete,
  onComplete,
}: {
  session: Doc<"discoverySessions">;
  isActive: boolean;
  onResume: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onComplete: (e: React.MouseEvent) => void;
}) {
  const savedCount = session.reactions.filter(
    r => r.reaction === "saved"
  ).length;

  const label = session.seedPrompt || "Random exploration";

  return (
    <button
      type="button"
      className={cn(
        "group w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        isActive && "bg-muted/70"
      )}
      onClick={onResume}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground/90">{label}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/60">
            <span className="flex items-center gap-0.5">
              <ImagesIcon className="size-3" />
              {session.generationCount}
            </span>
            {savedCount > 0 && (
              <span className="flex items-center gap-0.5">
                <BookmarkSimpleIcon className="size-3" />
                {savedCount}
              </span>
            )}
            <span>
              {formatDistanceToNow(session.updatedAt, { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Status badge */}
        {session.status === "active" && (
          <span className="mt-0.5 shrink-0 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-500">
            Active
          </span>
        )}
        {session.status === "paused" && (
          <span className="mt-0.5 shrink-0 rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-[10px] text-yellow-500">
            Paused
          </span>
        )}
      </div>

      {/* Action buttons — show on hover, always visible on mobile */}
      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
        {session.status !== "completed" && (
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            onClick={onComplete}
          >
            <PauseIcon className="size-3" />
            End
          </button>
        )}
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-500"
          onClick={onDelete}
        >
          <TrashIcon className="size-3" />
          Delete
        </button>
      </div>
    </button>
  );
}
