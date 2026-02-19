import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  DownloadIcon,
  FileCodeIcon,
  FloppyDiskIcon,
  GitBranchIcon,
  GitCommitIcon,
  ShareNetworkIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOnline } from "@/hooks/use-online";
import { downloadFile, generateFilename } from "@/lib/export";
import { ROUTES } from "@/lib/routes";
import { cn, formatDate } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import { useUI } from "@/providers/ui-provider";
import type { ChatMessage, ConversationId } from "@/types";

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0;

type ChatHeaderProps = {
  conversationId?: ConversationId;
  conversation?: Doc<"conversations"> | null;
  isPrivateMode?: boolean;
  onSavePrivateChat?: () => void;
  canSavePrivateChat?: boolean;
  privateMessages?: ChatMessage[];
};

function getBranchLabel(
  branches: Array<{ _id: string }>,
  currentConversationId: string | undefined
): string {
  const idx = branches.findIndex(
    b => b._id === (currentConversationId as unknown as string)
  );
  const pos = idx >= 0 ? idx + 1 : 1;
  return `${pos}/${branches.length}`;
}

function sortBranches(
  branches: Array<{
    _id: string;
    parentConversationId?: string;
    createdAt?: number;
    title?: string;
  }>,
  rootId: string | undefined
) {
  return [...branches].sort((a, b) => {
    const aRoot = !a.parentConversationId || a._id === rootId;
    const bRoot = !b.parentConversationId || b._id === rootId;
    if (aRoot && !bRoot) {
      return -1;
    }
    if (!aRoot && bRoot) {
      return 1;
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

const ChatHeaderComponent = ({
  conversationId,
  conversation,
  isPrivateMode,
  onSavePrivateChat,
  canSavePrivateChat,
  privateMessages,
}: ChatHeaderProps) => {
  const { isSidebarVisible, setSidebarVisible } = useUI();
  const managedToast = useToast();
  const online = useOnline();
  const navigate = useNavigate();
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );

  // Check if conversation is shared
  const sharedStatus = useQuery(
    api.sharedConversations.getSharedStatus,
    conversationId ? { conversationId } : "skip"
  );

  // Branch navigation: load all related branches using rootConversationId
  const branches = useQuery(
    api.branches.getBranches,
    conversationId && (conversation?.rootConversationId || conversation?._id)
      ? {
          rootConversationId: (conversation?.rootConversationId ||
            conversationId) as Id<"conversations">,
        }
      : ("skip" as const)
  );

  const handlePrivateExport = (format: "json" | "md") => {
    if (!privateMessages) {
      return;
    }

    setExportingFormat(format);

    try {
      let content: string;
      let mimeType: string;

      if (format === "json") {
        content = JSON.stringify(
          {
            messages: privateMessages.map(msg => ({
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
              attachments: msg.attachments,
            })),
            exportedAt: new Date().toISOString(),
            type: "private-chat",
          },
          null,
          2
        );
        mimeType = "application/json";
      } else {
        content = privateMessages
          .filter(msg => msg.content)
          .map(msg => {
            const timestamp = new Date(msg.createdAt).toLocaleString();
            const role = msg.role === "user" ? "You" : "Assistant";
            return `## ${role} (${timestamp})\n\n${msg.content}\n`;
          })
          .join("\n");
        mimeType = "text/markdown";
      }

      const filename = generateFilename("Private Chat", format);
      downloadFile(content, filename, mimeType);

      managedToast.success("Export successful", {
        description: `Private chat exported as ${filename}`,
        id: `export-private-${Date.now()}`,
      });
    } catch (_error) {
      managedToast.error("Export failed", {
        description: "An error occurred while exporting the private chat",
        id: `export-private-error-${Date.now()}`,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-between gap-1.5 py-0 sm:gap-2",
        "z-sticky"
      )}
    >
      {/* Left side: sidebar toggle + branch selector + shared indicator */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {!(isSidebarVisible || isPrivateMode) && (
          <Button
            size="icon-sm"
            title={`Expand sidebar (${isMac ? "⌘B" : "Ctrl+B"})`}
            variant="ghost"
            onClick={() => setSidebarVisible(true)}
          >
            <SidebarSimpleIcon />
          </Button>
        )}

        {/* Branch selector */}
        {conversationId && Array.isArray(branches) && branches.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="pill" className="h-5 mt-0">
                <GitBranchIcon />
                <span className="text-xxs">
                  {getBranchLabel(
                    branches,
                    conversation?._id as unknown as string
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {sortBranches(
                branches,
                conversation?.rootConversationId || conversation?._id
              ).map(b => {
                const rootId =
                  conversation?.rootConversationId || conversation?._id;
                const isRoot = !b.parentConversationId || b._id === rootId;
                const isActive = b._id === conversation?._id;
                const created = formatDate(b.createdAt || 0);
                return (
                  <DropdownMenuItem
                    key={b._id}
                    onClick={() => navigate(ROUTES.CHAT_CONVERSATION(b._id))}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full flex-shrink-0",
                          isActive ? "bg-primary" : "bg-transparent"
                        )}
                        aria-label={isActive ? "Active" : undefined}
                      />
                      <div className="w-4 flex items-center justify-center flex-shrink-0">
                        {isRoot ? (
                          <GitCommitIcon
                            className="size-3.5 text-muted-foreground"
                            aria-label="Root conversation"
                          />
                        ) : (
                          <GitBranchIcon
                            className="size-3.5 text-muted-foreground"
                            aria-label="Branch"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm truncate">{b.title}</span>
                          <span className="text-xxs text-muted-foreground whitespace-nowrap">
                            {created}
                          </span>
                        </div>
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {sharedStatus && (
          <Tooltip>
            <TooltipTrigger>
              <span className="inline-flex items-center h-6 px-1">
                <ShareNetworkIcon className="size-4 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>This conversation is shared</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Right side: private mode controls */}
      {isPrivateMode && (
        <div className="flex items-center gap-1 sm:gap-1.5">
          {canSavePrivateChat && (
            <Button
              variant="ghost"
              size="pill"
              onClick={onSavePrivateChat}
              disabled={!online}
            >
              <FloppyDiskIcon className="size-3.5" />
              <span className="text-xs">Save</span>
            </Button>
          )}

          {privateMessages && privateMessages.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Export private chat"
                  disabled={exportingFormat !== null}
                >
                  <DownloadIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handlePrivateExport("json")}
                  disabled={exportingFormat !== null}
                >
                  <FileCodeIcon className="mr-2 size-4" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handlePrivateExport("md")}
                  disabled={exportingFormat !== null}
                >
                  <DownloadIcon className="mr-2 size-4" />
                  Export as Markdown
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
};

export const ChatHeader = memo(ChatHeaderComponent);
