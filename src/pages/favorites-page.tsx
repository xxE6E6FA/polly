import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ChatCircleIcon,
  CopyIcon,
  HeartIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const ITEMS_PER_PAGE = 50;
const PREVIEW_LENGTH = 300;

/**
 * Strip markdown syntax to produce a clean plaintext preview.
 * Handles code blocks, inline code, headers, bold/italic, links, images, etc.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Remove code blocks (``` ... ```)
      .replace(/```[\s\S]*?```/g, " ")
      // Remove inline code
      .replace(/`([^`]*)`/g, "$1")
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Remove links but keep text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic
      .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2")
      // Remove strikethrough
      .replace(/~~(.*?)~~/g, "$1")
      // Remove blockquotes
      .replace(/^\s*>\s?/gm, "")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // Remove list markers
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // Collapse whitespace
      .replace(/\n{2,}/g, " \u00B7 ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

// Loading skeleton that mimics the final card layout
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

// Individual favorite row — clicking navigates to the conversation
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
        {/* Header row: conversation context + actions */}
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

          {/* Actions — always visible on mobile, subtle on desktop */}
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

        {/* Preview text — links to conversation */}
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

// Sentinel element for infinite scroll
function LoadMoreSentinel({
  onVisible,
  isLoading,
}: {
  onVisible: () => void;
  isLoading: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          onVisible();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div ref={sentinelRef}>
      {isLoading && (
        <div>
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
          <FavoriteItemSkeleton />
        </div>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  const { user } = useUserDataContext();
  const [search, setSearch] = useState("");
  const managedToast = useToast();

  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listFavoritesPaginated,
    user ? {} : "skip",
    { initialNumItems: ITEMS_PER_PAGE }
  );

  const toggleFavorite = useMutation(api.messages.toggleFavorite);

  const handleEndReached = useCallback(() => {
    if (status === "CanLoadMore") {
      loadMore(ITEMS_PER_PAGE);
    }
  }, [status, loadMore]);

  const items = useMemo(() => {
    const raw = results as unknown as FavoriteItem[] | undefined;
    if (!raw) {
      return [];
    }
    if (!search.trim()) {
      return raw;
    }
    const q = search.toLowerCase();
    return raw.filter(
      it =>
        it.conversation.title.toLowerCase().includes(q) ||
        it.message.content.toLowerCase().includes(q)
    );
  }, [results, search]);

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

  // Unauthenticated / anonymous
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

  // Initial loading
  if (status === "LoadingFirstPage") {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header skeleton */}
          <div className="sticky top-0 z-sticky bg-background border-b border-border/40">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="h-9 w-56 rounded-md" />
            </div>
          </div>
          {/* Item skeletons */}
          <div>
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
            <FavoriteItemSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const totalCount =
    (results as unknown as FavoriteItem[] | undefined)?.length ?? 0;
  const hasSearch = search.trim().length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-sticky bg-background/95 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-semibold">Favorites</h1>
              {totalCount > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {hasSearch ? `${items.length} of ${totalCount}` : totalCount}
                </span>
              )}
            </div>
            {totalCount > 0 && (
              <SearchInput
                placeholder="Search favorites…"
                value={search}
                onChange={setSearch}
                className="w-56"
              />
            )}
          </div>
        </div>

        {/* Content */}
        {(() => {
          // Still resolving first results — show skeletons to avoid empty-state flash
          if (items.length === 0 && !hasSearch && status !== "Exhausted") {
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

          if (items.length === 0) {
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
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" })
                    )}
                  >
                    Go to conversations
                  </Link>
                )}
              </div>
            );
          }

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

              {/* Infinite scroll sentinel */}
              {status !== "Exhausted" && (
                <LoadMoreSentinel
                  onVisible={handleEndReached}
                  isLoading={status === "LoadingMore"}
                />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
