import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  DotsThreeIcon,
  DownloadIcon,
  FileCodeIcon,
  FloppyDiskIcon,
  GitBranchIcon,
  GitCommitIcon,
  NotePencilIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { memo, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useOnline } from "@/hooks/use-online";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { cn, formatDate } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ChatMessage, ConversationId } from "@/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ControlledShareConversationDialog } from "./ui/share-conversation-dialog";
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

function getBranchLabel(
  branches: Array<{ _id: string }>,
  currentConversationId: string | undefined
): string {
  const idx = branches.findIndex(
    b => b._id === (currentConversationId as unknown as string)
  );
  const pos = idx >= 0 ? idx + 1 : 1;
  return `Branch ${pos} of ${branches.length}`;
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
  isPrivateMode,
  isArchived,
  onSavePrivateChat,
  canSavePrivateChat,
  privateMessages,
  privatePersonaId,
}: ChatHeaderProps) => {
  const { user } = useUserDataContext();
  const { isSidebarVisible } = useUI();
  const managedToast = useToast();
  const online = useOnline();
  const navigate = useNavigate();
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );
  const [shouldLoadExportData, setShouldLoadExportData] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);

  const conversation = useQuery(
    api.conversations.get,
    conversationId ? { id: conversationId } : "skip"
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

  const exportData = useQuery(
    api.conversations.getForExport,
    conversationId && shouldLoadExportData ? { id: conversationId } : "skip"
  );

  const personaQueryArg = (() => {
    if (conversation?.personaId) {
      return { id: conversation.personaId };
    }
    if (privatePersonaId) {
      return { id: privatePersonaId };
    }
    return "skip";
  })();

  const persona = useQuery(api.personas.get, personaQueryArg);

  const patchConversation = useMutation(api.conversations.patch);

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

        managedToast.success("Export successful", {
          description: `Private chat exported as ${filename}`,
          id: `export-private-${Date.now()}`,
        });
      } catch (_error) {
        managedToast.error("Export failed", {
          description: "An error occurred while exporting the private chat",
          id: `export-private-error-${Date.now()}`,
        });
      }
      return;
    }

    // Handle regular conversation export
    if (!conversationId) {
      managedToast.error("Export failed", {
        description: "No conversation to export",
        id: "export-no-conversation",
      });
      return;
    }

    setExportingFormat(format);
    setShouldLoadExportData(true);
  };

  // Handle export data loading completion and errors
  useEffect(() => {
    if (exportData && exportingFormat && conversation && conversation.title) {
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

        managedToast.success("Export successful", {
          description: `Conversation exported as ${filename}`,
          id: `export-conversation-${conversationId}`,
        });
      } catch (_error) {
        managedToast.error("Export failed", {
          description: "An error occurred while exporting the conversation",
          id: `export-conversation-error-${conversationId}`,
        });
      } finally {
        setExportingFormat(null);
        setShouldLoadExportData(false);
      }
    } else if (shouldLoadExportData && exportData === null && exportingFormat) {
      managedToast.error("Export failed", {
        description: "Unable to load conversation data",
        id: `export-load-error-${conversationId}`,
      });
      setExportingFormat(null);
      setShouldLoadExportData(false);
    }
  }, [
    exportData,
    exportingFormat,
    conversation,
    shouldLoadExportData,
    managedToast,
    conversationId,
  ]);

  // For chat pages, show full header with conversation title
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-between gap-1.5 py-0 sm:gap-2",
        !isSidebarVisible && "pl-12 sm:pl-14",
        isSidebarVisible && "transition-[padding] duration-300 ease-out",
        "z-10"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        {persona && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                className="flex-shrink-0 cursor-default gap-1.5"
                variant="info"
              >
                {persona.icon && (
                  <span className="text-sm">{persona.icon}</span>
                )}
                <span className="text-xxs">{persona.name}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              <p>{persona.name}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {/* Branch selector */}
        {conversationId && Array.isArray(branches) && branches.length > 1 && (
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7">
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
                        {/* Active dot first (aligned) */}
                        <span
                          className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full flex-shrink-0",
                            isActive ? "bg-primary" : "bg-transparent"
                          )}
                          aria-label={isActive ? "Active" : undefined}
                        />
                        {/* Fixed icon slot for alignment */}
                        <div className="w-4 flex items-center justify-center flex-shrink-0">
                          {isRoot ? (
                            <GitCommitIcon
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-label="Root conversation"
                            />
                          ) : (
                            <GitBranchIcon
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-label="Branch"
                            />
                          )}
                        </div>
                        {/* Text */}
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
          </div>
        )}
        {isArchived && (
          <Badge
            variant="warning-subtle"
            size="sm"
            className="flex-shrink-0 gap-1"
          >
            <ArchiveIcon className="h-3.5 w-3.5" />
            <span className="text-xxs">Archived</span>
          </Badge>
        )}
      </div>

      {/* Only show actions for authenticated users */}
      {user && !user.isAnonymous && (
        <div className="flex items-center gap-1 sm:gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More actions"
            asChild
          >
            <Link to={ROUTES.HOME}>
              <NotePencilIcon className="h-4 w-4" />
            </Link>
          </Button>
          {/* Desktop menu */}
          <div className="hidden sm:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                >
                  <DotsThreeIcon weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isPrivateMode && (
                  <DropdownMenuItem
                    onClick={onSavePrivateChat}
                    disabled={!(online && canSavePrivateChat)}
                  >
                    <FloppyDiskIcon className="mr-2 h-4 w-4" />
                    Save Private Chat
                  </DropdownMenuItem>
                )}

                {!isPrivateMode && conversationId && (
                  <DropdownMenuItem
                    onClick={() => setIsShareDialogOpen(true)}
                    disabled={!online}
                  >
                    <ShareNetworkIcon className="mr-2 h-4 w-4" />
                    Share Conversation
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleExport("json")}
                  disabled={!online || exportingFormat !== null}
                >
                  <FileCodeIcon className="mr-2 h-4 w-4" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport("md")}
                  disabled={!online || exportingFormat !== null}
                >
                  <DownloadIcon className="mr-2 h-4 w-4" />
                  Export as Markdown
                </DropdownMenuItem>

                {!isPrivateMode && conversation && !isArchived && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setIsArchiveDialogOpen(true)}
                      disabled={!online}
                    >
                      <ArchiveIcon className="mr-2 h-4 w-4" />
                      Archive Conversation
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile drawer */}
          <div className="sm:hidden">
            <Drawer>
              <DrawerTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                >
                  <DotsThreeIcon weight="bold" />
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Conversation actions</DrawerTitle>
                </DrawerHeader>
                <DrawerBody>
                  <div className="flex flex-col">
                    {isPrivateMode && (
                      <Button
                        className="h-10 justify-start gap-2 px-3 text-sm"
                        size="sm"
                        variant="ghost"
                        onClick={onSavePrivateChat}
                        disabled={!(online && canSavePrivateChat)}
                      >
                        <FloppyDiskIcon className="h-4 w-4" />
                        Save Private Chat
                      </Button>
                    )}

                    {!isPrivateMode && conversationId && (
                      <Button
                        className="h-10 justify-start gap-2 px-3 text-sm"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsShareDialogOpen(true)}
                        disabled={!online}
                      >
                        <ShareNetworkIcon className="h-4 w-4" />
                        Share Conversation
                      </Button>
                    )}

                    <Button
                      className="h-10 justify-start gap-2 px-3 text-sm"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExport("json")}
                      disabled={!online || exportingFormat !== null}
                    >
                      <FileCodeIcon className="h-4 w-4" />
                      Export as JSON
                    </Button>
                    <Button
                      className="h-10 justify-start gap-2 px-3 text-sm"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExport("md")}
                      disabled={!online || exportingFormat !== null}
                    >
                      <DownloadIcon className="h-4 w-4" />
                      Export as Markdown
                    </Button>

                    {!isPrivateMode && conversation && !isArchived && (
                      <Button
                        className="h-10 justify-start gap-2 px-3 text-sm"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsArchiveDialogOpen(true)}
                        disabled={!online}
                      >
                        <ArchiveIcon className="h-4 w-4" />
                        Archive Conversation
                      </Button>
                    )}
                  </div>
                </DrawerBody>
              </DrawerContent>
            </Drawer>
          </div>
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

      {/* Archive confirmation */}
      {!isPrivateMode && conversationId && (
        <ConfirmationDialog
          open={isArchiveDialogOpen}
          onOpenChange={setIsArchiveDialogOpen}
          title="Archive Conversation"
          description={`Are you sure you want to archive "${conversation?.title ?? "this conversation"}"? You can restore it later from Archived Conversations.`}
          confirmText="Archive"
          onConfirm={async () => {
            try {
              // Navigate away first if archiving the current conversation view
              navigate(ROUTES.HOME);
              await new Promise(resolve => setTimeout(resolve, 100));

              await patchConversation({
                id: conversationId as Id<"conversations">,
                updates: { isArchived: true },
              });

              del(CACHE_KEYS.conversations);
              managedToast.success("Conversation archived", {
                description: "The conversation has been moved to archive.",
                id: `archive-${conversationId}`,
              });
            } catch (_err) {
              managedToast.error("Failed to archive conversation", {
                description:
                  "Unable to archive conversation. Please try again.",
                id: `archive-error-${conversationId}`,
              });
            }
          }}
        />
      )}
    </div>
  );
};

export const ChatHeader = memo(ChatHeaderComponent);
