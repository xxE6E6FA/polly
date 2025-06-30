import { Link } from "react-router";

import { useAuthToken } from "@convex-dev/auth/react";
import {
  DotsThreeVerticalIcon,
  FileCodeIcon,
  FileTextIcon,
  FloppyDiskIcon,
  ShareNetworkIcon,
  StackPlusIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-user";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type ConversationId, type ChatMessage } from "@/types";

import { Skeleton } from "./ui/skeleton";
import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

type ChatHeaderProps = {
  conversationId?: ConversationId;
  isPrivateMode?: boolean;
  onSavePrivateChat?: () => void;
  canSavePrivateChat?: boolean;
  privateMessages?: ChatMessage[]; // For private chat export
  // For private mode persona display
  privatePersonaId?: Id<"personas">;
};

export const ChatHeader = ({
  conversationId,
  isPrivateMode,
  onSavePrivateChat,
  canSavePrivateChat,
  privateMessages,
  privatePersonaId,
}: ChatHeaderProps) => {
  const { user } = useUser();
  const token = useAuthToken();
  const { isSidebarVisible, mounted } = useSidebar();

  // Check if user is authenticated (not anonymous)
  const isAuthenticated = Boolean(token) && Boolean(user) && !user?.isAnonymous;

  const conversation = useQuery(
    api.conversations.getAuthorized,
    conversationId ? { id: conversationId, userId: user?._id } : "skip"
  );

  const exportData = useQuery(
    api.conversations.getForExport,
    conversationId ? { id: conversationId } : "skip"
  );

  const persona = useQuery(
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
            .filter(msg => msg.content) // Only include messages with content
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
    if (!exportData || !conversation) {
      toast.error("Export failed", {
        description: "Unable to load conversation data",
      });
      return;
    }

    try {
      let content: string;
      let mimeType: string;

      if (format === "json") {
        content = exportAsJSON(exportData);
        mimeType = "application/json";
      } else {
        content = exportAsMarkdown(exportData);
        mimeType = "text/markdown";
      }

      const filename = generateFilename(conversation.title, format);
      downloadFile(content, filename, mimeType);

      toast.success("Export successful", {
        description: `Conversation exported as ${filename}`,
      });
    } catch (_error) {
      toast.error("Export failed", {
        description: "An error occurred while exporting the conversation",
      });
    }
  };

  // For chat pages, show full header with conversation title
  return (
    <div
      className={cn(
        "relative flex min-h-[2rem] w-full items-center justify-between gap-2 bg-background py-3 sm:gap-4",
        // Add left padding only when sidebar is collapsed
        !isSidebarVisible && "pl-12 sm:pl-14",
        // Add transition for smooth animation (matching sidebar transition)
        mounted && "transition-[padding] duration-300 ease-out",
        // Add z-index to ensure header is above content
        "z-10",
        // Add bottom fade effect
        "after:pointer-events-none after:absolute after:-bottom-6 after:left-0 after:right-0 after:h-6 after:bg-gradient-to-b after:from-background after:to-transparent"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isPrivateMode ? (
          // Hide title in private mode
          <div className="h-4" />
        ) : conversation === undefined ? (
          // Loading state for title
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
      {(conversationId || isPrivateMode) && isAuthenticated && (
        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
          {/* New chat button - only show when not in private mode */}
          {!isPrivateMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  className="sm:w-auto sm:gap-2 sm:px-3"
                  size="icon-sm"
                  variant="action"
                >
                  <Link to={ROUTES.HOME}>
                    <StackPlusIcon className="h-4 w-4" />
                    <span className="hidden text-xs sm:inline">New</span>
                    <span className="sr-only sm:hidden">New chat</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">
                <p>New chat</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Save Private Chat button - show outside dropdown in private mode */}
          {isPrivateMode && onSavePrivateChat && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="sm:w-auto sm:gap-2 sm:px-3"
                  size="icon-sm"
                  variant="action"
                  disabled={!canSavePrivateChat}
                  onClick={onSavePrivateChat}
                >
                  <FloppyDiskIcon className="h-4 w-4" />
                  <span className="hidden text-xs sm:inline">Save</span>
                  <span className="sr-only sm:hidden">Save chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">
                <p>Save private chat</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Only show share button for saved conversations */}
          {conversationId && (
            <ShareConversationDialog conversationId={conversationId}>
              <Button
                className="sm:w-auto sm:gap-2 sm:px-3"
                disabled={!conversation}
                size="icon-sm"
                title={conversation ? "Share conversation" : "Loading..."}
                variant="action"
              >
                <ShareNetworkIcon className="h-4 w-4" />
                <span className="hidden text-xs sm:inline">Share</span>
                <span className="sr-only sm:hidden">Share conversation</span>
              </Button>
            </ShareConversationDialog>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" title="More options" variant="action">
                <DotsThreeVerticalIcon className="h-4 w-4" weight="bold" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={
                  isPrivateMode ? !privateMessages?.length : !exportData
                }
                onClick={() => handleExport("md")}
              >
                <FileTextIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>Export as Markdown</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={
                  isPrivateMode ? !privateMessages?.length : !exportData
                }
                onClick={() => handleExport("json")}
              >
                <FileCodeIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>Export as JSON</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};
