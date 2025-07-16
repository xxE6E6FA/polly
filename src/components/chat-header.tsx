import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  DotsThreeVerticalIcon,
  DownloadIcon,
  FileCodeIcon,
  FloppyDiskIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePersistentConvexQuery } from "@/hooks/use-persistent-convex-query";
import { useUserData } from "@/hooks/use-user-data";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import type { ChatMessage, ConversationId, ExportData } from "@/types";

const isExportData = (x: unknown): x is ExportData => {
  return (
    !!x &&
    typeof x === "object" &&
    "conversation" in x &&
    "messages" in x &&
    Array.isArray((x as Record<string, unknown>).messages)
  );
};

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ControlledShareConversationDialog } from "./ui/share-conversation-dialog";
import { Skeleton } from "./ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ChatHeaderProps = {
  conversationId?: ConversationId;
  isPrivateMode?: boolean;
  isArchived?: boolean;
  onSavePrivateChat?: () => void;
  canSavePrivateChat?: boolean;
  privateMessages?: ChatMessage[];
  privatePersonaId?: Id<"personas">;
};

export const ChatHeader = ({
  conversationId,
  isPrivateMode,
  isArchived,
  onSavePrivateChat,
  canSavePrivateChat,
  privateMessages,
  privatePersonaId,
}: ChatHeaderProps) => {
  const userData = useUserData();
  const user = userData?.user;
  const { isSidebarVisible } = useUI();
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );
  const [shouldLoadExportData, setShouldLoadExportData] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  const conversation = usePersistentConvexQuery<Doc<"conversations"> | null>(
    "chat-header-conversation",
    api.conversations.get,
    conversationId ? { id: conversationId } : "skip"
  );

  const exportDataRaw = usePersistentConvexQuery(
    "chat-header-export",
    api.conversations.getForExport,
    conversationId && shouldLoadExportData ? { id: conversationId } : "skip"
  );

  const exportData = isExportData(exportDataRaw) ? exportDataRaw : null;

  const persona = usePersistentConvexQuery<Doc<"personas"> | null>(
    "chat-header-persona",
    api.personas.get,
    conversation?.personaId
      ? { id: conversation.personaId }
      : privatePersonaId
        ? { id: privatePersonaId }
        : "skip"
  );

  const handleExport = (format: "json" | "md") => {
    // Handle private chat export
    if (isPrivateMode && privateMessages) {
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

        toast.success("Export successful", {
          description: `Private chat exported as ${filename}`,
        });
      } catch (_error) {
        toast.error("Export failed", {
          description: "An error occurred while exporting the private chat",
        });
      }
      return;
    }

    // Handle regular conversation export
    if (!conversationId) {
      toast.error("Export failed", {
        description: "No conversation to export",
      });
      return;
    }

    setExportingFormat(format);
    setShouldLoadExportData(true);
  };

  // Handle export data loading completion and errors
  useEffect(() => {
    if (exportData && exportingFormat && conversation) {
      try {
        let content: string;
        let mimeType: string;

        if (exportingFormat === "json") {
          content = exportAsJSON(exportData);
          mimeType = "application/json";
        } else {
          content = exportAsMarkdown(exportData);
          mimeType = "text/markdown";
        }

        const filename = generateFilename(conversation.title, exportingFormat);
        downloadFile(content, filename, mimeType);

        toast.success("Export successful", {
          description: `Conversation exported as ${filename}`,
        });
      } catch (_error) {
        toast.error("Export failed", {
          description: "An error occurred while exporting the conversation",
        });
      } finally {
        setExportingFormat(null);
        setShouldLoadExportData(false);
      }
    } else if (shouldLoadExportData && exportData === null && exportingFormat) {
      toast.error("Export failed", {
        description: "Unable to load conversation data",
      });
      setExportingFormat(null);
      setShouldLoadExportData(false);
    }
  }, [exportData, exportingFormat, conversation, shouldLoadExportData]);

  // For chat pages, show full header with conversation title
  return (
    <div
      className={cn(
        "relative flex min-h-[2rem] w-full items-center justify-between gap-2 bg-background py-3 sm:gap-4",
        !isSidebarVisible && "pl-12 sm:pl-14",
        isSidebarVisible && "transition-[padding] duration-300 ease-out",
        "z-10",
        "after:pointer-events-none after:absolute after:-bottom-6 after:left-0 after:right-0 after:h-6 after:bg-gradient-to-b after:from-background after:to-transparent"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isPrivateMode ? (
          <div className="h-4" />
        ) : conversation === undefined ? (
          <Skeleton className="h-4 w-[120px] sm:w-[200px]" />
        ) : conversation?.title ? (
          <h1 className="truncate text-xs font-medium text-foreground sm:text-sm">
            {conversation.title}
          </h1>
        ) : (
          <div className="h-4" />
        )}
        {persona && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                className="flex-shrink-0 cursor-default gap-1 sm:gap-2"
                variant="info"
              >
                <span className="text-xs sm:text-sm">
                  {persona.icon || "🤖"}
                </span>
                <span className="text-xxs hidden sm:inline">
                  {persona.name}
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              <p>{persona.name}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Only show actions for authenticated users */}
      {user && !user.isAnonymous && (
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Save private chat button */}
          {isPrivateMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSavePrivateChat}
              disabled={!canSavePrivateChat}
              className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
            >
              <FloppyDiskIcon className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          )}

          {/* Share button - only for regular conversations */}
          {!isPrivateMode && conversationId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsShareDialogOpen(true)}
              className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
            >
              <ShareNetworkIcon className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}

          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 sm:h-8 sm:w-8"
              >
                <DotsThreeVerticalIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleExport("json")}
                disabled={exportingFormat !== null}
              >
                <FileCodeIcon className="mr-2 h-4 w-4" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("md")}
                disabled={exportingFormat !== null}
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                Export as Markdown
              </DropdownMenuItem>
              {!isPrivateMode && conversation && !isArchived && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <ArchiveIcon className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Share dialog */}
      {conversationId && (
        <ControlledShareConversationDialog
          conversationId={conversationId}
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
        />
      )}
    </div>
  );
};
