import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowSquareOutIcon, CopyIcon, HeartIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ROUTES } from "@/lib/routes";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";

type FavoriteItem = {
  favoriteId: Id<"messageFavorites">;
  createdAt: number;
  message: {
    _id: Id<"messages">;
    content: string;
    role: "user" | "assistant" | "system" | "context";
    conversationId: Id<"conversations">;
    createdAt: number;
  };
  conversation: {
    _id: Id<"conversations">;
    title: string;
  };
};

export default function FavoritesPage() {
  const { user } = useUserDataContext();
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const managedToast = useToast();

  const data = useQuery(
    api.messages.listFavorites,
    user && !user.isAnonymous
      ? {
          cursor: cursor ?? undefined,
          limit: 50,
        }
      : "skip"
  );

  const toggleFavorite = useMutation(api.messages.toggleFavorite);

  const items = useMemo(() => {
    const raw = data?.items as unknown as FavoriteItem[] | undefined;
    if (!raw) {
      return [];
    }
    if (!search.trim()) {
      return raw;
    }
    const q = search.toLowerCase();
    return raw.filter(it => {
      return (
        it.conversation.title.toLowerCase().includes(q) ||
        it.message.content.toLowerCase().includes(q)
      );
    });
  }, [data?.items, search]);

  const handleCopy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      managedToast.success("Message copied to clipboard");
    },
    [managedToast.success]
  );

  const handleUnfavorite = useCallback(
    async (messageId: Id<"messages">) => {
      try {
        await toggleFavorite({ messageId });
      } catch {
        managedToast.error("Failed to update favorite");
      }
    },
    [toggleFavorite, managedToast.error]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (!user || user.isAnonymous) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-lg font-semibold mb-2">Favorites</h1>
          <div className="text-sm text-muted-foreground">
            Sign in to view your favorites.
          </div>
        </div>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 stack-lg max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="h-8 w-40 bg-muted/50 rounded animate-pulse" />
            <div className="h-9 w-60 bg-muted/50 rounded animate-pulse" />
          </div>
          <div className="grid gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Favorites</h1>
          <SearchInput
            placeholder="Search favorites..."
            value={search}
            onChange={setSearch}
            className="w-64"
          />
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-4 rounded-full bg-muted/40 p-4">
              <HeartIcon
                className="h-8 w-8 text-muted-foreground"
                weight="regular"
              />
            </div>
            <h2 className="text-base font-medium mb-2">No favorites yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search.trim()
                ? "No favorites match your search. Try a different search term."
                : "Save important messages by clicking the heart icon on any message in your conversations."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map(item => {
              const favId = String(item.favoriteId);
              const isExpanded = expanded[favId] === true;
              const longContent = item.message.content.length > 800;
              const preview = longContent
                ? `${item.message.content.slice(0, 800)}\n\n…`
                : item.message.content;
              const contentToRender = isExpanded
                ? item.message.content
                : preview;
              return (
                <Card key={item.favoriteId} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-xs text-muted-foreground flex items-center gap-2">
                        <Link
                          to={ROUTES.CHAT_CONVERSATION(item.conversation._id)}
                          className="hover:underline"
                        >
                          {item.conversation.title}
                        </Link>
                        <span>•</span>
                        <span>
                          {new Date(item.message.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <StreamingMarkdown
                          isStreaming={false}
                          messageId={String(item.message._id)}
                        >
                          {contentToRender}
                        </StreamingMarkdown>
                      </div>
                      {longContent && (
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs px-2 h-7"
                            onClick={() => toggleExpand(favId)}
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              navigate(
                                ROUTES.CHAT_CONVERSATION(item.conversation._id)
                              )
                            }
                            className="btn-action h-7 w-7 p-0"
                          >
                            <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open conversation</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleCopy(item.message.content)}
                            className="btn-action h-7 w-7 p-0"
                          >
                            <CopyIcon className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy message</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleUnfavorite(item.message._id)}
                            className="btn-action h-7 w-7 p-0 text-red-500"
                            title="Remove favorite"
                          >
                            <HeartIcon className="h-3.5 w-3.5" weight="fill" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove favorite</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {data?.hasMore && (
          <div className="flex justify-center mt-4">
            <Button
              variant="ghost"
              onClick={() => setCursor(data.nextCursor)}
              className="text-sm"
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
