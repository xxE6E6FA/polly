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
import { FileText, FileJson, Share2, MoreHorizontal } from "lucide-react";
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
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        {conversation === undefined ? (
          // Loading state for title
          <Skeleton className="h-5 w-[200px]" />
        ) : conversation?.title ? (
          <h1 className="text-sm font-medium text-foreground">
            {conversation.title}
          </h1>
        ) : (
          <div className="h-5" />
        )}
        {persona && (
          <Badge
            variant="info-subtle"
            size="default"
            className="gap-1.5 pl-1.5 pr-2.5 py-1 font-medium shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md hover:scale-105"
          >
            <span className="text-base leading-none">
              {persona.icon || "🤖"}
            </span>
            <span className="text-xs">{persona.name}</span>
          </Badge>
        )}
      </div>

      {/* Only show actions for authenticated users */}
      {conversationId && isAuthenticated && (
        <div className="flex items-center gap-2">
          {/* Share button - always visible, disabled when loading */}
          <ShareConversationDialog conversationId={conversationId}>
            <Button
              variant="action"
              size="sm"
              className="gap-2"
              disabled={!conversation}
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
              <span className="sr-only">Share conversation</span>
            </Button>
          </ShareConversationDialog>

          {/* Export dropdown - always visible */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="action" size="icon-sm">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleExport("md")}
                disabled={!exportData}
              >
                <FileText className="mr-2 h-4 w-4" />
                Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("json")}
                disabled={!exportData}
              >
                <FileJson className="mr-2 h-4 w-4" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
