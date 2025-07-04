import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  CheckIcon,
  MagnifyingGlassIcon,
  PushPinIcon,
  ArchiveIcon,
} from "@phosphor-icons/react";

import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ConversationSummary = {
  _id: Id<"conversations">;
  _creationTime: number;
  title: string;
  isArchived?: boolean;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

interface ConversationSelectionListProps {
  selectedConversations: Set<string>;
  onConversationSelect: (
    conversationId: string,
    index: number,
    isShiftKey: boolean
  ) => void;
  onSelectAll: () => void;
  onBulkSelect: (conversationIds: string[]) => void;
  includeArchived?: boolean;
  includePinned?: boolean;
}

export function ConversationSelectionList({
  selectedConversations,
  onConversationSelect,
  onSelectAll,
  onBulkSelect,
  includeArchived = true,
  includePinned = true,
}: ConversationSelectionListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const conversationData = useQuery(
    api.conversations.getConversationsSummaryForExport,
    {
      includeArchived,
      includePinned,
      limit: 1000,
    }
  );

  const conversations = useMemo(() => {
    return conversationData?.conversations || [];
  }, [conversationData?.conversations]);

  const isLoading = conversationData === undefined;

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations;
    }

    const query = searchQuery.toLowerCase();
    return conversations.filter((conversation: ConversationSummary) =>
      conversation.title.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  const handleConversationSelect = useCallback(
    (conversationId: string, index: number, isShiftKey: boolean) => {
      onConversationSelect(conversationId, index, isShiftKey);
    },
    [onConversationSelect]
  );

  const allSelected = useMemo(() => {
    return (
      filteredConversations.length > 0 &&
      filteredConversations.every((conv: ConversationSummary) =>
        selectedConversations.has(conv._id)
      )
    );
  }, [filteredConversations, selectedConversations]);

  const someSelected = useMemo(() => {
    return filteredConversations.some((conv: ConversationSummary) =>
      selectedConversations.has(conv._id)
    );
  }, [filteredConversations, selectedConversations]);

  const handleSelectAllFiltered = useCallback(() => {
    const conversationIds = filteredConversations.map(conv => conv._id);
    onBulkSelect(conversationIds);
  }, [filteredConversations, onBulkSelect]);

  const handleItemClick = useCallback(
    (conversationId: string, index: number, shiftKey: boolean) => {
      handleConversationSelect(conversationId, index, shiftKey);
    },
    [handleConversationSelect]
  );

  const renderItem = useCallback(
    (conversation: ConversationSummary, index: number) => {
      const isSelected = selectedConversations.has(conversation._id);
      const isEven = index % 2 === 0;

      const fullDate = new Date(conversation.updatedAt).toLocaleDateString(
        undefined,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }
      );

      return (
        <div
          key={conversation._id}
          className={cn(
            "flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors duration-150",
            isEven ? "bg-background" : "bg-muted/30",
            isSelected && "!bg-primary/10 border-l-2 border-l-primary",
            "hover:bg-muted/50"
          )}
          onClick={e => handleItemClick(conversation._id, index, e.shiftKey)}
        >
          {/* Selection indicator */}
          <div
            className={cn(
              "w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors",
              isSelected
                ? "bg-primary border-primary"
                : "border-muted-foreground/40 bg-background hover:border-muted-foreground/60"
            )}
          >
            {isSelected && (
              <CheckIcon className="w-2 h-2 text-primary-foreground" />
            )}
          </div>

          {/* Content - single line */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Title and badges */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-medium min-w-0 flex-shrink truncate">
                {conversation.title}
              </span>

              {/* Status badges after title */}
              <div className="flex items-center gap-1 shrink-0">
                {conversation.isPinned && (
                  <Badge
                    variant="secondary"
                    className="h-5 px-2 text-xs flex items-center gap-1"
                  >
                    <PushPinIcon className="w-3 h-3" />
                    Pinned
                  </Badge>
                )}
                {conversation.isArchived && (
                  <Badge
                    variant="secondary"
                    className="h-5 px-2 text-xs flex items-center gap-1"
                  >
                    <ArchiveIcon className="w-3 h-3" />
                    Archived
                  </Badge>
                )}
              </div>
            </div>

            {/* Right side info */}
            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
              <span className="hidden sm:block">{fullDate}</span>
            </div>
          </div>
        </div>
      );
    },
    [selectedConversations, handleItemClick]
  );

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 space-y-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Select Conversations</span>
            <div className="flex items-center gap-2">
              <Button
                onClick={searchQuery ? handleSelectAllFiltered : onSelectAll}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
              >
                {allSelected ? "Deselect All" : "Select All"}
                {searchQuery && " (Filtered)"}
              </Button>
              {someSelected && (
                <Badge variant="secondary" className="h-5 text-xs px-2">
                  {selectedConversations.size}
                </Badge>
              )}
            </div>
          </CardTitle>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Compact status */}
          {searchQuery && filteredConversations.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {filteredConversations.length} of {conversations.length}{" "}
              conversations
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0 border-t border-border/50">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">
                {searchQuery
                  ? "No conversations match your search"
                  : "No conversations found"}
              </p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              {filteredConversations.map((conversation, index) =>
                renderItem(conversation, index)
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
