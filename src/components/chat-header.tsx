import { useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { ConversationId } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileTextIcon,
  FileCodeIcon,
  ShareNetworkIcon,
  DotsThreeVerticalIcon,
  StackPlusIcon,
} from "@phosphor-icons/react";
import { ShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import {
  exportAsJSON,
  exportAsMarkdown,
  downloadFile,
  generateFilename,
} from "@/lib/export";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-user";
import { Skeleton } from "./ui/skeleton";
import { Link } from "react-router";
import { ROUTES } from "@/lib/routes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatHeaderProps {
  conversationId?: ConversationId;
}

export function ChatHeader({ conversationId }: ChatHeaderProps) {
  const { user } = useUser();
  const token = useAuthToken();

  // Check if user is authenticated (not anonymous)
  const isAuthenticated = !!token && !!user && !user.isAnonymous;

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
    conversation?.personaId ? { id: conversation.personaId } : "skip"
  );

  const handleExport = async (format: "json" | "md") => {
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
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Export failed", {
        description: "An error occurred while exporting the conversation",
      });
    }
  };

  // For chat pages, show full header with conversation title
  return (
    <div className="flex items-center justify-between w-full gap-2 sm:gap-4 min-h-[2.5rem]">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {conversation === undefined ? (
          // Loading state for title
          <Skeleton className="h-5 w-[120px] sm:w-[200px]" />
        ) : conversation?.title ? (
          <h1 className="text-sm font-medium text-foreground truncate">
            {conversation.title}
          </h1>
        ) : (
          <div className="h-5" />
        )}
        {persona && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="info"
                className="gap-1 sm:gap-2 flex-shrink-0 cursor-default"
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
      {conversationId && isAuthenticated && (
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="action"
                size="icon-sm"
                className="sm:w-auto sm:px-3 sm:gap-2"
                asChild
              >
                <Link to={ROUTES.HOME}>
                  <StackPlusIcon className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">New</span>
                  <span className="sr-only sm:hidden">New chat</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              <p>New chat</p>
            </TooltipContent>
          </Tooltip>
          <ShareConversationDialog conversationId={conversationId}>
            <Button
              variant="action"
              size="icon-sm"
              className="sm:w-auto sm:px-3 sm:gap-2"
              disabled={!conversation}
              title={conversation ? "Share conversation" : "Loading..."}
            >
              <ShareNetworkIcon className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Share</span>
              <span className="sr-only sm:hidden">Share conversation</span>
            </Button>
          </ShareConversationDialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="action" size="icon-sm" title="More options">
                <DotsThreeVerticalIcon weight="bold" className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => handleExport("md")}
                disabled={!exportData}
                className="cursor-pointer"
              >
                <FileTextIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>Export as Markdown</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("json")}
                disabled={!exportData}
                className="cursor-pointer"
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
}
