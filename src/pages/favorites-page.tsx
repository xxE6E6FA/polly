import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ChatCircleIcon,
  CopyIcon,
  HeartIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib";
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

const PREVIEW_LENGTH = 300;

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, " \u00B7 ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const FavoriteItemSkeleton = memo(() => (
  <div className="border-b border-border/40 px-5 py-4">
    <div className="flex items-center gap-2 mb-2.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
    <div className="stack-xs">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  </div>
));
FavoriteItemSkeleton.displayName = "FavoriteItemSkeleton";

const FavoriteCard = memo(function FavoriteCard({
  item,
  onCopy,
  onUnfavorite,
}: {
  item: FavoriteItem;
  onCopy: (text: string) => void;
  onUnfavorite: (messageId: Id<"messages">) => void;
}) {
  const plainPreview = useMemo(
    () => stripMarkdown(item.message.content),
    [item.message.content]
  );
  const truncatedPreview =
    plainPreview.length > PREVIEW_LENGTH
      ? `${plainPreview.slice(0, PREVIEW_LENGTH)}…`
      : plainPreview;

  const isAssistant = item.message.role === "assistant";

  return (
    <div className="group border-b border-border/40 transition-colors hover:bg-muted/20">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
            {isAssistant ? (
              <ChatCircleIcon className="size-3.5 shrink-0" />
            ) : (
              <UserIcon className="size-3.5 shrink-0" />
            )}
            <Link
              to={ROUTES.CHAT_CONVERSATION(item.conversation._id)}
              className="truncate font-medium text-foreground/80 hover:text-foreground hover:underline underline-offset-2 transition-colors"
            >
              {item.conversation.title}
            </Link>
            <span className="text-muted-foreground/50 shrink-0">&middot;</span>
            <span className="shrink-0 tabular-nums">
              {formatDate(item.message.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onCopy(item.message.content)}
              title="Copy message"
            >
              <CopyIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onUnfavorite(item.message._id)}
              title="Remove favorite"
            >
              <HeartIcon className="size-3.5" weight="fill" />
            </Button>
          </div>
        </div>

        <Link
          to={ROUTES.CHAT_CONVERSATION(item.conversation._id)}
          className="block text-sm leading-relaxed text-foreground/90 line-clamp-3 hover:text-foreground transition-colors"
        >
          {truncatedPreview}
        </Link>
      </div>
    </div>
  );
});

export default function FavoritesPage() {
  const { user } = useUserDataContext();
  const [search, setSearch] = useState("");
  const managedToast = useToast();

  const data = useQuery(api.messages.listFavorites, user ? {} : "skip");

  const toggleFavorite = useMutation(api.messages.toggleFavorite);

  const allItems = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.items as unknown as FavoriteItem[];
  }, [data]);

  const items = useMemo(() => {
    if (!search.trim()) {
      return allItems;
    }
    const q = search.toLowerCase();
    return allItems.filter(
      it =>
        it.conversation.title.toLowerCase().includes(q) ||
        it.message.content.toLowerCase().includes(q)
    );
  }, [allItems, search]);

  const handleCopy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      managedToast.success("Copied to clipboard");
    },
    [managedToast.success]
  );

  const handleUnfavorite = useCallback(
    async (messageId: Id<"messages">) => {
      try {
        await toggleFavorite({ messageId });
        managedToast.success("Removed from favorites");
      } catch {
        managedToast.error("Failed to update favorite");
      }
    },
    [toggleFavorite, managedToast.success, managedToast.error]
  );

  if (!user || user.isAnonymous) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-lg font-semibold mb-2">Favorites</h1>
          <p className="text-sm text-muted-foreground">
            Sign up to save and view your favorite messages.
          </p>
        </div>
      </div>
    );
  }

  const hasSearch = search.trim().length > 0;
  // undefined = still loading, null won't happen since we skip when no user
  const isLoading = data === undefined;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div>
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
        </div>
      );
    }

    if (items.length > 0) {
      return (
        <div>
          {items.map(item => (
            <FavoriteCard
              key={String(item.favoriteId)}
              item={item}
              onCopy={handleCopy}
              onUnfavorite={handleUnfavorite}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="mb-4 rounded-full bg-muted/30 p-4">
          <HeartIcon
            className="size-7 text-muted-foreground/50"
            weight="regular"
          />
        </div>
        <h2 className="text-base font-medium text-foreground/80 mb-1.5">
          {hasSearch ? "No matches found" : "No favorites yet"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mb-5 leading-relaxed">
          {hasSearch
            ? "Try a different search term."
            : "Tap the heart icon on any message to save it here for quick access."}
        </p>
        {!hasSearch && (
          <Link
            to={ROUTES.HOME}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Go to conversations
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="sticky top-0 z-sticky bg-background/95 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-semibold">Favorites</h1>
              {items.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {items.length}
                </span>
              )}
            </div>
            {allItems.length > 0 && (
              <SearchInput
                placeholder="Search favorites…"
                value={search}
                onChange={setSearch}
                className="w-56"
              />
            )}
          </div>
        </div>

        {renderContent()}
      </div>
    </div>
  );
}
